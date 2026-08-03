package main

import (
	"context"
	"log/slog"
	"os"
	"strconv"
	"time"

	"kaplun/api-go/internal/platform/crypto"
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

// safeTokenDecryptor tolerates a missing encryption key (tokens stored
// plaintext), matching CommentRunner's nil-crypto fallback.
type safeTokenDecryptor struct {
	c *crypto.TokenCrypto
}

func (d safeTokenDecryptor) DecryptOrPlaintext(stored string) string {
	if d.c == nil {
		return stored
	}
	return d.c.DecryptOrPlaintext(stored)
}

// reconcilePollInterval mirrors openreply's COMMENT_POLL_INTERVAL_MS
// (default 5 minutes).
func reconcilePollInterval() time.Duration {
	if raw := os.Getenv("COMMENT_POLL_INTERVAL_MS"); raw != "" {
		if ms, err := strconv.Atoi(raw); err == nil && ms > 0 {
			return time.Duration(ms) * time.Millisecond
		}
	}
	return 5 * time.Minute
}

// startReconcileLoop runs the comment sweep in-process: first pass ~10s after
// boot (like openreply's dm-worker), then on a fixed interval. Webhooks stay
// the instant path; this catches everything they miss or never receive.
func startReconcileLoop(ctx context.Context, svc *reconcile.Service, interval time.Duration, logger *slog.Logger) {
	if svc == nil || interval <= 0 {
		return
	}
	go func() {
		run := func() {
			sweepCtx, cancel := context.WithTimeout(ctx, 3*time.Minute)
			defer cancel()
			res, err := svc.ReconcileOnce(sweepCtx)
			if err != nil {
				logger.Warn("comment reconcile sweep failed", "error", err)
				return
			}
			if res.Enqueued > 0 {
				logger.Info("comment reconcile sweep enqueued jobs", "enqueued", res.Enqueued)
			}
			if _, err := svc.AttachNextReels(sweepCtx); err != nil {
				logger.Warn("attach next reels failed", "error", err)
			}
		}

		timer := time.NewTimer(10 * time.Second)
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
