package profilescore

import (
	"fmt"
	"math"
	"sort"
	"unicode"
	"unicode/utf8"

	"kaplun/api-go/internal/services/insights"
)

// BuildPayload assembles a MetricsPayload from the persisted creator row
// (derived columns + profile fields) and the raw child rows (media, days,
// online followers). It computes the derived fields the score needs that
// aren't already on the creator row: content_language, best_posting_window,
// save/share rates, growth, and top posts.
func BuildPayload(
	creator map[string]any,
	media []insights.MediaItemWithInsights,
	days []insights.InsightDay,
	onlineFollowers []insights.OnlineFollowers,
) *MetricsPayload {
	p := &MetricsPayload{}

	p.FollowersCount = int64Field(creator, "follower_count")
	p.FollowingCount = int64Field(creator, "following_count")
	p.PostCount = int64Field(creator, "post_count")

	p.EngagementRate = float64Field(creator, "engagement_rate")
	p.AvgReelViews = int64Field(creator, "avg_reel_views")
	p.MedianReelViews = int64Field(creator, "median_reel_views")
	p.ReelsCount30Days = int(int64Field(creator, "reels_count_30_days"))
	p.ReelsCount7Days = int(int64Field(creator, "reels_count_7_days"))
	p.LastPostDays = int(int64Field(creator, "last_post_days"))
	p.ContentFrequencyDays = float64Field(creator, "content_frequency_days")
	p.AvgLikes = int64Field(creator, "avg_likes")
	p.AvgComments = int64Field(creator, "avg_comments")
	p.MaxLikes = int64Field(creator, "max_likes")

	p.ProfileViewsWindow = int64Field(creator, "profile_views_window")
	p.ProfileLinkTapsWindow = int64Field(creator, "profile_link_taps_window")

	p.TopCities = stringSliceField(creator, "top_cities")
	p.TopAgeGroups = stringSliceField(creator, "top_age_groups")
	p.TopGenderAgePairs = stringSliceField(creator, "top_gender_age_pairs")
	p.DemographicsAvailable = p.FollowersCount >= 100 && (len(p.TopCities) > 0 || len(p.TopAgeGroups) > 0 || len(p.TopGenderAgePairs) > 0)

	// Derived fields computed from child rows.
	p.ContentLanguage = DetectLanguage(media)
	p.BestPostingWindow = BestPostingWindow(onlineFollowers)
	p.PostingWindowAvailable = p.BestPostingWindow != ""
	p.SaveRate, p.ShareRate = computeSaveShareRates(media)
	p.Growth = computeGrowth(days)
	p.GrowthAvailable = p.Growth != nil
	p.TopPosts = topPosts(media, 3)

	p.OverallScore = ComputeScore(p)
	return p
}

// DetectLanguage inspects caption Unicode scripts and returns "en", "gu",
// "hi", or "mixed". Gujarati = U+0A80–U+0AFF, Devanagari = U+0900–U+097F.
func DetectLanguage(media []insights.MediaItemWithInsights) string {
	hasGujarati, hasDevanagari, hasLatin := false, false, false
	for _, item := range media {
		for _, r := range item.Media.Caption {
			if !unicode.IsLetter(r) {
				continue
			}
			switch {
			case r >= 0x0A80 && r <= 0x0AFF:
				hasGujarati = true
			case r >= 0x0900 && r <= 0x097F:
				hasDevanagari = true
			case r >= 'A' && r <= 'Z' || r >= 'a' && r <= 'z':
				hasLatin = true
			}
		}
	}

	indic := 0
	if hasGujarati {
		indic++
	}
	if hasDevanagari {
		indic++
	}
	if hasLatin {
		indic++
	}

	if indic >= 2 {
		return "mixed"
	}
	if hasGujarati {
		return "gu"
	}
	if hasDevanagari {
		return "hi"
	}
	return "en"
}

// BestPostingWindow slides a 3-hour window over the 24-hour online_followers
// array and returns the top window as "HH:00-HH:00". Returns "" if no data.
func BestPostingWindow(rows []insights.OnlineFollowers) string {
	if len(rows) == 0 {
		return ""
	}

	buckets := make(map[int]int64, 24)
	for _, r := range rows {
		if r.Hour >= 0 && r.Hour < 24 {
			buckets[r.Hour] += r.Value
		}
	}

	var bestStart int
	var bestSum int64 = -1
	for start := 0; start < 24; start++ {
		sum := buckets[start] + buckets[(start+1)%24] + buckets[(start+2)%24]
		if sum > bestSum {
			bestSum = sum
			bestStart = start
		}
	}

	if bestSum <= 0 {
		return ""
	}

	endHour := (bestStart + 3) % 24
	return fmt.Sprintf("%02d:00-%02d:00", bestStart, endHour)
}

