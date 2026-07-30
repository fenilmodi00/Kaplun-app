// Package ngrok starts the local ngrok CLI agent for pre-deploy HTTPS tunnels.
package ngrok

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"time"
)

const localAPI = "http://127.0.0.1:4040/api/tunnels"

// Tunnel is a running ngrok http agent subprocess.
type Tunnel struct {
	cmd       *exec.Cmd
	PublicURL string
	log       *slog.Logger
}

// Options configure the ngrok CLI invocation.
type Options struct {
	Port   string // local listen port, e.g. "8000"
	URL    string // optional reserved endpoint, e.g. https://foo.ngrok-free.dev
	Logger *slog.Logger
}

// ResolveURL picks the ngrok --url value from an explicit domain or PUBLIC_BASE_URL
// when that base URL is already an ngrok host (matches the FastAPI .env setup).
func ResolveURL(domain, publicBaseURL string) string {
	domain = strings.TrimSpace(domain)
	if domain != "" {
		if strings.HasPrefix(domain, "http://") || strings.HasPrefix(domain, "https://") {
			return strings.TrimRight(domain, "/")
		}
		return "https://" + strings.TrimRight(domain, "/")
	}

	publicBaseURL = strings.TrimSpace(publicBaseURL)
	if publicBaseURL == "" {
		return ""
	}
	u, err := url.Parse(publicBaseURL)
	if err != nil || u.Host == "" {
		return ""
	}
	host := strings.ToLower(u.Host)
	if strings.Contains(host, "ngrok") {
		return strings.TrimRight(publicBaseURL, "/")
	}
	return ""
}

// Start launches `ngrok http <port>` (optionally with --url) and waits briefly
// for the local agent API to report a public HTTPS URL.
func Start(ctx context.Context, opts Options) (*Tunnel, error) {
	log := opts.Logger
	if log == nil {
		log = slog.Default()
	}
	port := strings.TrimSpace(opts.Port)
	if port == "" {
		port = "8000"
	}

	bin, err := exec.LookPath("ngrok")
	if err != nil {
		return nil, fmt.Errorf("ngrok CLI not found on PATH: %w", err)
	}

	args := []string{"http", port, "--log=stdout", "--log-format=term"}
	if u := strings.TrimSpace(opts.URL); u != "" {
		args = append(args, "--url", u)
	}

	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	// Detach from parent's console group on Windows so Ctrl+C is handled by us.
	cmd.Env = os.Environ()

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start ngrok: %w", err)
	}

	t := &Tunnel{cmd: cmd, log: log}
	publicURL, waitErr := waitForPublicURL(ctx, 8*time.Second)
	if waitErr != nil {
		_ = t.Stop()
		return nil, waitErr
	}
	t.PublicURL = publicURL
	log.Info("ngrok tunnel ready", "url", publicURL, "local", ":"+port)
	return t, nil
}

// Stop terminates the ngrok agent process.
func (t *Tunnel) Stop() error {
	if t == nil || t.cmd == nil || t.cmd.Process == nil {
		return nil
	}
	err := t.cmd.Process.Kill()
	_, _ = t.cmd.Process.Wait()
	t.cmd = nil
	return err
}

func waitForPublicURL(ctx context.Context, timeout time.Duration) (string, error) {
	deadline := time.Now().Add(timeout)
	client := &http.Client{Timeout: 500 * time.Millisecond}
	var lastErr error
	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		default:
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, localAPI, nil)
		if err != nil {
			return "", err
		}
		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			time.Sleep(200 * time.Millisecond)
			continue
		}
		var body struct {
			Tunnels []struct {
				PublicURL string `json:"public_url"`
				Proto     string `json:"proto"`
			} `json:"tunnels"`
		}
		decodeErr := json.NewDecoder(resp.Body).Decode(&body)
		_ = resp.Body.Close()
		if decodeErr != nil {
			lastErr = decodeErr
			time.Sleep(200 * time.Millisecond)
			continue
		}
		for _, tun := range body.Tunnels {
			if strings.HasPrefix(tun.PublicURL, "https://") {
				return tun.PublicURL, nil
			}
		}
		for _, tun := range body.Tunnels {
			if tun.PublicURL != "" {
				return tun.PublicURL, nil
			}
		}
		lastErr = fmt.Errorf("ngrok agent has no tunnels yet")
		time.Sleep(200 * time.Millisecond)
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("timeout waiting for ngrok public URL")
	}
	return "", fmt.Errorf("ngrok not ready: %w", lastErr)
}
