package automations

import (
	"context"
	"errors"
	"strings"
	"time"

	"kaplun/api-go/internal/models"
	"kaplun/api-go/internal/services/templates"
)

var (
	ErrNotFound               = errors.New("automation not found")
	ErrValidation             = errors.New("validation")
	ErrInstagramNotConnected  = errors.New("instagram_not_connected")
)

// ValidationError carries a client-facing validation message.
type ValidationError struct {
	Message string
}

func (e *ValidationError) Error() string { return e.Message }
func (e *ValidationError) Is(target error) bool { return target == ErrValidation }

// Store is the persistence interface for automations (Appwrite impl later).
type Store interface {
	ListAutomations(ctx context.Context, clerkUserID string) ([]models.Automation, error)
	GetAutomation(ctx context.Context, automationID string) (*models.Automation, error)
	CreateAutomation(ctx context.Context, data models.Automation) (models.Automation, error)
	UpdateAutomation(ctx context.Context, automationID string, data map[string]any) (models.Automation, error)
	DeleteAutomation(ctx context.Context, automationID string) error

	ListLogs(ctx context.Context, automationID string, limit int) ([]models.AutomationLog, error)
	CountLogsByAction(ctx context.Context, automationID string) (map[string]int, error)
	CountLogsByActionSince(ctx context.Context, clerkUserID, sinceISO string) (map[string]int, error)
	TopKeywords(ctx context.Context, clerkUserID, sinceISO string, limit int) ([][]any, error)

	GetCreatorByClerkID(ctx context.Context, clerkUserID string) (*models.CreatorRow, error)
}

// Service implements Automations API business rules.
type Service struct {
	store Store
	now   func() time.Time
}

// NewService constructs an automations service with constructor injection.
func NewService(store Store) *Service {
	return &Service{
		store: store,
		now:   func() time.Time { return time.Now().UTC() },
	}
}

func (s *Service) List(ctx context.Context, clerkUserID string) ([]models.Automation, error) {
	return s.store.ListAutomations(ctx, clerkUserID)
}

func (s *Service) Get(ctx context.Context, clerkUserID, automationID string) (models.Automation, error) {
	return s.requireOwned(ctx, clerkUserID, automationID)
}

func (s *Service) Create(ctx context.Context, clerkUserID string, body models.AutomationCreate) (models.Automation, error) {
	if err := validateCreate(body); err != nil {
		return models.Automation{}, err
	}

	creator, err := s.store.GetCreatorByClerkID(ctx, clerkUserID)
	if err != nil {
		return models.Automation{}, err
	}
	if creator == nil || strings.TrimSpace(creator.AccessToken) == "" {
		return models.Automation{}, ErrInstagramNotConnected
	}

	now := s.now().Format(time.RFC3339Nano)
	mediaIDs := body.MediaIDs
	if mediaIDs == nil {
		mediaIDs = []string{}
	}
	matchMode := body.MatchMode
	if matchMode == "" {
		matchMode = "whole_word"
	}
	opening := body.OpeningDMMode
	if opening == "" {
		opening = "direct"
	}
	keywords := cleanKeywords(body.Keywords)
	if body.MatchAnyWord {
		// Any-word campaigns carry no keyword list — every comment matches.
		keywords = []string{}
	}
	row := models.Automation{
		ClerkUserID:             clerkUserID,
		IGUserID:                creator.IGUserID,
		Name:                    body.Name,
		TargetType:              body.TargetType,
		MediaIDs:                mediaIDs,
		BoundMediaIDs:           []string{},
		Keywords:                keywords,
		MatchMode:               matchMode,
		MatchAnyWord:            body.MatchAnyWord,
		OpeningDMMode:           opening,
		DMMessage:               body.DMMessage,
		ButtonText:              body.ButtonText,
		RevealMessage:           body.RevealMessage,
		PublicReplyEnabled:      body.PublicReplyEnabled,
		PublicReplyMessage:      body.PublicReplyMessage,
		PublicReplyMessages:     body.PublicReplyMessages,
		RequireFollow:           body.RequireFollow,
		FollowPromptMessage:     body.FollowPromptMessage,
		FollowPromptButtonLabel: body.FollowPromptButtonLabel,
		FollowUpEnabled:         body.FollowUpEnabled,
		FollowUpMessage:         body.FollowUpMessage,
		FollowUpDelayMinutes:    body.FollowUpDelayMinutes,
		DMTriggerEnabled:        body.DMTriggerEnabled,
		Status:                  "active",
		CreatedAt:               now,
		UpdatedAt:               now,
	}

	created, err := s.store.CreateAutomation(ctx, row)
	if err != nil {
		return models.Automation{}, err
	}

	return created, nil
}

func (s *Service) Patch(ctx context.Context, clerkUserID, automationID string, body models.AutomationPatch) (models.Automation, error) {
	if _, err := s.requireOwned(ctx, clerkUserID, automationID); err != nil {
		return models.Automation{}, err
	}
	data, err := patchToMap(body)
	if err != nil {
		return models.Automation{}, err
	}
	data["updated_at"] = s.now().Format(time.RFC3339Nano)
	return s.store.UpdateAutomation(ctx, automationID, data)
}

