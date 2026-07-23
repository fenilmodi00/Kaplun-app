"""FastAPI application with CORS, Clerk JWT auth, and Instagram dashboard routes.

Provides the backend API for the Instagram creator dashboard MVP.
Endpoints use instagrapi via SessionManager, sync profiles to Appwrite, and
require a valid Clerk JWT for every route except /health.
"""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

# Load api/.env before any module reads os.environ (auth, appwrite, CORS).
load_dotenv(Path(__file__).resolve().parent / ".env")

import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
from pydantic import BaseModel
from instagrapi.exceptions import (
    LoginRequired,
    BadPassword,
    PleaseWaitFewMinutes,
    RateLimitError,
    ClientThrottledError,
    ClientError,
    TwoFactorRequired,
)

from api.auth import get_clerk_user_id
from api.session_manager import StaleSessionError, get_session_manager
from api.appwrite_client import get_appwrite_client


class LoginRequest(BaseModel):
    """Request body for POST /login."""

    clerk_id: str
    username: str
    password: str


class CreateSessionResponse(BaseModel):
    """Response body for POST /auth/appwrite-session."""

    userId: str
    secret: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown context for the FastAPI app."""
    logger.info("API server starting up")
    yield
    # Graceful shutdown: logout all active Instagram sessions
    sm = get_session_manager()
    logged_out = sm.logout_all()
    logger.info("API server shutting down (logged out {} sessions)", logged_out)


app = FastAPI(
    title="Vernacular Creator API",
    description="Instagram creator dashboard backend — MVP",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS: read allowed origins from env, default to wildcard for MVP dev
_cors_origins = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Return dict HTTPException details directly as JSON (not wrapped in 'detail')."""
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """Attach a unique request_id to every request for log correlation."""
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:8])
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


def require_clerk_user_id(authorization: str | None = Header(None)) -> str:
    """FastAPI dependency: require a valid Clerk JWT, returning 401 if missing/invalid.

    Delegates to api.auth.get_clerk_user_id for actual verification.
    """
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail={"error": "unauthorized", "message": "Missing Authorization header"},
        )
    return get_clerk_user_id(authorization)


# ── Health ────────────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


@app.post("/auth/appwrite-session")
async def create_appwrite_session(clerk_user_id: str = Depends(require_clerk_user_id)):
    """Create an Appwrite session for the authenticated user.

    The creator profile is created in a background thread so the
    session response reaches the mobile app faster. The profile
    creation is idempotent — it's safe to retry on the next sign-in
    if it fails asynchronously.
    """
    try:
        result = get_appwrite_client().create_user_session(clerk_user_id)
        # Fire profile creation in background — not needed for the session response
        import threading
        aw = get_appwrite_client()
        threading.Thread(target=aw._ensure_creator_profile, args=(clerk_user_id,), daemon=True).start()
        return CreateSessionResponse(userId=result["userId"], secret=result["secret"])
    except RuntimeError as exc:
        logger.error("Failed to create Appwrite session for {}: {}", clerk_user_id, exc)
        raise HTTPException(
            status_code=502,
            detail={"error": "appwrite_session_failed", "message": str(exc)},
        ) from exc


# ── Helpers ─────────────────────────────────────────────────────────────────


def _profile_to_creator_dict(clerk_user_id: str, profile: dict) -> dict:
    """Map an instagrapi profile dict to the Appwrite Creator schema."""
    is_business = bool(profile.get("is_business", False))
    account_type = "business" if is_business else "personal"
    now = datetime.now(timezone.utc).isoformat()

    return {
        "clerk_user_id": clerk_user_id,
        "ig_user_id": str(profile.get("pk", "")),
        "ig_scoped_id": str(profile.get("pk", "")),
        "ig_username": profile.get("username", ""),
        "username": profile.get("username", ""),
        "full_name": profile.get("full_name", ""),
        "bio": profile.get("biography", ""),
        "external_url": profile.get("external_url", ""),
        "profile_pic_url": profile.get("profile_pic_url", ""),
        "follower_count": profile.get("follower_count", 0),
        "following_count": profile.get("following_count", 0),
        "media_count": profile.get("media_count", 0),
        "post_count": profile.get("media_count", 0),
        "is_verified": bool(profile.get("is_verified", False)),
        "is_business": is_business,
        "account_type": account_type,
        "is_onboarded": True,
        # Default values for optional Creator fields
        "niche": "",
        "creator_tier": "emerging_viral",
        "detected_language": "",
        "language_hint": "",
        "region": "",
        "detected_region": "",
        "has_brand_experience": False,
        "has_brand_signals": False,
        "brand_signal_count": 0,
        "avg_reel_views": 0,
        "avg_views": 0,
        "engagement_rate": 0.0,
        "reach_ratio": 0.0,
        "created_at": now,
        "last_synced_at": now,
    }


def _require_client(clerk_user_id: str):
    """Fetch the Instagram client for a user, rehydrating from Appwrite if needed."""
    sm = get_session_manager()
    client = sm.get(clerk_user_id)
    if client is not None:
        return client
    try:
        client = sm.get_or_rehydrate(clerk_user_id, get_appwrite_client())
    except StaleSessionError:
        raise HTTPException(
            status_code=401,
            detail={"error": "session_expired", "message": "Please reconnect your Instagram account"},
        )
    if client is None:
        raise HTTPException(
            status_code=401,
            detail={"error": "not_connected", "message": "Please connect your Instagram account first"},
        )
    return client


