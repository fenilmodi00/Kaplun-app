# api/campaign_templates.py
"""Static campaign templates for the comment-automation builder.

Ported (MIT) from openreply's lib/templates/campaign-templates.ts.
Each template is a dict with slug, title, keywords, and dm_message.
Tapping a template in the builder pre-fills the form fields."""

CAMPAIGN_TEMPLATES: list[dict] = [
    {
        "slug": "dtc-product-link",
        "title": "DTC Product Link Drop",
        "keywords": ["LINK", "SHOP", "BUY"],
        "dm_message": "Hey {username}, here is the product link you asked for: https://yourstore.com/product",
    },
    {
        "slug": "real-estate-lead-form",
        "title": "Real Estate Lead Form",
        "keywords": ["HOME", "LISTING", "VALUE"],
        "dm_message": "Hey {username}, here is the form to get the property details and next available showing slots: https://yourlink.com/home",
    },
    {
        "slug": "fitness-plan",
        "title": "Fitness Plan Download",
        "keywords": ["PLAN", "FIT", "START"],
        "dm_message": "Hey {username}, here is the free plan from the reel: https://yourlink.com/fitness-plan",
    },
    {
        "slug": "course-webinar",
        "title": "Course Webinar Invite",
        "keywords": ["WEBINAR", "CLASS", "LEARN"],
        "dm_message": "Hey {username}, here is the free class registration link: https://yourlink.com/webinar",
    },
    {
        "slug": "beauty-price-list",
        "title": "Beauty Service Price List",
        "keywords": ["PRICE", "MENU", "BOOK"],
        "dm_message": "Hey {username}, here is our service menu and booking link: https://yourlink.com/booking",
    },
    {
        "slug": "restaurant-menu",
        "title": "Restaurant Menu And Reservation",
        "keywords": ["MENU", "TABLE", "RESERVE"],
        "dm_message": "Hey {username}, here is our menu and reservation link: https://yourlink.com/menu",
    },
    {
        "slug": "event-rsvp",
        "title": "Event RSVP Campaign",
        "keywords": ["RSVP", "TICKET", "JOIN"],
        "dm_message": "Hey {username}, here is the RSVP link with event details: https://yourlink.com/rsvp",
    },
    {
        "slug": "creator-media-kit",
        "title": "Creator Media Kit Reply",
        "keywords": ["COLLAB", "KIT", "RATES"],
        "dm_message": "Hey {username}, here is my media kit and partnership form: https://yourlink.com/media-kit",
    },
]
