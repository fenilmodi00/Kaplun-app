from api.keyword_matcher import match_keywords, strip_special_characters


def test_strip_emojis_and_punct():
    assert strip_special_characters("LINK!!! \U0001F525\U0001F525") == "LINK"
    assert strip_special_characters("  send   me   the  link ") == "send me the link"


def test_whole_word_match_case_insensitive():
    r = match_keywords("Please send the LINK now", ["link"], True)
    assert r.matched and r.matched_keyword == "link"


def test_whole_word_rejects_substring():
    assert not match_keywords("I am linking this", ["link"], True).matched


def test_partial_match_allows_substring():
    assert match_keywords("I am linking this", ["link"], False).matched


def test_multi_keyword_or_logic():
    r = match_keywords("send SHOP details", ["link", "shop"], True)
    assert r.matched and r.matched_keyword == "shop"


def test_empty_inputs_no_match():
    assert not match_keywords("", ["link"], True).matched
    assert not match_keywords("hello", [], True).matched


def test_keyword_with_emoji_stripped():
    r = match_keywords("price please", ["price \U0001F4B0"], True)
    assert r.matched and r.matched_keyword == "price \U0001F4B0"
