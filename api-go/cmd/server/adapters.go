package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"time"

	"kaplun/api-go/internal/handlers"
	"kaplun/api-go/internal/platform/meta"
	"kaplun/api-go/internal/services/keywords"
	"kaplun/api-go/internal/services/reconcile"
)

// reconcileGraph adapts meta.Client to reconcile.GraphClient.
type reconcileGraph struct {
	client *meta.Client
}

func (g reconcileGraph) GetUserMedia(ctx context.Context, limit int, accessToken string) ([]reconcile.Media, error) {
	items, err := g.client.GetUserMedia(ctx, limit, accessToken)
	if err != nil {
		return nil, err
	}
	out := make([]reconcile.Media, 0, len(items))
	for _, m := range items {
		out = append(out, reconcile.Media{ID: m.ID})
	}
	return out, nil
}

func (g reconcileGraph) GetRecentMediaComments(ctx context.Context, mediaID string, sinceMS int64, accessToken string) ([]reconcile.Comment, error) {
	items, err := g.client.GetRecentMediaComments(ctx, mediaID, sinceMS, accessToken)
	if err != nil {
		return nil, err
	}
	out := make([]reconcile.Comment, 0, len(items))
	for _, c := range items {
		out = append(out, reconcile.Comment{
			ID:   c.ID,
			Text: c.Text,
			From: map[string]string{"id": c.FromID, "username": c.FromUsername},
		})
	}
	return out, nil
}

func (g reconcileGraph) ListConversations(ctx context.Context, limit int, accessToken string) ([]reconcile.Conversation, error) {
	items, err := g.client.ListConversations(ctx, limit, accessToken)
	if err != nil {
		return nil, err
	}
	out := make([]reconcile.Conversation, 0, len(items))
	for _, c := range items {
		out = append(out, reconcile.Conversation{ID: c.ID, UpdatedTime: c.UpdatedTime})
	}
	return out, nil
}

func (g reconcileGraph) ListConversationMessages(ctx context.Context, conversationID string, limit int, accessToken string) ([]reconcile.ConversationMessage, error) {
	items, err := g.client.ListConversationMessages(ctx, conversationID, limit, accessToken)
	if err != nil {
		return nil, err
	}
	out := make([]reconcile.ConversationMessage, 0, len(items))
	for _, m := range items {
		out = append(out, reconcile.ConversationMessage{
			ID:            m.ID,
			CreatedTime:   m.CreatedTime,
			FromID:        m.FromID,
			Text:          m.Text,
			IsUnsupported: m.IsUnsupported,
		})
	}
	return out, nil
}

// keywordMatcherAdapter bridges keywords.MatchKeywords to reconcile.KeywordMatcher.
type keywordMatcherAdapter struct{}

func (keywordMatcherAdapter) Matched(text string, kws []string, wholeWord bool) bool {
	return keywords.MatchKeywords(text, kws, wholeWord).Matched
}

// cronReconcileAdapter shapes reconcile.Service to handlers.ReconcileService
// (the cron route wants map results, the service returns typed Result).
type cronReconcileAdapter struct {
	svc *reconcile.Service
}

func (a cronReconcileAdapter) ReconcileOnce(ctx context.Context) (map[string]any, error) {
	res, err := a.svc.ReconcileOnce(ctx)
	if err != nil {
		return nil, err
	}
	return map[string]any{"enqueued": res.Enqueued}, nil
}

func (a cronReconcileAdapter) AttachNextReels(ctx context.Context) (int, error) {
	return a.svc.AttachNextReels(ctx)
}

// graphRefreshSender exposes RefreshLongLivedToken alongside the send methods
// so the worker can self-heal on Meta error 190 (refresh once + retry once).
type graphRefreshSender struct {
	*meta.Sender
}

func (g graphRefreshSender) RefreshLongLivedToken(ctx context.Context, token string) (string, int, error) {
	if g.Sender == nil || g.Client == nil {
		return "", 0, fmt.Errorf("meta sender not configured")
	}
	return g.Client.RefreshLongLivedToken(ctx, token)
}

