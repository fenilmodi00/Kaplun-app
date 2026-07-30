package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"kaplun/api-go/internal/config"
	"kaplun/api-go/internal/handlers"
	"kaplun/api-go/internal/middleware"
	"kaplun/api-go/internal/platform/appwrite"
	"kaplun/api-go/internal/platform/clerk"
	"kaplun/api-go/internal/platform/crypto"
	"kaplun/api-go/internal/platform/meta"
	"kaplun/api-go/internal/router"
	"kaplun/api-go/internal/services/automations"
	"kaplun/api-go/internal/services/bridge"
	"kaplun/api-go/internal/services/oauth"
	"kaplun/api-go/internal/services/session"
	"kaplun/api-go/internal/services/trackedlinks"
	"kaplun/api-go/internal/store"
	"kaplun/api-go/internal/worker"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

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

	go func() {
		logger.Info("server listening", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("listen", "error", err)
			stop()
		}
	}()

	<-ctx.Done()
	logger.Info("shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("shutdown", "error", err)
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
			Creators:      cfg.AppwriteCreatorsTableID,
			Automations:   cfg.AppwriteAutomationsTableID,
			Logs:          cfg.AppwriteAutomationLogsTableID,
			Jobs:          cfg.AppwriteAutomationJobsTableID,
			TrackedLinks:  cfg.AppwriteTrackedLinksTableID,
			LinkClicks:    cfg.AppwriteLinkClicksTableID,
			WebhookEvents: cfg.AppwriteWebhookEventsTableID,
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

	if autoStore != nil && deps.ClerkAuth != nil {
		deps.Automations = handlers.NewAutomationsHandler(automations.NewService(autoStore))
		deps.TrackedLinks = handlers.NewTrackedLinksHandler(trackedlinks.NewService(autoStore))
		logger.Info("route enabled", "path", "/automations/* and GET /r/:slug")
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
		var cronCrypto handlers.TokenCrypto
		if tokCrypto != nil {
			cronCrypto = tokCrypto
		}
		deps.Cron = handlers.NewCronHandler(
			autoStore,
			&metaTokenRefresher{client: graphClient},
			cronCrypto,
			nil, // reconcile service not wired yet (needs Graph media/comments adapters)
		)
		logger.Info("route enabled", "path", "/cron/* (store + token refresh wired; reconcile deferred)")
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
			deps.InstagramOAuth = handlers.NewInstagramOAuthHandler(
				oauthSvc,
				creatorStore,
				oauthCrypto,
				cfg.InstagramAppID,
				cfg.InstagramAppSecret,
				cfg.RedirectURI,
			)
			logger.Info("route enabled", "path", "GET /instagram/callback")
		} else {
			logger.Warn("instagram oauth skipped: Appwrite required to persist creator profiles")
		}
	} else {
		logger.Warn("instagram oauth disabled: set INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, REDIRECT_URI")
	}

	if awClient != nil && deps.ClerkAuth != nil {
		sessionSvc := session.NewService(session.Options{
			Store:  awClient,
			Logger: logger,
		})
		cleanups = append(cleanups, func() {
			n := sessionSvc.LogoutAll()
			logger.Info("instagram sessions logged out", "count", n)
		})
		deps.InstagramAuth = handlers.NewInstagramAuthHandler(sessionSvc, awClient, logger)
		deps.InstagramProxy = handlers.NewInstagramProxyHandler(sessionSvc, awClient, logger)
		logger.Info("route enabled", "path", "POST /login, GET /profile|/media|/insights, POST /disconnect")
	} else if awClient != nil {
		logger.Warn("instagram login/proxy skipped: clerk auth required")
	} else {
		logger.Warn("instagram login/proxy skipped: appwrite required")
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
