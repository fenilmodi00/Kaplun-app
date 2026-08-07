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
	AppwriteAuth gin.HandlerFunc
	CronAuth     gin.HandlerFunc

	EnsureProfile  *handlers.EnsureProfileHandler
	Automations    *handlers.AutomationsHandler
	Webhooks       *handlers.WebhooksHandler
	Cron           *handlers.CronHandler
	InstagramOAuth *handlers.InstagramOAuthHandler
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
	if deps.EnsureProfile != nil && deps.AppwriteAuth != nil {
		engine.POST("/auth/ensure-profile", deps.AppwriteAuth, deps.EnsureProfile.EnsureProfile)
	}

	if deps.Automations != nil && deps.AppwriteAuth != nil {
		deps.Automations.Register(engine.Group("/automations"), deps.AppwriteAuth)
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
		cron.POST("/sync-insights", deps.Cron.SyncInsights)
		cron.GET("/health", deps.Cron.Health)
	}

	if deps.InstagramOAuth != nil {
		engine.GET("/instagram/callback", deps.InstagramOAuth.Callback)
	}

}
