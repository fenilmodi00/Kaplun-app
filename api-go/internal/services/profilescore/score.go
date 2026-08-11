package profilescore

import "math"

// Sub-score weights. When a sub-score is unavailable, its weight is
// redistributed proportionally across the available sub-scores.
const (
	WeightEngagement = 0.30
	WeightCadence    = 0.20
	WeightGrowth     = 0.20
	WeightFunnel     = 0.15
	WeightPosting    = 0.15
)

// SubScore is one band of the overall profile score.
type SubScore struct {
	Value     int     `json:"value"`
	Weight    float64 `json:"weight"`
	Available bool    `json:"available"`
}

// MetricsPayload is the compact, deterministic data bundle the score
// calculator and the LLM coach both consume. All Available flags must be
// false when the underlying data is missing.
type MetricsPayload struct {
	FollowersCount int64 `json:"followers_count"`
	FollowingCount int64 `json:"following_count"`
	PostCount      int64 `json:"post_count"`

	EngagementRate      float64 `json:"engagement_rate"`
	AvgReelViews        int64   `json:"avg_reel_views"`
	MedianReelViews     int64   `json:"median_reel_views"`
	ReelsCount30Days    int     `json:"reels_count_30_days"`
	ReelsCount7Days     int     `json:"reels_count_7_days"`
	LastPostDays        int     `json:"last_post_days"`
	ContentFrequencyDays float64 `json:"content_frequency_days"`
	AvgLikes            int64   `json:"avg_likes"`
	AvgComments         int64   `json:"avg_comments"`
	MaxLikes            int64   `json:"max_likes"`

	ProfileViewsWindow     int64 `json:"profile_views_window"`
	ProfileLinkTapsWindow  int64 `json:"profile_link_taps_window"`

	SaveRate  float64 `json:"save_rate"`
	ShareRate float64 `json:"share_rate"`

	Growth          *int64 `json:"growth,omitempty"`
	GrowthAvailable bool   `json:"growth_available"`

	BestPostingWindow     string `json:"best_posting_window"`
	PostingWindowAvailable bool   `json:"posting_window_available"`

	ContentLanguage string `json:"content_language"`

	TopCities         []string `json:"top_cities,omitempty"`
	TopAgeGroups      []string `json:"top_age_groups,omitempty"`
	TopGenderAgePairs []string `json:"top_gender_age_pairs,omitempty"`
	DemographicsAvailable bool `json:"demographics_available"`

	TopPosts []TopPost `json:"top_posts,omitempty"`

	SubScores struct {
		Engagement SubScore `json:"engagement"`
		Cadence    SubScore `json:"cadence"`
		Growth     SubScore `json:"growth"`
		Funnel     SubScore `json:"funnel"`
		Posting    SubScore `json:"posting"`
	} `json:"sub_scores"`

	OverallScore int `json:"overall_score"`
}

// TopPost is one of the top-3 media items by views.
type TopPost struct {
	MediaID    string `json:"media_id"`
	Caption    string `json:"caption"`
	Views      int64  `json:"views"`
	Reach      int64  `json:"reach"`
	Likes      int64  `json:"likes"`
	Comments   int64  `json:"comments"`
	Permalink  string `json:"permalink"`
	PostedAt   string `json:"posted_at"`
	MediaType  string `json:"media_type"`
}

// ComputeScore calculates the deterministic 0–100 overall score from a
// MetricsPayload. Sub-scores that are unavailable have their weight
// redistributed proportionally across the available sub-scores.
func ComputeScore(p *MetricsPayload) int {
	if p == nil {
		return 0
	}

	subs := computeSubScores(p)

	totalWeight := 0.0
	weightedSum := 0.0
	for _, s := range []SubScore{subs.Engagement, subs.Cadence, subs.Growth, subs.Funnel, subs.Posting} {
		if s.Available {
			totalWeight += s.Weight
			weightedSum += float64(s.Value) * s.Weight
		}
	}

	if totalWeight == 0 {
		return 0
	}

	score := math.Round(weightedSum / totalWeight)
	if score < 0 {
		score = 0
	}
	if score > 100 {
		score = 100
	}
	return int(score)
}

