// Package cloudflare starts the local cloudflared CLI for pre-deploy HTTPS tunnels.
// Quick tunnels (trycloudflare.com) have no browser interstitial, so Meta webhook
// verification works — unlike free ngrok.
package cloudflare

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

var tryCloudflareURL = regexp.MustCompile(`https://[a-zA-Z0-9.-]+\.trycloudflare\.com`)

// Tunnel is a running cloudflared subprocess.
type Tunnel struct {
	cmd       *exec.Cmd
	PublicURL string
	log       *slog.Logger
}

// Options configure the cloudflared CLI invocation.
type Options struct {
	Port   string // local listen port, e.g. "8000"
	Token  string // optional Zero Trust install token (tunnel run --token)
	Name   string // optional CLI tunnel name (tunnel run <name>) using ~/.cloudflared credentials
	URL    string // known public URL for named tunnels (required with Token or Name)
	Logger *slog.Logger
}

// ExtractPublicURL pulls a trycloudflare.com URL from a cloudflared log line.
func ExtractPublicURL(line string) string {
	match := tryCloudflareURL.FindString(line)
	return strings.TrimRight(match, "/")
}

// ResolveURL picks a known public HTTPS URL from an explicit hostname/URL or
// PUBLIC_BASE_URL when that base is already a Cloudflare tunnel host.
func ResolveURL(tunnelURL, publicBaseURL string) string {
	tunnelURL = strings.TrimSpace(tunnelURL)
	if tunnelURL != "" {
		if strings.HasPrefix(tunnelURL, "http://") || strings.HasPrefix(tunnelURL, "https://") {
			return strings.TrimRight(tunnelURL, "/")
		}
		return "https://" + strings.TrimRight(tunnelURL, "/")
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
	if strings.Contains(host, "trycloudflare.com") || strings.Contains(host, "cfargotunnel.com") {
		return strings.TrimRight(publicBaseURL, "/")
	}
	return ""
}

// Start launches cloudflared and waits for a public HTTPS URL.
//
// Priority:
//  1. Token set  → `cloudflared tunnel run --token …` (Zero Trust install token)
//  2. Name set   → `cloudflared tunnel run <name>` (CLI tunnel + ~/.cloudflared/*.json)
//  3. else       → quick tunnel `cloudflared tunnel --url http://127.0.0.1:PORT`
func Start(ctx context.Context, opts Options) (*Tunnel, error) {
	log := opts.Logger
	if log == nil {
		log = slog.Default()
	}
	port := strings.TrimSpace(opts.Port)
	if port == "" {
		port = "8000"
	}

	bin, err := lookCloudflared()
	if err != nil {
		return nil, err
	}

	token := strings.TrimSpace(opts.Token)
	name := strings.TrimSpace(opts.Name)
	knownURL := strings.TrimSpace(opts.URL)

	var args []string
	named := false
	switch {
	case token != "":
		if knownURL == "" {
			return nil, fmt.Errorf("CLOUDFLARE_TUNNEL_URL is required when CLOUDFLARE_TUNNEL_TOKEN is set")
		}
		args = []string{"tunnel", "run", "--token", token}
		named = true
	case name != "":
		if knownURL == "" {
			return nil, fmt.Errorf("CLOUDFLARE_TUNNEL_URL is required when CLOUDFLARE_TUNNEL_NAME is set (e.g. https://api-dev.kaplun.tech)")
		}
		cfgPath, cfgErr := ensureNamedTunnelConfig(name, port, knownURL)
		if cfgErr != nil {
			return nil, cfgErr
		}
		args = []string{"tunnel", "--config", cfgPath, "run", name}
		named = true
	default:
		args = []string{"tunnel", "--url", "http://127.0.0.1:" + port, "--no-autoupdate"}
	}

	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Env = os.Environ()

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("cloudflared stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("cloudflared stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start cloudflared: %w", err)
	}

	t := &Tunnel{cmd: cmd, log: log}
	exitCh := make(chan error, 1)
	go func() {
		exitCh <- cmd.Wait()
	}()

	if named {
		t.PublicURL = strings.TrimRight(knownURL, "/")
		ready, waitErr := waitForNamedTunnelReady(ctx, stdout, stderr, exitCh, 45*time.Second, log)
		if waitErr != nil {
			_ = t.Stop()
			return nil, waitErr
		}
		if !ready {
			_ = t.Stop()
			return nil, fmt.Errorf("cloudflared started but never registered a tunnel connection")
		}
		log.Info("cloudflare named tunnel ready", "url", t.PublicURL, "local", ":"+port, "name", name)
		return t, nil
	}

	publicURL, waitErr := waitForQuickTunnelURL(ctx, stdout, stderr, exitCh, 20*time.Second)
	if waitErr != nil {
		_ = t.Stop()
		return nil, waitErr
	}
	t.PublicURL = publicURL
	log.Info("cloudflare quick tunnel ready", "url", publicURL, "local", ":"+port)
	return t, nil
}

// ensureNamedTunnelConfig writes a minimal cloudflared config that routes the
// public hostname to local Gin. Credentials come from ~/.cloudflared/<id>.json
// created by `cloudflared tunnel create`.
func ensureNamedTunnelConfig(name, port, publicURL string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("home dir: %w", err)
	}
	cfDir := filepath.Join(home, ".cloudflared")
	credPattern := filepath.Join(cfDir, "*.json")
	matches, _ := filepath.Glob(credPattern)
	var credFile string
	for _, m := range matches {
		base := filepath.Base(m)
		if base == "cert.pem" || !strings.HasSuffix(base, ".json") {
			continue
		}
		// Prefer the kaplun-api credentials file if present.
		credFile = m
		if strings.Contains(strings.ToLower(base), "adea9aa9") {
			break
		}
	}
	if credFile == "" {
		return "", fmt.Errorf("no tunnel credentials in %s (run: cloudflared tunnel create %s)", cfDir, name)
	}

	host := publicURL
	if u, err := url.Parse(publicURL); err == nil && u.Host != "" {
		host = u.Host
	}

	// Read tunnel UUID from credentials filename (uuid.json).
	tunnelID := strings.TrimSuffix(filepath.Base(credFile), ".json")

	cfgPath := filepath.Join(cfDir, "kaplun-api-config.yml")
	body := fmt.Sprintf(`tunnel: %s
credentials-file: %s

ingress:
  - hostname: %s
    service: http://127.0.0.1:%s
  - service: http_status:404
`, tunnelID, filepath.ToSlash(credFile), host, port)

	if err := os.WriteFile(cfgPath, []byte(body), 0o600); err != nil {
		return "", fmt.Errorf("write cloudflared config: %w", err)
	}
	return cfgPath, nil
}

