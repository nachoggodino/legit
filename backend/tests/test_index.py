import json
from collections.abc import Generator
from pathlib import Path
from typing import Any

import pytest

import services.index as index_module
from services.index import (
    get_index,
    load_index,
    serialise_index,
    update_index_entry,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def reset_index() -> Generator[None, None, None]:
    index_module._INDEX = []
    yield
    index_module._INDEX = []


def _write_index(tmp_path: Path, entries: list[dict[str, Any]]) -> None:
    (tmp_path / "_index.json").write_text(
        json.dumps(entries, ensure_ascii=False), encoding="utf-8"
    )


# ---------------------------------------------------------------------------
# load_index
# ---------------------------------------------------------------------------


class TestLoadIndex:
    def test_loads_entries_from_file(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))
        entries = [{"path": "docs/a.md", "title": "A", "summary": "Summary A", "updated": "2026-01-01"}]
        _write_index(tmp_path, entries)

        load_index()

        assert index_module._INDEX == entries

    def test_empty_list_when_file_missing(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))
        load_index()
        assert index_module._INDEX == []

    def test_replaces_existing_in_memory_index(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))
        index_module._INDEX = [{"path": "old.md", "title": "Old", "summary": "", "updated": "2025-01-01"}]
        _write_index(tmp_path, [])

        load_index()

        assert index_module._INDEX == []


# ---------------------------------------------------------------------------
# get_index
# ---------------------------------------------------------------------------


class TestGetIndex:
    def test_returns_copy(self) -> None:
        index_module._INDEX = [{"path": "a.md", "title": "A", "summary": "", "updated": "2026-01-01"}]
        result = get_index()
        assert result == index_module._INDEX
        assert result is not index_module._INDEX

    def test_mutating_copy_does_not_affect_index(self) -> None:
        index_module._INDEX = [{"path": "a.md", "title": "A", "summary": "", "updated": "2026-01-01"}]
        result = get_index()
        result.append({"path": "extra.md", "title": "Extra", "summary": "", "updated": "2026-01-01"})
        assert len(index_module._INDEX) == 1

    def test_returns_empty_list_when_index_empty(self) -> None:
        assert get_index() == []


# ---------------------------------------------------------------------------
# update_index_entry
# ---------------------------------------------------------------------------


class TestUpdateIndexEntry:
    def test_creates_new_entry_when_path_not_found(self) -> None:
        update_index_entry("docs/new.md", title="New Page", summary="A new page")
        assert len(index_module._INDEX) == 1
        entry = index_module._INDEX[0]
        assert entry["path"] == "docs/new.md"
        assert entry["title"] == "New Page"
        assert entry["summary"] == "A new page"

    def test_updates_existing_entry_title(self) -> None:
        index_module._INDEX = [
            {"path": "docs/a.md", "title": "Old Title", "summary": "Old", "updated": "2025-01-01"}
        ]
        update_index_entry("docs/a.md", title="New Title")
        assert index_module._INDEX[0]["title"] == "New Title"

    def test_updates_existing_entry_summary(self) -> None:
        index_module._INDEX = [
            {"path": "docs/a.md", "title": "A", "summary": "Old summary", "updated": "2025-01-01"}
        ]
        update_index_entry("docs/a.md", summary="New summary")
        assert index_module._INDEX[0]["summary"] == "New summary"

    def test_updates_the_updated_field(self) -> None:
        index_module._INDEX = [
            {"path": "docs/a.md", "title": "A", "summary": "", "updated": "2020-01-01"}
        ]
        update_index_entry("docs/a.md", title="A")
        assert index_module._INDEX[0]["updated"] != "2020-01-01"

    def test_does_not_overwrite_title_when_none(self) -> None:
        index_module._INDEX = [
            {"path": "docs/a.md", "title": "Keep Me", "summary": "", "updated": "2025-01-01"}
        ]
        update_index_entry("docs/a.md", summary="updated")
        assert index_module._INDEX[0]["title"] == "Keep Me"

    def test_does_not_overwrite_summary_when_none(self) -> None:
        index_module._INDEX = [
            {"path": "docs/a.md", "title": "A", "summary": "Keep Me", "updated": "2025-01-01"}
        ]
        update_index_entry("docs/a.md", title="updated")
        assert index_module._INDEX[0]["summary"] == "Keep Me"

    def test_new_entry_uses_path_as_default_title(self) -> None:
        update_index_entry("docs/orphan.md")
        assert index_module._INDEX[0]["title"] == "docs/orphan.md"

    def test_does_not_duplicate_existing_entry(self) -> None:
        index_module._INDEX = [
            {"path": "docs/a.md", "title": "A", "summary": "", "updated": "2025-01-01"}
        ]
        update_index_entry("docs/a.md", title="A Updated")
        assert len(index_module._INDEX) == 1


# ---------------------------------------------------------------------------
# serialise_index
# ---------------------------------------------------------------------------


class TestSerialiseIndex:
    def test_returns_json_string(self) -> None:
        index_module._INDEX = [
            {"path": "docs/a.md", "title": "A", "summary": "s", "updated": "2026-01-01"}
        ]
        result = serialise_index()
        parsed = json.loads(result)
        assert parsed == index_module._INDEX

    def test_empty_index_serialises_to_empty_list(self) -> None:
        result = serialise_index()
        assert json.loads(result) == []

    def test_output_is_valid_json(self) -> None:
        index_module._INDEX = [
            {"path": "docs/unicode.md", "title": "Ünïcödé", "summary": "", "updated": "2026-01-01"}
        ]
        result = serialise_index()
        # Should not raise
        json.loads(result)