// computeSubScores derives each 0–100 sub-score from the payload fields.
// The sub-score structs are also stamped onto the payload so callers can
// inspect the band breakdown.
func computeSubScores(p *MetricsPayload) struct {
	Engagement SubScore
	Cadence    SubScore
	Growth     SubScore
	Funnel     SubScore
	Posting    SubScore
} {
	var out struct {
		Engagement SubScore
		Cadence    SubScore
		Growth     SubScore
		Funnel     SubScore
		Posting    SubScore
	}

	// Engagement (~30%): engagement_rate vs. follower-tier benchmarks.
	// Benchmarks: <1K followers → 8% good, 1K–10K → 6%, 10K–100K → 4%, >100K → 2.5%.
	out.Engagement = SubScore{Weight: WeightEngagement, Available: false}
	if p.EngagementRate > 0 {
		benchmark := 0.025
		if p.FollowersCount < 1000 {
			benchmark = 0.08
		} else if p.FollowersCount < 10000 {
			benchmark = 0.06
		} else if p.FollowersCount < 100000 {
			benchmark = 0.04
		}
		ratio := p.EngagementRate / benchmark
		v := int(math.Round(ratio * 100))
		if v > 100 {
			v = 100
		}
		out.Engagement.Value = v
		out.Engagement.Available = true
	}

	// Cadence (~20%): content_frequency_days + last_post_days.
	// Regular posting (freq ≤3 days, last post ≤3 days) = high.
	out.Cadence = SubScore{Weight: WeightCadence, Available: false}
	if p.ContentFrequencyDays > 0 || p.LastPostDays > 0 {
		freqScore := 100.0
		if p.ContentFrequencyDays > 0 {
			// ≤2 days → 100, ≥14 days → 0, linear between.
			freqScore = math.Max(0, 100*(1-(p.ContentFrequencyDays-2)/12))
		}
		recencyScore := 100.0
		if p.LastPostDays > 0 {
			// ≤1 day → 100, ≥14 days → 0, linear between.
			recencyScore = math.Max(0, 100*(1-float64(p.LastPostDays-1)/13))
		}
		v := int(math.Round((freqScore + recencyScore) / 2))
		if v > 100 {
			v = 100
		}
		out.Cadence.Value = v
		out.Cadence.Available = true
	}

	// Growth (~20%): follower_count delta over day series.
	out.Growth = SubScore{Weight: WeightGrowth, Available: false}
	if p.GrowthAvailable && p.Growth != nil {
		// Normalize growth against follower base.
		// >5% growth → 100, 0% → 50, <-5% → 0, linear.
		base := float64(p.FollowersCount)
		if base > 0 {
			pct := float64(*p.Growth) / base
			v := int(math.Round(50 + pct*1000))
			if v > 100 {
				v = 100
			}
			if v < 0 {
				v = 0
			}
			out.Growth.Value = v
			out.Growth.Available = true
		}
	}

	// Funnel (~15%): profile_views + link_taps, reach-normalized.
	out.Funnel = SubScore{Weight: WeightFunnel, Available: false}
	if p.ProfileViewsWindow > 0 {
		// CTR = link_taps / profile_views. 10% CTR → 100, 0% → 0.
		ctr := float64(p.ProfileLinkTapsWindow) / float64(p.ProfileViewsWindow)
		v := int(math.Round(ctr * 1000))
		if v > 100 {
			v = 100
		}
		out.Funnel.Value = v
		out.Funnel.Available = true
	}

	// Posting window (~15%): best posting window availability.
	out.Posting = SubScore{Weight: WeightPosting, Available: false}
	if p.PostingWindowAvailable && p.BestPostingWindow != "" {
		out.Posting.Value = 100
		out.Posting.Available = true
	}

	p.SubScores.Engagement = out.Engagement
	p.SubScores.Cadence = out.Cadence
	p.SubScores.Growth = out.Growth
	p.SubScores.Funnel = out.Funnel
	p.SubScores.Posting = out.Posting

	return out
}
