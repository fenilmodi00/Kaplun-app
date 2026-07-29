import hashlib
import hmac
import json

from fastapi.testclient import TestClient

from api.main import app


def test_get_verification_ok():
    r = TestClient(app).get("/webhooks/instagram", params={
        "hub.mode": "subscribe", "hub.verify_token": "test-verify-token", "hub.challenge": "42"})
    assert r.status_code == 200 and r.text == "42"


def test_get_verification_wrong_token_403():
    r = TestClient(app).get("/webhooks/instagram", params={
        "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "42"})
    assert r.status_code == 403


def test_post_bad_signature_401():
    r = TestClient(app).post("/webhooks/instagram", content=b"{}",
                             headers={"x-hub-signature-256": "sha256=bad"})
    assert r.status_code == 401


def test_post_creates_job(monkeypatch):
    created = []

    class FakeStore:
        def create_job(self, type_, payload, run_at_iso=None):
            created.append((type_, payload))
            return {"$id": "j1"}

    monkeypatch.setattr("api.routes.webhooks.get_automation_store", lambda: FakeStore())
    body = json.dumps({"object": "instagram", "entry": [{"id": "ig1", "changes": [
        {"field": "comments", "value": {"id": "c1", "text": "LINK",
                                        "from": {"id": "u2"}, "media": {"id": "m1"}}}]}]}).encode()
    sig = "sha256=" + hmac.new(b"test-ig-secret", body, hashlib.sha256).hexdigest()
    r = TestClient(app).post("/webhooks/instagram", content=body,
                             headers={"x-hub-signature-256": sig})
    assert r.status_code == 200
    assert created and created[0][0] == "process_comment"
    assert created[0][1]["comment_id"] == "c1"
