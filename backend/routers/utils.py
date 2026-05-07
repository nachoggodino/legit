import json
from typing import Any


def sse_event(event: str, data: dict[str, Any]) -> str:
    """Format a single SSE frame."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"
