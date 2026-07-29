import json
import httpx

from api.graph_client import (
    TokenExpiredError,
    send_private_reply,
    send_comment_reply,
    refresh_long_lived_token,
)


def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_send_private_reply_shape():
    seen = {}

    async def handler(request):
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.content)
        seen["auth"] = request.headers["authorization"]
        return httpx.Response(200, json={"recipient_id": "r1", "message_id": "m1"})

    async with _client(handler) as c:
        out = await send_private_reply("ig123", "cmt9", "hi there", access_token="tok", client=c)

    assert out["message_id"] == "m1"
    assert seen["url"] == "https://graph.instagram.com/v25.0/ig123/messages"
    assert seen["body"] == {"recipient": {"comment_id": "cmt9"}, "message": {"text": "hi there"}}
    assert seen["auth"] == "Bearer tok"


async def test_send_comment_reply_shape():
    async def handler(request):
        assert str(request.url) == "https://graph.instagram.com/v25.0/cmt9/replies"
        assert json.loads(request.content) == {"message": "thanks!"}
        return httpx.Response(200, json={"id": "reply1"})

    async with _client(handler) as c:
        assert (await send_comment_reply("cmt9", "thanks!", access_token="t", client=c))["id"] == "reply1"


async def test_error_190_raises_token_expired():
    async def handler(request):
        return httpx.Response(400, json={"error": {"message": "expired", "type": "OAuthException", "code": 190, "fbtrace_id": "fb"}})

    async with _client(handler) as c:
        try:
            await send_private_reply("ig", "c", "m", access_token="t", client=c)
            assert False, "should have raised"
        except TokenExpiredError:
            pass


async def test_refresh_token():
    async def handler(request):
        assert "grant_type=ig_refresh_token" in str(request.url)
        return httpx.Response(200, json={"access_token": "newtok", "expires_in": 5184000})

    async with _client(handler) as c:
        out = await refresh_long_lived_token("oldtok", client=c)
    assert out["access_token"] == "newtok" and out["expires_in"] == 5184000
