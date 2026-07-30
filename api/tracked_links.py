# api/tracked_links.py
"""Tracked links — port of openreply's lib/tracking/message.ts (MIT).

Copyright (c) 2026 Anish Raj, Diwen Huang — MIT License (see openreply LICENSE).
"""
from __future__ import annotations

import re
import secrets

URL_PATTERN = re.compile(r"https?://[^\s<>\"')\]]+", re.IGNORECASE)


def new_slug() -> str:
    """Generate an 8-char URL-safe slug for a tracked link."""
    for _ in range(3):
        slug = secrets.token_urlsafe(6).replace("-", "").replace("_", "")[:8]
        if slug:
            return slug
    raise RuntimeError("failed to generate tracked-link slug")


def extract_first_url(message: str) -> str | None:
    """Return the first URL found in *message*, or None."""
    m = URL_PATTERN.search(message or "")
    return m.group(0).rstrip(".,!?;:") if m else None


def render_message_with_tracking(
    message: str,
    commenter_name: str | None,
    tracked_url: str | None,
    destination_url: str | None,
) -> str:
    """Render *message* with {username} and {link} substitution + URL tracking.

    1. Replace ``{username}`` placeholders (case-insensitive) with
       *commenter_name* (or ``"there"`` when *commenter_name* is None).
    2. If *tracked_url* and *destination_url* are both set:
       a. If the message contains a ``{link}`` placeholder, replace it with
          *tracked_url* (``{link}`` wins over raw-URL replacement).
       b. Otherwise replace the first occurrence of *destination_url* in the
          rendered message with *tracked_url*.
       c. If *destination_url* is not found verbatim, try stripping its
          trailing slash before replacing.
    3. Return the rendered message.

    Ported from openreply's ``renderMessageWithTracking`` (MIT).
    """
    rendered = re.sub(
        r"\{username\}",
        lambda _: commenter_name or "there",
        message or "",
        flags=re.IGNORECASE,
    )
    if not tracked_url or not destination_url:
        return rendered
    if re.search(r"\{link\}", rendered, re.IGNORECASE):
        return re.sub(
            r"\{link\}",
            lambda _: tracked_url,
            rendered,
            flags=re.IGNORECASE,
        )
    # Check trailing-slash variant first so a replace of "https://x.com/p"
    # doesn't leave a dangling "/" when the message has "https://x.com/p/".
    if (destination_url + "/") in rendered:
        return rendered.replace(destination_url + "/", tracked_url)
    if destination_url in rendered:
        return rendered.replace(destination_url, tracked_url)
    return rendered.replace(destination_url.rstrip("/"), tracked_url)
