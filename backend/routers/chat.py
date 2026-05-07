import asyncio
import json
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from models.chat import ChatRequest
from services.ai import call_llm_full, call_llm_stream, estimate_tokens, get_max_context_tokens
from services.git import get_git_provider, maybe_pull
from services.index import serialise_index

chat_router = APIRouter()

_MAX_TOOL_ITERATIONS: int = 5

_GET_FILE_TOOL: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "get_file",
        "description": "Fetch the content of a markdown document",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the document"},
            },
            "required": ["path"],
        },
    },
}

# System prompt matches SPEC 9.2
_SYSTEM_PROMPT_TEMPLATE: str = (
    "You are an expert assistant on the AI research project documented in this wiki.\n"
    "You have access to an index of all available documents.\n"
    "To answer the user's question, request relevant files using the get_file tool.\n"
    "Reason first about which files you need before requesting them.\n"
    "Do not invent information not present in the documents.\n"
    "When you have sufficient context, respond clearly and in a structured way.\n"
    "If the information is not available in the documentation, say so explicitly.\n"
    "\n"
    "{context_budget_warning}"
    "DOCUMENT INDEX:\n"
    "{index_json}"
)

_CONTEXT_BUDGET_WARNING: str = (
    "IMPORTANT: The context is nearly full. Do not request any more files. "
    "Answer with the information already retrieved.\n\n"
)


def sse_event(event: str, data: dict[str, Any]) -> str:
    """Format a single SSE frame."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _build_system_prompt(index_json: str, warn: bool) -> str:
    warning = _CONTEXT_BUDGET_WARNING if warn else ""
    return _SYSTEM_PROMPT_TEMPLATE.format(
        context_budget_warning=warning,
        index_json=index_json,
    )


async def _chat_generator(query: str) -> AsyncGenerator[str, None]:
    try:
        await maybe_pull()

        index_json = serialise_index()
        max_tokens = get_max_context_tokens()
        total_tokens = estimate_tokens(index_json) + estimate_tokens(query)
        warned = total_tokens >= int(max_tokens * 0.8)

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": _build_system_prompt(index_json, warned)},
            {"role": "user", "content": query},
        ]

        git_provider = get_git_provider()
        loop = asyncio.get_running_loop()

        for _ in range(_MAX_TOOL_ITERATIONS):
            response: dict[str, Any] = await loop.run_in_executor(
                None,
                lambda: call_llm_full(messages, tools=[_GET_FILE_TOOL]),  # noqa: B023
            )

            assistant_message: dict[str, Any] = response["choices"][0]["message"]
            tool_calls: list[dict[str, Any]] = assistant_message.get("tool_calls") or []

            if not tool_calls:
                break

            # Persist the assistant's tool-call turn in the conversation
            messages.append(assistant_message)

            for tool_call in tool_calls:
                try:
                    args: dict[str, Any] = json.loads(
                        tool_call["function"]["arguments"]
                    )
                    path: str = args["path"]
                except (json.JSONDecodeError, KeyError) as exc:
                    yield sse_event("error", {"message": f"Invalid tool call arguments: {exc}"})
                    return

                yield sse_event("reading_file", {"path": path})

                try:
                    content: str = await git_provider.get_file(path)
                except Exception as exc:
                    yield sse_event(
                        "error",
                        {"message": f"Failed to read file '{path}': {exc}"},
                    )
                    return

                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call["id"],
                        "content": content,
                    }
                )

                # Re-check context budget after adding file content
                total_tokens += estimate_tokens(content)
                if not warned and total_tokens >= int(max_tokens * 0.8):
                    warned = True
                    messages[0]["content"] = _build_system_prompt(index_json, warned)

        # Stream the final answer token by token — tokens are forwarded
        # incrementally via a queue so SSE events are sent as they arrive.
        token_queue: asyncio.Queue[str | None] = asyncio.Queue()

        def _produce_tokens() -> None:
            try:
                for text in call_llm_stream(messages):
                    loop.call_soon_threadsafe(token_queue.put_nowait, text)
            finally:
                loop.call_soon_threadsafe(token_queue.put_nowait, None)

        producer_fut = loop.run_in_executor(None, _produce_tokens)
        while True:
            text = await token_queue.get()
            if text is None:
                break
            yield sse_event("token", {"text": text})
        await producer_fut  # re-raises any exception from the producer thread

        yield sse_event("done", {})

    except Exception as exc:
        yield sse_event("error", {"message": str(exc)})


@chat_router.post("/chat")
async def chat(request: ChatRequest) -> StreamingResponse:
    return StreamingResponse(
        _chat_generator(request.query),
        media_type="text/event-stream",
    )
