import type { Creator } from '@/lib/types';
import type { InstagramProfileResponse } from '@/lib/instagram';

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Map a Creator row from Appwrite TablesDB to the InstagramProfileResponse
 * shape the UI expects. Used as the source-of-truth after OAuth succeeds,
 * so the UI never blocks on the (sometimes slow / abortable) ig-api-proxy call.
 */
export function profileFromCreator(creator: Creator): InstagramProfileResponse {
  return {
    id: creator.ig_user_id || creator.$id || '',
    username: creator.username || creator.ig_username || '',
    name: creator.full_name || '',
    biography: creator.bio || '',
    website: creator.external_url,
    followers_count: creator.follower_count ?? 0,
    follows_count: creator.following_count ?? 0,
    media_count: creator.media_count ?? creator.post_count ?? 0,
    profile_picture_url: creator.profile_pic_url || '',
  };
}

export function hasUsableToken(creator: Creator | null): boolean {
  return !!creator?.access_token;
}

export function getInitials(name: string): string {
  return (
    name
      .split(' ')
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'K'
  );
}
