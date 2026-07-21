export interface DealContext {
  budget: number;
  deliverables: string[];
  timeline: string;
  notes?: string;
}

export interface Creator {
  $id?: string;
  ig_user_id: string;
  ig_username: string;
  ig_scoped_id: string;
  full_name: string;
  profile_pic_url: string;
  bio: string;
  follower_count: number;
  following_count: number;
  media_count: number;
  post_count: number;
  is_verified: boolean;
  is_business: boolean;
  account_type: 'business' | 'creator' | 'personal';
  external_url: string;
  niche: string;
  creator_tier: 'emerging_viral' | 'established_micro' | 'growing_nano' | 'premium_mid';
  detected_language: string;
  language_hint: string;
  region: string;
  detected_region: string;
  has_brand_experience: boolean;
  has_brand_signals: boolean;
  brand_signal_count: number;
  avg_reel_views: number;
  avg_views: number;
  engagement_rate: number;
  reach_ratio: number;
  access_token: string;
  token_expires_at: string;
  is_onboarded: boolean;
  clerk_user_id: string;
  username: string;
  created_at: string;
  last_synced_at: string;
}

export interface DealThread {
  $id?: string;
  thread_id: string;
  ig_user_id: string;
  ig_username: string;
  status: 'invited' | 'negotiating' | 'contracted' | 'content_pending' | 'live' | 'completed' | 'declined';
  campaign_title: string;
  deal_context: DealContext;
  agent_assigned: string;
  context_summary: string;
  last_message_at: string;
  unread_count: number;
  created_at: string;
}

export interface Message {
  $id?: string;
  message_id: string;
  thread_id: string;
  sender_type: 'creator' | 'agent' | 'brand' | 'system';
  body: string;
  attachments: string;
  agent_name: string | null;
  is_read: boolean;
  timestamp: string;
}

export interface Deal {
  $id?: string;
  deal_id: string;
  thread_id: string;
  brand_name: string;
  budget: number;
  deliverables: string[];
  posting_dates: string[];
  revision_count: number;
  payment_status: 'pending' | 'escrow' | 'released';
  contract_url: string;
  status: 'draft' | 'pending' | 'active' | 'completed' | 'cancelled';
}
