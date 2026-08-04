package meta

import (
	"errors"
	"fmt"
	"strings"
)

type MetaAPIError struct {
	Code      int
	Message   string
	Subcode   int
	FBTraceID string
}

func (e *MetaAPIError) Error() string {
	return e.Message
}

type TokenExpiredError struct{ *MetaAPIError }
type GraphRateLimitError struct{ *MetaAPIError }
type MetaPermissionError struct{ *MetaAPIError }

func Handle(data map[string]any, status int) (map[string]any, error) {
	errorValue, ok := data["error"]
	if !ok {
		return data, nil
	}

	errMap, ok := errorValue.(map[string]any)
	if !ok {
		return nil, &MetaAPIError{Code: status, Message: "Unknown Meta API error"}
	}

	base := &MetaAPIError{
		Code:      intValue(errMap["code"], status),
		Message:   stringValue(errMap["message"], "Unknown Meta API error"),
		Subcode:   intValue(errMap["error_subcode"], 0),
		FBTraceID: stringValue(errMap["fbtrace_id"], ""),
	}

	switch base.Code {
	case 190:
		return nil, &TokenExpiredError{MetaAPIError: base}
	case 368, 4, 17, 613, 32:
		return nil, &GraphRateLimitError{MetaAPIError: base}
	case 10, 100, 200:
		return nil, &MetaPermissionError{MetaAPIError: base}
	default:
		return nil, base
	}
}

func intValue(value any, fallback int) int {
	switch v := value.(type) {
	case int:
		return v
	case int32:
		return int(v)
	case int64:
		return int(v)
	case float64:
		return int(v)
	default:
		return fallback
	}
}

func stringValue(value any, fallback string) string {
	if text, ok := value.(string); ok && text != "" {
		return text
	}
	return fallback
}

func WrapRequestError(err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("meta request failed: %w", err)
}

// IsTemplateRejection reports whether err is a Meta API error indicating
// a button template was rejected (e.g., messaging window closed).
// Meta returns code 100/10 with messages containing "template" or "button"
// when a button template DM cannot be delivered.
func IsTemplateRejection(err error) bool {
	if err == nil {
		return false
	}
	var metaErr *MetaAPIError
	if !errors.As(err, &metaErr) {
		return false
	}
	if metaErr.Code != 100 && metaErr.Code != 10 {
		return false
	}
	msg := strings.ToLower(metaErr.Message)
	return strings.Contains(msg, "template") || strings.Contains(msg, "button")
}
