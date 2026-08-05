package meta_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"kaplun/api-go/internal/platform/meta"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) Do(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestSendPrivateReplyShape(t *testing.T) {
	t.Parallel()

	var seenURL, seenAuth string
	var seenBody map[string]any

	client := meta.NewClient(roundTripFunc(func(req *http.Request) (*http.Response, error) {
		seenURL = req.URL.String()
		seenAuth = req.Header.Get("Authorization")
		_ = json.NewDecoder(req.Body).Decode(&seenBody)
		return &http.Response{
			StatusCode: 200,
			Body:       io.NopCloser(strings.NewReader(`{"recipient_id":"r1","message_id":"m1"}`)),
			Header:     make(http.Header),
		}, nil
	}))

	out, err := client.SendPrivateReply(context.Background(), "ig123", "cmt9", "hi there", "tok")
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	if out["message_id"] != "m1" {
		t.Fatalf("out: %#v", out)
	}
	if seenURL != "https://graph.instagram.com/v26.0/ig123/messages" {
		t.Fatalf("url: %s", seenURL)
	}
	if seenAuth != "Bearer tok" {
		t.Fatalf("auth: %s", seenAuth)
	}
	recipient, _ := seenBody["recipient"].(map[string]any)
	message, _ := seenBody["message"].(map[string]any)
	if recipient["comment_id"] != "cmt9" || message["text"] != "hi there" {
		t.Fatalf("body: %#v", seenBody)
	}
}

func TestSendCommentReplyShape(t *testing.T) {
	t.Parallel()

	client := meta.NewClient(roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.URL.String() != "https://graph.instagram.com/v26.0/cmt9/replies" {
			t.Fatalf("url: %s", req.URL)
		}
		var body map[string]any
		_ = json.NewDecoder(req.Body).Decode(&body)
		if body["message"] != "thanks!" {
			t.Fatalf("body: %#v", body)
		}
		return &http.Response{
			StatusCode: 200,
			Body:       io.NopCloser(strings.NewReader(`{"id":"reply1"}`)),
			Header:     make(http.Header),
		}, nil
	}))

	out, err := client.SendCommentReply(context.Background(), "cmt9", "thanks!", "t")
	if err != nil || out["id"] != "reply1" {
		t.Fatalf("out=%#v err=%v", out, err)
	}
}

func TestSendPrivateReplyMapsTokenExpired(t *testing.T) {
	t.Parallel()

	client := meta.NewClient(roundTripFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: 400,
			Body: io.NopCloser(strings.NewReader(
				`{"error":{"message":"expired","type":"OAuthException","code":190,"fbtrace_id":"fb"}}`,
			)),
			Header: make(http.Header),
		}, nil
	}))

	_, err := client.SendPrivateReply(context.Background(), "ig", "c", "m", "t")
	if !meta.IsTokenExpired(err) {
		t.Fatalf("expected TokenExpiredError, got %T %v", err, err)
	}
}

func TestIsMetaAPIErrorThroughWrappers(t *testing.T) {
	t.Parallel()
	err := &meta.GraphRateLimitError{MetaAPIError: &meta.MetaAPIError{Code: 613, Message: "rate"}}
	if !meta.IsMetaAPIError(err) || !meta.IsGraphRateLimit(err) {
		t.Fatalf("helpers failed for %T", err)
	}
}
