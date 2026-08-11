package profilescore

import (
	"testing"

	"kaplun/api-go/internal/services/insights"
)

func ptrInt64(v int64) *int64 { return &v }

func TestComputeScore(t *testing.T) {
	tests := []struct {
		name    string
		payload *MetricsPayload
		want    int
	}{
		{
			name: "all available mid-range",
			payload: &MetricsPayload{
				FollowersCount:        500,
				EngagementRate:        0.08,
				ContentFrequencyDays:  4.4,
				LastPostDays:          1,
				Growth:                ptrInt64(0),
				GrowthAvailable:       true,
				ProfileViewsWindow:    100,
				ProfileLinkTapsWindow: 10,
				BestPostingWindow:     "19:00-22:00",
				PostingWindowAvailable: true,
			},
			want: 88,
		},
		{
			name: "growth unavailable redistributes weight",
			payload: &MetricsPayload{
				FollowersCount:        500,
				EngagementRate:        0.08,
				ContentFrequencyDays:  4.4,
				LastPostDays:          1,
				GrowthAvailable:       false,
				ProfileViewsWindow:    100,
				ProfileLinkTapsWindow: 10,
				BestPostingWindow:     "19:00-22:00",
				PostingWindowAvailable: true,
			},
			want: 98,
		},
		{
			name:    "all unavailable",
			payload: &MetricsPayload{},
			want:    0,
		},
		{
			name: "all maxed",
			payload: &MetricsPayload{
				FollowersCount:        500,
				EngagementRate:        0.08,
				ContentFrequencyDays:  2,
				LastPostDays:          1,
				Growth:                ptrInt64(25),
				GrowthAvailable:       true,
				ProfileViewsWindow:    100,
				ProfileLinkTapsWindow: 10,
				BestPostingWindow:     "19:00-22:00",
				PostingWindowAvailable: true,
			},
			want: 100,
		},
		{
			name:    "nil payload",
			payload: nil,
			want:    0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := ComputeScore(tc.payload)
			if got != tc.want {
				t.Errorf("ComputeScore() = %d, want %d", got, tc.want)
			}
		})
	}
}

func TestComputeScoreSubScores(t *testing.T) {
	p := &MetricsPayload{
		FollowersCount:        500,
		EngagementRate:        0.08,
		ContentFrequencyDays:  4.4,
		LastPostDays:          1,
		Growth:                ptrInt64(0),
		GrowthAvailable:       true,
		ProfileViewsWindow:    100,
		ProfileLinkTapsWindow: 10,
		BestPostingWindow:     "19:00-22:00",
		PostingWindowAvailable: true,
	}
	ComputeScore(p)

	if !p.SubScores.Engagement.Available || p.SubScores.Engagement.Value != 100 {
		t.Errorf("engagement sub-score = %d (available=%v), want 100/true", p.SubScores.Engagement.Value, p.SubScores.Engagement.Available)
	}
	if !p.SubScores.Cadence.Available || p.SubScores.Cadence.Value != 90 {
		t.Errorf("cadence sub-score = %d (available=%v), want 90/true", p.SubScores.Cadence.Value, p.SubScores.Cadence.Available)
	}
	if !p.SubScores.Growth.Available || p.SubScores.Growth.Value != 50 {
		t.Errorf("growth sub-score = %d (available=%v), want 50/true", p.SubScores.Growth.Value, p.SubScores.Growth.Available)
	}
	if !p.SubScores.Funnel.Available || p.SubScores.Funnel.Value != 100 {
		t.Errorf("funnel sub-score = %d (available=%v), want 100/true", p.SubScores.Funnel.Value, p.SubScores.Funnel.Available)
	}
	if !p.SubScores.Posting.Available || p.SubScores.Posting.Value != 100 {
		t.Errorf("posting sub-score = %d (available=%v), want 100/true", p.SubScores.Posting.Value, p.SubScores.Posting.Available)
	}
}

