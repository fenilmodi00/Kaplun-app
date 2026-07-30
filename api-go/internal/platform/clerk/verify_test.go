package clerk_test

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"kaplun/api-go/internal/platform/clerk"
)

func TestVerifyTokenHS256(t *testing.T) {
	t.Parallel()

	verifier := clerk.NewVerifier(clerk.Config{
		SecretKey: "test-secret",
	})

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": "user_123",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	signed, err := token.SignedString([]byte("test-secret"))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}

	userID, err := verifier.VerifyToken(signed)
	if err != nil {
		t.Fatalf("verify token: %v", err)
	}
	if userID != "user_123" {
		t.Fatalf("expected user_123, got %q", userID)
	}
}

func TestExtractBearerToken(t *testing.T) {
	t.Parallel()

	token, err := clerk.ExtractBearerToken("Bearer abc123")
	if err != nil {
		t.Fatalf("extract bearer token: %v", err)
	}
	if token != "abc123" {
		t.Fatalf("expected abc123, got %q", token)
	}
}

func TestExtractBearerTokenRejectsMalformedHeader(t *testing.T) {
	t.Parallel()

	if _, err := clerk.ExtractBearerToken("abc123"); err == nil {
		t.Fatal("expected malformed header error")
	}
}