# ── Routes ────────────────────────────────────────────────────────────────────


@app.post("/login")
async def login(request: LoginRequest, clerk_user_id: str = Depends(require_clerk_user_id)):
    """Authenticate with Instagram credentials and store the profile in Appwrite."""
    if request.clerk_id != clerk_user_id:
        logger.warning(
            "Clerk ID mismatch: body={} jwt_sub={}", request.clerk_id, clerk_user_id
        )
        raise HTTPException(
            status_code=401,
            detail={"error": "clerk_id_mismatch"},
        )

    try:
        client = get_session_manager().get_or_create(
            clerk_user_id, request.username, request.password
        )
    except (BadPassword, TwoFactorRequired) as exc:
        logger.warning("Instagram login rejected for {}: {}", clerk_user_id, type(exc).__name__)
        raise HTTPException(
            status_code=401,
            detail={"error": "invalid_credentials", "message": str(exc)},
        ) from exc
    except (PleaseWaitFewMinutes, RateLimitError, ClientThrottledError) as exc:
        logger.warning("Instagram rate limited for {}", clerk_user_id)
        raise HTTPException(
            status_code=429,
            detail={"error": "rate_limited", "message": "Instagram rate limit reached. Try again later."},
        ) from exc
    except ClientError as exc:
        logger.warning("Instagram client error for {}: {}", clerk_user_id, exc)
        raise HTTPException(
            status_code=502,
            detail={"error": "instagram_login_failed", "message": str(exc)},
        ) from exc

    profile = client.fetch_profile(username=None)
    if profile is None:
        logger.error("fetch_profile returned None after login for {}", clerk_user_id)
        raise HTTPException(
            status_code=502,
            detail={"error": "instagram_login_failed", "message": "Could not retrieve profile"},
        )

    creator_data = _profile_to_creator_dict(clerk_user_id, profile)
    get_appwrite_client().store_creator_profile(clerk_user_id, creator_data)

    if not get_session_manager().save_session(clerk_user_id, get_appwrite_client()):
        logger.warning("Failed to persist IG session for {}", clerk_user_id)

    logger.info("Login successful for {} ({})", clerk_user_id, profile.get("username"))
    return profile


@app.get("/profile")
async def profile(clerk_user_id: str = Depends(require_clerk_user_id)):
    """Return the authenticated user's Instagram profile."""
    client = _require_client(clerk_user_id)

    try:
        profile = client.fetch_profile(username=None)
    except LoginRequired as exc:
        logger.warning("Instagram session expired for {}", clerk_user_id)
        raise HTTPException(
            status_code=401,
            detail={"error": "session_expired", "message": "Please reconnect your Instagram account"},
        ) from exc

    if profile is None:
        if client.auth_failed:
            get_session_manager().remove(clerk_user_id)
            get_appwrite_client().clear_creator_session(clerk_user_id)
        raise HTTPException(
            status_code=401,
            detail={"error": "session_expired", "message": "Please reconnect your Instagram account"},
        )

    return profile


@app.get("/media")
async def media(
    amount: int = Query(default=25, ge=1, le=100),
    clerk_user_id: str = Depends(require_clerk_user_id),
):
    """Return the authenticated user's Instagram media."""
    client = _require_client(clerk_user_id)

    try:
        media_items = client.fetch_media(amount=amount)
    except LoginRequired as exc:
        logger.warning("Instagram session expired for {}", clerk_user_id)
        raise HTTPException(
            status_code=401,
            detail={"error": "session_expired", "message": "Please reconnect your Instagram account"},
        ) from exc

    if client.auth_failed:
        get_session_manager().remove(clerk_user_id)
        get_appwrite_client().clear_creator_session(clerk_user_id)
        raise HTTPException(
            status_code=401,
            detail={"error": "session_expired", "message": "Please reconnect your Instagram account"},
        )

    return {"data": media_items}


@app.get("/insights")
async def insights(clerk_user_id: str = Depends(require_clerk_user_id)):
    """Return Instagram account insights (Business accounts only)."""
    client = _require_client(clerk_user_id)

    try:
        insights = client.fetch_insights()
    except LoginRequired as exc:
        logger.warning("Instagram session expired for {}", clerk_user_id)
        raise HTTPException(
            status_code=401,
            detail={"error": "session_expired", "message": "Please reconnect your Instagram account"},
        ) from exc

    if insights is None:
        if client.auth_failed:
            get_session_manager().remove(clerk_user_id)
            get_appwrite_client().clear_creator_session(clerk_user_id)
            raise HTTPException(
                status_code=401,
                detail={"error": "session_expired", "message": "Please reconnect your Instagram account"},
            )
        raise HTTPException(
            status_code=502,
            detail={"error": "insights_unavailable", "message": "Unable to fetch insights"},
        )

    return insights


@app.post("/disconnect")
async def disconnect(clerk_user_id: str = Depends(require_clerk_user_id)):
    """Disconnect the Instagram session and clear Appwrite session fields."""
    get_session_manager().remove(clerk_user_id)
    get_appwrite_client().clear_creator_session(clerk_user_id)
    logger.info("Disconnected Instagram session for {}", clerk_user_id)
    return {"status": "disconnected"}
