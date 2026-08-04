package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"kaplun/api-go/internal/config"
	"kaplun/api-go/internal/handlers"
	"kaplun/api-go/internal/middleware"
	"kaplun/api-go/internal/platform/appwrite"
	"kaplun/api-go/internal/platform/clerk"
	"kaplun/api-go/internal/platform/cloudflare"
	"kaplun/api-go/internal/platform/crypto"
	"kaplun/api-go/internal/platform/meta"
	"kaplun/api-go/internal/platform/ngrok"
	"kaplun/api-go/internal/router"
	"kaplun/api-go/internal/services/automations"
	"kaplun/api-go/internal/services/bridge"
	"kaplun/api-go/internal/services/oauth"
	"kaplun/api-go/internal/services/reconcile"
	"kaplun/api-go/internal/store"
	"kaplun/api-go/internal/worker"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	// Match FastAPI: load api-go/.env into the process env before config.Load().
	// Existing process env vars win over .env values.
	loadDotEnv(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("load config", "error", err)
		os.Exit(1)
	}

	deps, cleanup := buildDependencies(cfg, logger)
	defer cleanup()

	engine := router.New(cfg, deps)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           engine,
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Listen immediately — do not block on ngrok (it can take several seconds).
	go func() {
		logger.Info("server listening", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("listen", "error", err)
			stop()
		}
	}()

	var (
		tunnelMu   sync.Mutex
		ngrokTun   *ngrok.Tunnel
		cfTun      *cloudflare.Tunnel
	)

	logPublicEndpoints := func(publicURL string) {
		base := strings.TrimRight(publicURL, "/")
		logger.Info("tunnel public URL",
			"url", publicURL,
			"oauth_callback", base+"/instagram/callback",
			"webhook", base+"/webhooks/instagram",
		)
		logger.Info("update Meta + .env to this tunnel host",
			"REDIRECT_URI", base+"/instagram/callback",
			"EXPO_PUBLIC_IG_OAUTH_REDIRECT_URI", base+"/instagram/callback",
			"PUBLIC_BASE_URL", base,
		)
	}

	if cfg.CloudflareTunnelEnabled {
		knownURL := cloudflare.ResolveURL(cfg.CloudflareTunnelURL, cfg.PublicBaseURL)
		logger.Info("cloudflare tunnel starting in background", "url", knownURL, "local", ":"+cfg.Port, "named", cfg.CloudflareTunnelToken != "" || cfg.CloudflareTunnelName != "", "tunnel_name", cfg.CloudflareTunnelName)
		go func() {
			t, err := cloudflare.Start(ctx, cloudflare.Options{
				Port:   cfg.Port,
				Token:  cfg.CloudflareTunnelToken,
				Name:   cfg.CloudflareTunnelName,
				URL:    knownURL,
				Logger: logger,
			})
			if err != nil {
				logger.Warn("cloudflare tunnel start failed (server continues locally)", "error", err)
				return
			}
			tunnelMu.Lock()
			cfTun = t
			tunnelMu.Unlock()
			logPublicEndpoints(t.PublicURL)
		}()
	} else {
		logger.Info("cloudflare tunnel disabled (set CLOUDFLARE_TUNNEL_ENABLED=true)")
	}

	if cfg.NgrokEnabled {
		tunnelURL := ngrok.ResolveURL(cfg.NgrokDomain, cfg.PublicBaseURL)
		logger.Info("ngrok starting in background", "url", tunnelURL, "local", ":"+cfg.Port)
		go func() {
			t, err := ngrok.Start(ctx, ngrok.Options{
				Port:   cfg.Port,
				URL:    tunnelURL,
				Logger: logger,
			})
			if err != nil {
				logger.Warn("ngrok start failed (server continues locally)", "error", err)
				return
			}
			tunnelMu.Lock()
			ngrokTun = t
			tunnelMu.Unlock()
			logPublicEndpoints(t.PublicURL)
		}()
	}

	<-ctx.Done()
	logger.Info("shutting down")

	tunnelMu.Lock()
	n := ngrokTun
	c := cfTun
	tunnelMu.Unlock()
	if n != nil {
		if stopErr := n.Stop(); stopErr != nil {
			logger.Warn("ngrok stop", "error", stopErr)
		}
	}
	if c != nil {
		if stopErr := c.Stop(); stopErr != nil {
			logger.Warn("cloudflare tunnel stop", "error", stopErr)
		}
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("shutdown", "error", err)
	}
}

func loadDotEnv(logger *slog.Logger) {
	candidates := []string{".env"}
	if exe, err := os.Executable(); err == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(exe), ".env"))
	}
	for _, path := range candidates {
		if _, err := os.Stat(path); err != nil {
			continue
		}
		if err := godotenv.Load(path); err != nil {
			logger.Warn("failed to load env file", "path", path, "error", err)
			return
		}
		logger.Info("loaded env file", "path", path)
		return
	}
}