func (s *Service) Delete(ctx context.Context, clerkUserID, automationID string) error {
	if _, err := s.requireOwned(ctx, clerkUserID, automationID); err != nil {
		return err
	}
	return s.store.DeleteAutomation(ctx, automationID)
}

func (s *Service) ListLogs(ctx context.Context, clerkUserID, automationID string) ([]models.AutomationLog, error) {
	if _, err := s.requireOwned(ctx, clerkUserID, automationID); err != nil {
		return nil, err
	}
	return s.store.ListLogs(ctx, automationID, 100)
}

func (s *Service) Templates() []models.CampaignTemplate {
	out := make([]models.CampaignTemplate, len(templates.CampaignTemplates))
	for i, t := range templates.CampaignTemplates {
		out[i] = models.CampaignTemplate{
			Slug:      t.Slug,
			Title:     t.Title,
			Keywords:  append([]string(nil), t.Keywords...),
			DMMessage: t.DMMessage,
		}
	}
	return out
}

func (s *Service) OverviewStats(ctx context.Context, clerkUserID string) (models.OverviewStats, error) {
	since7d := s.now().Add(-7 * 24 * time.Hour).Format(time.RFC3339Nano)

	actionCounts, err := s.store.CountLogsByActionSince(ctx, clerkUserID, since7d)
	if err != nil {
		return models.OverviewStats{}, err
	}
	sent := actionCounts["dm_sent"] + actionCounts["button_dm_sent"] +
		actionCounts["reveal_sent"] + actionCounts["reply_sent"]

	automations, err := s.store.ListAutomations(ctx, clerkUserID)
	if err != nil {
		return models.OverviewStats{}, err
	}
	activeCount := 0
	for _, a := range automations {
		if a.Status == "active" {
			activeCount++
		}
	}

	topKws, err := s.store.TopKeywords(ctx, clerkUserID, since7d, 1)
	if err != nil {
		return models.OverviewStats{}, err
	}
	topKW := ""
	if len(topKws) > 0 && len(topKws[0]) > 0 {
		if s, ok := topKws[0][0].(string); ok {
			topKW = s
		}
	}

	return models.OverviewStats{
		Sent7d:            sent,
		TopKeyword7d:      topKW,
		ActiveAutomations: activeCount,
	}, nil
}

func (s *Service) AutomationStats(ctx context.Context, clerkUserID, automationID string) (models.AutomationStats, error) {
	if _, err := s.requireOwned(ctx, clerkUserID, automationID); err != nil {
		return models.AutomationStats{}, err
	}

	actionCounts, err := s.store.CountLogsByAction(ctx, automationID)
	if err != nil {
		return models.AutomationStats{}, err
	}
	sent := actionCounts["dm_sent"] + actionCounts["button_dm_sent"] +
		actionCounts["reveal_sent"] + actionCounts["reply_sent"]
	skipped := actionCounts["skipped"]
	failed := actionCounts["failed"]

	return models.AutomationStats{
		Sent:    sent,
		Skipped: skipped,
		Failed:  failed,
	}, nil
}

func (s *Service) requireOwned(ctx context.Context, clerkUserID, automationID string) (models.Automation, error) {
	row, err := s.store.GetAutomation(ctx, automationID)
	if err != nil {
		return models.Automation{}, err
	}
	if row == nil || row.ClerkUserID != clerkUserID {
		return models.Automation{}, ErrNotFound
	}
	return *row, nil
}

func validateCreate(body models.AutomationCreate) error {
	name := strings.TrimSpace(body.Name)
	if name == "" || len(body.Name) > 128 {
		return &ValidationError{Message: "name is required and must be at most 128 characters"}
	}
	switch body.TargetType {
	case "all_posts", "specific_posts", "next_reel":
	default:
		return &ValidationError{Message: "target_type must be all_posts, specific_posts, or next_reel"}
	}
	if body.TargetType == "specific_posts" && len(body.MediaIDs) == 0 {
		return &ValidationError{Message: "media_ids is required when target_type is specific_posts"}
	}
	cleaned := cleanKeywords(body.Keywords)
	if !body.MatchAnyWord && len(cleaned) == 0 {
		return &ValidationError{Message: "at least one keyword is required, or enable match_any_word"}
	}
	matchMode := body.MatchMode
	if matchMode == "" {
		matchMode = "whole_word"
	}
	if matchMode != "whole_word" && matchMode != "partial" {
		return &ValidationError{Message: "match_mode must be whole_word or partial"}
	}
	if strings.TrimSpace(body.DMMessage) == "" || len(body.DMMessage) > 2000 {
		return &ValidationError{Message: "dm_message is required and must be at most 2000 characters"}
	}
	opening := body.OpeningDMMode
	if opening == "" {
		opening = "direct"
	}
	if opening != "direct" && opening != "button" {
		return &ValidationError{Message: "opening_dm_mode must be direct or button"}
	}
	if opening == "button" {
		if body.ButtonText == nil || strings.TrimSpace(*body.ButtonText) == "" {
			return &ValidationError{Message: "button_text is required when opening_dm_mode is 'button'"}
		}
		if len(*body.ButtonText) > 20 {
			return &ValidationError{Message: "button_text must be at most 20 characters"}
		}
		if body.RevealMessage == nil || strings.TrimSpace(*body.RevealMessage) == "" {
			return &ValidationError{Message: "reveal_message is required when opening_dm_mode is 'button'"}
		}
	}
	if body.PublicReplyEnabled {
		hasSingle := body.PublicReplyMessage != nil && strings.TrimSpace(*body.PublicReplyMessage) != ""
		hasPool := len(body.PublicReplyMessages) > 0
		if !hasSingle && !hasPool {
			return &ValidationError{Message: "public_reply_message or public_reply_messages is required when public replies are enabled"}
		}
	}
	if body.FollowUpEnabled {
		if body.FollowUpMessage == nil || strings.TrimSpace(*body.FollowUpMessage) == "" {
			return &ValidationError{Message: "follow_up_message is required when follow-up is enabled"}
		}
		if body.FollowUpDelayMinutes == nil || *body.FollowUpDelayMinutes < 1 {
			return &ValidationError{Message: "follow_up_delay_minutes must be at least 1 when follow-up is enabled"}
		}
	}
	return nil
}

