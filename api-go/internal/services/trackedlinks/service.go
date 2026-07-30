package trackedlinks

import (
	"context"
	"errors"
)

var ErrNotFound = errors.New("tracked link not found")

type Link struct {
	Slug      string
	TargetURL string
}

type Store interface {
	GetTrackedLink(ctx context.Context, slug string) (Link, error)
	RecordClick(ctx context.Context, slug string) error
}

type Service struct {
	store Store
}

func NewService(store Store) *Service {
	return &Service{store: store}
}

func (s *Service) ResolveRedirect(ctx context.Context, slug string) (Link, error) {
	link, err := s.store.GetTrackedLink(ctx, slug)
	if err != nil {
		return Link{}, err
	}
	if err := s.store.RecordClick(ctx, slug); err != nil {
		return Link{}, err
	}
	return link, nil
}
