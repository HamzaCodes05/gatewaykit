import httpx
import pytest

from gatewaykit import Client, GatewayError

OK = {
    "id": "chat_1", "model": "mock-1", "content": "hi", "cached": False, "latency_ms": 12,
    "usage": {"input_tokens": 3, "output_tokens": 5, "cost_usd": 0.00002},
}
MSG = [{"role": "user", "content": "hello"}]


def make_client(handler, **kw):
    sleeps: list[float] = []
    client = Client("gk_test", transport=httpx.MockTransport(handler), sleep=sleeps.append, **kw)
    return client, sleeps


def test_chat_parses_response_and_sends_auth():
    seen = {}

    def handler(request: httpx.Request):
        seen["auth"] = request.headers["authorization"]
        seen["body"] = request.read()
        return httpx.Response(201, json=OK)

    client, _ = make_client(handler)
    res = client.chat("mock-1", MSG, temperature=0, max_tokens=50)

    assert res.content == "hi" and res.usage.output_tokens == 5 and res.cached is False
    assert seen["auth"] == "Bearer gk_test"
    assert b'"temperature":0' in seen["body"].replace(b" ", b"")


def test_retries_429_and_honours_retry_after():
    calls = []

    def handler(request):
        calls.append(1)
        if len(calls) == 1:
            return httpx.Response(429, headers={"Retry-After": "2"}, json={"message": "Rate limit exceeded"})
        return httpx.Response(201, json=OK)

    client, sleeps = make_client(handler)
    assert client.chat("mock-1", MSG).content == "hi"
    assert len(calls) == 2 and sleeps == [2.0]


def test_gives_up_after_max_retries():
    client, sleeps = make_client(lambda r: httpx.Response(503, json={"message": "down"}), max_retries=2)
    with pytest.raises(GatewayError) as e:
        client.chat("mock-1", MSG)
    assert e.value.status == 503
    assert len(sleeps) == 2  # 3 attempts, 2 waits


@pytest.mark.parametrize("status", [400, 401, 402])
def test_client_errors_are_not_retried(status):
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(status, json={"message": ["bad thing", "other thing"]})

    client, sleeps = make_client(handler)
    with pytest.raises(GatewayError, match="bad thing, other thing") as e:
        client.chat("mock-1", MSG)
    assert e.value.status == status and len(calls) == 1 and sleeps == []


SSE = (
    'event: delta\ndata: {"text":"Hel"}\n\n'
    'event: delta\ndata: {"text":"lo"}\n\n'
    'event: done\ndata: {"id":"c","latency_ms":9,"usage":{"input_tokens":1,"output_tokens":2,"cost_usd":0.1}}\n\n'
)


def test_stream_yields_deltas_and_exposes_usage():
    client, _ = make_client(lambda r: httpx.Response(200, content=SSE.encode(), headers={"content-type": "text/event-stream"}))
    stream = client.stream("mock-1", MSG)
    assert stream.usage is None
    assert "".join(stream) == "Hello"
    assert stream.usage.output_tokens == 2 and stream.latency_ms == 9


def test_stream_error_event_raises():
    body = 'event: delta\ndata: {"text":"a"}\n\nevent: error\ndata: {"message":"upstream died"}\n\n'
    client, _ = make_client(lambda r: httpx.Response(200, content=body.encode()))
    with pytest.raises(GatewayError, match="upstream died"):
        list(client.stream("mock-1", MSG))


def test_stream_retries_before_first_byte():
    calls = []

    def handler(request):
        calls.append(1)
        if len(calls) == 1:
            return httpx.Response(429, headers={"Retry-After": "1"}, json={"message": "slow down"})
        return httpx.Response(200, content=SSE.encode())

    client, sleeps = make_client(handler)
    assert "".join(client.stream("mock-1", MSG)) == "Hello" and sleeps == [1.0]
