package profilescore

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

// ActionItem is one of the exactly-3 action items the LLM must return.
type ActionItem struct {
	Priority   string `json:"priority"`
	Action     string `json:"action"`
	Why        string `json:"why"`
	WhenToPost string `json:"when_to_post"`
}

// LLMResponse is the validated/clamped output from the LLM coach call.
type LLMResponse struct {
	ScoreLabel     string       `json:"score_label"`
	OneLineSummary string       `json:"one_line_summary"`
	Strengths      []string     `json:"strengths"`
	Weaknesses     []string     `json:"weaknesses"`
	ActionPlan     []ActionItem `json:"action_plan"`
	Model          string       `json:"model"`
	TokensUsed     int          `json:"tokens_used"`
}

// LLMClient produces the English coach copy (label, summary, strengths,
// weaknesses, actions) from a metrics payload + Go-owned score. The model
// never sets overall_score.
type LLMClient interface {
	GenerateReport(ctx context.Context, payload MetricsPayload, score int) (*LLMResponse, error)
}

// OpenAIConfig holds the connection settings for an OpenAI-compatible
// chat completions endpoint.
type OpenAIConfig struct {
	BaseURL  string
	APIKey   string
	Model    string
	Timeout  time.Duration
}

// openAIClient calls an OpenAI-compatible /chat/completions endpoint.
type openAIClient struct {
	baseURL string
	apiKey  string
	model   string
	http    *http.Client
}

// NewOpenAIClient constructs an LLMClient for an OpenAI-compatible endpoint.
func NewOpenAIClient(cfg OpenAIConfig) LLMClient {
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	return &openAIClient{
		baseURL: strings.TrimRight(cfg.BaseURL, "/"),
		apiKey:  cfg.APIKey,
		model:   cfg.Model,
		http:    &http.Client{Timeout: timeout},
	}
}

// chatRequest is the OpenAI-compatible chat completions request body.
type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// chatResponse is the subset of the OpenAI-compatible response we parse.
type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Usage struct {
		TotalTokens int `json:"total_tokens"`
	} `json:"usage"`
	Model string `json:"model"`
}

// llmRawOutput is the raw JSON shape we expect from the LLM content field.
type llmRawOutput struct {
	ScoreLabel     string       `json:"score_label"`
	OneLineSummary string       `json:"one_line_summary"`
	Strengths      []string     `json:"strengths"`
	Weaknesses     []string     `json:"weaknesses"`
	ActionPlan     []ActionItem `json:"action_plan"`
}

// GenerateReport calls the LLM with the system + user prompt, parses the
// JSON from choices[0].message.content, and validates/clamps the fields.
func (c *openAIClient) GenerateReport(ctx context.Context, payload MetricsPayload, score int) (*LLMResponse, error) {
	userPrompt := buildUserPrompt(payload, score)
	body := chatRequest{
		Model: c.model,
		Messages: []chatMessage{
			{Role: "system", Content: buildSystemPrompt()},
			{Role: "user", Content: userPrompt},
		},
		Temperature: 0.7,
	}

	payloadBytes, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal chat request: %w", err)
	}

	url := c.baseURL + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payloadBytes))
	if err != nil {
		return nil, fmt.Errorf("build llm request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("llm request: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read llm response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("llm returned status %d: %s", resp.StatusCode, truncateBody(raw, 200))
	}

	var chatResp chatResponse
	if err := json.Unmarshal(raw, &chatResp); err != nil {
		return nil, fmt.Errorf("decode llm response: %w", err)
	}
	if len(chatResp.Choices) == 0 {
		return nil, fmt.Errorf("llm returned no choices")
	}

	content := strings.TrimSpace(chatResp.Choices[0].Message.Content)
	model := chatResp.Model
	if model == "" {
		model = c.model
	}
	tokens := chatResp.Usage.TotalTokens

	return parseAndClamp(content, model, tokens), nil
}

// buildSystemPrompt returns the system prompt that constrains the LLM to
// JSON-only output with the correct fields.
func buildSystemPrompt() string {
	return "Instagram growth coach for Indian micro-influencers. " +
		"Return ONLY JSON for label/summary/strengths/weaknesses/actions. " +
		"Be specific and encouraging. Tailor when-to-post to the payload window. " +
		"Every number you cite must appear in the payload. " +
		"Do not output overall_score."
}

