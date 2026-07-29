"""Instagram OAuth callback route for the Basic Display API.

Handles the OAuth redirect from Instagram after a user authorizes the app.
Exchanges the authorization code for tokens, fetches the Instagram profile,
and stores it in Appwrite. Returns an HTML page with meta refresh to the
deep link so the mobile app can detect the result.

This module does NOT require Clerk JWT auth — Instagram calls this endpoint
directly via browser redirect.
"""

from __future__ import annotations

import html
import json
import os
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Query
from fastapi.responses import HTMLResponse
from loguru import logger

from api.appwrite_client import get_appwrite_client
from api.token_crypto import get_token_crypto

# ── Constants ─────────────────────────────────────────────────────────────────

GRAPH_API_VERSION = "v25.0"
GRAPH_API_BASE = f"https://graph.instagram.com/{GRAPH_API_VERSION}"
OAUTH_TOKEN_URL = "https://api.instagram.com/oauth/access_token"

# ── Router ────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/instagram", tags=["instagram-oauth"])


# ── Instagram API Helpers ─────────────────────────────────────────────────────


async def exchange_code_for_short_token(
    code: str,
    redirect_uri: str,
    app_id: str,
    app_secret: str,
) -> dict:
    """Exchange the OAuth authorization code for a short-lived access token.

    POSTs to Instagram's OAuth token endpoint with
    application/x-www-form-urlencoded content type.

    Args:
        code: The authorization code from Instagram's redirect.
        redirect_uri: The redirect URI registered with the app.
        app_id: Instagram App ID.
        app_secret: Instagram App Secret.

    Returns:
        The JSON response dict containing access_token, user_id, etc.

    Raises:
        httpx.HTTPError: On network or HTTP errors.
        ValueError: If the response does not contain an access_token.
    """
    logger.info("[OAUTH] Exchanging code for short-lived token")
    async with httpx.AsyncClient() as client:
        response = await client.post(
            OAUTH_TOKEN_URL,
            data={
                "client_id": app_id,
                "client_secret": app_secret,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
                "code": code,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30.0,
        )
        response.raise_for_status()
        data = response.json()

    if "access_token" not in data:
        logger.error("[OAUTH] No access_token in short-token response: {}", data)
        raise ValueError(f"Missing access_token in response: {data}")

    logger.info("[OAUTH] Short-lived token obtained successfully")
    return data


async def exchange_for_long_token(
    short_token: str,
    app_secret: str,
    graph_api_version: str = GRAPH_API_VERSION,
) -> dict:
    """Exchange a short-lived token for a long-lived (60-day) token.

    Args:
        short_token: The short-lived access token.
        app_secret: Instagram App Secret.
        graph_api_version: Instagram Graph API version (default v25.0).

    Returns:
        The JSON response dict containing access_token, expires_in, etc.

    Raises:
        httpx.HTTPError: On network or HTTP errors.
        ValueError: If the response does not contain an access_token.
    """
    logger.info("[OAUTH] Exchanging short-lived token for long-lived token")
    url = (
        f"https://graph.instagram.com/{graph_api_version}/access_token"
        f"?grant_type=ig_exchange_token"
        f"&client_secret={app_secret}"
        f"&access_token={short_token}"
    )
    async with httpx.AsyncClient() as client:
        response = await client.get(url, timeout=30.0)
        response.raise_for_status()
        data = response.json()

    if "access_token" not in data:
        logger.error("[OAUTH] No access_token in long-token response: {}", data)
        raise ValueError(f"Missing access_token in response: {data}")

    logger.info("[OAUTH] Long-lived token obtained successfully")
    return data


async def fetch_instagram_profile(
    access_token: str,
    graph_api_version: str = GRAPH_API_VERSION,
) -> dict:
    """Fetch the authenticated user's Instagram profile.

    Args:
        access_token: A valid Instagram access token (long-lived).
        graph_api_version: Instagram Graph API version (default v25.0).

    Returns:
        The profile dict with fields: id, username, name, account_type,
        media_count, followers_count, follows_count, profile_picture_url,
        biography, website.

    Raises:
        httpx.HTTPError: On network or HTTP errors.
        ValueError: If the response contains an error.
    """
    logger.info("[OAUTH] Fetching Instagram profile")
    fields = (
        "id,username,name,account_type,media_count,"
        "followers_count,follows_count,profile_picture_url,"
        "biography,website"
    )
    url = (
        f"https://graph.instagram.com/{graph_api_version}/me"
        f"?fields={fields}&access_token={access_token}"
    )
    async with httpx.AsyncClient() as client:
        response = await client.get(url, timeout=30.0)
        response.raise_for_status()
        data = response.json()

    if "error" in data:
        logger.error("[OAUTH] Profile fetch error: {}", data["error"])
        raise ValueError(f"Instagram API error: {data['error']}")

    if "id" not in data:
        logger.error("[OAUTH] No id in profile response: {}", data)
        raise ValueError(f"Missing id in profile response: {data}")

    logger.info("[OAUTH] Profile fetched for user {}", data.get("username", data.get("id", "unknown")))
    return data


def calculate_token_expiry(expires_in: int | None) -> str:
    """Calculate the ISO datetime when the token expires.

    Args:
        expires_in: Seconds until token expiry (from Instagram API response).
                    If None, defaults to 60 days.

    Returns:
        ISO 8601 datetime string.
    """
    if expires_in is None:
        expires_in = 5184000  # 60 days in seconds
    expiry = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    return expiry.isoformat()


def build_creator_data(
    profile: dict,
    access_token: str,
    token_expires_at: str,
    clerk_id: str,
) -> dict:
    """Map an Instagram Graph API profile to the Appwrite creator schema.

    Args:
        profile: Profile dict from fetch_instagram_profile().
        access_token: The long-lived access token.
        token_expires_at: ISO datetime when the token expires.
        clerk_id: The Clerk user ID from the OAuth state.

    Returns:
        A dict matching the Appwrite creators table schema.
    """
    account_type_raw = profile.get("account_type", "").lower()
    # Normalize account_type to one of the expected values
    if account_type_raw in ("business", "creator", "personal"):
        account_type = account_type_raw
    elif account_type_raw == "professional":
        account_type = "creator"
    else:
        account_type = "personal"

    is_business = account_type == "business"
    now = datetime.now(timezone.utc).isoformat()

    return {
        "clerk_user_id": clerk_id,
        "ig_user_id": profile.get("id", ""),
        "ig_scoped_id": profile.get("id", ""),
        "username": profile.get("username", ""),
        "full_name": profile.get("name", ""),
        "bio": profile.get("biography", ""),
        "external_url": profile.get("website", ""),
        "profile_pic_url": profile.get("profile_picture_url", ""),
        "follower_count": profile.get("followers_count", 0),
        "following_count": profile.get("follows_count", 0),
        "post_count": profile.get("media_count", 0),
        "is_verified": False,
        "is_business": is_business,
        "account_type": account_type,
        "is_onboarded": True,
        "access_token": access_token,
        "ig_session_json": None,
        "token_expires_at": token_expires_at,
        "updated_at": now,
    }


# ── HTML Page Templates ───────────────────────────────────────────────────────


def success_page(username: str, redirect_url: str) -> str:
    """Return an HTML page that redirects to the app with a success status."""
    safe_username = html.escape(username)
    clean_url = _clean_redirect_url(redirect_url)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="2;url={clean_url}?status=success">
    <title>Connected Successfully</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background-color: #fffaf0;
            color: #1a1a2e;
        }}
        .card {{
            text-align: center;
            padding: 2rem;
            max-width: 400px;
        }}
        .checkmark {{
            font-size: 4rem;
            margin-bottom: 1rem;
        }}
        h1 {{ font-size: 1.5rem; margin-bottom: 0.5rem; }}
        p {{ color: #666; margin-bottom: 1.5rem; }}
        .redirect {{ font-size: 0.875rem; color: #999; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="checkmark">✅</div>
        <h1>Instagram Connected</h1>
        <p>Your account <strong>@{safe_username}</strong> has been connected successfully.</p>
        <p class="redirect">Redirecting back to the app...</p>
    </div>
</body>
</html>"""


def error_page(message: str, redirect_url: str) -> str:
    """Return an HTML page that redirects to the app with an error status."""
    safe_message = html.escape(message)
    clean_url = _clean_redirect_url(redirect_url)
    encoded_message = urlencode({"message": safe_message})
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="3;url={clean_url}?status=error&{encoded_message}">
    <title>Connection Failed</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background-color: #fffaf0;
            color: #1a1a2e;
        }}
        .card {{
            text-align: center;
            padding: 2rem;
            max-width: 400px;
        }}
        .icon {{ font-size: 4rem; margin-bottom: 1rem; }}
        h1 {{ font-size: 1.5rem; margin-bottom: 0.5rem; color: #dc2626; }}
        p {{ color: #666; margin-bottom: 1.5rem; word-break: break-word; }}
        .redirect {{ font-size: 0.875rem; color: #999; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">❌</div>
        <h1>Connection Failed</h1>
        <p>{safe_message}</p>
        <p class="redirect">Redirecting back to the app...</p>
    </div>
</body>
</html>"""


def _clean_redirect_url(redirect_url: str) -> str:
    """Strip path from exp:// URLs to prevent Expo Go 'Failed to download update' error.

    Expo Go interprets paths in exp:// URLs as routes to load. When the
    callback page redirects to exp://host:port/--/instagram-callback,
    Expo Go tries to download a bundle for that route and fails.
    Stripping the path leaves just exp://host:port which brings the
    app to the foreground without triggering a bundle load.
    """
    if redirect_url.startswith("exp://"):
        from urllib.parse import urlparse
        parsed = urlparse(redirect_url)
        return f"exp://{parsed.netloc}"
    return html.escape(redirect_url)


# ── Callback Endpoint ─────────────────────────────────────────────────────────


@router.get("/callback", response_class=HTMLResponse)
async def instagram_callback(
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    error_reason: str | None = Query(None),
    error_description: str | None = Query(None),
):
    """Handle the Instagram OAuth redirect callback.

    Instagram redirects the user's browser here after they authorize (or
    deny) the app. This endpoint:

    1. Checks for OAuth errors from Instagram
    2. Validates the code and state parameters
    3. Parses the state JSON (clerk_id, uid, redirect_url)
    4. Exchanges the code for a short-lived token
    5. Exchanges the short-lived token for a long-lived token
    6. Fetches the Instagram profile
    7. Stores the profile in Appwrite
    8. Returns an HTML page with meta refresh to the deep link

    This endpoint does NOT require Clerk JWT auth — Instagram calls it
    directly via browser redirect.
    """
    logger.info("[OAUTH] Received callback — code={} state={} error={}", code is not None, state is not None, error)

    # ── Step 1: Check for OAuth error from Instagram ──────────────────────
    if error:
        message = error_description or error_reason or error
        logger.error("[OAUTH] Instagram returned error: {} — {}", error, error_description or error_reason or "")
        # Try to parse state for redirect_url even on error
        redirect_url = _extract_redirect_url(state)
        return HTMLResponse(content=error_page(message, redirect_url or "exp://localhost:8081"))

    # ── Step 2: Validate code and state ───────────────────────────────────
    if not code:
        logger.error("[OAUTH] Missing authorization code in callback")
        redirect_url = _extract_redirect_url(state)
        return HTMLResponse(
            content=error_page("Missing authorization code from Instagram.", redirect_url or "exp://localhost:8081"),
        )

    if not state:
        logger.error("[OAUTH] Missing state parameter in callback")
        return HTMLResponse(
            content=error_page("Missing state parameter. Please try connecting again.", "exp://localhost:8081"),
        )

    # ── Step 3: Parse state JSON ──────────────────────────────────────────
    try:
        state_data = json.loads(state)
        clerk_id = state_data.get("clerk_id", "")
        uid = state_data.get("uid", "")
        redirect_url = state_data.get("redirect_url", "exp://localhost:8081")
        logger.info("[OAUTH] Parsed state — clerk_id={} uid={}", clerk_id, uid)
    except (json.JSONDecodeError, TypeError) as exc:
        logger.error("[OAUTH] Failed to parse state JSON: {} — {}", state, exc)
        return HTMLResponse(
            content=error_page("Invalid state parameter. Please try connecting again.", "exp://localhost:8081"),
        )

    if not clerk_id:
        logger.error("[OAUTH] Missing clerk_id in state")
        return HTMLResponse(
            content=error_page("Missing user identifier. Please try connecting again.", redirect_url),
        )

    # ── Step 4: Read env vars ─────────────────────────────────────────────
    app_id = os.getenv("INSTAGRAM_APP_ID", "")
    app_secret = os.getenv("INSTAGRAM_APP_SECRET", "")
    redirect_uri = os.getenv("REDIRECT_URI", "")

    if not app_id or not app_secret:
        logger.error("[OAUTH] Missing INSTAGRAM_APP_ID or INSTAGRAM_APP_SECRET env vars")
        return HTMLResponse(
            content=error_page("Server configuration error. Please contact support.", redirect_url),
        )

    if not redirect_uri:
        logger.error("[OAUTH] Missing REDIRECT_URI env var")
        return HTMLResponse(
            content=error_page("Server configuration error. Please contact support.", redirect_url),
        )

    # ── Step 5: Exchange code for short-lived token ───────────────────────
    try:
        short_token_data = await exchange_code_for_short_token(code, redirect_uri, app_id, app_secret)
        short_token = short_token_data["access_token"]
        logger.info("[OAUTH] Short-lived token obtained")
    except (httpx.HTTPError, ValueError) as exc:
        logger.error("[OAUTH] Failed to exchange code for short token: {}", exc)
        return HTMLResponse(
            content=error_page(f"Failed to exchange authorization code: {exc}", redirect_url),
        )

    # ── Step 6: Exchange for long-lived token ─────────────────────────────
    try:
        long_token_data = await exchange_for_long_token(short_token, app_secret)
        long_token = long_token_data["access_token"]
        expires_in = long_token_data.get("expires_in")
        token_expires_at = calculate_token_expiry(expires_in)
        logger.info("[OAUTH] Long-lived token obtained, expires at {}", token_expires_at)
    except (httpx.HTTPError, ValueError) as exc:
        logger.error("[OAUTH] Failed to exchange for long token: {}", exc)
        return HTMLResponse(
            content=error_page(f"Failed to obtain long-lived token: {exc}", redirect_url),
        )

    # ── Step 7: Fetch Instagram profile ───────────────────────────────────
    try:
        profile = await fetch_instagram_profile(long_token)
        username = profile.get("username", profile.get("id", "unknown"))
        logger.info("[OAUTH] Profile fetched for @{}", username)
    except (httpx.HTTPError, ValueError) as exc:
        logger.error("[OAUTH] Failed to fetch Instagram profile: {}", exc)
        return HTMLResponse(
            content=error_page(f"Failed to fetch Instagram profile: {exc}", redirect_url),
        )

    # ── Step 8: Store in Appwrite ─────────────────────────────────────────
    try:
        encrypted_token = get_token_crypto().encrypt(long_token)
        creator_data = build_creator_data(profile, encrypted_token, token_expires_at, clerk_id)
        success = get_appwrite_client().store_creator_profile(clerk_id, creator_data)
        if success:
            logger.info("[OAUTH] Creator profile stored in Appwrite for clerk_id={}", clerk_id)
        else:
            logger.error("[OAUTH] Failed to store creator profile in Appwrite for clerk_id={}", clerk_id)
            return HTMLResponse(
                content=error_page("Failed to save your profile. Please try again.", redirect_url),
            )
    except Exception as exc:
        logger.error("[OAUTH] Unexpected error storing profile in Appwrite: {}", exc)
        return HTMLResponse(
            content=error_page(f"Failed to save your profile: {exc}", redirect_url),
        )

    # ── Step 9: Return success page ───────────────────────────────────────
    logger.info("[OAUTH] OAuth flow completed successfully for @{} (clerk_id={})", username, clerk_id)
    return HTMLResponse(content=success_page(username, redirect_url))


# ── Helpers ───────────────────────────────────────────────────────────────────


def _extract_redirect_url(state: str | None) -> str | None:
    """Try to extract the redirect_url from the state JSON.

    Args:
        state: The state parameter from the OAuth callback (JSON string).

    Returns:
        The redirect_url if parsing succeeds, None otherwise.
    """
    if not state:
        return None
    try:
        state_data = json.loads(state)
        return state_data.get("redirect_url")
    except (json.JSONDecodeError, TypeError):
        return None
