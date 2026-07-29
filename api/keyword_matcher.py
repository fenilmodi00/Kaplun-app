# api/keyword_matcher.py
"""Keyword matcher — Python port of openreply's lib/utils/keyword-matcher.ts.

Ported from https://github.com/diwenne/openreply (MIT License,
Copyright (c) 2026 Anish Raj, Diwen Huang).

NOTE: JavaScript \\w is ASCII-only, so this port uses an explicit ASCII
non-word class ([^A-Za-z0-9_\\s]) — Python's \\w is Unicode-aware and would
keep accented letters the original strips.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

_EMOJI_RE = re.compile(
    "[" + "".join(
        f"{chr(lo)}-{chr(hi)}"
        for lo, hi in [
            (0x1F600, 0x1F64F), (0x1F300, 0x1F5FF), (0x1F680, 0x1F6FF),
            (0x1F1E0, 0x1F1FF), (0x2600, 0x26FF), (0x2700, 0x27BF),
            (0xFE00, 0xFE0F), (0x1F900, 0x1F9FF), (0x1FA00, 0x1FA6F),
            (0x1FA70, 0x1FAFF),
        ]
    ) + chr(0x200D) + chr(0x20E3) + "]"
)
_NON_WORD_RE = re.compile(r"[^A-Za-z0-9_\s]")
_WS_RE = re.compile(r"\s+")


@dataclass(frozen=True)
class KeywordMatchResult:
    matched: bool
    matched_keyword: str | None


def strip_special_characters(text: str) -> str:
    text = _EMOJI_RE.sub("", text)
    text = _NON_WORD_RE.sub(" ", text)
    return _WS_RE.sub(" ", text).strip()


def match_keywords(
    comment_text: str, keywords: list[str], whole_word_match: bool = True
) -> KeywordMatchResult:
    if not comment_text or not keywords:
        return KeywordMatchResult(False, None)

    cleaned_text = strip_special_characters(comment_text).lower()
    if not cleaned_text:
        return KeywordMatchResult(False, None)

    for keyword in keywords:
        cleaned_keyword = strip_special_characters(keyword).lower()
        if not cleaned_keyword:
            continue
        if whole_word_match:
            if re.search(rf"\b{re.escape(cleaned_keyword)}\b", cleaned_text, re.IGNORECASE):
                return KeywordMatchResult(True, keyword)
        elif cleaned_keyword in cleaned_text:
            return KeywordMatchResult(True, keyword)

    return KeywordMatchResult(False, None)
