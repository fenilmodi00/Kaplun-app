import { useState, useCallback, useRef } from 'react';
import { useSignIn, useSignUp, useOAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';

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

interface UseAuthFlowReturn {
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

function clerkErr(err: any): string {
  return (
    err?.errors?.[0]?.longMessage ||
    err?.errors?.[0]?.message ||
    err?.longMessage ||
    err?.message ||
    'Something went wrong'
  );
}

export function useAuthFlow(): UseAuthFlowReturn {
  const router = useRouter();
  const { signIn, isLoaded: signInLoaded } = useSignIn();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();
  const { startOAuthFlow } = useOAuth({ strategy: 'oauth_google' });

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

  const setMode = useCallback((mode: AuthMode) => {
    setState((s) => ({ ...s, mode, step: 'idle', error: null }));
  }, []);

  const setLoading = useCallback((isLoading: boolean) => {
    setState((s) => ({ ...s, isLoading }));
  }, []);

  const navigateHome = useCallback(() => {
    router.replace('/(tabs)/(home)');
  }, [router]);

  const submitEmailPassword = useCallback(async (email: string, password: string) => {
    if (!signUpLoaded || !signUp) return;
    setLoading(true);
    setState((s) => ({ ...s, error: null }));
    emailRef.current = email;
    passwordRef.current = password;

    const future = signUp.__internal_future;
    const { error } = await future.password({ emailAddress: email, password });
    if (error) {
      setState((s) => ({ ...s, step: 'error', error: clerkErr(error) }));
      setLoading(false);
      return;
    }

    if (signUp.status === 'complete') {
      const { error: finErr } = await future.finalize({ navigate: () => navigateHome() });
      if (finErr) {
        setState((s) => ({ ...s, step: 'error', error: clerkErr(finErr) }));
      } else {
        setState((s) => ({ ...s, step: 'complete' }));
      }
      setLoading(false);
      return;
    }

    const { error: sendErr } = await future.verifications.sendEmailCode();
    if (sendErr) {
      setState((s) => ({ ...s, step: 'error', error: clerkErr(sendErr) }));
      setLoading(false);
      return;
    }

    setState((s) => ({
      ...s,
      step: 'otp-sent',
      email,
      pendingIdentifier: email,
    }));
    setLoading(false);
  }, [signUpLoaded, signUp, setLoading, navigateHome]);

  const submitEmailOTP = useCallback(async (email: string) => {
    if (!signInLoaded || !signIn) return;
    setLoading(true);
    setState((s) => ({ ...s, error: null }));
    emailRef.current = email;

    const future = signIn.__internal_future;
    const { error } = await future.create({ identifier: email, strategy: 'email_code' });
    if (error) {
      setState((s) => ({ ...s, step: 'error', error: clerkErr(error) }));
      setLoading(false);
      return;
    }

    if (signIn.status === 'complete') {
      const { error: finErr } = await future.finalize({ navigate: () => navigateHome() });
      if (finErr) {
        setState((s) => ({ ...s, step: 'error', error: clerkErr(finErr) }));
      } else {
        setState((s) => ({ ...s, step: 'complete' }));
      }
      setLoading(false);
      return;
    }

    const { error: sendErr } = await future.emailCode.sendCode();
    if (sendErr) {
      setState((s) => ({ ...s, step: 'error', error: clerkErr(sendErr) }));
      setLoading(false);
      return;
    }

    setState((s) => ({
      ...s,
      step: 'otp-sent',
      email,
      pendingIdentifier: email,
    }));
    setLoading(false);
  }, [signInLoaded, signIn, setLoading, navigateHome]);

  const submitOTP = useCallback(async (code: string) => {
    if (!signInLoaded && !signUpLoaded) return;
    setLoading(true);
    setState((s) => ({ ...s, error: null }));

    if (state.mode === 'signup' && signUp) {
      const future = signUp.__internal_future;
      const { error } = await future.verifications.verifyEmailCode({ code });
      if (error) {
        setState((s) => ({ ...s, step: 'otp-sent', error: clerkErr(error) }));
        setLoading(false);
        return;
      }

      if (signUp.status !== 'complete') {
        setState((s) => ({
          ...s,
          step: 'otp-sent',
          error: 'Verification incomplete. Please try again.',
        }));
        setLoading(false);
        return;
      }

      const { error: finErr } = await future.finalize({ navigate: () => navigateHome() });
      if (finErr) {
        setState((s) => ({ ...s, step: 'otp-sent', error: clerkErr(finErr) }));
      } else {
        setState((s) => ({ ...s, step: 'complete' }));
      }
    } else if (signIn) {
      const future = signIn.__internal_future;
      const { error } = await future.emailCode.verifyCode({ code });
      if (error) {
        setState((s) => ({ ...s, step: 'otp-sent', error: clerkErr(error) }));
        setLoading(false);
        return;
      }

      if (signIn.status !== 'complete') {
        setState((s) => ({
          ...s,
          step: 'otp-sent',
          error: 'Verification incomplete. Please try again.',
        }));
        setLoading(false);
        return;
      }

      const { error: finErr } = await future.finalize({ navigate: () => navigateHome() });
      if (finErr) {
        setState((s) => ({ ...s, step: 'otp-sent', error: clerkErr(finErr) }));
      } else {
        setState((s) => ({ ...s, step: 'complete' }));
      }
    }

    setLoading(false);
  }, [state.mode, signInLoaded, signUpLoaded, signIn, signUp, setLoading, navigateHome]);

  const resendOTP = useCallback(async () => {
    if (!emailRef.current) return;
    setLoading(true);
    setState((s) => ({ ...s, error: null }));

    if (state.mode === 'signup' && signUp) {
      const { error } = await signUp.__internal_future.verifications.sendEmailCode();
      if (error) setState((s) => ({ ...s, error: clerkErr(error) }));
    } else if (signIn) {
      const { error } = await signIn.__internal_future.emailCode.sendCode();
      if (error) setState((s) => ({ ...s, error: clerkErr(error) }));
    }

    setLoading(false);
  }, [state.mode, signIn, signUp, setLoading]);

  const loginWithGoogle = useCallback(async () => {
    setLoading(true);
    setState((s) => ({ ...s, error: null }));

    try {
      const { createdSessionId, setActive } = await startOAuthFlow();
      if (createdSessionId) {
        await setActive!({ session: createdSessionId });
        setState((s) => ({ ...s, step: 'complete' }));
        navigateHome();
      } else {
        setState((s) => ({ ...s, error: 'Google sign-in was cancelled' }));
      }
    } catch (err: any) {
      setState((s) => ({ ...s, error: clerkErr(err) }));
    } finally {
      setLoading(false);
    }
  }, [startOAuthFlow, setLoading, navigateHome]);

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