// Stop terminates the cloudflared process.
func (t *Tunnel) Stop() error {
	if t == nil || t.cmd == nil || t.cmd.Process == nil {
		return nil
	}
	err := t.cmd.Process.Kill()
	_, _ = t.cmd.Process.Wait()
	t.cmd = nil
	return err
}

func waitForNamedTunnelReady(
	ctx context.Context,
	stdout, stderr io.Reader,
	exitCh <-chan error,
	timeout time.Duration,
	log *slog.Logger,
) (bool, error) {
	lines := make(chan string, 128)
	var wg sync.WaitGroup
	scan := func(r io.Reader) {
		defer wg.Done()
		s := bufio.NewScanner(r)
		s.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for s.Scan() {
			line := s.Text()
			select {
			case lines <- line:
			case <-ctx.Done():
				return
			}
		}
	}
	wg.Add(2)
	go scan(stdout)
	go scan(stderr)
	go func() {
		wg.Wait()
		close(lines)
	}()

	deadline := time.After(timeout)
	for {
		select {
		case <-ctx.Done():
			return false, ctx.Err()
		case err := <-exitCh:
			if err != nil {
				return false, fmt.Errorf("cloudflared exited before ready: %w", err)
			}
			return false, fmt.Errorf("cloudflared exited before ready")
		case <-deadline:
			return false, fmt.Errorf("timeout waiting for cloudflared Registered tunnel connection")
		case line, ok := <-lines:
			if !ok {
				return false, fmt.Errorf("cloudflared closed logs before registering connection")
			}
			// Keep cloudflared chatter visible while bringing the tunnel up.
			if strings.Contains(line, "ERR") || strings.Contains(line, " error=") {
				log.Warn("cloudflared", "line", clip(line, 300))
			} else if strings.Contains(line, "Registered tunnel connection") ||
				strings.Contains(line, "INF ") {
				log.Info("cloudflared", "line", clip(line, 300))
			}
			if strings.Contains(line, "Registered tunnel connection") {
				// Keep draining after ready so Windows pipe buffers never fill.
				go func() {
					for line := range lines {
						if strings.Contains(line, "ERR") || strings.Contains(line, " error=") {
							log.Warn("cloudflared", "line", clip(line, 300))
						}
					}
				}()
				go func() {
					if err := <-exitCh; err != nil {
						log.Error("cloudflared exited", "err", err)
					}
				}()
				return true, nil
			}
		}
	}
}

func waitForQuickTunnelURL(ctx context.Context, stdout, stderr io.Reader, exitCh <-chan error, timeout time.Duration) (string, error) {
	lines := make(chan string, 64)
	var wg sync.WaitGroup
	scan := func(r io.Reader) {
		defer wg.Done()
		s := bufio.NewScanner(r)
		s.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for s.Scan() {
			select {
			case lines <- s.Text():
			case <-ctx.Done():
				return
			}
		}
	}
	wg.Add(2)
	go scan(stdout)
	go scan(stderr)
	go func() {
		wg.Wait()
		close(lines)
	}()

	deadline := time.After(timeout)
	for {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case err := <-exitCh:
			if err != nil {
				return "", fmt.Errorf("cloudflared exited before publishing URL: %w", err)
			}
			return "", fmt.Errorf("cloudflared exited before publishing a public URL")
		case <-deadline:
			return "", fmt.Errorf("timeout waiting for cloudflared trycloudflare.com URL")
		case line, ok := <-lines:
			if !ok {
				return "", fmt.Errorf("cloudflared exited before publishing a public URL")
			}
			if u := ExtractPublicURL(line); u != "" {
				go drainLines(lines)
				go func() { <-exitCh }()
				return u, nil
			}
		}
	}
}

func drainLines(lines <-chan string) {
	for range lines {
	}
}

func drain(r io.Reader) {
	_, _ = io.Copy(io.Discard, r)
}

func clip(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}

func lookCloudflared() (string, error) {
	if bin, err := exec.LookPath("cloudflared"); err == nil {
		return bin, nil
	}
	// Local vendored binary (api-go/tools/cloudflared.exe) for Windows dev.
	candidates := []string{
		filepath.Join("tools", "cloudflared.exe"),
		filepath.Join("tools", "cloudflared"),
		filepath.Join("api-go", "tools", "cloudflared.exe"),
		filepath.Join("api-go", "tools", "cloudflared"),
	}
	for _, c := range candidates {
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			abs, absErr := filepath.Abs(c)
			if absErr != nil {
				return c, nil
			}
			return abs, nil
		}
	}
	return "", fmt.Errorf("cloudflared CLI not found on PATH or ./tools (install: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/)")
}
