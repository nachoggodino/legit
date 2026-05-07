import asyncio
import json
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from models.edit import EditRequest
from services.ai import call_llm_full, estimate_tokens, get_max_context_tokens

edit_router = APIRouter()

# System prompt from SPEC 9.3
_SYSTEM_PROMPT: str = (
    "You are a technical writing assistant specialized in AI research documentation.\n"
    "The user will provide a Markdown document and an editing instruction.\n"
    "Return the complete modified document according to the instruction,\n"
    "preserving Markdown formatting.\n"
    "Do not add any explanation before or after the document.\n"
    "Respond only with the Markdown content of the modified document."
)

_STATUS_MESSAGES: list[str] = [
    "Reading document\u2026",
    "Generating changes\u2026",
    "Almost done\u2026",
    "Finalizing\u2026",
]


def sse_event(event: str, data: dict[str, Any]) -> str:
    """Format a single SSE frame."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _edit_generator(
    path: str,
    content: str,
    instruction: str,
) -> AsyncGenerator[str, None]:
    try:
        # Check context budget
        estimated_tokens = estimate_tokens(content) + estimate_tokens(instruction)
        max_tokens = get_max_context_tokens()
        if estimated_tokens > max_tokens:
            yield sse_event("error", {"message": f"Document exceeds context limit ({estimated_tokens} > {max_tokens} tokens)"})
            return

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"INSTRUCTION:\n{instruction}\n\nDOCUMENT:\n{content}",
            },
        ]

        loop = asyncio.get_running_loop()
        future: asyncio.Future[dict[str, Any]] = loop.run_in_executor(
            None, lambda: call_llm_full(messages)
        )

        i = 0
        while not future.done():
            yield sse_event(
                "status",
                {"message": _STATUS_MESSAGES[i % len(_STATUS_MESSAGES)]},
            )
            i += 1
            await asyncio.sleep(0.5)

        response: dict[str, Any] = await future
        modified: str = response["choices"][0]["message"]["content"] or ""
        yield sse_event("done", {"content": modified})

    except Exception as exc:
        yield sse_event("error", {"message": str(exc)})


@edit_router.post("/edit")
async def edit(request: EditRequest) -> StreamingResponse:
    return StreamingResponse(
        _edit_generator(request.path, request.content, request.instruction),
        media_type="text/event-stream",
    )
