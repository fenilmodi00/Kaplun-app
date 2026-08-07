package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Config holds all environment-backed settings for the Gin API.
// Field names mirror api/.env.example.
type Config struct {
	// CORS / server
	CORSOrigins []string
	Port        string

	// Appwrite
	AppwriteEndpoint        string
	AppwriteProjectID       string
	AppwriteAPIKey          string
	AppwriteDatabaseID      string
	AppwriteCreatorsTableID string

	// Instagram OAuth
	InstagramAppID     string
	InstagramAppSecret string
	RedirectURI        string

	// Comment Automation — Appwrite Table IDs
	AppwriteAutomationsTableID    string
	AppwriteAutomationLogsTableID string
	AppwriteAutomationJobsTableID string

	// Comment Automation — Secrets / flags
	WebhookVerifyToken       string
	FacebookAppSecret        string
	CronSecret               string
	PublicBaseURL            string
	AutomationSweeperEnabled bool

	// First-party Insights sync — Appwrite Table IDs + flag
	AppwriteCreatorMediaTableID                string
	AppwriteCreatorInsightDaysTableID          string
	AppwriteCreatorAudienceDemographicsTableID string
	AppwriteCreatorOnlineFollowersTableID      string
	AppwriteMentionedMediaTableID              string
	InsightsSyncEnabled                        bool

	// Cloudflare Tunnel (preferred for Meta webhooks — no free-ngrok interstitial)
	CloudflareTunnelEnabled bool
	CloudflareTunnelToken   string // Zero Trust install token (optional)
	CloudflareTunnelName    string // CLI tunnel name, e.g. kaplun-api (uses ~/.cloudflared credentials)
	CloudflareTunnelURL     string // known public URL for named tunnels
}

// Load reads configuration from the process environment.
func Load() (Config, error) {
	return FromMap(envMap())
}

// FromMap builds Config from a key/value map (testable without mutating os.Environ).
func FromMap(values map[string]string) (Config, error) {
	cfg := Config{
		CORSOrigins: splitCSV(values["CORS_ORIGINS"]),
		Port:        strings.TrimSpace(values["IG_API_PORT"]),

		AppwriteEndpoint:        strings.TrimSpace(values["APPWRITE_ENDPOINT"]),
		AppwriteProjectID:       strings.TrimSpace(values["APPWRITE_PROJECT_ID"]),
		AppwriteAPIKey:          strings.TrimSpace(values["APPWRITE_API_KEY"]),
		AppwriteDatabaseID:      strings.TrimSpace(values["APPWRITE_DATABASE_ID"]),
		AppwriteCreatorsTableID: strings.TrimSpace(values["APPWRITE_CREATORS_TABLE_ID"]),

		InstagramAppID:     strings.TrimSpace(values["INSTAGRAM_APP_ID"]),
		InstagramAppSecret: strings.TrimSpace(values["INSTAGRAM_APP_SECRET"]),
		RedirectURI:        strings.TrimSpace(values["REDIRECT_URI"]),

		AppwriteAutomationsTableID:    strings.TrimSpace(values["APPWRITE_AUTOMATIONS_TABLE_ID"]),
		AppwriteAutomationLogsTableID: strings.TrimSpace(values["APPWRITE_AUTOMATION_LOGS_TABLE_ID"]),
		AppwriteAutomationJobsTableID: strings.TrimSpace(values["APPWRITE_AUTOMATION_JOBS_TABLE_ID"]),

		AppwriteCreatorMediaTableID:                strings.TrimSpace(values["APPWRITE_CREATOR_MEDIA_TABLE_ID"]),
		AppwriteCreatorInsightDaysTableID:          strings.TrimSpace(values["APPWRITE_CREATOR_INSIGHT_DAYS_TABLE_ID"]),
		AppwriteCreatorAudienceDemographicsTableID: strings.TrimSpace(values["APPWRITE_CREATOR_AUDIENCE_DEMOGRAPHICS_TABLE_ID"]),
		AppwriteCreatorOnlineFollowersTableID:      strings.TrimSpace(values["APPWRITE_CREATOR_ONLINE_FOLLOWERS_TABLE_ID"]),
		AppwriteMentionedMediaTableID:              strings.TrimSpace(values["APPWRITE_MENTIONED_MEDIA_TABLE_ID"]),

		WebhookVerifyToken: strings.TrimSpace(values["WEBHOOK_VERIFY_TOKEN"]),
		FacebookAppSecret:  strings.TrimSpace(values["FACEBOOK_APP_SECRET"]),
		CronSecret:         strings.TrimSpace(values["CRON_SECRET"]),
		PublicBaseURL:      strings.TrimSpace(values["PUBLIC_BASE_URL"]),
	}

	if len(cfg.CORSOrigins) == 0 {
		cfg.CORSOrigins = []string{"*"}
	}

	if cfg.Port == "" {
		cfg.Port = "8000"
	}
	if cfg.Port == "0" {
		return Config{}, fmt.Errorf("IG_API_PORT must not be 0")
	}

	if cfg.AppwriteEndpoint == "" {
		cfg.AppwriteEndpoint = "https://sgp.cloud.appwrite.io/v1"
	}
	if cfg.AppwriteDatabaseID == "" {
		cfg.AppwriteDatabaseID = "vernacular_saas"
	}
	if cfg.AppwriteCreatorsTableID == "" {
		cfg.AppwriteCreatorsTableID = "creators"
	}

	sweeper, err := parseBoolDefault(values["AUTOMATION_SWEEPER_ENABLED"], true)
	if err != nil {
		return Config{}, fmt.Errorf("AUTOMATION_SWEEPER_ENABLED: %w", err)
	}
	cfg.AutomationSweeperEnabled = sweeper

	insightsSync, err := parseBoolDefault(values["INSIGHTS_SYNC_ENABLED"], false)
	if err != nil {
		return Config{}, fmt.Errorf("INSIGHTS_SYNC_ENABLED: %w", err)
	}
	cfg.InsightsSyncEnabled = insightsSync

	// Prefer Cloudflare Tunnel for local Meta webhooks/OAuth (no free-ngrok interstitial).
	cfOn, err := parseBoolDefault(values["CLOUDFLARE_TUNNEL_ENABLED"], true)
	if err != nil {
		return Config{}, fmt.Errorf("CLOUDFLARE_TUNNEL_ENABLED: %w", err)
	}
	cfg.CloudflareTunnelEnabled = cfOn
	cfg.CloudflareTunnelToken = strings.TrimSpace(values["CLOUDFLARE_TUNNEL_TOKEN"])
	cfg.CloudflareTunnelName = strings.TrimSpace(values["CLOUDFLARE_TUNNEL_NAME"])
	cfg.CloudflareTunnelURL = strings.TrimSpace(values["CLOUDFLARE_TUNNEL_URL"])

	return cfg, nil
}

