# gatewaykit (Python SDK)

```python
from gatewaykit import Client

client = Client(api_key="gk_...", base_url="http://localhost:4000")

res = client.chat("mock-1", [{"role": "user", "content": "Hello"}], temperature=0)
print(res.content, res.usage.cost_usd, res.cached)

stream = client.stream("mock-1", [{"role": "user", "content": "Tell me a story"}])
for token in stream:
    print(token, end="", flush=True)
print(stream.usage)
```

- Retries `429` / `502` / `503` with `Retry-After` support and exponential backoff (`max_retries=2` by default).
- Never retries `401`, `402` (budget) or `400`.
- Raises `GatewayError(status, message)` on failure.
