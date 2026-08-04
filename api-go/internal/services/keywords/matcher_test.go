package keywords_test

import (
	"testing"

	"kaplun/api-go/internal/services/keywords"
)

func TestStripEmojisAndPunct(t *testing.T) {
	t.Parallel()

	if got := keywords.StripSpecialCharacters("LINK!!! \U0001F525\U0001F525"); got != "LINK" {
		t.Fatalf("got %q", got)
	}
	if got := keywords.StripSpecialCharacters("  send   me   the  link "); got != "send me the link" {
		t.Fatalf("got %q", got)
	}
}

func TestWholeWordMatchCaseInsensitive(t *testing.T) {
	t.Parallel()

	r := keywords.MatchKeywords("Please send the LINK now", []string{"link"}, true)
	if !r.Matched || r.MatchedKeyword != "link" {
		t.Fatalf("unexpected result: %#v", r)
	}
}

func TestWholeWordRejectsSubstring(t *testing.T) {
	t.Parallel()

	if keywords.MatchKeywords("I am linking this", []string{"link"}, true).Matched {
		t.Fatal("expected no match")
	}
}

func TestPartialMatchAllowsSubstring(t *testing.T) {
	t.Parallel()

	if !keywords.MatchKeywords("I am linking this", []string{"link"}, false).Matched {
		t.Fatal("expected match")
	}
}

func TestMultiKeywordOrLogic(t *testing.T) {
	t.Parallel()

	r := keywords.MatchKeywords("send SHOP details", []string{"link", "shop"}, true)
	if !r.Matched || r.MatchedKeyword != "shop" {
		t.Fatalf("unexpected result: %#v", r)
	}
}

func TestEmptyInputsNoMatch(t *testing.T) {
	t.Parallel()

	if keywords.MatchKeywords("", []string{"link"}, true).Matched {
		t.Fatal("expected no match for empty text")
	}
	if keywords.MatchKeywords("hello", nil, true).Matched {
		t.Fatal("expected no match for empty keywords")
	}
}

func TestKeywordWithEmojiStripped(t *testing.T) {
	t.Parallel()

	r := keywords.MatchKeywords("price please", []string{"price \U0001F4B0"}, true)
	if !r.Matched || r.MatchedKeyword != "price \U0001F4B0" {
		t.Fatalf("unexpected result: %#v", r)
	}
}
