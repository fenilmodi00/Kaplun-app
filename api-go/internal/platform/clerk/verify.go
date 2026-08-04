package clerk

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type Config struct {
	SecretKey         string
	JWTKey            string
	AuthorizedParties []string
}

type Verifier struct {
	cfg Config
}

func NewVerifier(cfg Config) *Verifier {
	return &Verifier{cfg: cfg}
}

func ExtractBearerToken(authorization string) (string, error) {
	if strings.TrimSpace(authorization) == "" {
		return "", errors.New("missing authorization header")
	}

	parts := strings.SplitN(authorization, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") || strings.TrimSpace(parts[1]) == "" {
		return "", errors.New("authorization header must be 'Bearer <token>'")
	}

	return strings.TrimSpace(parts[1]), nil
}

func (v *Verifier) VerifyToken(token string) (string, error) {
	if strings.TrimSpace(token) == "" {
		return "", errors.New("empty jwt token")
	}

	switch {
	case v.cfg.SecretKey != "" && !strings.HasPrefix(v.cfg.SecretKey, "sk_"):
		return verifyHS256(token, v.cfg.SecretKey)
	case v.cfg.JWTKey != "":
		return verifyRS256(token, v.cfg.JWTKey)
	default:
		return "", errors.New("clerk verifier is not configured")
	}
}

func verifyHS256(token string, secret string) (string, error) {
	parsed, err := jwt.Parse(token, func(t *jwt.Token) (any, error) {
		if t.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("unexpected signing method %s", t.Method.Alg())
		}
		return []byte(secret), nil
	})
	if err != nil {
		return "", err
	}

	subject, err := parsed.Claims.GetSubject()
	if err != nil {
		return "", err
	}
	if subject == "" {
		return "", errors.New("jwt missing sub claim")
	}
	return subject, nil
}

func verifyRS256(token string, publicKeyPEM string) (string, error) {
	key, err := parseRSAPublicKey(publicKeyPEM)
	if err != nil {
		return "", err
	}

	parsed, err := jwt.Parse(token, func(t *jwt.Token) (any, error) {
		if t.Method != jwt.SigningMethodRS256 {
			return nil, fmt.Errorf("unexpected signing method %s", t.Method.Alg())
		}
		return key, nil
	})
	if err != nil {
		return "", err
	}

	subject, err := parsed.Claims.GetSubject()
	if err != nil {
		return "", err
	}
	if subject == "" {
		return "", errors.New("jwt missing sub claim")
	}
	return subject, nil
}

func parseRSAPublicKey(publicKeyPEM string) (*rsa.PublicKey, error) {
	block, _ := pem.Decode([]byte(publicKeyPEM))
	if block == nil {
		return nil, errors.New("invalid clerk jwt pem")
	}

	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse pkix public key: %w", err)
	}

	key, ok := parsed.(*rsa.PublicKey)
	if !ok {
		return nil, errors.New("clerk jwt pem is not an rsa public key")
	}
	return key, nil
}