// plaintextTokenDecryptor satisfies reconcile.TokenDecryptor; creator tokens
// are stored plaintext by design (the Expo app reads access_token directly).
type plaintextTokenDecryptor struct{}

func (plaintextTokenDecryptor) DecryptOrPlaintext(stored string) string { return stored }

// reconcilePollInterval mirrors openreply's COMMENT_POLL_INTERVAL_MS.
// Default 5 minutes; set COMMENT_POLL_INTERVAL_MS=5000 for fast local polling.
func reconcilePollInterval() time.Duration {
	if raw := os.Getenv("COMMENT_POLL_INTERVAL_MS"); raw != "" {
		if ms, err := strconv.Atoi(raw); err == nil && ms > 0 {
			return time.Duration(ms) * time.Millisecond
		}
	}
	return 5 * time.Minute
}

// jobEnqueuer is the optional immediate-run hook for reconcile-created jobs.
type jobEnqueuer interface {
	Enqueue(jobID string) error
}

// startReconcileLoop runs the comment sweep in-process: first pass soon after
// boot, then on a fixed interval. Webhooks stay the instant path; this catches
// everything they miss. When enqueuer is set, newly created jobs run immediately
// instead of waiting for the sweeper tick.
func startReconcileLoop(ctx context.Context, svc *reconcile.Service, interval time.Duration, enqueuer jobEnqueuer, logger *slog.Logger) {
	if svc == nil || interval <= 0 {
		return
	}
	go func() {
		run := func() {
			sweepCtx, cancel := context.WithTimeout(ctx, 3*time.Minute)
			defer cancel()
			enqueueAll := func(res reconcile.Result, label string) {
				if res.Enqueued > 0 {
					logger.Info(label, "enqueued", res.Enqueued)
				}
				if enqueuer != nil {
					for _, jobID := range res.JobIDs {
						if err := enqueuer.Enqueue(jobID); err != nil {
							logger.Warn("reconcile enqueue failed", "job_id", jobID, "error", err)
						}
					}
				}
			}
			res, err := svc.ReconcileOnce(sweepCtx)
			if err != nil {
				logger.Warn("comment reconcile sweep failed", "error", err)
			} else {
				enqueueAll(res, "comment reconcile sweep enqueued jobs")
			}
			postbacks, err := svc.ReconcilePostbacksOnce(sweepCtx)
			if err != nil {
				logger.Warn("postback reconcile sweep failed", "error", err)
			} else {
				enqueueAll(postbacks, "postback reconcile sweep enqueued jobs")
			}
			if _, err := svc.AttachNextReels(sweepCtx); err != nil {
				logger.Warn("attach next reels failed", "error", err)
			}
		}

		first := 10 * time.Second
		if interval < first {
			first = interval
		}
		timer := time.NewTimer(first)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				run()
				timer.Reset(interval)
			}
		}
	}()
	logger.Info("comment reconcile loop started", "interval", interval.String())
}

// startTokenRefreshLoop refreshes Instagram long-lived creator tokens
// in-process on a fixed (daily) interval so they never reach expiry while the
// server runs — no external scheduler required. First pass runs shortly after
// boot; per-sweep failures are logged inside handlers.RefreshExpiringTokens.
func startTokenRefreshLoop(ctx context.Context, store handlers.TokenRefreshStore, refresher handlers.TokenRefresher, interval time.Duration, logger *slog.Logger) {
	if store == nil || refresher == nil || interval <= 0 {
		return
	}
	go func() {
		run := func() {
			sweepCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
			defer cancel()
			refreshed, failed, err := handlers.RefreshExpiringTokens(sweepCtx, store, refresher, nil, logger)
			if err != nil {
				logger.Warn("token refresh sweep failed", "error", err)
				return
			}
			if refreshed > 0 || failed > 0 {
				logger.Info("token refresh sweep complete", "refreshed", refreshed, "failed", failed)
			}
		}

		timer := time.NewTimer(time.Minute)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				run()
				timer.Reset(interval)
			}
		}
	}()
	logger.Info("token refresh loop started", "interval", interval.String())
}
