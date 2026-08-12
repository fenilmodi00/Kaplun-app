import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import {
  findNodeHandle,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  UIManager,
  useWindowDimensions,
} from 'react-native';
import type { TextInput as RNTextInput, View as RNView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Input, OtpInput, Text } from 'panelui-native';
import { Pressable, ScrollView, View, useCSSVariable } from '@/tw';
import { AnimatedView } from '@/tw/animated';
import { cn } from '@/tw/cn';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from '@/lib/reanimated-platform';
import { Reveal } from '@/components/ui/reveal';
import { useAuthFlow, AuthMode } from '@/hooks/useAuthFlow';
import { useShakeAnimation } from '@/tw/animated';

const TOGGLE_WIDTH = 280;
const PILL_WIDTH = TOGGLE_WIDTH / 2 - 3;
/** Field height (h-11). */
const INPUT_HEIGHT = 44;
/** Room for focused field + password field + submit button. */
const FIELD_STACK = INPUT_HEIGHT + 12 + INPUT_HEIGHT + 16 + INPUT_HEIGHT;

type AuthScrollApi = {
  ensureVisible: (target: RNView | RNTextInput | null) => void;
};
const AuthScrollContext = createContext<AuthScrollApi>({ ensureVisible: () => {} });

// ─── Capsule Toggle ───
function CapsuleToggle({ mode, onChange }: { mode: AuthMode; onChange: (m: AuthMode) => void }) {
  const translateX = useSharedValue(mode === 'login' ? 0 : PILL_WIDTH);

  useEffect(() => {
    translateX.value = withTiming(mode === 'login' ? 0 : PILL_WIDTH, {
      duration: 250,
      easing: Easing.out(Easing.cubic),
    });
  }, [mode, translateX]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      style={{ width: TOGGLE_WIDTH }}
      className="h-11 flex-row items-center self-center rounded-full bg-secondary p-[3px]"
    >
      <AnimatedView
        style={[pillStyle, { width: PILL_WIDTH }]}
        className="absolute left-[3px] h-[38px] rounded-full bg-primary"
      />
      {(['login', 'signup'] as AuthMode[]).map((m) => (
        <Pressable
          key={m}
          onPress={() => onChange(m)}
          className="z-10 h-[38px] flex-1 items-center justify-center"
          accessibilityRole="button"
          accessibilityState={{ selected: mode === m }}
        >
          <Text
            size="sm"
            weight="semibold"
            className={mode === m ? 'text-primary-foreground' : undefined}
          >
            {m === 'login' ? 'Log In' : 'Sign Up'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Email Input ───
function EmailField({ value, onChangeText }: { value: string; onChangeText: (v: string) => void }) {
  const inputRef = useRef<RNTextInput>(null);
  const { ensureVisible } = useContext(AuthScrollContext);

  return (
    <Input
      ref={inputRef}
      placeholder="Email address"
      value={value}
      onChangeText={onChangeText}
      autoCapitalize="none"
      keyboardType="email-address"
      autoComplete="email"
      textContentType="emailAddress"
      className="h-11 rounded-xl"
      onFocus={() => ensureVisible(inputRef.current)}
    />
  );
}

// ─── Password Input ───
function PasswordInput({ value, onChangeText }: { value: string; onChangeText: (v: string) => void }) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<RNTextInput>(null);
  const { ensureVisible } = useContext(AuthScrollContext);
  const muted = useCSSVariable('--color-muted-foreground') as string;

  return (
    <Input
      ref={inputRef}
      placeholder="Password (min 8 characters)"
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoComplete="new-password"
      textContentType="newPassword"
      className="h-11 rounded-xl"
      onFocus={() => ensureVisible(inputRef.current)}
      endContent={
        <Pressable
          onPress={() => setVisible((v) => !v)}
          className="h-11 w-11 items-center justify-center"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        >
          <Ionicons name={visible ? 'eye-off' : 'eye'} size={20} color={muted} />
        </Pressable>
      }
    />
  );
}

/** Shared shell: stay in safe area; dynamically scroll so input + submit button are above soft keyboard. */
function AuthShell({
  children,
  topPad,
  bottomPad,
  compact,
  safeTop,
}: {
  children: ReactNode;
  topPad: number;
  bottomPad: number;
  compact: boolean;
  safeTop: number;
}) {
  const canvas = useCSSVariable('--color-background') as string;
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardHeightRef = useRef(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = Keyboard.addListener(showEvent, (e) => {
      const h = Math.min(e.endCoordinates.height, FIELD_STACK + 36);
      keyboardHeightRef.current = e.endCoordinates.height;
      setKeyboardHeight(h);
    });

    const onHide = Keyboard.addListener(hideEvent, () => {
      keyboardHeightRef.current = 0;
      setKeyboardHeight(0);
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const ensureVisible = useCallback(
    (target: RNView | RNTextInput | null) => {
      if (!target || !scrollRef.current) return;

      const node = findNodeHandle(target);
      const scrollNode = findNodeHandle(scrollRef.current);
      if (node == null || scrollNode == null) return;

      setTimeout(() => {
        UIManager.measureInWindow(node, (_x, y, _w, height) => {
          const kb = keyboardHeightRef.current;
          if (kb <= 0) return;

          const keyboardTop = windowHeight - kb;
          // Ensure room for focused input + submit button below it (approx 64px)
          const needBottom = y + height + 64;
          const overflow = needBottom - keyboardTop;

          if (overflow > 0) {
            const maxScroll = Math.max(0, y - safeTop - 12);
            // Dynamic scroll without artificial 120px ceiling so Create Account button stays visible
            const scrollBy = Math.min(overflow + 16, maxScroll);
            if (scrollBy > 0) {
              scrollRef.current?.scrollTo({ y: scrollBy, animated: true });
            }
          }
        });
      }, Platform.OS === 'android' ? 100 : 60);
    },
    [windowHeight, safeTop],
  );

  return (
    <AuthScrollContext.Provider value={{ ensureVisible }}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: canvas }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? safeTop : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerClassName="grow items-center justify-center"
          contentContainerStyle={{
            paddingTop: Math.max(topPad, safeTop + 12),
            paddingBottom: bottomPad + keyboardHeight,
            paddingHorizontal: compact ? 20 : 28,
            backgroundColor: canvas,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
          bounces={false}
          overScrollMode="never"
        >
          <Reveal style={{ alignSelf: 'center', width: '100%', maxWidth: 400 }}>
            <Card className="w-full items-center p-6">{children}</Card>
          </Reveal>
        </ScrollView>
      </KeyboardAvoidingView>
    </AuthScrollContext.Provider>
  );
}

// ─── Main Auth Screen ───
export default function AuthScreen() {
  const {
    mode,
    step,
    error,
    isLoading,
    email: otpEmail,
    setMode,
    submitEmailPassword,
    submitEmailOTP,
    submitOTP,
    loginWithGoogle,
    resendOTP,
  } = useAuthFlow();

  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [resendTimer, setResendTimer] = useState(30);
  const handleVerifyRef = useRef<(() => Promise<void>) | null>(null);
  const autoVerifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showOTP = step === 'otp-sent';
  const showPassword = mode === 'signup';
  const isCompact = windowHeight < 700;

  const verticalPad = Math.max(insets.top, 16) + (isCompact ? 28 : Math.round(windowHeight * 0.1));
  const bottomPad = Math.max(insets.bottom, 16) + 40;

  const loginOpacity = useSharedValue(1);
  const signupOpacity = useSharedValue(0);
  const passwordHeight = useSharedValue(0);
  const passwordOpacity = useSharedValue(0);

  useEffect(() => {
    if (showOTP) setResendTimer(30);
  }, [showOTP]);

  useEffect(() => {
    if (!showOTP || resendTimer <= 0) return;
    const interval = setInterval(() => setResendTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [showOTP, resendTimer]);

  useEffect(() => {
    if (showOTP) return;
    loginOpacity.value = withTiming(mode === 'login' ? 1 : 0, { duration: 200 });
    signupOpacity.value = withTiming(mode === 'signup' ? 1 : 0, { duration: 200 });
  }, [mode, showOTP, loginOpacity, signupOpacity]);

  useEffect(() => {
    // Password row: field height + container vertical padding (3px top/bottom)
    passwordHeight.value = withTiming(showPassword ? INPUT_HEIGHT + 6 : 0, { duration: 300 });
    passwordOpacity.value = withTiming(showPassword ? 1 : 0, { duration: 300 });
  }, [showPassword, passwordHeight, passwordOpacity]);

  const loginFadeStyle = useAnimatedStyle(() => ({ opacity: loginOpacity.value }));
  const signupFadeStyle = useAnimatedStyle(() => ({ opacity: signupOpacity.value }));
  const passwordContainerStyle = useAnimatedStyle(() => ({
    height: passwordHeight.value,
    opacity: passwordOpacity.value,
  }));

  const { shake, animatedStyle: shakeStyle } = useShakeAnimation();
  useEffect(() => {
    if (error && showOTP) shake();
  }, [error, showOTP, shake]);

  const handleContinue = useCallback(async () => {
    if (mode === 'signup') await submitEmailPassword(email, password);
    else await submitEmailOTP(email);
  }, [mode, email, password, submitEmailPassword, submitEmailOTP]);

  const handleVerify = useCallback(async () => {
    if (otpCode.length !== 6 || isLoading) return;
    await submitOTP(otpCode);
  }, [otpCode, isLoading, submitOTP]);

  handleVerifyRef.current = handleVerify;

  useEffect(() => {
    if (otpCode.length !== 6) return;

    autoVerifyTimerRef.current = setTimeout(() => {
      handleVerifyRef.current?.();
      autoVerifyTimerRef.current = null;
    }, 300);

    return () => {
      if (autoVerifyTimerRef.current) {
        clearTimeout(autoVerifyTimerRef.current);
        autoVerifyTimerRef.current = null;
      }
    };
  }, [otpCode]);

  const handleResend = useCallback(async () => {
    await resendOTP();
    setResendTimer(30);
  }, [resendOTP]);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmit = isValidEmail && !isLoading && (mode === 'login' || password.length >= 8);

  // ─── OTP VIEW ───
  if (showOTP) {
    return (
      <AuthShell
        topPad={verticalPad}
        bottomPad={bottomPad}
        compact={isCompact}
        safeTop={insets.top}
      >
        <Text
          weight="semibold"
          className={cn(
            'mb-2.5 text-center tracking-tight',
            isCompact ? 'text-[22px] leading-7' : 'text-2xl',
          )}
        >
          Verify your email
        </Text>
        <Text muted className="mb-5 px-2 text-center">
          Enter the 6-digit code sent to{' '}
          <Text weight="semibold" muted={false}>
            {otpEmail || 'your email'}
          </Text>
        </Text>

        <AnimatedView style={shakeStyle} className="mb-5 w-full max-w-[340px] items-center self-center">
          <OtpInput
            value={otpCode}
            onChangeText={setOtpCode}
            disabled={isLoading}
            accessibilityLabel="Verification code"
          />
        </AnimatedView>

        {error ? (
          <Text size="sm" className="mb-2 text-center text-destructive">
            {error}
          </Text>
        ) : null}

        <View className="mb-5 w-full max-w-[340px] self-center">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onPress={handleVerify}
            disabled={otpCode.length !== 6 || isLoading}
            loading={isLoading}
          >
            Verify & Continue
          </Button>
        </View>

        <Text size="sm" muted className="text-center">
          Didn't receive the code?
        </Text>
        {resendTimer > 0 ? (
          <Text size="sm" muted className="mb-4 text-center">
            Resend in {resendTimer}s
          </Text>
        ) : (
          <Pressable onPress={handleResend} className="mb-4 mt-2 py-2">
            <Text size="sm" weight="semibold" className="text-center text-primary">
              Resend code
            </Text>
          </Pressable>
        )}

        <Pressable
          className="py-2"
          onPress={() => {
            setOtpCode('');
            setMode(mode);
          }}
        >
          <Text size="sm" muted className="text-center">
            ← Change email
          </Text>
        </Pressable>
      </AuthShell>
    );
  }

  // ─── FORM VIEW ───
  return (
    <AuthShell
      topPad={verticalPad}
      bottomPad={bottomPad}
      compact={isCompact}
      safeTop={insets.top}
    >
      <Text
        weight="medium"
        className={cn(
          'mb-2.5 text-center tracking-tight',
          isCompact ? 'text-3xl leading-[34px]' : 'text-4xl leading-10',
        )}
      >
        Kaplun
      </Text>

      <View className="mb-6 h-[52px] w-full items-center justify-center">
        <AnimatedView style={loginFadeStyle} className="absolute inset-x-0 items-center justify-center">
          <Text muted className="px-2 text-center">
            Welcome back! Sign in to continue.
          </Text>
        </AnimatedView>
        <AnimatedView style={signupFadeStyle} className="absolute inset-x-0 items-center justify-center">
          <Text muted className="px-2 text-center">
            Create your account to get started.
          </Text>
        </AnimatedView>
      </View>

      <View className="mb-6">
        <CapsuleToggle mode={mode} onChange={setMode} />
      </View>

      <View className="w-full max-w-[340px] self-center">
        <View className="w-full px-[3px] py-[3px]">
          <EmailField value={email} onChangeText={setEmail} />
        </View>

        <AnimatedView
          style={passwordContainerStyle}
          className="w-full overflow-hidden px-[3px] py-[3px]"
        >
          <PasswordInput value={password} onChangeText={setPassword} />
        </AnimatedView>

        {error ? (
          <Text size="sm" className="mt-3 text-center text-destructive">
            {error}
          </Text>
        ) : null}

        <Button
          variant="primary"
          size="lg"
          fullWidth
          testID="auth-continue"
          className="mt-4"
          onPress={handleContinue}
          disabled={!canSubmit}
          loading={isLoading}
        >
          {isLoading ? null : (
            <View className="h-[22px] w-full items-center justify-center">
              <AnimatedView
                style={loginFadeStyle}
                className="absolute inset-x-0 items-center justify-center"
              >
                <Text size="sm" weight="semibold" className="text-primary-foreground">
                  Continue with Email
                </Text>
              </AnimatedView>
              <AnimatedView
                style={signupFadeStyle}
                className="absolute inset-x-0 items-center justify-center"
              >
                <Text size="sm" weight="semibold" className="text-primary-foreground">
                  Create Account
                </Text>
              </AnimatedView>
            </View>
          )}
        </Button>
      </View>

      <View className="my-6 w-full max-w-[340px] flex-row items-center">
        <View className="h-px flex-1 bg-border" />
        <Text size="sm" muted className="mx-4">
          or
        </Text>
        <View className="h-px flex-1 bg-border" />
      </View>

      <View className="mb-5 w-full max-w-[340px] self-center">
        <Button
          variant="social"
          size="lg"
          fullWidth
          onPress={loginWithGoogle}
          disabled={isLoading}
          loading={isLoading}
        >
          Continue with Google
        </Button>
      </View>

      <View className="h-10 w-full items-center justify-center">
        <AnimatedView
          style={loginFadeStyle}
          className="absolute inset-x-0 items-center justify-center px-6"
        >
          <Text size="sm" muted className="text-center">
            We'll send you a verification code to sign in.
          </Text>
        </AnimatedView>
        <AnimatedView
          style={signupFadeStyle}
          className="absolute inset-x-0 items-center justify-center px-6"
        >
          <Text size="sm" muted className="text-center">
            By signing up, you agree to our Terms and Privacy Policy.
          </Text>
        </AnimatedView>
      </View>
    </AuthShell>
  );
}