// computeSaveShareRates returns (saved/reach, shares/reach) over media items
// with reach > 0.
func computeSaveShareRates(media []insights.MediaItemWithInsights) (float64, float64) {
	var totalSaved, totalShared, totalReach int64
	for _, item := range media {
		if item.Insights == nil || item.Insights.Reach <= 0 {
			continue
		}
		totalSaved += item.Insights.Saved
		totalShared += item.Insights.Shares
		totalReach += item.Insights.Reach
	}
	if totalReach == 0 {
		return 0, 0
	}
	return float64(totalSaved) / float64(totalReach), float64(totalShared) / float64(totalReach)
}

// computeGrowth returns last−first follower_count over the day series, or nil
// if fewer than 2 points have a non-nil FollowerCount.
func computeGrowth(days []insights.InsightDay) *int64 {
	var first, last int64
	count := 0
	for _, d := range days {
		if d.FollowerCount == nil {
			continue
		}
		if count == 0 {
			first = *d.FollowerCount
		}
		last = *d.FollowerCount
		count++
	}
	if count < 2 {
		return nil
	}
	delta := last - first
	return &delta
}

// topPosts returns the top n media items by views (falls back to reach when
// views are zero). Caption is truncated to ≤80 chars with "…".
func topPosts(media []insights.MediaItemWithInsights, n int) []TopPost {
	if n <= 0 || len(media) == 0 {
		return nil
	}

	type candidate struct {
		item  insights.MediaItemWithInsights
		score int64
	}
	cands := make([]candidate, 0, len(media))
	for _, item := range media {
		var views, reach int64
		if item.Insights != nil {
			views = item.Insights.Views
			reach = item.Insights.Reach
		}
		score := views
		if score == 0 {
			score = reach
		}
		cands = append(cands, candidate{item: item, score: score})
	}

	sort.Slice(cands, func(i, j int) bool {
		if cands[i].score != cands[j].score {
			return cands[i].score > cands[j].score
		}
		return cands[i].item.Media.ID > cands[j].item.Media.ID
	})

	if n > len(cands) {
		n = len(cands)
	}
	out := make([]TopPost, 0, n)
	for i := 0; i < n; i++ {
		c := cands[i]
		var views, reach int64
		if c.item.Insights != nil {
			views = c.item.Insights.Views
			reach = c.item.Insights.Reach
		}
		out = append(out, TopPost{
			MediaID:   c.item.Media.ID,
			Caption:   truncateCaption(c.item.Media.Caption),
			Views:     views,
			Reach:     reach,
			Likes:     c.item.Media.LikeCount,
			Comments:  c.item.Media.CommentsCount,
			Permalink: c.item.Media.Permalink,
			PostedAt:  c.item.Media.Timestamp,
			MediaType: c.item.Media.MediaType,
		})
	}
	return out
}

// truncateCaption limits a caption to 80 runes, appending "…" if truncated.
func truncateCaption(s string) string {
	if utf8.RuneCountInString(s) <= 80 {
		return s
	}
	runes := []rune(s)
	return string(runes[:80]) + "…"
}

// int64Field extracts an int64 from a map[string]any row. Appwrite returns
// numbers as float64 over JSON.
func int64Field(row map[string]any, key string) int64 {
	switch v := row[key].(type) {
	case float64:
		return int64(v)
	case int:
		return int64(v)
	case int64:
		return v
	}
	return 0
}

// float64Field extracts a float64 from a map[string]any row.
func float64Field(row map[string]any, key string) float64 {
	switch v := row[key].(type) {
	case float64:
		return v
	case int:
		return float64(v)
	case int64:
		return float64(v)
	}
	return 0
}

// stringSliceField extracts a []string from a map[string]any row. Appwrite
// stores arrays as []any.
func stringSliceField(row map[string]any, key string) []string {
	v, ok := row[key].([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(v))
	for _, item := range v {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// round is a small helper to avoid importing math in callers that only need
// rounding.
func round(v float64) int {
	return int(math.Round(v))
}
