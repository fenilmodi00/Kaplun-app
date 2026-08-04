package automations_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"kaplun/api-go/internal/models"
	"kaplun/api-go/internal/services/automations"
)

type fakeStore struct {
	automations map[string]models.Automation
	logs        map[string][]models.AutomationLog
	creators    map[string]models.CreatorRow
}

func newFakeStore() *fakeStore {
	return &fakeStore{
		automations: map[string]models.Automation{},
		logs:        map[string][]models.AutomationLog{},
		creators:    map[string]models.CreatorRow{},
	}
}

func (f *fakeStore) ListAutomations(_ context.Context, clerkUserID string) ([]models.Automation, error) {
	out := []models.Automation{}
	for _, a := range f.automations {
		if a.ClerkUserID == clerkUserID {
			out = append(out, a)
		}
	}
	return out, nil
}

func (f *fakeStore) GetAutomation(_ context.Context, automationID string) (*models.Automation, error) {
	a, ok := f.automations[automationID]
	if !ok {
		return nil, nil
	}
	cp := a
	return &cp, nil
}

func (f *fakeStore) CreateAutomation(_ context.Context, data models.Automation) (models.Automation, error) {
	id := "auto_" + data.Name
	data.ID = id
	f.automations[id] = data
	return data, nil
}

func (f *fakeStore) UpdateAutomation(_ context.Context, automationID string, data map[string]any) (models.Automation, error) {
	a := f.automations[automationID]
	if name, ok := data["name"].(string); ok {
		a.Name = name
	}
	if status, ok := data["status"].(string); ok {
		a.Status = status
	}
	if updated, ok := data["updated_at"].(string); ok {
		a.UpdatedAt = updated
	}
	f.automations[automationID] = a
	return a, nil
}

func (f *fakeStore) DeleteAutomation(_ context.Context, automationID string) error {
	delete(f.automations, automationID)
	return nil
}

func (f *fakeStore) ListLogs(_ context.Context, automationID string, _ int) ([]models.AutomationLog, error) {
	return f.logs[automationID], nil
}

func (f *fakeStore) CountLogsByAction(_ context.Context, automationID string) (map[string]int, error) {
	counts := map[string]int{}
	for _, log := range f.logs[automationID] {
		counts[log.Action]++
	}
	return counts, nil
}

func (f *fakeStore) CountLogsByActionSince(_ context.Context, clerkUserID, sinceISO string) (map[string]int, error) {
	counts := map[string]int{}
	for _, logs := range f.logs {
		for _, log := range logs {
			if log.ClerkUserID == clerkUserID && log.CreatedAt >= sinceISO {
				counts[log.Action]++
			}
		}
	}
	return counts, nil
}

