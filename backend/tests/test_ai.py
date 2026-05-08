import json
from collections.abc import Iterator
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from services.ai import (
    call_llm_full,
    call_llm_stream,
    estimate_tokens,
    get_max_context_tokens,
)

from tests.conftest import BASE_ENV, make_llm_response


# ---------------------------------------------------------------------------
# estimate_tokens
# ---------------------------------------------------------------------------


class TestEstimateTokens:
    @pytest.mark.parametrize(
        "text, expected",
        [
            ("", 0),
            ("hello", 1),
            ("hello world", 2),
            ("a" * 100, 20),
            ("a" * 5000, 1000),
        ],
    )
    def test_divides_length_by_five(self, text: str, expected: int) -> None:
        assert estimate_tokens(text) == expected


# ---------------------------------------------------------------------------
# get_max_context_tokens
# ---------------------------------------------------------------------------


class TestGetMaxContextTokens:
    def test_reads_env_var(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("MAX_CONTEXT_TOKENS", "200000")
        assert get_max_context_tokens() == 200000

    def test_defaults_to_150000(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("MAX_CONTEXT_TOKENS", raising=False)
        assert get_max_context_tokens() == 150_000


# ---------------------------------------------------------------------------
# call_llm_full
# ---------------------------------------------------------------------------


@pytest.fixture()
def ai_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key, value in BASE_ENV.items():
        monkeypatch.setenv(key, value)


@pytest.fixture()
def mock_http_resp() -> MagicMock:
    m = MagicMock()
    m.json.return_value = make_llm_response("answer")
    m.raise_for_status = MagicMock()
    return m


@pytest.fixture()
def mock_stream_resp() -> MagicMock:
    m = MagicMock()
    m.raise_for_status = MagicMock()
    m.__enter__ = MagicMock(return_value=m)
    m.__exit__ = MagicMock(return_value=False)
    return m


class TestCallLlmFull:
    def test_posts_to_correct_url(self, ai_env: None, mock_http_resp: MagicMock) -> None:
        with patch("services.ai.requests.post", return_value=mock_http_resp) as mock_post:
            call_llm_full(messages=[{"role": "user", "content": "hi"}])

        url_arg: str = mock_post.call_args.args[0]
        assert url_arg.endswith("/chat/completions")

    def test_sends_messages_and_model(self, ai_env: None, mock_http_resp: MagicMock) -> None:
        messages = [{"role": "user", "content": "hello"}]
        with patch("services.ai.requests.post", return_value=mock_http_resp) as mock_post:
            call_llm_full(messages=messages)

        payload: dict[str, Any] = mock_post.call_args.kwargs["json"]
        assert payload["messages"] == messages
        assert payload["model"] == "gpt-4o"

    def test_sends_tools_when_provided(self, ai_env: None, mock_http_resp: MagicMock) -> None:
        tools = [{"type": "function", "function": {"name": "get_file"}}]
        with patch("services.ai.requests.post", return_value=mock_http_resp) as mock_post:
            call_llm_full(messages=[{"role": "user", "content": "hi"}], tools=tools)

        payload = mock_post.call_args.kwargs["json"]
        assert payload["tools"] == tools

    def test_omits_tools_when_none(self, ai_env: None, mock_http_resp: MagicMock) -> None:
        with patch("services.ai.requests.post", return_value=mock_http_resp) as mock_post:
            call_llm_full(messages=[{"role": "user", "content": "hi"}], tools=None)

        payload = mock_post.call_args.kwargs["json"]
        assert "tools" not in payload

    def test_sets_bearer_auth_header(self, ai_env: None, mock_http_resp: MagicMock) -> None:
        with patch("services.ai.requests.post", return_value=mock_http_resp) as mock_post:
            call_llm_full(messages=[{"role": "user", "content": "hi"}])

        headers: dict[str, str] = mock_post.call_args.kwargs["headers"]
        assert headers["Authorization"] == "Bearer sk-test"

    def test_returns_response_dict(self, ai_env: None, mock_http_resp: MagicMock) -> None:
        expected = make_llm_response("the answer")
        mock_http_resp.json.return_value = expected

        with patch("services.ai.requests.post", return_value=mock_http_resp):
            result = call_llm_full(messages=[{"role": "user", "content": "hi"}])

        assert result == expected

    def test_raises_on_http_error(self, ai_env: None, mock_http_resp: MagicMock) -> None:
        mock_http_resp.raise_for_status.side_effect = Exception("HTTP 500")

        with patch("services.ai.requests.post", return_value=mock_http_resp):
            with pytest.raises(Exception, match="HTTP 500"):
                call_llm_full(messages=[{"role": "user", "content": "hi"}])


# ---------------------------------------------------------------------------
# call_llm_stream
# ---------------------------------------------------------------------------


def _make_sse_lines(tokens: list[str]) -> list[bytes]:
    """Build fake SSE byte lines for a list of token strings."""
    lines: list[bytes] = []
    for token in tokens:
        chunk = {
            "choices": [{"delta": {"content": token}, "index": 0}]
        }
        lines.append(f"data: {json.dumps(chunk)}".encode())
    lines.append(b"data: [DONE]")
    return lines


class TestCallLlmStream:
    def test_yields_token_strings(self, ai_env: None, mock_stream_resp: MagicMock) -> None:
        sse_lines = _make_sse_lines(["Hello", " world", "!"])
        mock_stream_resp.iter_lines.return_value = iter(sse_lines)

        with patch("services.ai.requests.post", return_value=mock_stream_resp):
            tokens = list(call_llm_stream(messages=[{"role": "user", "content": "hi"}]))

        assert tokens == ["Hello", " world", "!"]

    def test_stops_at_done_sentinel(self, ai_env: None, mock_stream_resp: MagicMock) -> None:
        sse_lines = _make_sse_lines(["tok"]) + [b"data: {\"choices\":[{\"delta\":{\"content\":\"extra\"}}]}"]
        mock_stream_resp.iter_lines.return_value = iter(sse_lines)

        with patch("services.ai.requests.post", return_value=mock_stream_resp):
            tokens = list(call_llm_stream(messages=[{"role": "user", "content": "hi"}]))

        assert "extra" not in tokens

    def test_skips_empty_lines(self, ai_env: None, mock_stream_resp: MagicMock) -> None:
        sse_lines = [b"", b"data: {\"choices\":[{\"delta\":{\"content\":\"A\"}}]}", b"data: [DONE]"]
        mock_stream_resp.iter_lines.return_value = iter(sse_lines)

        with patch("services.ai.requests.post", return_value=mock_stream_resp):
            tokens = list(call_llm_stream(messages=[{"role": "user", "content": "hi"}]))

        assert tokens == ["A"]

    def test_skips_lines_without_data_prefix(self, ai_env: None, mock_stream_resp: MagicMock) -> None:
        sse_lines = [
            b"event: ping",
            b"data: {\"choices\":[{\"delta\":{\"content\":\"B\"}}]}",
            b"data: [DONE]",
        ]
        mock_stream_resp.iter_lines.return_value = iter(sse_lines)

        with patch("services.ai.requests.post", return_value=mock_stream_resp):
            tokens = list(call_llm_stream(messages=[{"role": "user", "content": "hi"}]))

        assert tokens == ["B"]

    def test_sets_stream_true_in_payload(self, ai_env: None, mock_stream_resp: MagicMock) -> None:
        mock_stream_resp.iter_lines.return_value = iter([b"data: [DONE]"])

        with patch("services.ai.requests.post", return_value=mock_stream_resp) as mock_post:
            list(call_llm_stream(messages=[{"role": "user", "content": "hi"}]))

        payload = mock_post.call_args.kwargs["json"]
        assert payload["stream"] is True

    def test_skips_malformed_json_lines(self, ai_env: None, mock_stream_resp: MagicMock) -> None:
        sse_lines = [
            b"data: {malformed json}",
            b'data: {"choices":[{"delta":{"content":"good"}}]}',
            b"data: [DONE]",
        ]
        mock_stream_resp.iter_lines.return_value = iter(sse_lines)

        with patch("services.ai.requests.post", return_value=mock_stream_resp):
            tokens = list(call_llm_stream(messages=[{"role": "user", "content": "hi"}]))

        assert tokens == ["good"]
