"""Appwrite Server SDK wrapper for creator profile storage.

Provides methods to store, update, and clear creator profiles in the
Appwrite 'creators' table. Singleton pattern — one instance per process.
"""

from __future__ import annotations

import os
import threading
from datetime import datetime, timezone

from appwrite.client import Client
from appwrite.exception import AppwriteException
from appwrite.permission import Permission
from appwrite.role import Role
from appwrite.query import Query
from appwrite.services.databases import Databases
from appwrite.services.users import Users
from appwrite.services.tables_db import TablesDB as TablesDBService
from loguru import logger

# ── Env vars ──────────────────────────────────────────────────────────────────

APPWRITE_ENDPOINT: str = os.getenv("APPWRITE_ENDPOINT", "https://sgp.cloud.appwrite.io/v1")
APPWRITE_PROJECT_ID: str = os.getenv("APPWRITE_PROJECT_ID", "")
APPWRITE_API_KEY: str = os.getenv("APPWRITE_API_KEY", "")
APPWRITE_DATABASE_ID: str = os.getenv("APPWRITE_DATABASE_ID", "vernacular_saas")
APPWRITE_CREATORS_TABLE_ID: str = os.getenv("APPWRITE_CREATORS_TABLE_ID", "creators")


class AppwriteClient:
    """Wraps the Appwrite Python SDK for server-side operations.

    Uses API key auth (server integration). Stores and updates creator
    profiles in the `creators` table within `vernacular_saas` database.
    """

    def __init__(self) -> None:
        self._client = Client()
        self._client.set_endpoint(APPWRITE_ENDPOINT)
        self._client.set_project(APPWRITE_PROJECT_ID)
        self._client.set_key(APPWRITE_API_KEY)
        self._databases = Databases(self._client)
        self._users = Users(self._client)
        self._tables_db = TablesDBService(self._client)

    @staticmethod
    def _user_permissions(appwrite_uid: str) -> list[str]:
        """Return read/update/delete permissions for a single Appwrite user."""
        return [
            Permission.read(Role.user(appwrite_uid)),
            Permission.update(Role.user(appwrite_uid)),
            Permission.delete(Role.user(appwrite_uid)),
        ]

    def store_creator_profile(self, clerk_user_id: str, profile: dict) -> bool:
        """Upsert a creator profile in Appwrite.

        Queries the creators table for an existing row with matching
        clerk_user_id. If found, updates it. Otherwise creates a new row.

        Args:
            clerk_user_id: Clerk user ID (used as the lookup key).
            profile: Dictionary of creator fields (matches Creator interface).

        Returns:
            True on success, False on failure.
        """
        profile["clerk_user_id"] = clerk_user_id
        try:
            result = self._databases.list_documents(
                database_id=APPWRITE_DATABASE_ID,
                collection_id=APPWRITE_CREATORS_TABLE_ID,
                queries=[Query.equal("clerk_user_id", clerk_user_id), Query.limit(1)],
            )
            documents = getattr(result, "documents", None) or result.get("documents", [])

            existing = documents[0] if documents else None

            if existing:
                doc_id = existing["$id"]
                self._databases.update_document(
                    database_id=APPWRITE_DATABASE_ID,
                    collection_id=APPWRITE_CREATORS_TABLE_ID,
                    document_id=doc_id,
                    data=profile,
                    permissions=self._user_permissions(clerk_user_id),
                )
                logger.info("Updated creator profile for {} (doc {})", clerk_user_id, doc_id)
            else:
                self._databases.create_document(
                    database_id=APPWRITE_DATABASE_ID,
                    collection_id=APPWRITE_CREATORS_TABLE_ID,
                    document_id="unique()",
                    data=profile,
                    permissions=self._user_permissions(clerk_user_id),
                )
                logger.info("Created creator profile for {}", clerk_user_id)

            return True
        except AppwriteException:
            logger.exception("Appwrite error storing creator profile for {}", clerk_user_id)
            return False
        except Exception:
            logger.exception("Unexpected error storing creator profile for {}", clerk_user_id)
            return False

    def clear_creator_session(self, clerk_user_id: str) -> bool:
        """Clear session fields and set is_onboarded=False for a creator.

        Used when a user disconnects their Instagram account.

        Args:
            clerk_user_id: Clerk user ID.

        Returns:
            True on success, False on failure.
        """
        try:
            result = self._databases.list_documents(
                database_id=APPWRITE_DATABASE_ID,
                collection_id=APPWRITE_CREATORS_TABLE_ID,
                queries=[Query.equal("clerk_user_id", clerk_user_id), Query.limit(1)],
            )
            documents = getattr(result, "documents", None) or result.get("documents", [])

            existing = documents[0] if documents else None

            if not existing:
                logger.warning("No creator profile found for {} to clear", clerk_user_id)
                return False

            doc_id = existing["$id"]
            self._databases.update_document(
                database_id=APPWRITE_DATABASE_ID,
                collection_id=APPWRITE_CREATORS_TABLE_ID,
                document_id=doc_id,
                data={
                    "access_token": "",
                    "token_expires_at": "",
                    "is_onboarded": False,
                },
            )
            logger.info("Cleared session for {}", clerk_user_id)
            return True
        except AppwriteException:
            logger.exception("Appwrite error clearing session for {}", clerk_user_id)
            return False
        except Exception:
            logger.exception("Unexpected error clearing session for {}", clerk_user_id)
            return False

    def save_creator_session(self, clerk_user_id: str, session_json: str) -> bool:
        """Persist the Instagram session JSON to the creator's access_token field.

        Args:
            clerk_user_id: Clerk user ID.
            session_json: JSON string from InstagramClient.dump_settings_json().

        Returns:
            True on success, False on failure.
        """
        try:
            result = self._databases.list_documents(
                database_id=APPWRITE_DATABASE_ID,
                collection_id=APPWRITE_CREATORS_TABLE_ID,
                queries=[Query.equal("clerk_user_id", clerk_user_id), Query.limit(1)],
            )
            documents = getattr(result, "documents", None) or result.get("documents", [])
            existing = documents[0] if documents else None

            if not existing:
                logger.warning("No creator profile found for {} to save session", clerk_user_id)
                return False

            doc_id = existing["$id"]
            self._databases.update_document(
                database_id=APPWRITE_DATABASE_ID,
                collection_id=APPWRITE_CREATORS_TABLE_ID,
                document_id=doc_id,
                data={"access_token": session_json},
            )
            logger.info("Saved IG session for {}", clerk_user_id)
            return True
        except AppwriteException:
            logger.exception("Appwrite error saving session for {}", clerk_user_id)
            return False
        except Exception:
            logger.exception("Unexpected error saving session for {}", clerk_user_id)
            return False

    def get_creator_session(self, clerk_user_id: str) -> str:
        """Retrieve the saved Instagram session JSON for a creator.

        Args:
            clerk_user_id: Clerk user ID.

        Returns:
            The session JSON string, or empty string if not found.
        """
        try:
            result = self._databases.list_documents(
                database_id=APPWRITE_DATABASE_ID,
                collection_id=APPWRITE_CREATORS_TABLE_ID,
                queries=[Query.equal("clerk_user_id", clerk_user_id), Query.limit(1)],
            )
            documents = getattr(result, "documents", None) or result.get("documents", [])
            existing = documents[0] if documents else None

            if not existing:
                return ""

            token = existing.get("access_token", "")
            return token if token else ""
        except AppwriteException:
            logger.exception("Appwrite error getting session for {}", clerk_user_id)
            return ""
        except Exception:
            logger.exception("Unexpected error getting session for {}", clerk_user_id)
            return ""

    def _ensure_creator_profile(self, clerk_user_id: str) -> None:
        """Create a minimal creator profile row in the creators table if one doesn't exist.

        This runs after every session creation so that the mobile app always has
        a creator row to read — even before the user connects Instagram.
        """
        try:
            result = self._tables_db.list_rows(
                database_id=APPWRITE_DATABASE_ID,
                table_id=APPWRITE_CREATORS_TABLE_ID,
                queries=[Query.equal("clerk_user_id", clerk_user_id), Query.limit(1)],
            )
            if result.total > 0:
                return  # Profile already exists

            now = datetime.now(timezone.utc).isoformat()
            self._tables_db.create_row(
                database_id=APPWRITE_DATABASE_ID,
                table_id=APPWRITE_CREATORS_TABLE_ID,
                row_id="unique()",
                data={
                    "clerk_user_id": clerk_user_id,
                    "username": clerk_user_id,
                    "full_name": "",
                    "bio": "",
                    "profile_pic_url": "",
                    "follower_count": 0,
                    "following_count": 0,
                    "post_count": 0,
                    "engagement_rate": 0.0,
                    "is_onboarded": False,
                    "is_active": True,
                    "created_at": now,
                    "updated_at": now,
                },
                permissions=self._user_permissions(clerk_user_id),
            )
            logger.info("Created minimal creator profile for {}", clerk_user_id)
        except AppwriteException:
            logger.exception("Appwrite error ensuring creator profile for {}", clerk_user_id)

    def create_user_session(self, clerk_user_id: str) -> dict:
        """Create an Appwrite session token for a Clerk user.

        Looks up the Appwrite user whose ID matches the Clerk user ID,
        creating the user if they do not exist yet, then creates a token
        the client can exchange for a session via PUT /account/sessions/token.
        Also ensures a minimal creator profile row exists.

        Args:
            clerk_user_id: Clerk user ID (used as the Appwrite user ID).

        Returns:
            {"userId": <appwrite_uid>, "secret": <session_secret>}
            May include "warning" key if creator profile creation failed.

        Raises:
            RuntimeError: If any Appwrite or unexpected error occurs.
        """
        try:
            result = self._users.list(queries=[Query.equal("$id", clerk_user_id)])
            users = result.users

            if users:
                appwrite_uid = users[0].id
            else:
                new_user = self._users.create(user_id=clerk_user_id, name=clerk_user_id)
                appwrite_uid = new_user.id
                logger.info("Created Appwrite user {} for Clerk user {}", appwrite_uid, clerk_user_id)

            token = self._users.create_token(user_id=appwrite_uid)
            return {"userId": appwrite_uid, "secret": token.secret}
        except AppwriteException as exc:
            logger.exception("Appwrite error creating user session for {}", clerk_user_id)
            raise RuntimeError(f"Appwrite error: {exc}") from exc
        except Exception as exc:
            logger.exception("Unexpected error creating user session for {}", clerk_user_id)
            raise RuntimeError(f"Unexpected error: {exc}") from exc


# ── Singleton ─────────────────────────────────────────────────────────────────

_appwrite_client: AppwriteClient | None = None
_aw_lock = threading.Lock()


def get_appwrite_client() -> AppwriteClient:
    """Return the singleton AppwriteClient instance."""
    global _appwrite_client
    if _appwrite_client is None:
        with _aw_lock:
            if _appwrite_client is None:
                _appwrite_client = AppwriteClient()
    return _appwrite_client
