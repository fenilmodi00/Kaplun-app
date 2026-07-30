package keywords

import (
	"regexp"
	"strings"
)

// KeywordMatchResult mirrors the Python KeywordMatchResult dataclass.
type KeywordMatchResult struct {
	Matched         bool
	MatchedKeyword  string
}

var (
	emojiRanges = [][2]rune{
		{0x1F600, 0x1F64F},
		{0x1F300, 0x1F5FF},
		{0x1F680, 0x1F6FF},
		{0x1F1E0, 0x1F1FF},
		{0x2600, 0x26FF},
		{0x2700, 0x27BF},
		{0xFE00, 0xFE0F},
		{0x1F900, 0x1F9FF},
		{0x1FA00, 0x1FA6F},
		{0x1FA70, 0x1FAFF},
	}
	nonWordRE = regexp.MustCompile(`[^A-Za-z0-9_\s]`)
	wsRE      = regexp.MustCompile(`\s+`)
)

func isEmojiRune(r rune) bool {
	if r == 0x200D || r == 0x20E3 {
		return true
	}
	for _, rng := range emojiRanges {
		if r >= rng[0] && r <= rng[1] {
			return true
		}
	}
	return false
}

// StripSpecialCharacters removes emojis and non-ASCII-word punctuation,
// collapsing whitespace. Mirrors Python strip_special_characters.
func StripSpecialCharacters(text string) string {
	var b strings.Builder
	b.Grow(len(text))
	for _, r := range text {
		if isEmojiRune(r) {
			continue
		}
		b.WriteRune(r)
	}
	text = nonWordRE.ReplaceAllString(b.String(), " ")
	text = wsRE.ReplaceAllString(text, " ")
	return strings.TrimSpace(text)
}

// MatchKeywords returns the first matching keyword (OR logic).
// wholeWordMatch=true uses ASCII word boundaries; false allows substring.
func MatchKeywords(commentText string, keywordList []string, wholeWordMatch bool) KeywordMatchResult {
	if commentText == "" || len(keywordList) == 0 {
		return KeywordMatchResult{}
	}

	cleanedText := strings.ToLower(StripSpecialCharacters(commentText))
	if cleanedText == "" {
		return KeywordMatchResult{}
	}

	for _, keyword := range keywordList {
		cleanedKeyword := strings.ToLower(StripSpecialCharacters(keyword))
		if cleanedKeyword == "" {
			continue
		}
		if wholeWordMatch {
			pattern := `\b` + regexp.QuoteMeta(cleanedKeyword) + `\b`
			re, err := regexp.Compile("(?i)" + pattern)
			if err != nil {
				continue
			}
			if re.MatchString(cleanedText) {
				return KeywordMatchResult{Matched: true, MatchedKeyword: keyword}
			}
		} else if strings.Contains(cleanedText, cleanedKeyword) {
			return KeywordMatchResult{Matched: true, MatchedKeyword: keyword}
		}
	}

	return KeywordMatchResult{}
}