// buildUserPrompt returns the user message containing the metrics payload
// and the Go-owned score.
func buildUserPrompt(payload MetricsPayload, score int) string {
	payloadJSON, _ := json.Marshal(payload)
	return fmt.Sprintf(`The profile score is %d/100 (computed deterministically by the server — do not include it in your output).

Metrics payload:
%s

Return JSON with exactly these fields:
{
  "score_label": "short label (max 40 chars)",
  "one_line_summary": "one sentence summary (max 200 chars)",
  "strengths": ["2-3 specific strengths (max 200 chars each)"],
  "weaknesses": ["1-3 specific weaknesses (max 200 chars each)"],
  "action_plan": [
    {"priority": "high|medium|low", "action": "specific action", "why": "reason", "when_to_post": "time window from payload or general best time"}
  ]
}

Return exactly 3 action items. Do not invent metrics for unavailable sections.`, score, string(payloadJSON))
}

// parseAndClamp extracts the JSON from the LLM content string, validates it,
// and clamps all fields to safe limits. If the content is not valid JSON,
// returns a fallback report.
func parseAndClamp(content, model string, tokens int) *LLMResponse {
	// Strip markdown code fences if present.
	content = stripCodeFences(content)

	var raw llmRawOutput
	if err := json.Unmarshal([]byte(content), &raw); err != nil {
		return fallbackReport(model, tokens)
	}

	return validateAndClamp(&raw, model, tokens)
}

// validateAndClamp enforces field limits and counts on the parsed LLM output.
func validateAndClamp(raw *llmRawOutput, model string, tokens int) *LLMResponse {
	out := &LLMResponse{
		Model:      model,
		TokensUsed: tokens,
	}

	out.ScoreLabel = clampString(raw.ScoreLabel, 40)
	if out.ScoreLabel == "" {
		out.ScoreLabel = "Needs data"
	}
	out.OneLineSummary = clampString(raw.OneLineSummary, 200)

	out.Strengths = clampStringSlice(raw.Strengths, 3, 200)
	out.Weaknesses = clampStringSlice(raw.Weaknesses, 3, 200)

	// Take first 3 action items, clamp each field, default priority.
	if len(raw.ActionPlan) > 3 {
		raw.ActionPlan = raw.ActionPlan[:3]
	}
	out.ActionPlan = make([]ActionItem, 0, len(raw.ActionPlan))
	for _, item := range raw.ActionPlan {
		priority := strings.ToLower(strings.TrimSpace(item.Priority))
		if priority != "high" && priority != "medium" && priority != "low" {
			priority = "medium"
		}
		out.ActionPlan = append(out.ActionPlan, ActionItem{
			Priority:   priority,
			Action:     clampString(item.Action, 500),
			Why:        clampString(item.Why, 500),
			WhenToPost: clampString(item.WhenToPost, 500),
		})
	}

	return out
}

// fallbackReport returns a minimal report when the LLM output is unparseable.
func fallbackReport(model string, tokens int) *LLMResponse {
	return &LLMResponse{
		ScoreLabel:     "Needs data",
		OneLineSummary: "",
		Strengths:      []string{},
		Weaknesses:     []string{},
		ActionPlan:     []ActionItem{},
		Model:          model,
		TokensUsed:     tokens,
	}
}

// clampString trims a string to maxRunes, appending "…" if truncated.
func clampString(s string, maxRunes int) string {
	s = strings.TrimSpace(s)
	if maxRunes <= 0 {
		return ""
	}
	if utf8.RuneCountInString(s) <= maxRunes {
		return s
	}
	runes := []rune(s)
	return string(runes[:maxRunes-1]) + "…"
}

// clampStringSlice takes the first n items and clamps each to maxRunes.
func clampStringSlice(items []string, n, maxRunes int) []string {
	if len(items) > n {
		items = items[:n]
	}
	out := make([]string, 0, len(items))
	for _, s := range items {
		clamped := clampString(s, maxRunes)
		if clamped != "" {
			out = append(out, clamped)
		}
	}
	return out
}

// stripCodeFences removes ```json ... ``` wrappers that some LLMs add.
func stripCodeFences(s string) string {
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, "```") {
		return s
	}
	// Remove opening fence line.
	if idx := strings.Index(s, "\n"); idx >= 0 {
		s = s[idx+1:]
	}
	// Remove closing fence.
	s = strings.TrimSuffix(strings.TrimSpace(s), "```")
	return strings.TrimSpace(s)
}

// truncateBody limits an error response body for logging.
func truncateBody(body []byte, max int) string {
	if len(body) <= max {
		return string(body)
	}
	return string(body[:max]) + "..."
}