// buildDependencies constructs whatever can be built from available config.
// Missing secrets skip dependent routes; /health always remains available.
func buildDependencies(cfg config.Config, logger *slog.Logger) (router.Dependencies, func()) {
	deps := router.Dependencies{}
	var cleanups []func()
	cleanup := func() {
		for i := len(cleanups) - 1; i >= 0; i-- {
			cleanups[i]()
		}
	}

	if cfg.HasClerkAuth() {
		verifier := clerk.NewVerifier(clerk.Config{
			SecretKey:         cfg.ClerkSecretKey,
			JWTKey:            cfg.ClerkJWTKey,
			AuthorizedParties: cfg.ClerkAuthorizedParties,
		})
		deps.ClerkAuth = middleware.ClerkAuth(verifier)
		logger.Info("clerk auth enabled")
	} else {
		logger.Warn("clerk auth disabled: set CLERK_SECRET_KEY or CLERK_JWT_KEY")
	}

	var awClient *appwrite.Client
	if cfg.HasAppwriteCore() {
		client, err := appwrite.New(appwrite.Config{
			Endpoint:        cfg.AppwriteEndpoint,
			ProjectID:       cfg.AppwriteProjectID,
			APIKey:          cfg.AppwriteAPIKey,
			DatabaseID:      cfg.AppwriteDatabaseID,
			CreatorsTableID: cfg.AppwriteCreatorsTableID,
		})
		if err != nil {
			logger.Error("appwrite client init failed", "error", err)
		} else {
			awClient = client
			logger.Info("appwrite client ready")
		}
	} else {
		logger.Warn("appwrite disabled: set APPWRITE_PROJECT_ID and APPWRITE_API_KEY")
	}

	if awClient != nil && deps.ClerkAuth != nil {
		deps.Bridge = handlers.NewBridgeHandler(bridge.NewService(awClient))
		logger.Info("route enabled", "path", "POST /auth/appwrite-session")
	}

	var tokCrypto *crypto.TokenCrypto
	if cfg.TokenEncryptionKey != "" {
		tc, err := crypto.New(cfg.TokenEncryptionKey)
		if err != nil {
			logger.Warn("token crypto init failed", "error", err)
		} else {
			tokCrypto = tc
		}
	}

	graphClient := meta.NewClient(nil)
	graphSender := meta.NewSender(graphClient)

	var autoStore *store.AutomationsStore
	var commentRunner *worker.CommentRunner
	if awClient != nil && cfg.HasAutomationTables() {
		autoStore = store.NewAutomationsStore(awClient, store.Tables{
			Creators:    cfg.AppwriteCreatorsTableID,
			Automations: cfg.AppwriteAutomationsTableID,
			Logs:        cfg.AppwriteAutomationLogsTableID,
			Jobs:        cfg.AppwriteAutomationJobsTableID,
		})
		commentRunner = worker.NewCommentRunner(autoStore.AsWorker(), graphSender, tokCrypto)
		if cfg.PublicBaseURL != "" {
			commentRunner.PublicBaseURL = strings.TrimRight(cfg.PublicBaseURL, "/")
		}
		commentRunner.Log = logger
		logger.Info("automations store ready")
	} else if awClient != nil {
		logger.Warn("automations store disabled: set all APPWRITE_*_TABLE_ID env vars")
	}

	// Worker pool + sweeper first so reconcile can enqueue jobs immediately.
	var pool *worker.Pool
	if cfg.AutomationSweeperEnabled && autoStore != nil {
		pool = worker.NewPool(4, 64)
		cleanups = append(cleanups, pool.Shutdown)
		sweeper := worker.NewSweeper(autoStore, commentRunner, time.Minute)
		sweeper.Log = logger
		sweeper.Start()
		cleanups = append(cleanups, sweeper.Stop)
		logger.Info("automation sweeper started")
	} else if cfg.AutomationSweeperEnabled {
		logger.Warn("automation sweeper skipped: store unavailable")
	}

	var reconcileEnqueuer jobEnqueuer
	if pool != nil && commentRunner != nil {
		reconcileEnqueuer = &poolEnqueuer{pool: pool, runner: commentRunner, log: logger}
	}

	// Comment reconciler (polling safety net for comments webhooks miss —
	// mirrors openreply's dm-worker poll). Runs in-process on an interval so
	// no external scheduler is required.
	var reconcileSvc *reconcile.Service
	if autoStore != nil {
		reconcileSvc = reconcile.NewService(
			autoStore.AsReconcile(),
			reconcileGraph{client: graphClient},
			safeTokenDecryptor{c: tokCrypto},
			keywordMatcherAdapter{},
		)
	}
	if reconcileSvc != nil && cfg.AutomationSweeperEnabled {
		loopCtx, loopCancel := context.WithCancel(context.Background())
		cleanups = append(cleanups, loopCancel)
		startReconcileLoop(loopCtx, reconcileSvc, reconcilePollInterval(), reconcileEnqueuer, logger)
	}

	if autoStore != nil && deps.ClerkAuth != nil {
		deps.Automations = handlers.NewAutomationsHandler(automations.NewService(autoStore))
		logger.Info("route enabled", "path", "/automations/*")
	}

	if cfg.WebhookVerifyToken != "" {
		secrets := make([]string, 0, 2)
		if cfg.InstagramAppSecret != "" {
			secrets = append(secrets, cfg.InstagramAppSecret)
		}
		if cfg.FacebookAppSecret != "" {
			secrets = append(secrets, cfg.FacebookAppSecret)
		}
		var enqueuer handlers.JobEnqueuer
		if pool != nil && commentRunner != nil {
			enqueuer = &poolEnqueuer{pool: pool, runner: commentRunner, log: logger}
		}
		var webhookStore handlers.WebhookStore
		if autoStore != nil {
			webhookStore = autoStore.AsWorker()
		}
		deps.Webhooks = handlers.NewWebhooksHandler(cfg.WebhookVerifyToken, secrets, webhookStore, enqueuer)
		deps.Webhooks.Log = logger
		if os.Getenv("WEBHOOK_INSECURE_SKIP_SIGNATURE") == "1" || os.Getenv("WEBHOOK_INSECURE_SKIP_SIGNATURE") == "true" {
			deps.Webhooks.AllowUnsigned = true
			logger.Warn("WEBHOOK_INSECURE_SKIP_SIGNATURE enabled — accepting unsigned Instagram webhooks")
		}
		if webhookStore == nil {
			logger.Info("route enabled", "path", "/webhooks/instagram (verify + events; persistence deferred — no automation store)")
		} else {
			logger.Info("route enabled", "path", "/webhooks/instagram")
		}
	} else {
		logger.Warn("webhooks disabled: set WEBHOOK_VERIFY_TOKEN")
	}

	if cfg.CronSecret != "" && autoStore != nil {
		deps.CronAuth = middleware.CronSecret(cfg.CronSecret)
		// Keep cron-refreshed tokens plaintext: the Expo app reads access_token
		// directly and cannot decrypt enc1: values.
		var cronReconciler handlers.ReconcileService
		if reconcileSvc != nil {
			cronReconciler = cronReconcileAdapter{svc: reconcileSvc}
		}
		deps.Cron = handlers.NewCronHandler(
			autoStore,
			&metaTokenRefresher{client: graphClient},
			nil, // no encryption: app uses the token directly
			cronReconciler,
		)
		logger.Info("route enabled", "path", "/cron/* (store + token refresh + reconcile wired)")
	} else if cfg.CronSecret != "" {
		logger.Warn("cron skipped: automation store unavailable (set APPWRITE_*_TABLE_ID env vars)")
	} else {
		logger.Warn("cron disabled: set CRON_SECRET")
	}

	if cfg.InstagramAppID != "" && cfg.InstagramAppSecret != "" && cfg.RedirectURI != "" {
		oauthSvc := oauth.NewService(nil, oauth.Config{
			AppID:       cfg.InstagramAppID,
			AppSecret:   cfg.InstagramAppSecret,
			RedirectURI: cfg.RedirectURI,
		})
		var oauthCrypto handlers.OAuthTokenCrypto
		if tokCrypto != nil {
			oauthCrypto = tokCrypto
		}
		var creatorStore handlers.CreatorProfileStore
		if awClient != nil {
			creatorStore = awClient
		}
		if creatorStore != nil {
			oauthHandler := handlers.NewInstagramOAuthHandler(
				oauthSvc,
				creatorStore,
				oauthCrypto,
				cfg.InstagramAppID,
				cfg.InstagramAppSecret,
				cfg.RedirectURI,
				logger,
			)
			// Meta Step 3: POST /{ig-user-id}/subscribed_apps after OAuth so
			// comments/messages webhooks actually deliver for that IG account.
			oauthHandler.Subscriber = graphClient
			deps.InstagramOAuth = oauthHandler
			logger.Info("route enabled",
				"path", "GET /instagram/callback",
				"instagram_app_id", cfg.InstagramAppID,
				"redirect_uri", cfg.RedirectURI,
			)
		} else {
			logger.Warn("instagram oauth skipped: Appwrite required to persist creator profiles")
		}
	} else {
		logger.Warn("instagram oauth disabled: set INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, REDIRECT_URI")
	}

	return deps, cleanup
}

type poolEnqueuer struct {
	pool   *worker.Pool
	runner worker.JobRunner
	log    *slog.Logger
}

func (p *poolEnqueuer) Enqueue(jobID string) error {
	safe := &worker.SafeRunner{Runner: p.runner, Log: p.log}
	return worker.EnqueueJob(p.pool, safe, jobID)
}

type metaTokenRefresher struct {
	client *meta.Client
}

func (r *metaTokenRefresher) RefreshLongLivedToken(ctx context.Context, token string) (handlers.TokenRefreshResult, error) {
	accessToken, expiresIn, err := r.client.RefreshLongLivedToken(ctx, token)
	if err != nil {
		return handlers.TokenRefreshResult{}, err
	}
	return handlers.TokenRefreshResult{AccessToken: accessToken, ExpiresIn: expiresIn}, nil
}
