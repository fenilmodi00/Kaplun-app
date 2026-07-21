import { account } from './appwrite';

const API_BASE_URL = process.env.EXPO_PUBLIC_IG_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error(
    'EXPO_PUBLIC_IG_API_BASE_URL is not set. Add it to your .env file.'
  );
}

export async function createAppwriteSession(clerkToken: string) {
  const response = await fetch(`${API_BASE_URL}/auth/appwrite-session`, {
    headers: {
      Authorization: `Bearer ${clerkToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Bridge failed' }));
    throw new Error(error.message || 'Failed to create Appwrite session');
  }

  const { userId, secret } = await response.json();
  await account.createSession({ userId, secret });

  return { userId, secret };
}
