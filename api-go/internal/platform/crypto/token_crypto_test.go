package crypto_test

import (
	"testing"

	platformcrypto "kaplun/api-go/internal/platform/crypto"
)

const testKey = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="

func TestTokenCryptoRoundTrip(t *testing.T) {
	t.Parallel()

	crypto, err := platformcrypto.New(testKey)
	if err != nil {
		t.Fatalf("new crypto: %v", err)
	}

	encrypted, err := crypto.Encrypt("IGQVJ-example-token")
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	if encrypted == "IGQVJ-example-token" {
		t.Fatal("expected ciphertext to differ from plaintext")
	}

	decrypted, err := crypto.Decrypt(encrypted)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if decrypted != "IGQVJ-example-token" {
		t.Fatalf("expected round-trip token, got %q", decrypted)
	}
}

func TestTokenCryptoUsesRandomNonce(t *testing.T) {
	t.Parallel()

	crypto, err := platformcrypto.New(testKey)
	if err != nil {
		t.Fatalf("new crypto: %v", err)
	}

	first, err := crypto.Encrypt("same")
	if err != nil {
		t.Fatalf("encrypt first: %v", err)
	}
	second, err := crypto.Encrypt("same")
	if err != nil {
		t.Fatalf("encrypt second: %v", err)
	}

	if first == second {
		t.Fatal("expected different ciphertexts for the same plaintext")
	}
}

func TestDecryptOrPlaintextFallsBackForLegacyTokens(t *testing.T) {
	t.Parallel()

	crypto, err := platformcrypto.New(testKey)
	if err != nil {
		t.Fatalf("new crypto: %v", err)
	}

	if got := platformcrypto.DecryptOrPlaintext("legacy-plaintext-token", crypto); got != "legacy-plaintext-token" {
		t.Fatalf("expected plaintext fallback, got %q", got)
	}

	encrypted, err := crypto.Encrypt("new-token")
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	if got := platformcrypto.DecryptOrPlaintext(encrypted, crypto); got != "new-token" {
		t.Fatalf("expected decrypted token, got %q", got)
	}
}
