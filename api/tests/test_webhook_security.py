import hashlib
import hmac

from api.webhook_security import verify_signature, parse_comment_events, parse_postback_events

SECRET = "test-ig-secret"


def _sig(body: bytes) -> str:
    return "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()


def test_verify_signature_ok_and_bad():
    body = b'{"object":"instagram","entry":[]}'
    assert verify_signature(body, _sig(body), [SECRET])
    assert not verify_signature(body, "sha256=deadbeef", [SECRET])
    assert not verify_signature(body, None, [SECRET])
    assert not verify_signature(body, _sig(body), [])


def test_parse_comment_events_basic_and_self_skip():
    payload = {"object": "instagram", "entry": [
        {"id": "ig1", "time": 1, "changes": [
            {"field": "comments", "value": {"id": "c1", "text": "LINK please",
                                            "from": {"id": "u2", "username": "fan"},
                                            "media": {"id": "m1"}}},
            {"field": "comments", "value": {"id": "c2", "text": "own",
                                            "from": {"id": "ig1"}, "media": {"id": "m1"}}},
            {"field": "likes", "value": {}},
        ]}]}
    events = parse_comment_events(payload)
    assert len(events) == 1
    e = events[0]
    assert (e.instagram_account_id, e.comment_id, e.media_id, e.commenter_id) == ("ig1", "c1", "m1", "u2")
    assert e.comment_text == "LINK please" and e.commenter_name == "fan"


def test_parse_comment_events_non_instagram_object():
    assert parse_comment_events({"object": "page", "entry": []}) == []


def test_parse_postback_events():
    payload = {"object": "instagram", "entry": [
        {"id": "ig1", "messaging": [
            {"sender": {"id": "u2"}, "recipient": {"id": "ig1"},
             "postback": {"mid": "m1", "title": "Get it", "payload": "reveal:auto1"}}]}]}
    events = parse_postback_events(payload)
    assert len(events) == 1 and events[0].payload == "reveal:auto1" and events[0].user_id == "u2"
