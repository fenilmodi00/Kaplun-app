package oauth_test

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"kaplun/api-go/internal/services/oauth"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) Do(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestExchangeCodeForShortToken(t *testing.T) {
	t.Parallel()

	client := roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.Method != http.MethodPost || req.URL.String() != oauth.OAuthTokenURL {
			t.Fatalf("unexpected request %s %s", req.Method, req.URL)
		}
		body, _ := io.ReadAll(req.Body)
		if !strings.Contains(string(body), "code=abc") {
			t.Fatalf("form: %s", body)
		}
		return &http.Response{
			StatusCode: 200,
			Body:       io.NopCloser(strings.NewReader(`{"access_token":"short","user_id":"1"}`)),
			Header:     make(http.Header),
		}, nil
	})

	svc := oauth.NewService(client, oauth.Config{AppID: "id", AppSecret: "sec", RedirectURI: "https://cb"})
	got, err := svc.ExchangeCodeForShortToken(context.Background(), "abc")
	if err != nil {
		t.Fatalf("exchange: %v", err)
	}
	if got.AccessToken != "short" {
		t.Fatalf("token: %#v", got)
	}
}

func TestExchangeForLongTokenAndProfile(t *testing.T) {
	t.Parallel()

	var calls int
	client := roundTripFunc(func(req *http.Request) (*http.Response, error) {
		calls++
		switch {
		case strings.Contains(req.URL.Path, "/access_token"):
			return &http.Response{
				StatusCode: 200,
				Body:       io.NopCloser(strings.NewReader(`{"access_token":"long","expires_in":100}`)),
				Header:     make(http.Header),
			}, nil
		case strings.Contains(req.URL.Path, "/me"):
			return &http.Response{
				StatusCode: 200,
				Body:       io.NopCloser(strings.NewReader(`{"id":"ig1","username":"alice","account_type":"BUSINESS","followers_count":10}`)),
				Header:     make(http.Header),
			}, nil
		default:
			t.Fatalf("unexpected url %s", req.URL)
			return nil, nil
		}
	})

	svc := oauth.NewService(client, oauth.Config{AppSecret: "sec"})
	long, err := svc.ExchangeForLongToken(context.Background(), "short")
	if err != nil || long.AccessToken != "long" || long.ExpiresIn == nil || *long.ExpiresIn != 100 {
		t.Fatalf("long: %#v err=%v", long, err)
	}
	profile, err := svc.FetchInstagramProfile(context.Background(), "long")
	if err != nil || profile.Username != "alice" || profile.FollowersCount != 10 {
		t.Fatalf("profile: %#v err=%v", profile, err)
	}
	if calls != 2 {
		t.Fatalf("calls=%d", calls)
	}
}

func TestBuildCreatorDataAndExpiry(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	expires := 60
	at := oauth.CalculateTokenExpiry(&expires, now)
	want := now.Add(60 * time.Second).Format(time.RFC3339Nano)
	if at != want {
		t.Fatalf("expiry %s != %s", at, want)
	}

	data := oauth.BuildCreatorData(oauth.Profile{
		ID: "ig1", Username: "alice", Name: "Alice", AccountType: "professional",
	}, "tok", at, "clerk1", now)
	if data["account_type"] != "creator" || data["is_business"] != false {
		t.Fatalf("data: %#v", data)
	}
	if data["clerk_user_id"] != "clerk1" || data["ig_user_id"] != "ig1" {
		t.Fatalf("ids: %#v", data)
	}
}
