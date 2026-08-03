package cloudflare_test

import (
	"testing"

	"kaplun/api-go/internal/platform/cloudflare"
)

func TestExtractPublicURLFromQuickTunnelLog(t *testing.T) {
	t.Parallel()

	line := `|  https://random-words-here.trycloudflare.com                                                   |`
	got := cloudflare.ExtractPublicURL(line)
	if got != "https://random-words-here.trycloudflare.com" {
		t.Fatalf("got %q", got)
	}
}

func TestExtractPublicURLIgnoresNonTunnelHosts(t *testing.T) {
	t.Parallel()

	if got := cloudflare.ExtractPublicURL("visit https://developers.cloudflare.com/docs"); got != "" {
		t.Fatalf("expected empty, got %q", got)
	}
}

func TestResolveURLPrefersExplicitTunnelURL(t *testing.T) {
	t.Parallel()

	got := cloudflare.ResolveURL("my-app.example.com", "https://api.kaplun.tech")
	if got != "https://my-app.example.com" {
		t.Fatalf("got %q", got)
	}
}

func TestResolveURLUsesPublicBaseWhenCloudflareHost(t *testing.T) {
	t.Parallel()

	got := cloudflare.ResolveURL("", "https://foo.trycloudflare.com/")
	if got != "https://foo.trycloudflare.com" {
		t.Fatalf("got %q", got)
	}
}

func TestResolveURLEmptyForNonCloudflarePublicBase(t *testing.T) {
	t.Parallel()

	got := cloudflare.ResolveURL("", "https://api.kaplun.tech")
	if got != "" {
		t.Fatalf("got %q", got)
	}
}
