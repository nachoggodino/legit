import asyncio
import json
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from models.commit import CommitRequest
from routers.utils import sse_event
from services.ai import call_llm_full, check_context_budget
from services.git import get_git_provider, maybe_pull
from services.index import serialise_index, update_index_entry

commit_router = APIRouter()

_COMMIT_SYSTEM_PROMPT_TEMPLATE: str = (
    "You are a technical assistant specialized in AI research documentation.\n"
    "Read the following Markdown document and return a JSON object with two fields:\n"
    '- "summary": a single sentence (max 30 words) describing the content\n'
    '- "commit_message": a concise conventional commit message (max 72 characters)\n\n'
    "Respond ONLY with the raw JSON object. No explanations, no markdown fences.\n\n"
    "FILE PATH: {path}\n"
    "DOCUMENT CONTENT:\n{content}"
)


async def _commit_generator(
    path: str,
    content: str,
    branch: str,
) -> AsyncGenerator[str, None]:
    try:
        await maybe_pull()
        error = check_context_budget(content)
        if error:
            yield sse_event("error", {"message": error})
            return
        yield sse_event("status", {"message": "Generating summary and commit message\u2026"})

        prompt = _COMMIT_SYSTEM_PROMPT_TEMPLATE.format(path=path, content=content)
        messages: list[dict[str, Any]] = [
            {"role": "user", "content": prompt},
        ]

        loop = asyncio.get_running_loop()
        response: dict[str, Any] = await loop.run_in_executor(
            None, lambda: call_llm_full(messages)
        )

        llm_content: str = response["choices"][0]["message"]["content"] or ""
        try:
            parsed: dict[str, Any] = json.loads(llm_content)
            summary: str = parsed["summary"]
            commit_message: str = parsed["commit_message"]
        except (json.JSONDecodeError, KeyError) as exc:
            yield sse_event("error", {"message": f"Failed to parse LLM response: {exc}"})
            return

        update_index_entry(path, summary=summary)

        yield sse_event("status", {"message": "Updating index\u2026"})

        index_content = serialise_index()
        files: list[dict[str, Any]] = [
            {"path": path, "content": content},
            {"path": "_index.json", "content": index_content},
        ]

        git_provider = get_git_provider()
        commit_url: str = await git_provider.commit_files(files, branch, commit_message)

        yield sse_event("done", {"commit_url": commit_url})

    except Exception as exc:
        yield sse_event("error", {"message": str(exc)})


@commit_router.post("/commit")
async def commit(request: CommitRequest) -> StreamingResponse:
    return StreamingResponse(
        _commit_generator(request.path, request.content, request.branch),
        media_type="text/event-stream",
    )
