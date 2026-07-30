package meta

import (
	"context"
	"fmt"
)

// Sender adapts Client messaging methods to error-only signatures
// (worker.GraphSender / similar consumers that discard the response map).
type Sender struct {
	Client *Client
}

// NewSender wraps a Graph Client. client may be nil (methods return errors).
func NewSender(client *Client) *Sender {
	return &Sender{Client: client}
}

func (s *Sender) SendCommentReply(ctx context.Context, commentID, message, accessToken string) error {
	if s == nil || s.Client == nil {
		return fmt.Errorf("meta sender not configured")
	}
	_, err := s.Client.SendCommentReply(ctx, commentID, message, accessToken)
	return err
}

func (s *Sender) SendPrivateReply(ctx context.Context, igAccountID, commentID, text, accessToken string) error {
	if s == nil || s.Client == nil {
		return fmt.Errorf("meta sender not configured")
	}
	_, err := s.Client.SendPrivateReply(ctx, igAccountID, commentID, text, accessToken)
	return err
}

func (s *Sender) SendPrivateReplyWithButton(ctx context.Context, igAccountID, commentID, text, buttonTitle, payload, accessToken string) error {
	if s == nil || s.Client == nil {
		return fmt.Errorf("meta sender not configured")
	}
	_, err := s.Client.SendPrivateReplyWithButton(ctx, igAccountID, commentID, text, buttonTitle, payload, accessToken)
	return err
}

func (s *Sender) SendDirectMessage(ctx context.Context, igAccountID, userID, text, accessToken string) error {
	if s == nil || s.Client == nil {
		return fmt.Errorf("meta sender not configured")
	}
	_, err := s.Client.SendDirectMessage(ctx, igAccountID, userID, text, accessToken)
	return err
}
