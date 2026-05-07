import asyncio
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse

from services.git import maybe_pull

files_router = APIRouter()


@files_router.get("/file", response_class=PlainTextResponse)
async def get_file(path: str) -> str:
    await maybe_pull()

    docs_path = Path(os.environ["DOCS_LOCAL_PATH"]).resolve()
    file_path = (docs_path / path).resolve()

    if not file_path.is_relative_to(docs_path):
        raise HTTPException(status_code=400, detail="Invalid path")

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    return await asyncio.to_thread(file_path.read_text, encoding="utf-8")
