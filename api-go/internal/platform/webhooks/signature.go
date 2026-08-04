package webhooks

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

type CommentEvent struct {
	InstagramAccountID string
	CommentID          string
	CommentText        string
	CommenterID        string
	CommenterName      string
	MediaID            string
}

type PostbackEvent struct {
	InstagramAccountID string
	UserID             string
	Payload            string
	MID                string
}

type ReadEvent struct {
	InstagramAccountID string
	UserID             string
	Watermark          int64
}

func VerifySignature(rawBody []byte, signatureHeader string, secrets []string) bool {
	if signatureHeader == "" || len(secrets) == 0 {
		return false
	}

	for _, secret := range secrets {
		expected := ComputeTestSignature(secret, rawBody)
		if hmac.Equal([]byte(signatureHeader), []byte(expected)) {
			return true
		}
	}
	return false
}

func ComputeTestSignature(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

func ParseCommentEvents(payload map[string]any) []CommentEvent {
	events := make([]CommentEvent, 0)
	if payload["object"] != "instagram" {
		return events
	}

	for _, entryValue := range asSlice(payload["entry"]) {
		entry := asMap(entryValue)
		entryID := asString(entry["id"])
		for _, changeValue := range asSlice(entry["changes"]) {
			change := asMap(changeValue)
			if asString(change["field"]) != "comments" {
				continue
			}
			value := asMap(change["value"])
			if asString(value["parent_id"]) != "" {
				continue
			}
			commentID := firstNonEmpty(asString(value["id"]), asString(value["comment_id"]))
			mediaID := firstNonEmpty(asString(asMap(value["media"])["id"]), asString(value["media_id"]))
			from := asMap(value["from"])
			commenterID := asString(from["id"])
			if entryID == "" || commentID == "" || mediaID == "" || commenterID == "" || commenterID == entryID {
				continue
			}

			events = append(events, CommentEvent{
				InstagramAccountID: entryID,
				CommentID:          commentID,
				CommentText:        asString(value["text"]),
				CommenterID:        commenterID,
				CommenterName:      asString(from["username"]),
				MediaID:            mediaID,
			})
		}
	}

	return events
}

func ParsePostbackEvents(payload map[string]any) []PostbackEvent {
	events := make([]PostbackEvent, 0)
	if payload["object"] != "instagram" {
		return events
	}

	for _, entryValue := range asSlice(payload["entry"]) {
		entry := asMap(entryValue)
		entryID := asString(entry["id"])
		for _, messagingValue := range asSlice(entry["messaging"]) {
			messaging := asMap(messagingValue)
			postback := asMap(messaging["postback"])
			payloadValue := asString(postback["payload"])
			userID := asString(asMap(messaging["sender"])["id"])
			accountID := firstNonEmpty(entryID, asString(asMap(messaging["recipient"])["id"]))
			if payloadValue == "" || userID == "" || accountID == "" || userID == accountID {
				continue
			}

			events = append(events, PostbackEvent{
				InstagramAccountID: accountID,
				UserID:             userID,
				Payload:            payloadValue,
				MID:                asString(postback["mid"]),
			})
		}
	}

	return events
}

// MessageEvent represents an inbound DM text message from the Instagram
// webhook messaging[].message payload.
type MessageEvent struct {
	InstagramAccountID string
	MessageID          string
	MessageText        string
	SenderID           string
}

// ParseMessageEvents extracts inbound DM text messages from an Instagram
// webhook payload. It parses entry[].messaging[].message events, filtering
// out echoes, deletions, attachment-only messages, and self-messages.
func ParseMessageEvents(payload map[string]any) []MessageEvent {
	events := make([]MessageEvent, 0)
	if payload["object"] != "instagram" {
		return events
	}

	for _, entryValue := range asSlice(payload["entry"]) {
		entry := asMap(entryValue)
		entryID := asString(entry["id"])
		for _, messagingValue := range asSlice(entry["messaging"]) {
			messaging := asMap(messagingValue)
			msg := asMap(messaging["message"])
			if len(msg) == 0 {
				continue
			}

			// Filter out echoes (messages the business account sent).
			if asBool(msg["is_echo"]) {
				continue
			}

			// Filter out deletions.
			if asBool(msg["is_deleted"]) {
				continue
			}

			// Filter out unsupported message types (no text).
			messageText := asString(msg["text"])
			if messageText == "" {
				continue
			}

			messageID := asString(msg["mid"])
			senderID := asString(asMap(messaging["sender"])["id"])
			accountID := firstNonEmpty(entryID, asString(asMap(messaging["recipient"])["id"]))

			// Filter out self-messages (sender === account).
			if senderID == "" || accountID == "" || senderID == accountID {
				continue
			}

			events = append(events, MessageEvent{
				InstagramAccountID: accountID,
				MessageID:          messageID,
				MessageText:        messageText,
				SenderID:           senderID,
			})
		}
	}

	return events
}

// ParseReadEvents extracts read-receipt events from an Instagram webhook payload.
// Instagram sends `read` events in the messaging array when a user opens a DM.
func ParseReadEvents(payload map[string]any) []ReadEvent {
	events := make([]ReadEvent, 0)
	if payload["object"] != "instagram" {
		return events
	}

	for _, entryValue := range asSlice(payload["entry"]) {
		entry := asMap(entryValue)
		entryID := asString(entry["id"])
		for _, messagingValue := range asSlice(entry["messaging"]) {
			messaging := asMap(messagingValue)
			read := asMap(messaging["read"])
			if len(read) == 0 {
				continue
			}
			userID := asString(asMap(messaging["sender"])["id"])
			accountID := firstNonEmpty(entryID, asString(asMap(messaging["recipient"])["id"]))
			watermark, _ := read["watermark"].(float64)
			if userID == "" || accountID == "" || userID == accountID {
				continue
			}

			events = append(events, ReadEvent{
				InstagramAccountID: accountID,
				UserID:             userID,
				Watermark:          int64(watermark),
			})
		}
	}

	return events
}

func asSlice(value any) []any {
	if value == nil {
		return nil
	}
	items, ok := value.([]any)
	if ok {
		return items
	}
	return nil
}

func asMap(value any) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	mapped, ok := value.(map[string]any)
	if ok {
		return mapped
	}
	return map[string]any{}
}

func asString(value any) string {
	switch v := value.(type) {
	case string:
		return v
	case fmt.Stringer:
		return v.String()
	default:
		return ""
	}
}

func asBool(value any) bool {
	switch v := value.(type) {
	case bool:
		return v
	default:
		return false
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