func (f *fakeStore) TopKeywords(_ context.Context, clerkUserID, sinceISO string, limit int) ([][]any, error) {
	kwCounts := map[string]int{}
	for _, logs := range f.logs {
		for _, log := range logs {
			if log.ClerkUserID == clerkUserID && log.CreatedAt >= sinceISO && log.MatchedKeyword != nil {
				kwCounts[*log.MatchedKeyword]++
			}
		}
	}
	out := [][]any{}
	for kw, c := range kwCounts {
		out = append(out, []any{kw, c})
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (f *fakeStore) GetCreatorByClerkID(_ context.Context, clerkUserID string) (*models.CreatorRow, error) {
	c, ok := f.creators[clerkUserID]
	if !ok {
		return nil, nil
	}
	cp := c
	return &cp, nil
}

func TestCreateValidation(t *testing.T) {
	t.Parallel()

	svc := automations.NewService(newFakeStore())
	bigPool := make([]string, 11)
	for i := range bigPool {
		bigPool[i] = "ok"
	}
	longDelay := 1441
	cases := []struct {
		name string
		body models.AutomationCreate
	}{
		{"empty keywords", models.AutomationCreate{Name: "T", TargetType: "all_posts", Keywords: []string{}, DMMessage: "Hi"}},
		{"empty dm", models.AutomationCreate{Name: "T", TargetType: "all_posts", Keywords: []string{"kw"}, DMMessage: ""}},
		{"specific posts empty media", models.AutomationCreate{Name: "T", TargetType: "specific_posts", Keywords: []string{"kw"}, DMMessage: "Hi", MediaIDs: []string{}}},
		{"invalid status", models.AutomationCreate{Name: "T", TargetType: "all_posts", Keywords: []string{"kw"}, DMMessage: "Hi", Status: "draft"}},
		{"follow-up delay too high", models.AutomationCreate{Name: "T", TargetType: "all_posts", Keywords: []string{"kw"}, DMMessage: "Hi", FollowUpEnabled: true, FollowUpMessage: strPtr("Hi"), FollowUpDelayMinutes: &longDelay}},
		{"public reply pool too large", models.AutomationCreate{Name: "T", TargetType: "all_posts", Keywords: []string{"kw"}, DMMessage: "Hi", PublicReplyEnabled: true, PublicReplyMessages: bigPool}},
		{"public reply entry too long", models.AutomationCreate{Name: "T", TargetType: "all_posts", Keywords: []string{"kw"}, DMMessage: "Hi", PublicReplyEnabled: true, PublicReplyMessages: []string{strings.Repeat("x", 1001)}}},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			_, err := svc.Create(context.Background(), "clerk_1", tc.body)
			if !errors.Is(err, automations.ErrValidation) {
				t.Fatalf("expected validation error, got %v", err)
			}
		})
	}
}

