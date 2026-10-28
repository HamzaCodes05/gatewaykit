from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any, Callable, Iterator

import httpx

RETRYABLE = {429, 502, 503}


class GatewayError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(f"[{status}] {message}")
        self.status = status
        self.message = message


@dataclass
class Usage:
    input_tokens: int
    output_tokens: int
    cost_usd: float


@dataclass
class ChatResponse:
    id: str
    model: str
    content: str
    cached: bool
    latency_ms: int
    usage: Usage


class ChatStream:
    """Iterate to receive text deltas. After exhaustion, `.usage` and `.latency_ms` are set."""

    def __init__(self, response: httpx.Response):
        self._response = response
        self.usage: Usage | None = None
        self.latency_ms: int | None = None

    def __iter__(self) -> Iterator[str]:
        event = None
        try:
            for line in self._response.iter_lines():
                if line.startswith("event: "):
                    event = line[7:]
                elif line.startswith("data: "):
                    data = json.loads(line[6:])
                    if event == "delta":
                        yield data["text"]
                    elif event == "done":
                        self.usage = Usage(**data["usage"])
                        self.latency_ms = data["latency_ms"]
                    elif event == "error":
                        raise GatewayError(502, data.get("message", "stream failed"))
        finally:
            self._response.close()


class Client:
    def __init__(
        self,
        api_key: str,
        base_url: str = "http://localhost:4000",
        *,
        timeout: float = 60.0,
        max_retries: int = 2,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self._http = httpx.Client(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout,
            transport=transport,
        )
        self._max_retries = max_retries
        self._sleep = sleep

    # -- public API ---------------------------------------------------------

    def chat(
        self,
        model: str,
        messages: list[dict[str, str]],
        *,
        system: str | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
    ) -> ChatResponse:
        body = self._body(model, messages, system, max_tokens, temperature)
        d = self._send(body).json()
        return ChatResponse(
            id=d["id"], model=d["model"], content=d["content"], cached=d["cached"],
            latency_ms=d["latency_ms"], usage=Usage(**d["usage"]),
        )

    def stream(
        self,
        model: str,
        messages: list[dict[str, str]],
        *,
        system: str | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
    ) -> ChatStream:
        body = self._body(model, messages, system, max_tokens, temperature) | {"stream": True}
        return ChatStream(self._send(body, stream=True))

    def models(self) -> list[dict[str, Any]]:
        r = self._http.get("/v1/models")
        self._raise_for_status(r)
        return r.json()["data"]

    def close(self) -> None:
        self._http.close()

    # -- internals ----------------------------------------------------------

    @staticmethod
    def _body(model, messages, system, max_tokens, temperature) -> dict[str, Any]:
        body: dict[str, Any] = {"model": model, "messages": messages}
        if system is not None:
            body["system"] = system
        if max_tokens is not None:
            body["max_tokens"] = max_tokens
        if temperature is not None:
            body["temperature"] = temperature
        return body

    def _send(self, body: dict[str, Any], *, stream: bool = False) -> httpx.Response:
        """POST /v1/chat, retrying transient failures before any response bytes are consumed."""
        for attempt in range(self._max_retries + 1):
            request = self._http.build_request("POST", "/v1/chat", json=body)
            response = self._http.send(request, stream=stream)
            if response.status_code < 400:
                return response
            if stream:
                response.read()
            if response.status_code in RETRYABLE and attempt < self._max_retries:
                delay = self._delay(response, attempt)
                response.close()
                self._sleep(delay)
                continue
            self._raise_for_status(response)
        raise AssertionError("unreachable")

    @staticmethod
    def _delay(response: httpx.Response, attempt: int) -> float:
        try:
            return min(30.0, float(response.headers["retry-after"]))
        except (KeyError, ValueError):
            return min(30.0, 0.5 * 2**attempt)

    @staticmethod
    def _raise_for_status(response: httpx.Response) -> None:
        if response.status_code < 400:
            return
        try:
            message = response.json().get("message", response.text)
            if isinstance(message, list):
                message = ", ".join(message)
        except ValueError:
            message = response.text
        raise GatewayError(response.status_code, str(message))