func cleanKeywords(keywords []string) []string {
	out := make([]string, 0, len(keywords))
	for _, k := range keywords {
		k = strings.TrimSpace(k)
		if k != "" {
			out = append(out, k)
		}
	}
	return out
}

func patchToMap(body models.AutomationPatch) (map[string]any, error) {
	data := map[string]any{}
	if body.Name != nil {
		data["name"] = *body.Name
	}
	if body.MatchAnyWord != nil {
		data["match_any_word"] = *body.MatchAnyWord
		if *body.MatchAnyWord {
			// Any-word clears the keyword list, mirroring create semantics.
			data["keywords"] = []string{}
		}
	}
	if body.Keywords != nil {
		cleaned := cleanKeywords(body.Keywords)
		anyWord := body.MatchAnyWord != nil && *body.MatchAnyWord
		if len(cleaned) == 0 && !anyWord {
			return nil, &ValidationError{Message: "at least one keyword is required, or enable match_any_word"}
		}
		data["keywords"] = cleaned
	}
	if body.MatchMode != nil {
		if *body.MatchMode != "whole_word" && *body.MatchMode != "partial" {
			return nil, &ValidationError{Message: "match_mode must be whole_word or partial"}
		}
		data["match_mode"] = *body.MatchMode
	}
	if body.DMMessage != nil {
		data["dm_message"] = *body.DMMessage
	}
	if body.OpeningDMMode != nil {
		if *body.OpeningDMMode != "direct" && *body.OpeningDMMode != "button" {
			return nil, &ValidationError{Message: "opening_dm_mode must be direct or button"}
		}
		data["opening_dm_mode"] = *body.OpeningDMMode
	}
	if body.ButtonText != nil {
		data["button_text"] = *body.ButtonText
	}
	if body.RevealMessage != nil {
		data["reveal_message"] = *body.RevealMessage
	}
	if body.PublicReplyEnabled != nil {
		data["public_reply_enabled"] = *body.PublicReplyEnabled
	}
	if body.PublicReplyMessage != nil {
		data["public_reply_message"] = *body.PublicReplyMessage
	}
	if body.PublicReplyMessages != nil {
			data["public_reply_messages"] = body.PublicReplyMessages
		}
		if body.RequireFollow != nil {
			data["require_follow"] = *body.RequireFollow
		}
		if body.FollowPromptMessage != nil {
			data["follow_prompt_message"] = *body.FollowPromptMessage
		}
		if body.FollowPromptButtonLabel != nil {
			data["follow_prompt_button_label"] = *body.FollowPromptButtonLabel
		}
		if body.FollowUpEnabled != nil {
			data["follow_up_enabled"] = *body.FollowUpEnabled
		}
		if body.FollowUpMessage != nil {
			data["follow_up_message"] = *body.FollowUpMessage
		}
		if body.FollowUpDelayMinutes != nil {
			data["follow_up_delay_minutes"] = *body.FollowUpDelayMinutes
		}
	if body.DMTriggerEnabled != nil {
		data["dm_trigger_enabled"] = *body.DMTriggerEnabled
	}
	if body.Status != nil {
		if *body.Status != "active" && *body.Status != "paused" {
			return nil, &ValidationError{Message: "status must be active or paused"}
		}
		data["status"] = *body.Status
	}
	if body.TargetType != nil {
		switch *body.TargetType {
		case "all_posts", "specific_posts", "next_reel":
			data["target_type"] = *body.TargetType
		default:
			return nil, &ValidationError{Message: "target_type must be all_posts, specific_posts, or next_reel"}
		}
	}
	if body.MediaIDs != nil {
		data["media_ids"] = body.MediaIDs
	}
	return data, nil
}
