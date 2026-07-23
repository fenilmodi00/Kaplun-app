"""instagrapi wrapper with session persistence, jittered delays, rate limiting, and thread safety.

Single Client instance per process. All Instagram calls are serialized via a threading.Lock.
"""

import json
import os
import random
import threading
import time

from loguru import logger
from instagrapi import Client
from instagrapi.exceptions import (
    ChallengeRequired,
    DirectError,
    DirectThreadNotFound,
    LoginRequired,
    PleaseWaitFewMinutes,
    RateLimitError,
    UserError,
    UserNotFound,
)

# ── Defaults (override via env or config.py) ────────────────────────────────
try:
    from config import (
        DM_DELAY_MAX,
        DM_DELAY_MIN,
        IG_PASSWORD,
        IG_SESSION_FILE,
        IG_USERNAME,
        MAX_DMS_PER_DAY,
    )
except ImportError:
    import os as _os

    IG_USERNAME = _os.getenv("IG_USERNAME", "")
    IG_PASSWORD = _os.getenv("IG_PASSWORD", "")
    IG_SESSION_FILE = _os.getenv("IG_SESSION_FILE", "data/ig_session.json")
    _dm_seconds = int(_os.getenv("DM_DELAY_SECONDS", "5"))
    _dm_jitter = int(_os.getenv("DM_DELAY_JITTER", "3"))
    DM_DELAY_MIN = max(0, _dm_seconds - _dm_jitter)
    DM_DELAY_MAX = _dm_seconds + _dm_jitter
    MAX_DMS_PER_DAY = int(_os.getenv("MAX_DMS_PER_DAY", "20"))

# ── Singleton ────────────────────────────────────────────────────────────────

_singleton: "InstagramClient | None" = None
_singleton_lock = threading.Lock()


def get_ig_client() -> "InstagramClient":
    """Return the singleton InstagramClient (lazy init, no login)."""
    global _singleton
    if _singleton is None:
        with _singleton_lock:
            if _singleton is None:
                _singleton = InstagramClient()
    return _singleton


# ── Instagram Client ─────────────────────────────────────────────────────────


