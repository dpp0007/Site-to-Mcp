"""Hosted API: auth, rate limits, headers, REST calls and error mapping (TinyFish faked)."""
import hashlib

import pytest
from starlette.testclient import TestClient

import api
import tf

KEY = "s2m_test-key-123"


@pytest.fixture(scope="module")
def client():
    mp = pytest.MonkeyPatch()
    mp.setenv("API_KEYS", f"tester:{hashlib.sha256(KEY.encode()).hexdigest()}")
    mp.setenv("ALLOWED_ORIGINS", "https://app.example")
    import server
    app = api.build_app(server.mcp)
    with TestClient(app) as c:
        yield c
    mp.undo()


AUTH = {"Authorization": f"Bearer {KEY}"}


def test_public_endpoints_need_no_key_and_carry_security_headers(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["tools"] >= 12
    assert r.headers["x-content-type-options"] == "nosniff" and "frame-ancestors" in r.headers["content-security-policy"]
    names = {t["name"] for t in client.get("/api/tools").json()["tools"]}
    assert {"list_events_from_page", "check_site_access", "mit_get_course"} <= names


def test_keyed_endpoints_reject_missing_and_wrong_keys(client):
    assert client.post("/api/tools/list_python_events", json={}).status_code == 401
    assert client.post("/api/tools/list_python_events", json={}, headers={"Authorization": "Bearer nope"}).status_code == 401
    assert client.post("/mcp", json={}).status_code == 401


def test_rest_call_returns_typed_json(client, monkeypatch):
    monkeypatch.setattr(tf, "agent_json", lambda *a: {"events": [{"name": "A", "start": "2026-11-12T18:00"}]})
    r = client.post("/api/tools/list_events_from_page", json={"url": "https://events.example.org/nyc", "limit": 3}, headers=AUTH)
    assert r.status_code == 200 and r.json()["events"][0]["name"] == "A"


def test_errors_map_to_codes_and_statuses(client):
    r = client.post("/api/tools/list_events_from_page", json={"url": "http://localhost:1"}, headers=AUTH)
    assert r.status_code == 400 and r.json()["error"]["code"] == "BAD_INPUT"
    assert client.post("/api/tools/nope", json={}, headers=AUTH).status_code == 404
    assert client.post("/api/tools/list_python_events", content=b"[1]", headers=AUTH).status_code == 400


def test_body_cap(client):
    r = client.post("/api/tools/list_python_events", content=b"x" * 70000, headers={**AUTH, "content-type": "application/json"})
    assert r.status_code == 413


def test_cors_allows_only_listed_origin(client):
    ok = client.get("/api/health", headers={"Origin": "https://app.example"})
    bad = client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert ok.headers.get("access-control-allow-origin") == "https://app.example"
    assert "access-control-allow-origin" not in bad.headers


def test_rate_limit_per_key(client, monkeypatch):
    monkeypatch.setattr(api, "PER_MINUTE", 2)
    codes = [client.post("/api/tools/nope", json={}, headers={"Authorization": f"Bearer {KEY}"}).status_code for _ in range(4)]
    assert 429 in codes


def test_hosted_refuses_to_start_without_keys(monkeypatch):
    monkeypatch.delenv("API_KEYS", raising=False)
    monkeypatch.delenv("ALLOW_ANON", raising=False)
    with pytest.raises(RuntimeError, match="API_KEYS"):
        api.load_keys()


def test_openapi_for_chatgpt_actions(client):
    d = client.get("/api/openapi.json").json()
    assert d["openapi"].startswith("3.1") and "/api/tools/list_events_from_page" in d["paths"]
    op = d["paths"]["/api/tools/list_events_from_page"]["post"]
    assert op["operationId"] == "list_events_from_page" and len(op["summary"]) <= 300
    assert d["components"]["securitySchemes"]["bearer"]["scheme"] == "bearer"


def test_self_serve_key_lifecycle(client, monkeypatch):
    assert client.post("/api/keys").status_code == 404                      # disabled without KEY_SECRET
    monkeypatch.setattr(api, "SECRET", b"test-secret")
    monkeypatch.setattr(tf, "agent_json", lambda *a: {"events": [{"name": "A", "start": "2026-11-12T18:00"}]})
    r = client.post("/api/keys")
    assert r.status_code == 200 and r.json()["key"].startswith("s2m_u.")
    key = r.json()["key"]
    ok = client.post("/api/tools/list_events_from_page", json={"url": "https://events.example.org/nyc"}, headers={"Authorization": f"Bearer {key}"})
    assert ok.status_code == 200
    bad = key[:-1] + ("0" if key[-1] != "0" else "1")                      # tampered signature
    assert client.post("/api/tools/list_python_events", json={}, headers={"Authorization": f"Bearer {bad}"}).status_code == 401
    monkeypatch.setattr(api, "REVOKED", {key.split(".")[2]})
    assert client.post("/api/tools/list_python_events", json={}, headers={"Authorization": f"Bearer {key}"}).status_code == 401
    monkeypatch.setattr(api, "REVOKED", set())
    monkeypatch.setattr(api, "time", type("T", (), {"time": staticmethod(lambda: 9e12), "monotonic": api.time.monotonic}))
    assert client.post("/api/tools/list_python_events", json={}, headers={"Authorization": f"Bearer {key}"}).status_code == 401  # expired


def test_signup_is_limited_per_ip(client, monkeypatch):
    monkeypatch.setattr(api, "SECRET", b"test-secret")
    codes = [client.post("/api/keys").status_code for _ in range(api.SIGNUP_PER_DAY + 1)]
    assert codes[-1] == 429
