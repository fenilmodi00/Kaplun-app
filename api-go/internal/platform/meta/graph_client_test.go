package meta_test

import (
	"testing"

	"kaplun/api-go/internal/platform/meta"
)

func TestHandleMapsTokenExpired(t *testing.T) {
	t.Parallel()

	_, err := meta.Handle(map[string]any{
		"error": map[string]any{
			"message":    "expired",
			"code":       float64(190),
			"fbtrace_id": "fb",
		},
	}, 400)
	if err == nil {
		t.Fatal("expected token expired error")
	}
	if _, ok := err.(*meta.TokenExpiredError); !ok {
		t.Fatalf("expected TokenExpiredError, got %T", err)
	}
}

func TestHandleMapsRateLimit(t *testing.T) {
	t.Parallel()

	_, err := meta.Handle(map[string]any{
		"error": map[string]any{
			"message": "rate limited",
			"code":    float64(613),
		},
	}, 400)
	if err == nil {
		t.Fatal("expected rate limit error")
	}
	if _, ok := err.(*meta.GraphRateLimitError); !ok {
		t.Fatalf("expected GraphRateLimitError, got %T", err)
	}
}

func TestHandleReturnsPayloadWhenNoError(t *testing.T) {
	t.Parallel()

	got, err := meta.Handle(map[string]any{"id": "reply1"}, 200)
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if got["id"] != "reply1" {
		t.Fatalf("expected id reply1, got %#v", got)
	}
}
