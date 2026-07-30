package ngrok_test

import (
	"testing"

	"kaplun/api-go/internal/platform/ngrok"
)

func TestResolveURLPrefersExplicitDomain(t *testing.T) {
	t.Parallel()

	got := ngrok.ResolveURL("my-tunnel.ngrok-free.dev", "https://api.kaplun.tech")
	if got != "https://my-tunnel.ngrok-free.dev" {
		t.Fatalf("got %q", got)
	}
}

func TestResolveURLUsesNgrokPublicBase(t *testing.T) {
	t.Parallel()

	got := ngrok.ResolveURL("", "https://vincenza-example.ngrok-free.dev/")
	if got != "https://vincenza-example.ngrok-free.dev" {
		t.Fatalf("got %q", got)
	}
}

func TestResolveURLIgnoresProductionPublicBase(t *testing.T) {
	t.Parallel()

	got := ngrok.ResolveURL("", "https://api.kaplun.tech")
	if got != "" {
		t.Fatalf("got %q want empty", got)
	}
}