class InstagramClient:
    """Thread-safe wrapper around instagrapi.Client.

    __init__ only creates the Client — login() must be called explicitly.
    """

    def __init__(self, session_file_path: str | None = None) -> None:
        self.cl = Client()
        self._lock = threading.Lock()
        self._dm_timestamps: list[float] = []
        self._logged_in = False
        self._auth_failed = False
        self._session_file_path = session_file_path

    # ── Login ──────────────────────────────────────────────────────────────

    def login(self, username: str | None = None, password: str | None = None) -> bool:
        username = username or IG_USERNAME
        password = password or IG_PASSWORD
        if not username or not password:
            logger.warning("login() called without credentials; skip")
            return False

        session_path = self._session_file_path or IG_SESSION_FILE

        try:
            if os.path.exists(session_path):
                logger.info("Loading existing session from {}", session_path)
                self.cl.load_settings(session_path)
                self._logged_in = True
                return True

            logger.info("Fresh login for {}", username)
            self.cl.login(username, password)
            self._dump_settings()
            self._logged_in = True
            return True
        except ChallengeRequired:
            logger.warning("Challenge required for {} — use challenge_code_handler", username)
            return False
        except Exception as exc:
            logger.error("Login failed: {}", exc)
            return False

    def _dump_settings(self) -> None:
        session_path = self._session_file_path or IG_SESSION_FILE
        os.makedirs(os.path.dirname(session_path) or ".", exist_ok=True)
        self.cl.dump_settings(session_path)
        try:
            os.chmod(session_path, 0o600)
        except OSError:
            pass  # Windows may ignore chmod

    @property
    def auth_failed(self) -> bool:
        """True if the last Instagram operation failed due to an auth issue."""
        return self._auth_failed

    def dump_settings_json(self) -> str:
        """Return the current Instagram session settings as a JSON string.

        Used by SessionManager.save_session to persist the session to Appwrite.
        """
        settings = self.cl.get_settings()
        return json.dumps(settings)

    def restore_session(self, settings: dict) -> bool:
        """Restore an Instagram session from a settings dict.

        Args:
            settings: Dict from instagrapi Client.get_settings().

        Returns:
            True if the session was restored and is valid, False otherwise.
        """
        try:
            self.cl.set_settings(settings)
            # Verify the session is valid by fetching the user ID
            uid = self.cl.user_id
            if uid:
                self._logged_in = True
                self._auth_failed = False
                logger.info("Session restored successfully (user_id={})", uid)
                return True
            logger.warning("Session restore produced no user_id")
            return False
        except LoginRequired:
            logger.warning("Session restore failed: LoginRequired")
            self._auth_failed = True
            return False
        except Exception as exc:
            logger.error("Session restore failed: {}", exc)
            self._auth_failed = True
            return False

    # ── Challenge ──────────────────────────────────────────────────────────

    def challenge_code_handler(self, username: str, choice: str) -> None:
        logger.info(
            "Challenge for {}: chose '{}'. Manually provide the verification code when prompted by instagrapi.",
            username,
            choice,
        )

    # ── Token-bucket rate limiter ──────────────────────────────────────────

    def _dm_quota_ok(self) -> bool:
        now = time.monotonic()
        window = 86400  # 24 h
        self._dm_timestamps = [t for t in self._dm_timestamps if now - t < window]
        if len(self._dm_timestamps) >= MAX_DMS_PER_DAY:
            oldest = self._dm_timestamps[0]
            wait = oldest + window - now
            logger.warning(
                "Daily DM quota ({}) reached. Resume in {:.0f}s", MAX_DMS_PER_DAY, wait
            )
            return False
        self._dm_timestamps.append(now)
        return True

    # ── DM helpers ─────────────────────────────────────────────────────────

    def send_dm(self, user_id: int, message: str) -> dict:
        """Send a DM with jittered delay and rate limiting.

        Returns: {"success": bool, "thread_id": str|None, "error": str|None}
        """
        with self._lock:
            if not self._logged_in:
                return {"success": False, "thread_id": None, "error": "Not logged in"}

            if not self._dm_quota_ok():
                return {
                    "success": False,
                    "thread_id": None,
                    "error": f"Daily DM limit ({MAX_DMS_PER_DAY}) reached",
                }

            delay = random.uniform(DM_DELAY_MIN, DM_DELAY_MAX)
            logger.info("Pre-DM delay: {:.2f}s", delay)
            time.sleep(delay)

            for attempt in range(2):
                try:
                    dm = self.cl.direct_send(message, user_ids=[user_id])
                    return {
                        "success": True,
                        "thread_id": str(getattr(dm, "thread_id", None)),
                        "error": None,
                    }
                except LoginRequired:
                    if attempt == 0:
                        logger.warning("Session expired, re-login and retry")
                        self.login()
                        continue
                    return {"success": False, "thread_id": None, "error": "LoginRequired"}
                except PleaseWaitFewMinutes:
                    wait = random.uniform(15, 60) * (attempt + 1)
                    logger.warning("Rate limited; backoff {:.1f}s", wait)
                    time.sleep(wait)
                    continue
                except (UserNotFound, DirectError) as exc:
                    return {"success": False, "thread_id": None, "error": type(exc).__name__}
                except ChallengeRequired:
                    return {
                        "success": False,
                        "thread_id": None,
                        "error": "ChallengeRequired",
                    }
                except RateLimitError:
                    wait = random.uniform(15, 60) * (attempt + 1)
                    logger.warning("RateLimitError; backoff {:.1f}s", wait)
                    time.sleep(wait)
                    continue
                except Exception as exc:
                    logger.error("send_dm unexpected: {}", exc)
                    return {"success": False, "thread_id": None, "error": str(exc)}

            return {"success": False, "thread_id": None, "error": "max retries exceeded"}

    # ── Thread read ────────────────────────────────────────────────────────

    def read_threads(self, amount: int = 20) -> list:
        with self._lock:
            for attempt in range(2):
                try:
                    threads = self.cl.direct_threads(amount=amount)
                    return list(threads) if threads else []
                except LoginRequired:
                    if attempt == 0:
                        self.login()
                        continue
                    return []
                except PleaseWaitFewMinutes:
                    time.sleep(random.uniform(15, 60) * (attempt + 1))
                    continue
                except RateLimitError:
                    time.sleep(random.uniform(15, 60) * (attempt + 1))
                    continue
                except Exception as exc:
                    logger.error("read_threads error: {}", exc)
                    return []
            return []

    def read_thread(self, thread_id, amount: int = 50) -> list:
        with self._lock:
            for attempt in range(2):
                try:
                    thread = self.cl.direct_thread(thread_id, amount=amount)
                    msgs = getattr(thread, "items", getattr(thread, "messages", []))
                    return list(msgs) if msgs else []
                except LoginRequired:
                    if attempt == 0:
                        self.login()
                        continue
                    return []
                except (DirectThreadNotFound, UserNotFound):
                    return []
                except PleaseWaitFewMinutes:
                    time.sleep(random.uniform(15, 60) * (attempt + 1))
                    continue
                except RateLimitError:
                    time.sleep(random.uniform(15, 60) * (attempt + 1))
                    continue
                except Exception as exc:
                    logger.error("read_thread error: {}", exc)
                    return []
            return []

    # ── User lookup ────────────────────────────────────────────────────────

    def user_id_from_username(self, username: str) -> int | None:
        with self._lock:
            for attempt in range(2):
                try:
                    user_id = self.cl.user_id_from_username(username)
                    return int(user_id) if user_id else None
                except LoginRequired:
                    if attempt == 0:
                        self.login()
                        continue
                    return None
                except UserNotFound:
                    return None
                except PleaseWaitFewMinutes:
                    time.sleep(random.uniform(15, 60) * (attempt + 1))
                    continue
                except RateLimitError:
                    time.sleep(random.uniform(15, 60) * (attempt + 1))
                    continue
                except Exception as exc:
                    logger.error("user_id_from_username error: {}", exc)
                    return None
            return None

    # ── Thread-based DM (for counter-offers, reminders, follow-ups) ────────

    def send_dm_to_thread(self, thread_id: str, message: str) -> dict:
        """Send a DM to an existing thread by thread_id.

        Returns: {"success": bool, "thread_id": str|None, "error": str|None}
        """
        with self._lock:
            if not self._logged_in:
                return {"success": False, "thread_id": None, "error": "Not logged in"}

            if not self._dm_quota_ok():
                return {
                    "success": False,
                    "thread_id": None,
                    "error": f"Daily DM limit ({MAX_DMS_PER_DAY}) reached",
                }

            delay = random.uniform(DM_DELAY_MIN, DM_DELAY_MAX)
            logger.info("Pre-DM thread delay: {:.2f}s", delay)
            time.sleep(delay)

            for attempt in range(2):
                try:
                    dm = self.cl.direct_send(message, thread_ids=[thread_id])
                    return {
                        "success": True,
                        "thread_id": str(getattr(dm, "thread_id", thread_id)),
                        "error": None,
                    }
                except LoginRequired:
                    if attempt == 0:
                        self.login()
                        continue
                    return {"success": False, "thread_id": None, "error": "LoginRequired"}
                except PleaseWaitFewMinutes:
                    wait = random.uniform(15, 60) * (attempt + 1)
                    logger.warning("Rate limited; backoff {:.1f}s", wait)
                    time.sleep(wait)
                    continue
                except RateLimitError:
                    wait = random.uniform(15, 60) * (attempt + 1)
                    logger.warning("RateLimitError; backoff {:.1f}s", wait)
                    time.sleep(wait)
                    continue
                except Exception as exc:
                    logger.error("send_dm_to_thread error: {}", exc)
                    return {"success": False, "thread_id": None, "error": str(exc)}

            return {"success": False, "thread_id": None, "error": "max retries exceeded"}

    # ── Unread threads ─────────────────────────────────────────────────────

    def get_unread_threads(self, amount: int = 20) -> list:
        """Get unread DM threads from inbox."""
        with self._lock:
            for attempt in range(2):
                try:
                    return list(self.cl.direct_threads(
                        amount=amount, selected_filter="unread"
                    ))
                except LoginRequired:
                    if attempt == 0:
                        self.login()
                        continue
                    return []
                except PleaseWaitFewMinutes:
                    time.sleep(random.uniform(15, 60) * (attempt + 1))
                    continue
                except RateLimitError:
                    time.sleep(random.uniform(15, 60) * (attempt + 1))
                    continue
                except Exception as exc:
                    logger.error("get_unread_threads error: {}", exc)
                    return []
            return []

    # ── Pending message requests ───────────────────────────────────────────

    def get_pending_requests(self, amount: int = 20) -> list:
        """Get pending message request threads (creators who DM'd us first)."""
        with self._lock:
            for attempt in range(2):
                try:
                    return list(self.cl.direct_requests(amount=amount))
                except LoginRequired:
                    if attempt == 0:
                        self.login()
                        continue
                    return []
                except PleaseWaitFewMinutes:
                    time.sleep(random.uniform(15, 60) * (attempt + 1))
                    continue
                except RateLimitError:
                    time.sleep(random.uniform(15, 60) * (attempt + 1))
                    continue
                except Exception as exc:
                    logger.error("get_pending_requests error: {}", exc)
                    return []
            return []

    # ── Find thread by user_id ─────────────────────────────────────────────

    def find_thread_by_user_id(self, user_id: int) -> str | None:
        """Find an existing DM thread by participant user_id."""
        with self._lock:
            for attempt in range(2):
                try:
                    thread = self.cl.direct_thread_by_participants([user_id])
                    if thread:
                        return str(getattr(thread, "id", None))
                    return None
                except LoginRequired:
                    if attempt == 0:
                        self.login()
                        continue
                    return None
                except Exception as exc:
                    logger.error("find_thread_by_user_id error: {}", exc)
                    return None

    # ── Profile / Media / Insights ─────────────────────────────────────────

    def fetch_profile(self, username: str | None = None) -> dict | None:
        """Fetch profile info for a given username, or own profile if username is None.

        Returns dict with keys: pk, username, full_name, biography, external_url,
        follower_count, following_count, media_count, is_private, is_verified,
        profile_pic_url, is_business. Returns None on UserNotFound.
        """
        with self._lock:
            for attempt in range(2):
                try:
                    if username is not None:
                        user = self.cl.user_info_from_username(username)
                    else:
                        user = self.cl.user_info(self.cl.user_id)
                    self._auth_failed = False
                    return {
                        "pk": getattr(user, "pk", None),
                        "username": getattr(user, "username", ""),
                        "full_name": getattr(user, "full_name", ""),
                        "biography": getattr(user, "biography", ""),
                        "external_url": getattr(user, "external_url", ""),
                        "follower_count": getattr(user, "follower_count", 0),
                        "following_count": getattr(user, "following_count", 0),
                        "media_count": getattr(user, "media_count", 0),
                        "is_private": getattr(user, "is_private", False),
                        "is_verified": getattr(user, "is_verified", False),
                        "profile_pic_url": str(getattr(user, "profile_pic_url", "")),
                        "is_business": getattr(user, "is_business", False),
                    }
                except LoginRequired:
                    if attempt == 0:
                        logger.warning("Session expired, re-login and retry")
                        self.login()
                        continue
                    self._auth_failed = True
                    return None
                except UserNotFound:
                    logger.info("User not found: {}", username)
                    return None
                except PleaseWaitFewMinutes:
                    time.sleep(random.uniform(15, 60) * (attempt + 1))
                    continue
                except RateLimitError:
                    time.sleep(random.uniform(15, 60) * (attempt + 1))
                    continue
                except Exception as exc:
                    logger.error("fetch_profile error: {}", exc)
                    return None
            return None

    def fetch_media(self, amount: int = 25) -> list[dict]:
        """Fetch the authenticated user's own media.

        Returns list of dicts with keys: pk, caption_text, media_type,
        thumbnail_url, media_url, permalink, taken_at (ISO string),
        like_count, comment_count, view_count, play_count.
        """
        with self._lock:
            for attempt in range(2):
                try:
                    medias = self.cl.user_medias(self.cl.user_id, amount=amount)
                    self._auth_failed = False
                    return [
                        {
                            "pk": getattr(m, "pk", None),
                            "caption_text": getattr(m, "caption_text", ""),
                            "media_type": getattr(m, "media_type", 0),
                            "thumbnail_url": str(getattr(m, "thumbnail_url", "") or ""),
                            "media_url": str(getattr(m, "media_url", "") or ""),
                            "permalink": getattr(m, "permalink", ""),
                            "taken_at": (
                                getattr(m, "taken_at", None).isoformat()
                                if getattr(m, "taken_at", None)
                                else None
                            ),
                            "like_count": getattr(m, "like_count", 0),
                            "comment_count": getattr(m, "comment_count", 0),
                            "view_count": getattr(m, "view_count", 0),
                            "play_count": getattr(m, "play_count", 0),
                        }
                        for m in medias
                    ]
                except LoginRequired:
                    if attempt == 0:
                        logger.warning("Session expired, re-login and retry")
                        self.login()
                        continue
                    self._auth_failed = True
                    return []
                except PleaseWaitFewMinutes:
                    time.sleep(random.uniform(15, 60) * (attempt + 1))
                    continue
                except RateLimitError:
                    time.sleep(random.uniform(15, 60) * (attempt + 1))
                    continue
                except Exception as exc:
                    logger.error("fetch_media error: {}", exc)
                    return []
            return []

    def fetch_insights(self) -> dict | None:
        """Fetch account insights (requires Business account).

        Returns dict with insights data, or {"error": "Business account required for insights"}
        if the account is not a Business account.
        """
        with self._lock:
            for attempt in range(2):
                try:
                    self._auth_failed = False
                    return self.cl.insights_account()
                except LoginRequired:
                    if attempt == 0:
                        logger.warning("Session expired, re-login and retry")
                        self.login()
                        continue
                    self._auth_failed = True
                    return None
                except UserError:
                    logger.info("Account is not a Business account — insights unavailable")
                    return {"error": "Business account required for insights"}
                except PleaseWaitFewMinutes:
                    time.sleep(random.uniform(15, 60) * (attempt + 1))
                    continue
                except RateLimitError:
                    time.sleep(random.uniform(15, 60) * (attempt + 1))
                    continue
                except Exception as exc:
                    logger.error("fetch_insights error: {}", exc)
                    return None
            return None

    def logout(self) -> bool:
        """Log out from Instagram and delete the session file.

        Returns True on success.
        """
        with self._lock:
            try:
                self.cl.logout()
                self._logged_in = False

                session_path = self._session_file_path or IG_SESSION_FILE
                if os.path.exists(session_path):
                    try:
                        os.remove(session_path)
                        logger.info("Removed session file: {}", session_path)
                    except OSError as exc:
                        logger.warning("Could not remove session file {}: {}", session_path, exc)

                logger.info("Logged out successfully")
                return True
            except Exception as exc:
                logger.error("logout error: {}", exc)
                return False