func TestCreateSuccessAndInstagramRequired(t *testing.T) {
	t.Parallel()

	store := newFakeStore()
	svc := automations.NewService(store)

	_, err := svc.Create(context.Background(), "clerk_1", models.AutomationCreate{
		Name: "Mine", TargetType: "all_posts", Keywords: []string{"kw"}, DMMessage: "Hi",
	})
	if !errors.Is(err, automations.ErrInstagramNotConnected) {
		t.Fatalf("expected instagram_not_connected, got %v", err)
	}

	store.creators["clerk_1"] = models.CreatorRow{
		ClerkUserID: "clerk_1", IGUserID: "ig_123", AccessToken: "tok",
	}
	row, err := svc.Create(context.Background(), "clerk_1", models.AutomationCreate{
		Name: "Mine", TargetType: "all_posts", Keywords: []string{"kw1", " kw2 "}, DMMessage: "Hi", MatchMode: "whole_word",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if row.ClerkUserID != "clerk_1" || row.Status != "active" || row.IGUserID != "ig_123" {
		t.Fatalf("unexpected row: %#v", row)
	}
	if row.OpeningDMMode != "direct" || len(row.BoundMediaIDs) != 0 {
		t.Fatalf("unexpected defaults: %#v", row)
	}
	if len(row.Keywords) != 2 || row.Keywords[1] != "kw2" {
		t.Fatalf("keywords not cleaned: %#v", row.Keywords)
	}
}

func TestCreateRespectsButtonOpeningMode(t *testing.T) {
	t.Parallel()

	btn := "Get link"
	reveal := "https://example.com"
	store := newFakeStore()
	store.creators["clerk_1"] = models.CreatorRow{
		ClerkUserID: "clerk_1", IGUserID: "ig_123", AccessToken: "tok",
	}
	svc := automations.NewService(store)

	row, err := svc.Create(context.Background(), "clerk_1", models.AutomationCreate{
		Name: "Button campaign", TargetType: "all_posts", Keywords: []string{"link"},
		DMMessage: "Tap below", OpeningDMMode: "button", ButtonText: &btn, RevealMessage: &reveal,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if row.OpeningDMMode != "button" {
		t.Fatalf("expected opening_dm_mode=button, got %q", row.OpeningDMMode)
	}
	if row.ButtonText == nil || *row.ButtonText != btn {
		t.Fatalf("button_text not persisted: %#v", row.ButtonText)
	}
	if row.RevealMessage == nil || *row.RevealMessage != reveal {
		t.Fatalf("reveal_message not persisted: %#v", row.RevealMessage)
	}
}

func TestOwnershipMasking(t *testing.T) {
	t.Parallel()

	store := newFakeStore()
	store.automations["other"] = models.Automation{ID: "other", ClerkUserID: "other_user", Name: "Theirs"}
	svc := automations.NewService(store)

	_, err := svc.Get(context.Background(), "clerk_1", "other")
	if !errors.Is(err, automations.ErrNotFound) {
		t.Fatalf("expected not found, got %v", err)
	}
	err = svc.Delete(context.Background(), "clerk_1", "other")
	if !errors.Is(err, automations.ErrNotFound) {
		t.Fatalf("expected not found on delete, got %v", err)
	}
}

func TestTemplates(t *testing.T) {
	t.Parallel()

	svc := automations.NewService(newFakeStore())
	tmpls := svc.Templates()
	if len(tmpls) != 8 {
		t.Fatalf("expected 8 templates, got %d", len(tmpls))
	}
}

func TestOverviewStatsEmpty(t *testing.T) {
	t.Parallel()

	svc := automations.NewService(newFakeStore())
	stats, err := svc.OverviewStats(context.Background(), "clerk_1")
	if err != nil {
		t.Fatalf("overview: %v", err)
	}
	if stats.Sent7d != 0 || stats.TopKeyword7d != "" || stats.ActiveAutomations != 0 {
		t.Fatalf("unexpected empty stats: %#v", stats)
	}
}

func TestAutomationStatsShape(t *testing.T) {
	t.Parallel()

	store := newFakeStore()
	store.automations["auto_1"] = models.Automation{ID: "auto_1", ClerkUserID: "clerk_1", Name: "Mine"}
	linkKW := "LINK"
	shopKW := "SHOP"
	store.logs["auto_1"] = []models.AutomationLog{
		{ID: "l1", Action: "dm_sent", MatchedKeyword: &linkKW, CreatedAt: "2026-07-29T00:00:00Z"},
		{ID: "l2", Action: "dm_sent", MatchedKeyword: &linkKW, CreatedAt: "2026-07-28T00:00:00Z"},
		{ID: "l3", Action: "skipped", CreatedAt: "2026-07-27T00:00:00Z"},
		{ID: "l4", Action: "failed", MatchedKeyword: &shopKW, CreatedAt: "2026-07-26T00:00:00Z"},
		{ID: "l5", Action: "button_dm_sent", MatchedKeyword: &linkKW, CreatedAt: "2026-07-25T00:00:00Z"},
	}
	svc := automations.NewService(store)

	stats, err := svc.AutomationStats(context.Background(), "clerk_1", "auto_1")
	if err != nil {
		t.Fatalf("stats: %v", err)
	}
	if stats.Sent != 3 || stats.Skipped != 1 || stats.Failed != 1 {
		t.Fatalf("unexpected counters: %#v", stats)
	}
}

func TestCreateStatusDefaultAndPaused(t *testing.T) {
	t.Parallel()

	store := newFakeStore()
	store.creators["clerk_1"] = models.CreatorRow{
		ClerkUserID: "clerk_1", IGUserID: "ig_123", AccessToken: "tok",
	}
	svc := automations.NewService(store)

	defaultRow, err := svc.Create(context.Background(), "clerk_1", models.AutomationCreate{
		Name: "Default", TargetType: "all_posts", Keywords: []string{"kw"}, DMMessage: "Hi",
	})
	if err != nil {
		t.Fatalf("create default: %v", err)
	}
	if defaultRow.Status != "active" {
		t.Fatalf("expected default active, got %q", defaultRow.Status)
	}

	pausedRow, err := svc.Create(context.Background(), "clerk_1", models.AutomationCreate{
		Name: "Paused", TargetType: "all_posts", Keywords: []string{"kw"}, DMMessage: "Hi", Status: "paused",
	})
	if err != nil {
		t.Fatalf("create paused: %v", err)
	}
	if pausedRow.Status != "paused" {
		t.Fatalf("expected paused, got %q", pausedRow.Status)
	}
}

func strPtr(s string) *string { return &s }
