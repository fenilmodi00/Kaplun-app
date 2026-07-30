package templates

// CampaignTemplate is a static builder preset matching Expo CampaignTemplate.
type CampaignTemplate struct {
	Slug      string   `json:"slug"`
	Title     string   `json:"title"`
	Keywords  []string `json:"keywords"`
	DMMessage string   `json:"dm_message"`
}

// CampaignTemplates mirrors api/campaign_templates.py CAMPAIGN_TEMPLATES.
var CampaignTemplates = []CampaignTemplate{
	{
		Slug:      "dtc-product-link",
		Title:     "DTC Product Link Drop",
		Keywords:  []string{"LINK", "SHOP", "BUY"},
		DMMessage: "Hey {username}, here is the product link you asked for: https://yourstore.com/product",
	},
	{
		Slug:      "real-estate-lead-form",
		Title:     "Real Estate Lead Form",
		Keywords:  []string{"HOME", "LISTING", "VALUE"},
		DMMessage: "Hey {username}, here is the form to get the property details and next available showing slots: https://yourlink.com/home",
	},
	{
		Slug:      "fitness-plan",
		Title:     "Fitness Plan Download",
		Keywords:  []string{"PLAN", "FIT", "START"},
		DMMessage: "Hey {username}, here is the free plan from the reel: https://yourlink.com/fitness-plan",
	},
	{
		Slug:      "course-webinar",
		Title:     "Course Webinar Invite",
		Keywords:  []string{"WEBINAR", "CLASS", "LEARN"},
		DMMessage: "Hey {username}, here is the free class registration link: https://yourlink.com/webinar",
	},
	{
		Slug:      "beauty-price-list",
		Title:     "Beauty Service Price List",
		Keywords:  []string{"PRICE", "MENU", "BOOK"},
		DMMessage: "Hey {username}, here is our service menu and booking link: https://yourlink.com/booking",
	},
	{
		Slug:      "restaurant-menu",
		Title:     "Restaurant Menu And Reservation",
		Keywords:  []string{"MENU", "TABLE", "RESERVE"},
		DMMessage: "Hey {username}, here is our menu and reservation link: https://yourlink.com/menu",
	},
	{
		Slug:      "event-rsvp",
		Title:     "Event RSVP Campaign",
		Keywords:  []string{"RSVP", "TICKET", "JOIN"},
		DMMessage: "Hey {username}, here is the RSVP link with event details: https://yourlink.com/rsvp",
	},
	{
		Slug:      "creator-media-kit",
		Title:     "Creator Media Kit Reply",
		Keywords:  []string{"COLLAB", "KIT", "RATES"},
		DMMessage: "Hey {username}, here is my media kit and partnership form: https://yourlink.com/media-kit",
	},
}
