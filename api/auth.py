"""Clerk JWT verification for FastAPI.

Uses clerk-backend-api verify_token (RS256 via CLERK_JWT_KEY, or JWKS via
CLERK_SECRET_KEY). Falls back to HS256 PyJWT for local/test secrets.
Exposes verify_clerk_jwt() and get_clerk_user_id FastAPI dependency.
"""

from __future__ import annotations

import os

import jwt
from fastapi import Header, HTTPException
from loguru import logger


def _authorized_parties() -> list[str] | None:
    raw = os.getenv("CLERK_AUTHORIZED_PARTIES", "")
    parties = [p.strip() for p in raw.split(",") if p.strip()]
    return parties or None


def verify_clerk_jwt(jwt_token: str) -> str | None:
    """Decode a Clerk JWT and return the user ID (sub claim), or None if invalid.

    Args:
        jwt_token: Raw JWT string from the Authorization header.

    Returns:
        Clerk user ID (sub claim) if valid, None otherwise.
    """
    if not jwt_token:
        logger.warning("Empty JWT token received")
        return None

    secret_key = os.getenv("CLERK_SECRET_KEY", "")
    jwt_key = os.getenv("CLERK_JWT_KEY", "")

    if not secret_key and not jwt_key:
        logger.error("CLERK_SECRET_KEY / CLERK_JWT_KEY is not set — cannot verify JWT")
        return None

    # Real Clerk: sk_* secret (JWKS) and/or networkless PEM. Non-sk secrets
    # (pytest) keep the HS256 path even if a PEM leaked in from dotenv.
    use_clerk_sdk = secret_key.startswith("sk_") or (bool(jwt_key) and not secret_key)
    if use_clerk_sdk:
        try:
            from clerk_backend_api.security.verifytoken import (
                TokenVerificationError,
                VerifyTokenOptions,
                verify_token,
            )

            payload = verify_token(
                jwt_token,
                VerifyTokenOptions(
                    secret_key=secret_key or None,
                    jwt_key=jwt_key or None,
                    authorized_parties=_authorized_parties(),
                ),
            )
            clerk_user_id: str | None = payload.get("sub")
            if not clerk_user_id:
                logger.warning("JWT decoded but missing 'sub' claim")
                return None
            return clerk_user_id
        except TokenVerificationError as exc:
            logger.warning("Clerk token verification failed: {}", exc)
            return None
        except Exception:
            logger.exception("Unexpected error verifying Clerk JWT")
            return None

    # Local/test fallback: HS256 with a non-Clerk secret (e.g. pytest fixtures).
    try:
        payload = jwt.decode(jwt_token, secret_key, algorithms=["HS256"])
        clerk_user_id = payload.get("sub")
        if not clerk_user_id:
            logger.warning("JWT decoded but missing 'sub' claim")
            return None
        return clerk_user_id
    except jwt.ExpiredSignatureError:
        logger.warning("Expired JWT token received")
        return None
    except jwt.InvalidTokenError:
        logger.warning("Invalid JWT token received (signature/format)")
        return None
    except Exception:
        logger.exception("Unexpected error verifying JWT")
        return None


def get_clerk_user_id(authorization: str = Header(...)) -> str:
    """FastAPI dependency: extract Clerk user ID from Bearer token.

    Args:
        authorization: Authorization header value (e.g. "Bearer <token>").

    Returns:
        Clerk user ID if valid.

    Raises:
        HTTPException(401): If token is missing, malformed, or invalid.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Authorization header must be 'Bearer <token>'")

    token = parts[1]
    user_id = verify_clerk_jwt(token)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired JWT token")

    return user_id
