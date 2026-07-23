"""Per-user Instagram client registry with LRU eviction.

Manages multiple InstagramClient instances keyed by Clerk user ID.
Enforces a maximum of MAX_SESSIONS concurrent sessions with LRU eviction.
"""

from __future__ import annotations

from collections import OrderedDict
import json
import os
import threading
from typing import TYPE_CHECKING

from loguru import logger

from ig_client import InstagramClient

if TYPE_CHECKING:
    from api.appwrite_client import AppwriteClient


class StaleSessionError(Exception):
    """Raised when a saved Instagram session is no longer valid."""


class SessionManager:
    """Thread-safe registry of per-user InstagramClient instances.

    Attributes:
        MAX_SESSIONS: Maximum concurrent sessions before LRU eviction.
    """

    MAX_SESSIONS: int = 50

    def __init__(self) -> None:
        self._clients: OrderedDict[str, InstagramClient] = OrderedDict()
        self._lock = threading.Lock()

    def _evict_if_needed(self) -> None:
        """Evict the least-recently-used client if at capacity. Must hold self._lock."""
        if len(self._clients) >= self.MAX_SESSIONS:
            evicted_id, evicted_client = self._clients.popitem(last=False)
            logger.info(
                "LRU eviction: removing session for {} ({} clients active)",
                evicted_id,
                len(self._clients),
            )
            try:
                evicted_client.logout()
            except Exception:
                logger.exception("Error logging out evicted client {}", evicted_id)

    def get_or_create(self, clerk_user_id: str, username: str, password: str) -> InstagramClient:
        """Return existing logged-in client or create and login a new one.

        If a client already exists and is logged in, return it immediately.
        If the client exists but is not logged in, re-login.
        Otherwise create a new client, login, and store it.

        Args:
            clerk_user_id: Clerk user ID used as the dict key.
            username: Instagram username.
            password: Instagram password.

        Returns:
            The InstagramClient instance (logged in).
        """
        with self._lock:
            if clerk_user_id in self._clients:
                client = self._clients[clerk_user_id]
                self._clients.move_to_end(clerk_user_id)
                if client._logged_in:
                    logger.debug("Reusing existing session for {}", clerk_user_id)
                    return client
                logger.info("Existing session not logged in - re-logging in for {}", clerk_user_id)
                client.login(username, password)
                return client

            self._evict_if_needed()

            logger.info("Creating new InstagramClient session for {}", clerk_user_id)
            session_file_path = f"data/sessions/{clerk_user_id}.json"
            client = InstagramClient(session_file_path=session_file_path)
            client.login(username, password)
            self._clients[clerk_user_id] = client
            return client

    def get_or_rehydrate(self, clerk_user_id: str, appwrite: "AppwriteClient") -> InstagramClient | None:
        """Return existing client or rehydrate from Appwrite-saved session.

        1. In-memory hit: return existing client immediately.
        2. Query Appwrite for saved session JSON.
        3. If found and valid, construct InstagramClient and restore.
        4. If stale or malformed, clear and raise StaleSessionError.

        Args:
            clerk_user_id: Clerk user ID.
            appwrite: AppwriteClient instance for session persistence.

        Returns:
            InstagramClient if found or rehydrated, None if no saved session.

        Raises:
            StaleSessionError: If the saved session is invalid or expired.
        """
        with self._lock:
            if clerk_user_id in self._clients:
                self._clients.move_to_end(clerk_user_id)
                return self._clients[clerk_user_id]

        token = appwrite.get_creator_session(clerk_user_id)
        if not token:
            return None

        try:
            settings = json.loads(token)
        except (json.JSONDecodeError, TypeError):
            logger.warning("Malformed session JSON for {} — clearing", clerk_user_id)
            appwrite.clear_creator_session(clerk_user_id)
            raise StaleSessionError

        session_file_path = f"data/sessions/{clerk_user_id}.json"
        client = InstagramClient(session_file_path=session_file_path)
        restored = client.restore_session(settings)

        if not restored:
            logger.warning("Stale session for {} — clearing", clerk_user_id)
            appwrite.clear_creator_session(clerk_user_id)
            try:
                os.remove(session_file_path)
            except OSError:
                pass
            raise StaleSessionError

        with self._lock:
            if clerk_user_id in self._clients:
                return self._clients[clerk_user_id]
            self._evict_if_needed()
            self._clients[clerk_user_id] = client
            return client

    def save_session(self, clerk_user_id: str, appwrite: "AppwriteClient") -> bool:
        """Persist the current Instagram session to Appwrite.

        Args:
            clerk_user_id: Clerk user ID.
            appwrite: AppwriteClient instance.

        Returns:
            True if saved, False if no client exists for this user.
        """
        with self._lock:
            client = self._clients.get(clerk_user_id)
            if client is None:
                return False
            return appwrite.save_creator_session(clerk_user_id, client.dump_settings_json())

    def get(self, clerk_user_id: str) -> InstagramClient | None:
        """Return the client for a user, or None if not found.

        Args:
            clerk_user_id: Clerk user ID.

        Returns:
            InstagramClient if exists, None otherwise.
        """
        with self._lock:
            return self._clients.get(clerk_user_id)

    def remove(self, clerk_user_id: str) -> bool:
        """Remove a client session, logging out if necessary.

        Args:
            clerk_user_id: Clerk user ID.

        Returns:
            True if the client was removed, False if it didn't exist.
        """
        with self._lock:
            client = self._clients.pop(clerk_user_id, None)
            if client is None:
                return False
            try:
                client.logout()
            except Exception:
                logger.exception("Error logging out client {}", clerk_user_id)
            logger.info("Removed session for {}", clerk_user_id)
            return True

    def logout_all(self) -> int:
        """Logout all active sessions. Called during graceful shutdown.

        Returns:
            Number of sessions successfully logged out.
        """
        count = 0
        with self._lock:
            while self._clients:
                _uid, client = self._clients.popitem()
                try:
                    client.logout()
                    count += 1
                except Exception:
                    logger.exception("Error logging out client during shutdown")
        return count


# Singleton
_session_manager: SessionManager | None = None
_sm_lock = threading.Lock()


def get_session_manager() -> SessionManager:
    """Return the singleton SessionManager instance."""
    global _session_manager
    if _session_manager is None:
        with _sm_lock:
            if _session_manager is None:
                _session_manager = SessionManager()
    return _session_manager
