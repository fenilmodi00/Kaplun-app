/**
 * Instagram OAuth flow helper.
 *
 * Opens Instagram's OAuth authorization page via expo-web-browser,
 * then checks the redirect URL for success/error status.
 *
 * The callback URL (https://ig-oauth-callback.sgp.appwrite.run/) processes
 * the code server-side and redirects back to kaplun://instagram-callback
 * with ?status=success or ?status=error.
 */

import { openAuthSessionAsync } from 'expo-web-browser';

const IG_APP_ID = process.env.EXPO_PUBLIC_IG_APP_ID;
const IG_OAUTH_REDIRECT_URI = process.env.EXPO_PUBLIC_IG_OAUTH_REDIRECT_URI;

if (!IG_APP_ID) {
  throw new Error(
    'EXPO_PUBLIC_IG_APP_ID is not set. Add it to your .env file (your Instagram App ID from Meta Developer Portal).'
  );
}

if (!IG_OAUTH_REDIRECT_URI) {
  throw new Error(
    'EXPO_PUBLIC_IG_OAUTH_REDIRECT_URI is not set. Add it to your .env file (the HTTPS callback URL registered with Meta).'
  );
}

const IG_AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';

const SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
  'instagram_business_manage_comments',
  'instagram_business_manage_messages',
  'instagram_business_manage_insights',
];

const REDIRECT_DEEP_LINK = 'kaplun://instagram-callback';

/**
 * Opens Instagram's OAuth authorization page and returns the auth code.
 *
 * @param clerkId - Clerk user ID (passed in `state` for the callback to identify the user)
 * @param appwriteUserId - Appwrite user ID (passed in `state` for row permissions)
 * @returns true on successful connection
 * @throws Error if the user cancels the flow or the connection failed
 */
export async function startInstagramOAuth(
  clerkId: string,
  appwriteUserId: string
): Promise<boolean> {
  const state = JSON.stringify({
    clerk_id: clerkId,
    uid: appwriteUserId,
  });

  const params = new URLSearchParams({
    client_id: IG_APP_ID!,
    redirect_uri: IG_OAUTH_REDIRECT_URI!,
    response_type: 'code',
    scope: SCOPES.join(','),
    state,
  });

  const authUrl = `${IG_AUTHORIZE_URL}?${params.toString()}`;

  const result = await openAuthSessionAsync(authUrl, REDIRECT_DEEP_LINK);

  if (result.type === 'dismiss' || result.type === 'cancel') {
    throw new Error('Instagram OAuth was cancelled');
  }

  if (result.type !== 'success' || !result.url) {
    throw new Error('Instagram OAuth failed: unexpected result type');
  }

  // Instagram appends `#_` to the redirect URL — strip it before parsing
  const cleanUrl = result.url.replace(/#_$/, '');
  const parsedUrl = new URL(cleanUrl);
  const status = parsedUrl.searchParams.get('status');

  if (status === 'success') {
    return true;
  }

  if (status === 'error') {
    const message = parsedUrl.searchParams.get('message');
    throw new Error(message || 'Instagram connection failed');
  }

  throw new Error('Instagram OAuth failed: unexpected redirect status');
}
