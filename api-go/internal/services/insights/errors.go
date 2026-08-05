package insights

import "errors"

var (
	// ErrTokenExpired is the sentinel identity for Meta error 190 — the
	// creator's long-lived Instagram token was rejected and they must
	// reconnect. Detect underlying Meta errors with meta.IsTokenExpired.
	ErrTokenExpired = errors.New("instagram token expired")

	// ErrBelow100Followers marks creators below Meta's 100-follower
	// threshold for the audience demographics endpoints — demographics are
	// skipped client-side before Meta can reject the call.
	ErrBelow100Followers = errors.New("below 100 followers: demographics unavailable")
)
