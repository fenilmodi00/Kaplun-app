/**
 * Instagram OAuth flow helper.
 *
 * Opens Instagram's OAuth authorization page via expo-web-browser,
 * then checks the redirect URL for success/error status.
 *
 * The callback URL processes the code server-side and redirects back
 * to the app's deep link with ?status=success or ?status=error.
 *
 * In Expo Go: uses exp://host:port (no path) to avoid "Failed to download update" error
 * In production: uses kaplun://instagram-callback
 */

import { openAuthSessionAsync } from 'expo-web-browser';
import * as Linking from 'expo-linking';

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

/**
 * Returns the deep link URL for the OAuth callback.
 *
 * In Expo Go: exp://192.168.0.103:8081 (base URL only, no path — avoids
 *   "Failed to download update" error when Expo Go tries to interpret
 *   the /--/ path as a route to load)
 * In production: kaplun://instagram-callback
 */
function getRedirectDeepLink(): string {
  const fullUrl = Linking.createURL('instagram-callback');
  // For exp:// URLs in Expo Go, strip the path to just the base URL.
  // This prevents Expo Go from trying to download a bundle for the path.
  if (fullUrl.startsWith('exp://')) {
    try {
      const parsed = new URL(fullUrl);
      return `exp://${parsed.host}`;
    } catch {
      return fullUrl;
    }
  }
  return fullUrl;
}

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
  const redirectDeepLink = getRedirectDeepLink();

  const state = JSON.stringify({
    clerk_id: clerkId,
    uid: appwriteUserId,
    redirect_url: redirectDeepLink,
  });

  const params = new URLSearchParams({
    client_id: IG_APP_ID!,
    redirect_uri: IG_OAUTH_REDIRECT_URI!,
    response_type: 'code',
    scope: SCOPES.join(','),
    state,
  });

  const authUrl = `${IG_AUTHORIZE_URL}?${params.toString()}`;

  const result = await openAuthSessionAsync(authUrl, redirectDeepLink);

  // In Expo Go on Android, the auth session may return 'dismiss' or 'cancel'
  // when the browser redirects to exp:// (because Expo Go intercepts the URL).
  // We treat any non-cancel result as potentially successful and let the
  // caller verify by calling fetchProfile().
  if (result.type === 'cancel') {
    throw new Error('Instagram OAuth was cancelled');
  }

  // If we got a success result with a URL, try to parse the status
  if (result.type === 'success' && result.url) {
    const cleanUrl = result.url.replace(/#_$/, '');
    let parsedUrl: URL | null = null;
    try {
      parsedUrl = new URL(cleanUrl);
    } catch {
      // URL parsing failed — fall through to optimistic success
    }

    if (parsedUrl) {
      const status = parsedUrl.searchParams.get('status');

      if (status === 'success') {
        return true;
      }

      if (status === 'error') {
        const message = parsedUrl.searchParams.get('message');
        throw new Error(message || 'Instagram connection failed');
      }
    }
  }

  // In Expo Go, the auth session often returns 'dismiss' when the browser
  // redirects to exp:// (because Expo Go intercepts the URL as an intent).
  // We treat this as a likely success — the caller should verify by
  // calling fetchProfile() to check if the connection actually worked.
  return true;
}
