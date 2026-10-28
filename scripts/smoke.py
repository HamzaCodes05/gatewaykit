#!/usr/bin/env python3
"""End-to-end smoke test against a running stack (uses the built-in mock model, no API key needed).

    python scripts/smoke.py [--url http://localhost:4000] [--email admin@gatewaykit.dev] [--password admin1234]
"""
import argparse
import json
import sys
import urllib.error
import urllib.request

p = argparse.ArgumentParser()
p.add_argument("--url", default="http://localhost:4000")
p.add_argument("--email", default="admin@gatewaykit.dev")
p.add_argument("--password", default="admin1234")
args = p.parse_args()

failures = 0


def call(method, path, body=None, token=None, raw=False):
    req = urllib.request.Request(
        args.url + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"content-type": "application/json", **({"authorization": f"Bearer {token}"} if token else {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read().decode()
            return r.status, dict(r.headers), data if raw else (json.loads(data) if data else None)
    except urllib.error.HTTPError as e:
        data = e.read().decode()
        try:
            data = json.loads(data)
        except ValueError:
            pass
        return e.code, dict(e.headers), data


def check(name, cond, detail=""):
    global failures
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"   {detail}" if detail and not cond else ""))
    failures += not cond


chat = lambda key, **kw: call("POST", "/v1/chat", {"model": "mock-1", "messages": [{"role": "user", "content": "hello"}], **kw}, key)

# --- admin auth ---
s, _, _ = call("POST", "/auth/login", {"email": args.email, "password": "wrong-password"})
check("login rejects bad password", s == 401, s)
s, _, body = call("POST", "/auth/login", {"email": args.email, "password": args.password})
check("login ok", s in (200, 201) and "accessToken" in body, s)
admin = body["accessToken"]
s, _, _ = call("GET", "/admin/keys")
check("admin routes require JWT", s == 401, s)

# --- key lifecycle ---
s, _, k = call("POST", "/admin/keys", {"name": "smoke", "rpmLimit": 100}, admin)
check("create key returns secret once", s in (200, 201) and k["secret"].startswith("gk_"), s)
key, key_id = k["secret"], k["id"]
_, _, keys = call("GET", "/admin/keys", token=admin)
check("listing never exposes the secret", all("secret" not in x and "hash" not in x for x in keys))

s, _, _ = call("POST", "/v1/chat", {"model": "mock-1", "messages": [{"role": "user", "content": "x"}]})
check("gateway rejects missing key", s == 401, s)
s, _, _ = chat("gk_not-a-real-key")
check("gateway rejects invalid key", s == 401, s)

# --- chat ---
s, h, r = chat(key)
check("chat completes", s in (200, 201) and r["content"].startswith("Mock reply"), r)
check("response has usage + cost", r["usage"]["cost_usd"] > 0 and r["usage"]["input_tokens"] > 0)
check("rate-limit headers present", "X-RateLimit-Remaining" in h or "x-ratelimit-remaining" in h)
s, _, r = call("POST", "/v1/chat", {"model": "nope", "messages": [{"role": "user", "content": "x"}]}, key)
check("unknown model -> 400", s == 400, s)
s, _, r = call("POST", "/v1/chat", {"model": "mock-1", "messages": []}, key)
check("empty messages -> 400", s == 400, s)

# --- cache (temperature 0 only) ---
_, _, a = chat(key, temperature=0, messages=[{"role": "user", "content": "cache me"}])
_, _, b = chat(key, temperature=0, messages=[{"role": "user", "content": "cache me"}])
check("first deterministic call is a miss", a["cached"] is False)
check("second identical call is a cache hit with $0", b["cached"] is True and b["usage"]["cost_usd"] == 0)
_, _, c = chat(key, messages=[{"role": "user", "content": "cache me"}])
check("non-deterministic call is never cached", c["cached"] is False)

# --- tenant isolation of cache ---
_, _, k2 = call("POST", "/admin/keys", {"name": "other-tenant"}, admin)
_, _, d = chat(k2["secret"], temperature=0, messages=[{"role": "user", "content": "cache me"}])
check("cache is not shared across keys", d["cached"] is False)

# --- streaming ---
s, _, raw = call("POST", "/v1/chat", {"model": "mock-1", "stream": True, "messages": [{"role": "user", "content": "stream please"}]}, key, raw=True)
events = [blk.split("\n") for blk in raw.strip().split("\n\n")]
names = [e[0].removeprefix("event: ") for e in events]
text = "".join(json.loads(e[1].removeprefix("data: "))["text"] for e in events if e[0] == "event: delta")
done = json.loads(next(e[1] for e in events if e[0] == "event: done").removeprefix("data: "))
check("stream emits deltas then done", names[0] == "delta" and names[-1] == "done", names[:3])
check("stream text reassembles", text.startswith("Mock reply to"), text)
check("stream reports usage", done["usage"]["output_tokens"] > 0)

# --- rate limit (rpm=2, 6 calls => some window must exceed 2) ---
_, _, rk = call("POST", "/admin/keys", {"name": "ratelimited", "rpmLimit": 2}, admin)
results = [call("POST", "/v1/chat", {"model": "mock-1", "messages": [{"role": "user", "content": "x"}]}, rk["secret"]) for _ in range(6)]
limited = [r for r in results if r[0] == 429]
check("rate limit returns 429", len(limited) >= 1, [r[0] for r in results])
check("429 includes Retry-After", bool(limited) and any(k.lower() == "retry-after" for k in limited[0][1]))

# --- budget (soft cap) ---
_, _, bk = call("POST", "/admin/keys", {"name": "budgeted", "monthlyBudgetUsd": 0.0001}, admin)
big = "word " * 1000
first = call("POST", "/v1/chat", {"model": "mock-1", "messages": [{"role": "user", "content": big}]}, bk["secret"])
second = call("POST", "/v1/chat", {"model": "mock-1", "messages": [{"role": "user", "content": "again"}]}, bk["secret"])
check("request that crosses the budget completes", first[0] in (200, 201), first[0])
check("next request is refused with 402", second[0] == 402, second[0])

# --- revocation ---
s, _, _ = call("DELETE", f"/admin/keys/{key_id}", token=admin)
check("revoke key", s == 200, s)
s, _, _ = chat(key)
check("revoked key is rejected", s == 401, s)

# --- analytics ---
_, _, st = call("GET", "/admin/stats?days=7", token=admin)
# 401/429/402 are rejected by the guard before metering, so only served requests are counted.
check("stats summary counts served requests", st["summary"]["requests"] >= 8, st["summary"])
check("stats include cache hit rate", st["summary"]["cacheHitRate"] > 0)
check("stats include latency percentiles", st["summary"]["p50Ms"] is not None)
check("daily series has 7 buckets", len(st["daily"]) == 7)
check("per-model breakdown present", any(m["model"] == "mock-1" for m in st["byModel"]))
_, _, rq = call("GET", "/admin/requests?limit=5", token=admin)
check("request log returns rows", len(rq) == 5 and "keyName" in rq[0])
check("failed/limited requests do not leak secrets", "gk_" not in json.dumps(rq))

print(f"\n{'ALL PASSED' if not failures else str(failures) + ' FAILED'}")
sys.exit(1 if failures else 0)
