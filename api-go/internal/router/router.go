package router

import (
	"log/slog"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/config"
	"kaplun/api-go/internal/handlers"
	"kaplun/api-go/internal/middleware"
)

// Dependencies are optional handlers/middleware. Nil fields skip route registration
// so the server can still expose /health when secrets are missing.
type Dependencies struct {
	ClerkAuth gin.HandlerFunc
	CronAuth  gin.HandlerFunc

	Bridge         *handlers.BridgeHandler
	Automations    *handlers.AutomationsHandler
	TrackedLinks   *handlers.TrackedLinksHandler
	Webhooks       *handlers.WebhooksHandler
	Cron           *handlers.CronHandler
	InstagramOAuth *handlers.InstagramOAuthHandler
	InstagramAuth  *handlers.InstagramAuthHandler
	InstagramProxy *handlers.InstagramProxyHandler
}

// New builds the Gin engine with shared middleware and optional route groups.
func New(cfg config.Config, deps Dependencies) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)

	engine := gin.New()
	engine.Use(middleware.RequestID())
	engine.Use(middleware.Recovery(slog.New(slog.NewJSONHandler(os.Stdout, nil))))
	engine.Use(middleware.CORS(cfg.CORSOrigins))

	engine.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	registerRoutes(engine, deps)
	return engine
}

func registerRoutes(engine *gin.Engine, deps Dependencies) {
	if deps.Bridge != nil && deps.ClerkAuth != nil {
		engine.POST("/auth/appwrite-session", deps.ClerkAuth, deps.Bridge.CreateSession)
	}

	if deps.Automations != nil && deps.ClerkAuth != nil {
		deps.Automations.Register(engine.Group("/automations"), deps.ClerkAuth)
	}

	if deps.TrackedLinks != nil {
		engine.GET("/r/:slug", deps.TrackedLinks.Redirect)
	}

	if deps.Webhooks != nil {
		engine.GET("/webhooks/instagram", deps.Webhooks.Verify)
		engine.POST("/webhooks/instagram", deps.Webhooks.Events)
	}

	if deps.Cron != nil && deps.CronAuth != nil {
		cron := engine.Group("/cron", deps.CronAuth)
		cron.POST("/refresh-tokens", deps.Cron.RefreshTokens)
		cron.POST("/reconcile", deps.Cron.Reconcile)
		cron.POST("/retain-logs", deps.Cron.RetainLogs)
		cron.GET("/health", deps.Cron.Health)
	}

	if deps.InstagramOAuth != nil {
		engine.GET("/instagram/callback", deps.InstagramOAuth.Callback)
	}

	if deps.InstagramAuth != nil && deps.ClerkAuth != nil {
		engine.POST("/login", deps.ClerkAuth, deps.InstagramAuth.Login)
	}

	if deps.InstagramProxy != nil && deps.ClerkAuth != nil {
		authed := engine.Group("", deps.ClerkAuth)
		authed.GET("/profile", deps.InstagramProxy.Profile)
		authed.GET("/media", deps.InstagramProxy.Media)
		authed.GET("/insights", deps.InstagramProxy.Insights)
		authed.POST("/disconnect", deps.InstagramProxy.Disconnect)
	}
}
