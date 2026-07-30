package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
)

const prefix = "enc1:"

type TokenCrypto struct {
	gcm cipher.AEAD
}

func New(keyB64 string) (*TokenCrypto, error) {
	key, err := base64.URLEncoding.DecodeString(keyB64)
	if err != nil {
		key, err = base64.RawURLEncoding.DecodeString(keyB64)
		if err != nil {
			return nil, fmt.Errorf("decode key: %w", err)
		}
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("new cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("new gcm: %w", err)
	}

	return &TokenCrypto{gcm: gcm}, nil
}

func (t *TokenCrypto) Encrypt(plaintext string) (string, error) {
	nonce := make([]byte, 12)
	if _, err := rand.Read(nonce); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}

	ciphertext := t.gcm.Seal(nil, nonce, []byte(plaintext), nil)
	return prefix + base64.RawURLEncoding.EncodeToString(append(nonce, ciphertext...)), nil
}

func (t *TokenCrypto) Decrypt(stored string) (string, error) {
	raw, err := base64.RawURLEncoding.DecodeString(trimPrefix(stored))
	if err != nil {
		return "", fmt.Errorf("decode ciphertext: %w", err)
	}
	if len(raw) < 13 {
		return "", fmt.Errorf("ciphertext too short")
	}

	plaintext, err := t.gcm.Open(nil, raw[:12], raw[12:], nil)
	if err != nil {
		return "", fmt.Errorf("decrypt token: %w", err)
	}
	return string(plaintext), nil
}

func DecryptOrPlaintext(stored string, crypto *TokenCrypto) string {
	if crypto == nil {
		return stored
	}
	plaintext, err := crypto.Decrypt(stored)
	if err != nil {
		return stored
	}
	return plaintext
}

// DecryptOrPlaintext decrypts enc1: tokens or returns the stored value unchanged
// for legacy plaintext tokens (implements worker.TokenDecryptor / handlers.TokenCrypto).
func (t *TokenCrypto) DecryptOrPlaintext(stored string) string {
	return DecryptOrPlaintext(stored, t)
}

func trimPrefix(stored string) string {
	if len(stored) >= len(prefix) && stored[:len(prefix)] == prefix {
		return stored[len(prefix):]
	}
	return stored
}
