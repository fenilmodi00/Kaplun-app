package webhooks_test

import (
	"testing"

	"kaplun/api-go/internal/platform/webhooks"
)

func TestVerifySignature(t *testing.T) {
	t.Parallel()

	body := []byte(`{"object":"instagram","entry":[]}`)
	signature := webhooks.ComputeTestSignature("test-ig-secret", body)

	if !webhooks.VerifySignature(body, signature, []string{"test-ig-secret"}) {
		t.Fatal("expected valid signature to verify")
	}
	if webhooks.VerifySignature(body, "sha256=deadbeef", []string{"test-ig-secret"}) {
		t.Fatal("expected invalid signature to fail")
	}
	if webhooks.VerifySignature(body, signature, nil) {
		t.Fatal("expected missing secrets to fail")
	}
}

func TestParseCommentEventsSkipsOwnComments(t *testing.T) {
	t.Parallel()

	payload := map[string]any{
		"object": "instagram",
		"entry": []any{
			map[string]any{
				"id": "ig1",
				"changes": []any{
					map[string]any{
						"field": "comments",
						"value": map[string]any{
							"id":    "c1",
							"text":  "LINK please",
							"from":  map[string]any{"id": "u2", "username": "fan"},
							"media": map[string]any{"id": "m1"},
						},
					},
					map[string]any{
						"field": "comments",
						"value": map[string]any{
							"id":    "c2",
							"text":  "own",
							"from":  map[string]any{"id": "ig1"},
							"media": map[string]any{"id": "m1"},
						},
					},
				},
			},
		},
	}

	events := webhooks.ParseCommentEvents(payload)
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}

	event := events[0]
	if event.InstagramAccountID != "ig1" || event.CommentID != "c1" || event.MediaID != "m1" || event.CommenterID != "u2" {
		t.Fatalf("unexpected parsed event: %#v", event)
	}
	if event.CommentText != "LINK please" || event.CommenterName != "fan" {
		t.Fatalf("unexpected event content: %#v", event)
	}
}

func TestParsePostbackEvents(t *testing.T) {
	t.Parallel()

	payload := map[string]any{
		"object": "instagram",
		"entry": []any{
			map[string]any{
				"id": "ig1",
				"messaging": []any{
					map[string]any{
						"sender":    map[string]any{"id": "u2"},
						"recipient": map[string]any{"id": "ig1"},
						"postback":  map[string]any{"mid": "m1", "payload": "reveal:auto1"},
					},
				},
			},
		},
	}

	events := webhooks.ParsePostbackEvents(payload)
	if len(events) != 1 {
		t.Fatalf("expected 1 postback event, got %d", len(events))
	}
	if events[0].Payload != "reveal:auto1" || events[0].UserID != "u2" {
		t.Fatalf("unexpected postback event: %#v", events[0])
	}
}
