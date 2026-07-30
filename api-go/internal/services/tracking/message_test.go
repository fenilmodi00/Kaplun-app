package tracking_test

import (
	"testing"

	"kaplun/api-go/internal/services/tracking"
)

func TestNewSlug(t *testing.T) {
	t.Parallel()

	slug, err := tracking.NewSlug()
	if err != nil {
		t.Fatalf("NewSlug: %v", err)
	}
	if len(slug) < 6 || len(slug) > 8 {
		t.Fatalf("expected 6-8 chars, got %q (%d)", slug, len(slug))
	}
	for _, r := range slug {
		if (r < 'a' || r > 'z') && (r < 'A' || r > 'Z') && (r < '0' || r > '9') {
			t.Fatalf("non-alnum slug char in %q", slug)
		}
	}
}

func TestNewSlugUnique(t *testing.T) {
	t.Parallel()

	seen := map[string]struct{}{}
	for i := 0; i < 100; i++ {
		slug, err := tracking.NewSlug()
		if err != nil {
			t.Fatalf("NewSlug: %v", err)
		}
		if _, ok := seen[slug]; ok {
			t.Fatalf("duplicate slug %q", slug)
		}
		seen[slug] = struct{}{}
	}
}

func TestExtractFirstURL(t *testing.T) {
	t.Parallel()

	cases := []struct {
		in   string
		want string
	}{
		{"Check https://x.com/p and http://y.com", "https://x.com/p"},
		{"See https://x.com/p!", "https://x.com/p"},
		{"(https://x.com/p)", "https://x.com/p"},
		{"no url here", ""},
		{"", ""},
	}
	for _, tc := range cases {
		if got := tracking.ExtractFirstURL(tc.in); got != tc.want {
			t.Fatalf("ExtractFirstURL(%q)=%q want %q", tc.in, got, tc.want)
		}
	}
}

func TestRenderMessageWithTracking(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name           string
		message        string
		commenterName  string
		trackedURL     string
		destinationURL string
		want           string
	}{
		{
			name:           "replaces url with tracked url",
			message:        "Hey {username}: https://x.com/p",
			commenterName:  "fan",
			trackedURL:     "https://api.example.com/r/abc",
			destinationURL: "https://x.com/p",
			want:           "Hey fan: https://api.example.com/r/abc",
		},
		{
			name:           "link placeholder wins",
			message:        "Get it here: {link} — also at https://x.com/p",
			commenterName:  "alice",
			trackedURL:     "https://api.example.com/r/abc",
			destinationURL: "https://x.com/p",
			want:           "Get it here: https://api.example.com/r/abc — also at https://x.com/p",
		},
		{
			name:           "username null falls back to there",
			message:        "Hey {username}: https://x.com/p",
			commenterName:  "",
			trackedURL:     "https://api.example.com/r/abc",
			destinationURL: "https://x.com/p",
			want:           "Hey there: https://api.example.com/r/abc",
		},
		{
			name:           "no tracked url",
			message:        "Hi {username}!",
			commenterName:  "bob",
			trackedURL:     "",
			destinationURL: "https://x.com/p",
			want:           "Hi bob!",
		},
		{
			name:           "no destination url",
			message:        "Hi {username}!",
			commenterName:  "bob",
			trackedURL:     "https://api.example.com/r/abc",
			destinationURL: "",
			want:           "Hi bob!",
		},
		{
			name:           "trailing slash variant",
			message:        "Link: https://x.com/p/",
			commenterName:  "bob",
			trackedURL:     "https://api.example.com/r/abc",
			destinationURL: "https://x.com/p",
			want:           "Link: https://api.example.com/r/abc",
		},
		{
			name:           "empty message",
			message:        "",
			commenterName:  "alice",
			trackedURL:     "https://api.example.com/r/abc",
			destinationURL: "https://x.com/p",
			want:           "",
		},
		{
			name:           "link placeholder case insensitive",
			message:        "Get it: {LINK}",
			commenterName:  "alice",
			trackedURL:     "https://api.example.com/r/abc",
			destinationURL: "https://x.com/p",
			want:           "Get it: https://api.example.com/r/abc",
		},
		{
			name:           "username placeholder case insensitive",
			message:        "Hi {USERNAME}: https://x.com/p",
			commenterName:  "alice",
			trackedURL:     "https://api.example.com/r/abc",
			destinationURL: "https://x.com/p",
			want:           "Hi alice: https://api.example.com/r/abc",
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := tracking.RenderMessageWithTracking(tc.message, tc.commenterName, tc.trackedURL, tc.destinationURL)
			if got != tc.want {
				t.Fatalf("got %q want %q", got, tc.want)
			}
		})
	}
}
