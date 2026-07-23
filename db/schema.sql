PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS brand_briefs (
    id INTEGER PRIMARY KEY,
    raw_brief TEXT NOT NULL,
    parsed_brief TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaign_suggestions (
    id INTEGER PRIMARY KEY,
    brief_id INTEGER NOT NULL REFERENCES brand_briefs(id),
    creator_username TEXT NOT NULL,
    fit_score REAL,
    match_reason TEXT,
    outreach_message TEXT,
    campaign_ideas TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY,
    brief_id INTEGER NOT NULL REFERENCES brand_briefs(id),
    creator_username TEXT NOT NULL,
    thread_id TEXT,
    status TEXT NOT NULL CHECK(status IN ('outreach_sent','replied','negotiating','declined','accepted','contract_sent','expired')),
    last_message_text TEXT,
    last_message_direction TEXT CHECK(last_message_direction IN ('sent','received')),
    negotiation_history TEXT DEFAULT NULL,
    agreed_rate REAL,
    last_message_count INTEGER DEFAULT 0,
    reminder_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    creator_username TEXT NOT NULL,
    brand_name TEXT,
    contract_text TEXT NOT NULL,
    contract_type TEXT CHECK(contract_type IN ('barter','paid','affiliate')),
    deliverables TEXT DEFAULT NULL,
    usage_rights TEXT,
    timeline TEXT,
    asci_compliant INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dm_log (
    id INTEGER PRIMARY KEY,
    creator_username TEXT NOT NULL,
    thread_id TEXT,
    message_text TEXT,
    direction TEXT CHECK(direction IN ('sent','received')),
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);