func TestDetectLanguage(t *testing.T) {
	tests := []struct {
		name  string
		media []insights.MediaItemWithInsights
		want  string
	}{
		{
			name: "english only",
			media: []insights.MediaItemWithInsights{
				{Media: insights.MediaItem{Caption: "Hello world, this is a test"}},
			},
			want: "en",
		},
		{
			name: "gujarati only",
			media: []insights.MediaItemWithInsights{
				{Media: insights.MediaItem{Caption: "નમસ્તે દુનિયા"}},
			},
			want: "gu",
		},
		{
			name: "devanagari only",
			media: []insights.MediaItemWithInsights{
				{Media: insights.MediaItem{Caption: "नमस्ते दुनिया"}},
			},
			want: "hi",
		},
		{
			name: "mixed gujarati and english",
			media: []insights.MediaItemWithInsights{
				{Media: insights.MediaItem{Caption: "Hello દુનિયા"}},
			},
			want: "mixed",
		},
		{
			name: "mixed devanagari and english",
			media: []insights.MediaItemWithInsights{
				{Media: insights.MediaItem{Caption: "Hello दुनिया"}},
			},
			want: "mixed",
		},
		{
			name:  "empty media",
			media: nil,
			want:  "en",
		},
		{
			name: "no captions",
			media: []insights.MediaItemWithInsights{
				{Media: insights.MediaItem{Caption: ""}},
			},
			want: "en",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := DetectLanguage(tc.media)
			if got != tc.want {
				t.Errorf("DetectLanguage() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestBestPostingWindow(t *testing.T) {
	tests := []struct {
		name string
		rows []insights.OnlineFollowers
		want string
	}{
		{
			name: "peak at 19-21",
			rows: []insights.OnlineFollowers{
				{Hour: 0, Value: 10},
				{Hour: 1, Value: 5},
				{Hour: 19, Value: 100},
				{Hour: 20, Value: 120},
				{Hour: 21, Value: 90},
			},
			want: "19:00-22:00",
		},
		{
			name: "peak at 0-2 wrapping",
			rows: []insights.OnlineFollowers{
				{Hour: 0, Value: 100},
				{Hour: 1, Value: 120},
				{Hour: 2, Value: 90},
				{Hour: 19, Value: 10},
			},
			want: "00:00-03:00",
		},
		{
			name: "empty",
			rows: nil,
			want: "",
		},
		{
			name: "all zeros",
			rows: []insights.OnlineFollowers{
				{Hour: 0, Value: 0},
				{Hour: 1, Value: 0},
			},
			want: "",
		},
		{
			name: "full 24h peak at 19-21",
			rows: func() []insights.OnlineFollowers {
				rows := make([]insights.OnlineFollowers, 24)
				for h := 0; h < 24; h++ {
					rows[h] = insights.OnlineFollowers{Hour: h, Value: 10}
				}
				rows[19] = insights.OnlineFollowers{Hour: 19, Value: 100}
				rows[20] = insights.OnlineFollowers{Hour: 20, Value: 1000}
				rows[21] = insights.OnlineFollowers{Hour: 21, Value: 100}
				return rows
			}(),
			want: "19:00-22:00",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := BestPostingWindow(tc.rows)
			if got != tc.want {
				t.Errorf("BestPostingWindow() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestBuildPayload(t *testing.T) {
	creator := map[string]any{
		"follower_count":          float64(500),
		"following_count":         float64(200),
		"post_count":              float64(50),
		"engagement_rate":         0.08,
		"content_frequency_days":  4.4,
		"last_post_days":          float64(1),
		"profile_views_window":    float64(100),
		"profile_link_taps_window": float64(10),
		"top_cities":              []any{"Mumbai", "Delhi"},
	}

	media := []insights.MediaItemWithInsights{
		{
			Media: insights.MediaItem{
				ID:        "media1",
				Caption:   "Hello world",
				Timestamp: "2026-08-10T12:00:00+0000",
			},
			Insights: &insights.MediaInsights{
				Views:  1000,
				Reach:  500,
				Saved:  50,
				Shares: 25,
			},
		},
		{
			Media: insights.MediaItem{
				ID:        "media2",
				Caption:   "નમસ્તે",
				Timestamp: "2026-08-09T12:00:00+0000",
			},
			Insights: &insights.MediaInsights{
				Views:  2000,
				Reach:  1000,
				Saved:  100,
				Shares: 50,
			},
		},
	}

	days := []insights.InsightDay{
		{Date: "2026-08-01", FollowerCount: ptrInt64(500)},
		{Date: "2026-08-05", FollowerCount: ptrInt64(500)},
	}

	onlineFollowers := []insights.OnlineFollowers{
		{Hour: 19, Value: 100},
		{Hour: 20, Value: 120},
		{Hour: 21, Value: 90},
	}

	p := BuildPayload(creator, media, days, onlineFollowers)

	if p.FollowersCount != 500 {
		t.Errorf("FollowersCount = %d, want 500", p.FollowersCount)
	}
	if p.EngagementRate != 0.08 {
		t.Errorf("EngagementRate = %f, want 0.08", p.EngagementRate)
	}
	if p.ContentLanguage != "mixed" {
		t.Errorf("ContentLanguage = %q, want %q", p.ContentLanguage, "mixed")
	}
	if p.BestPostingWindow != "19:00-22:00" {
		t.Errorf("BestPostingWindow = %q, want %q", p.BestPostingWindow, "19:00-22:00")
	}
	if !p.PostingWindowAvailable {
		t.Error("PostingWindowAvailable = false, want true")
	}
	if p.Growth == nil || *p.Growth != 0 {
		t.Errorf("Growth = %v, want 0", p.Growth)
	}
	if !p.GrowthAvailable {
		t.Error("GrowthAvailable = false, want true")
	}

	expectedSaveRate := float64(50+100) / float64(500+1000)
	if p.SaveRate != expectedSaveRate {
		t.Errorf("SaveRate = %f, want %f", p.SaveRate, expectedSaveRate)
	}
	expectedShareRate := float64(25+50) / float64(500+1000)
	if p.ShareRate != expectedShareRate {
		t.Errorf("ShareRate = %f, want %f", p.ShareRate, expectedShareRate)
	}

	if len(p.TopPosts) != 2 {
		t.Fatalf("TopPosts len = %d, want 2", len(p.TopPosts))
	}
	if p.TopPosts[0].MediaID != "media2" {
		t.Errorf("TopPosts[0].MediaID = %q, want media2 (2000 views)", p.TopPosts[0].MediaID)
	}
	if p.TopPosts[0].Views != 2000 {
		t.Errorf("TopPosts[0].Views = %d, want 2000", p.TopPosts[0].Views)
	}

	if !p.DemographicsAvailable {
		t.Error("DemographicsAvailable = false, want true (500 >= 100 with top_cities)")
	}
	if len(p.TopCities) != 2 || p.TopCities[0] != "Mumbai" {
		t.Errorf("TopCities = %v, want [Mumbai Delhi]", p.TopCities)
	}

	if p.OverallScore != 88 {
		t.Errorf("OverallScore = %d, want 88", p.OverallScore)
	}
}

func TestBuildPayloadInsufficientData(t *testing.T) {
	t.Run("empty creator row", func(t *testing.T) {
		p := BuildPayload(nil, nil, nil, nil)
		if p.OverallScore != 0 {
			t.Errorf("OverallScore = %d, want 0", p.OverallScore)
		}
		if p.GrowthAvailable {
			t.Error("GrowthAvailable = true, want false")
		}
		if p.PostingWindowAvailable {
			t.Error("PostingWindowAvailable = true, want false")
		}
		if p.DemographicsAvailable {
			t.Error("DemographicsAvailable = true, want false")
		}
	})

	t.Run("single day point no growth", func(t *testing.T) {
		days := []insights.InsightDay{
			{Date: "2026-08-01", FollowerCount: ptrInt64(500)},
		}
		p := BuildPayload(map[string]any{}, nil, days, nil)
		if p.Growth != nil {
			t.Errorf("Growth = %v, want nil (single point)", p.Growth)
		}
		if p.GrowthAvailable {
			t.Error("GrowthAvailable = true, want false")
		}
	})

	t.Run("under 100 followers no demographics", func(t *testing.T) {
		creator := map[string]any{
			"follower_count": float64(50),
			"top_cities":     []any{"Mumbai"},
		}
		p := BuildPayload(creator, nil, nil, nil)
		if p.DemographicsAvailable {
			t.Error("DemographicsAvailable = true, want false (<100 followers)")
		}
	})
}

func TestTruncateCaption(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"short", "Hello", "Hello"},
		{"exactly 80", string(make([]rune, 80)), string(make([]rune, 80))},
		{"81 chars truncated", string(make([]rune, 81)), string(make([]rune, 80)) + "…"},
		{"empty", "", ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := truncateCaption(tc.input)
			if got != tc.want {
				t.Errorf("truncateCaption() len=%d, want len=%d", len([]rune(got)), len([]rune(tc.want)))
			}
		})
	}
}

func TestTopPosts(t *testing.T) {
	media := []insights.MediaItemWithInsights{
		{Media: insights.MediaItem{ID: "a", Caption: "post a"}, Insights: &insights.MediaInsights{Views: 100, Reach: 200}},
		{Media: insights.MediaItem{ID: "b", Caption: "post b"}, Insights: &insights.MediaInsights{Views: 300, Reach: 400}},
		{Media: insights.MediaItem{ID: "c", Caption: "post c"}, Insights: &insights.MediaInsights{Views: 200, Reach: 500}},
		{Media: insights.MediaItem{ID: "d", Caption: "post d"}, Insights: &insights.MediaInsights{Views: 50, Reach: 100}},
	}

	posts := topPosts(media, 3)
	if len(posts) != 3 {
		t.Fatalf("topPosts len = %d, want 3", len(posts))
	}
	if posts[0].MediaID != "b" {
		t.Errorf("topPosts[0].MediaID = %q, want b (300 views)", posts[0].MediaID)
	}
	if posts[1].MediaID != "c" {
		t.Errorf("topPosts[1].MediaID = %q, want c (200 views)", posts[1].MediaID)
	}
	if posts[2].MediaID != "a" {
		t.Errorf("topPosts[2].MediaID = %q, want a (100 views)", posts[2].MediaID)
	}
}

func TestTopPostsFallbackToReach(t *testing.T) {
	media := []insights.MediaItemWithInsights{
		{Media: insights.MediaItem{ID: "a"}, Insights: &insights.MediaInsights{Views: 0, Reach: 500}},
		{Media: insights.MediaItem{ID: "b"}, Insights: &insights.MediaInsights{Views: 0, Reach: 1000}},
	}

	posts := topPosts(media, 2)
	if posts[0].MediaID != "b" {
		t.Errorf("topPosts[0].MediaID = %q, want b (reach 1000)", posts[0].MediaID)
	}
}
