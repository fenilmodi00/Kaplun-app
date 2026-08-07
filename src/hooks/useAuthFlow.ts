import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ID, OAuthProvider } from 'appwrite';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { account } from '@/lib/appwrite';
import { persistSession } from '@/lib/auth-session';

export type AuthMode = 'login' | 'signup';
export type AuthStep = 'idle' | 'otp-sent' | 'verifying' | 'complete' | 'error';

interface AuthState {
  mode: AuthMode;
  step: AuthStep;
  error: string | null;
  isLoading: boolean;
  email: string;
  pendingIdentifier: string | null;
}

export interface UseAuthFlowReturn {
  mode: AuthMode;
  step: AuthStep;
  error: string | null;
  isLoading: boolean;
  email: string;
  setMode: (mode: AuthMode) => void;
  submitEmailPassword: (email: string, password: string) => Promise<void>;
  submitEmailOTP: (email: string) => Promise<void>;
  submitOTP: (code: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  resendOTP: () => Promise<void>;
}

function authErr(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

export function useAuthFlow(): UseAuthFlowReturn {
  const router = useRouter();

  const [state, setState] = useState<AuthState>({
    mode: 'login',
    step: 'idle',
    error: null,
    isLoading: false,
    email: '',
    pendingIdentifier: null,
  });

  const emailRef = useRef('');
  const passwordRef = useRef('');
  const userIdRef = useRef('');

  const setMode = useCallback((mode: AuthMode) => {
    setState((s) => ({ ...s, mode, step: 'idle', error: null }));
  }, []);

  const setLoading = useCallback((isLoading: boolean) => {
    setState((s) => ({ ...s, isLoading }));
  }, []);

  const navigateHome = useCallback(() => {
    router.replace('/(tabs)/(home)');
  }, [router]);

  const submitEmailPassword = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      setState((s) => ({ ...s, error: null }));
      emailRef.current = email;
      passwordRef.current = password;

      try {
        const userId = ID.unique();
        await account.create({ userId, email, password });
        const token = await account.createEmailToken({ userId, email });
        userIdRef.current = token.userId;
        setState((s) => ({
          ...s,
          step: 'otp-sent',
          email,
          pendingIdentifier: email,
        }));
      } catch (err: unknown) {
        setState((s) => ({ ...s, step: 'error', error: authErr(err) }));
      } finally {
        setLoading(false);
      }
    },
    [setLoading],
  );

  const submitEmailOTP = useCallback(
    async (email: string) => {
      setLoading(true);
      setState((s) => ({ ...s, error: null }));
      emailRef.current = email;

      try {
        const userId = ID.unique();
        const token = await account.createEmailToken({ userId, email });
        userIdRef.current = token.userId;
        setState((s) => ({
          ...s,
          step: 'otp-sent',
          email,
          pendingIdentifier: email,
        }));
      } catch (err: unknown) {
        setState((s) => ({ ...s, step: 'error', error: authErr(err) }));
      } finally {
        setLoading(false);
      }
    },
    [setLoading],
  );

  const submitOTP = useCallback(
    async (code: string) => {
      setLoading(true);
      setState((s) => ({ ...s, error: null }));

      try {
        const session = await account.createSession({
          userId: userIdRef.current,
          secret: code,
        });
        await persistSession(session);
        setState((s) => ({ ...s, step: 'complete' }));
        navigateHome();
      } catch (err: unknown) {
        setState((s) => ({ ...s, step: 'otp-sent', error: authErr(err) }));
      } finally {
        setLoading(false);
      }
    },
    [setLoading, navigateHome],
  );

  const resendOTP = useCallback(async () => {
    if (!emailRef.current) return;
    setLoading(true);
    setState((s) => ({ ...s, error: null }));

    try {
      const userId = userIdRef.current || ID.unique();
      const token = await account.createEmailToken({
        userId,
        email: emailRef.current,
      });
      userIdRef.current = token.userId;
    } catch (err: unknown) {
      setState((s) => ({ ...s, error: authErr(err) }));
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  const loginWithGoogle = useCallback(async () => {
    setLoading(true);
    setState((s) => ({ ...s, error: null }));

    try {
      const deepLink = makeRedirectUri({
        preferLocalhost: true,
        scheme: 'kaplun',
      });
      const loginUrl = account.createOAuth2Token({
        provider: OAuthProvider.Google,
        success: deepLink,
        failure: deepLink,
      });

      if (!loginUrl || typeof loginUrl !== 'string') {
        setState((s) => ({ ...s, error: 'Failed to start Google sign-in' }));
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(loginUrl, 'kaplun://');
      if (result.type === 'cancel' || result.type === 'dismiss') {
        setState((s) => ({ ...s, error: 'Google sign-in was cancelled' }));
        return;
      }

      if (result.type !== 'success' || !result.url) {
        setState((s) => ({ ...s, error: 'Google sign-in failed' }));
        return;
      }

      const url = new URL(result.url);
      const userId = url.searchParams.get('userId');
      const secret = url.searchParams.get('secret');

      if (!userId || !secret) {
        setState((s) => ({ ...s, error: 'Google sign-in failed' }));
        return;
      }

      const session = await account.createSession({ userId, secret });
      await persistSession(session);
      setState((s) => ({ ...s, step: 'complete' }));
      navigateHome();
    } catch (err: unknown) {
      setState((s) => ({ ...s, error: authErr(err) }));
    } finally {
      setLoading(false);
    }
  }, [setLoading, navigateHome]);

  return {
    mode: state.mode,
    step: state.step,
    error: state.error,
    isLoading: state.isLoading,
    email: state.email,
    setMode,
    submitEmailPassword,
    submitEmailOTP,
    submitOTP,
    loginWithGoogle,
    resendOTP,
  };
}
