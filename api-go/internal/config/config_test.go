package config_test

import (
	"testing"

	"kaplun/api-go/internal/config"
)

func TestFromMapSplitsCORSOrigins(t *testing.T) {
	t.Parallel()

	cfg, err := config.FromMap(map[string]string{
		"CORS_ORIGINS": "https://kaplun.tech,http://localhost:8081",
	})
	if err != nil {
		t.Fatalf("expected config load to succeed, got %v", err)
	}

	want := []string{"https://kaplun.tech", "http://localhost:8081"}
	if len(cfg.CORSOrigins) != len(want) {
		t.Fatalf("expected %d origins, got %d", len(want), len(cfg.CORSOrigins))
	}

	for i := range want {
		if cfg.CORSOrigins[i] != want[i] {
			t.Fatalf("expected origin %q at index %d, got %q", want[i], i, cfg.CORSOrigins[i])
		}
	}
}

func TestFromMapDefaultsCORSOriginsToWildcard(t *testing.T) {
	t.Parallel()

	cfg, err := config.FromMap(map[string]string{})
	if err != nil {
		t.Fatalf("expected config load to succeed, got %v", err)
	}

	if len(cfg.CORSOrigins) != 1 || cfg.CORSOrigins[0] != "*" {
		t.Fatalf("expected wildcard cors default, got %#v", cfg.CORSOrigins)
	}
}

func TestFromMapLoadsAllEnvExampleKeys(t *testing.T) {
	t.Parallel()

	cfg, err := config.FromMap(map[string]string{
		"CLERK_SECRET_KEY":                  "sk_test",
		"CLERK_JWT_KEY":                     "pem",
		"CLERK_AUTHORIZED_PARTIES":          "https://kaplun.tech,http://localhost:8081",
		"CORS_ORIGINS":                      "https://a.test",
		"IG_API_PORT":                       "9000",
		"APPWRITE_ENDPOINT":                 "https://example.appwrite.io/v1",
		"APPWRITE_PROJECT_ID":               "proj",
		"APPWRITE_API_KEY":                  "key",
		"APPWRITE_DATABASE_ID":              "db",
		"APPWRITE_CREATORS_TABLE_ID":        "creators_tbl",
		"INSTAGRAM_APP_ID":                  "ig_app",
		"INSTAGRAM_APP_SECRET":              "ig_secret",
		"REDIRECT_URI":                      "https://cb.example/callback",
		"APPWRITE_AUTOMATIONS_TABLE_ID":     "automations",
		"APPWRITE_AUTOMATION_LOGS_TABLE_ID": "logs",
		"APPWRITE_AUTOMATION_JOBS_TABLE_ID": "jobs",
		"WEBHOOK_VERIFY_TOKEN":              "verify",
		"FACEBOOK_APP_SECRET":               "fb_secret",
		"CRON_SECRET":                       "cron",
		"PUBLIC_BASE_URL":                   "https://api.kaplun.tech",
		"AUTOMATION_SWEEPER_ENABLED":        "false",
	})
	if err != nil {
		t.Fatalf("FromMap: %v", err)
	}

	if cfg.ClerkSecretKey != "sk_test" || cfg.ClerkJWTKey != "pem" {
		t.Fatalf("clerk keys not loaded: %#v %#v", cfg.ClerkSecretKey, cfg.ClerkJWTKey)
	}
	if len(cfg.ClerkAuthorizedParties) != 2 {
		t.Fatalf("authorized parties: %#v", cfg.ClerkAuthorizedParties)
	}
	if cfg.Port != "9000" {
		t.Fatalf("port: %q", cfg.Port)
	}
	if cfg.AppwriteEndpoint != "https://example.appwrite.io/v1" || cfg.AppwriteProjectID != "proj" {
		t.Fatalf("appwrite core not loaded")
	}
	if cfg.AppwriteCreatorsTableID != "creators_tbl" || cfg.AppwriteAutomationsTableID != "automations" {
		t.Fatalf("table ids not loaded")
	}
	if cfg.InstagramAppID != "ig_app" || cfg.RedirectURI == "" {
		t.Fatalf("instagram oauth not loaded")
	}
	if cfg.WebhookVerifyToken != "verify" || cfg.CronSecret != "cron" || cfg.PublicBaseURL == "" {
		t.Fatalf("secrets/urls not loaded")
	}
	if cfg.AutomationSweeperEnabled {
		t.Fatal("expected AUTOMATION_SWEEPER_ENABLED=false")
	}
	if !cfg.HasAppwriteCore() || !cfg.HasClerkAuth() || !cfg.HasAutomationTables() {
		t.Fatal("expected capability helpers to be true")
	}
}

func TestFromMapDefaultsAppwriteAndSweeper(t *testing.T) {
	t.Parallel()

	cfg, err := config.FromMap(map[string]string{})
	if err != nil {
		t.Fatalf("FromMap: %v", err)
	}
	if cfg.AppwriteEndpoint != "https://sgp.cloud.appwrite.io/v1" {
		t.Fatalf("endpoint default: %q", cfg.AppwriteEndpoint)
	}
	if cfg.AppwriteDatabaseID != "vernacular_saas" || cfg.AppwriteCreatorsTableID != "creators" {
		t.Fatalf("db/creators defaults: %q %q", cfg.AppwriteDatabaseID, cfg.AppwriteCreatorsTableID)
	}
	if !cfg.AutomationSweeperEnabled {
		t.Fatal("expected sweeper enabled by default")
	}
	if cfg.NgrokEnabled {
		t.Fatal("expected ngrok disabled by default (use Cloudflare Tunnel)")
	}
	if !cfg.CloudflareTunnelEnabled {
		t.Fatal("expected cloudflare tunnel enabled by default")
	}
	if cfg.HasAppwriteCore() || cfg.HasClerkAuth() || cfg.HasAutomationTables() {
		t.Fatal("expected capability helpers false without secrets")
	}
}

func TestFromMapRejectsInvalidSweeperBool(t *testing.T) {
	t.Parallel()

	_, err := config.FromMap(map[string]string{"AUTOMATION_SWEEPER_ENABLED": "maybe"})
	if err == nil {
		t.Fatal("expected error for invalid bool")
	}
}

func TestFromMapRejectsPortZero(t *testing.T) {
	t.Parallel()

	_, err := config.FromMap(map[string]string{"IG_API_PORT": "0"})
	if err == nil {
		t.Fatal("expected error for port 0")
	}
}