// HasAppwriteCore reports whether the minimum Appwrite credentials are present.
func (c Config) HasAppwriteCore() bool {
	return c.AppwriteEndpoint != "" && c.AppwriteProjectID != "" && c.AppwriteAPIKey != ""
}

// HasAppwriteJWT reports whether Appwrite user JWT validation can be performed.
// This only needs the endpoint + project ID; it does NOT need the server API key.
func (c Config) HasAppwriteJWT() bool {
	return c.AppwriteEndpoint != "" && c.AppwriteProjectID != ""
}

// HasAutomationTables reports whether all automation table IDs are set.
func (c Config) HasAutomationTables() bool {
	return c.AppwriteAutomationsTableID != "" &&
		c.AppwriteAutomationLogsTableID != "" &&
		c.AppwriteAutomationJobsTableID != ""
}

// HasInsightsTables reports whether all first-party insights table IDs are set.
func (c Config) HasInsightsTables() bool {
	return c.AppwriteCreatorMediaTableID != "" &&
		c.AppwriteCreatorInsightDaysTableID != "" &&
		c.AppwriteCreatorAudienceDemographicsTableID != "" &&
		c.AppwriteCreatorOnlineFollowersTableID != "" &&
		c.AppwriteMentionedMediaTableID != ""
}

func envMap() map[string]string {
	keys := []string{
		"CORS_ORIGINS",
		"IG_API_PORT",
		"APPWRITE_ENDPOINT",
		"APPWRITE_PROJECT_ID",
		"APPWRITE_API_KEY",
		"APPWRITE_DATABASE_ID",
		"APPWRITE_CREATORS_TABLE_ID",
		"INSTAGRAM_APP_ID",
		"INSTAGRAM_APP_SECRET",
		"REDIRECT_URI",
		"APPWRITE_AUTOMATIONS_TABLE_ID",
		"APPWRITE_AUTOMATION_LOGS_TABLE_ID",
		"APPWRITE_AUTOMATION_JOBS_TABLE_ID",
		"APPWRITE_CREATOR_MEDIA_TABLE_ID",
		"APPWRITE_CREATOR_INSIGHT_DAYS_TABLE_ID",
		"APPWRITE_CREATOR_AUDIENCE_DEMOGRAPHICS_TABLE_ID",
		"APPWRITE_CREATOR_ONLINE_FOLLOWERS_TABLE_ID",
		"APPWRITE_MENTIONED_MEDIA_TABLE_ID",
		"INSIGHTS_SYNC_ENABLED",
		"WEBHOOK_VERIFY_TOKEN",
		"FACEBOOK_APP_SECRET",
		"CRON_SECRET",
		"PUBLIC_BASE_URL",
		"AUTOMATION_SWEEPER_ENABLED",
		"CLOUDFLARE_TUNNEL_ENABLED",
		"CLOUDFLARE_TUNNEL_TOKEN",
		"CLOUDFLARE_TUNNEL_NAME",
		"CLOUDFLARE_TUNNEL_URL",
	}
	out := make(map[string]string, len(keys))
	for _, k := range keys {
		out[k] = os.Getenv(k)
	}
	return out
}

func splitCSV(value string) []string {
	if strings.TrimSpace(value) == "" {
		return nil
	}

	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func parseBoolDefault(raw string, defaultValue bool) (bool, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return defaultValue, nil
	}
	v, err := strconv.ParseBool(trimmed)
	if err != nil {
		return false, err
	}
	return v, nil
}
