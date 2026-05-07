import datetime
import json
import os
from pathlib import Path
from typing import Any

_INDEX: list[dict[str, Any]] = []

_INDEX_FILENAME = "_index.json"


def load_index() -> None:
    """Load ``_index.json`` from the local clone into memory."""
    global _INDEX
    index_file = Path(os.environ["DOCS_LOCAL_PATH"]) / _INDEX_FILENAME
    if index_file.exists():
        _INDEX = json.loads(index_file.read_text(encoding="utf-8"))
    else:
        _INDEX = []


def get_index() -> list[dict[str, Any]]:
    """Return a shallow copy of the in-memory index."""
    return list(_INDEX)


def update_index_entry(
    path: str,
    title: str | None = None,
    summary: str | None = None,
) -> None:
    """Update an existing index entry or create a new one."""
    today = datetime.date.today().isoformat()
    for entry in _INDEX:
        if entry["path"] == path:
            if title is not None:
                entry["title"] = title
            if summary is not None:
                entry["summary"] = summary
            entry["updated"] = today
            return

    # No existing entry found — create a new one
    _INDEX.append(
        {
            "path": path,
            "title": title or path,
            "summary": summary or "",
            "updated": today,
        }
    )


def serialise_index() -> str:
    """Return the in-memory index as a JSON string."""
    return json.dumps(_INDEX, ensure_ascii=False, indent=2)
