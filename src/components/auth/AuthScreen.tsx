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
  ActivityIndicator,
  findNodeHandle,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  FadeInDown,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClayAnimatedButton } from '@/components/clay/ClayAnimatedButton';
import { useAuthFlow, AuthMode } from '@/hooks/useAuthFlow';
import { useShakeAnimation } from '@/hooks/useClayAnimations';
import { CLAY_FONTS } from '@/lib/fonts';

const TOGGLE_WIDTH = 280;
const PILL_WIDTH = TOGGLE_WIDTH / 2 - 3;
/** Standard Clay input height per DESIGN.md §5.2 */
const INPUT_HEIGHT = 44;
/** Room for focused field + password field + submit button. */
const FIELD_STACK = INPUT_HEIGHT + 12 + INPUT_HEIGHT + 16 + INPUT_HEIGHT;

type AuthScrollApi = {
  ensureVisible: (target: View | TextInput | null) => void;
};
const AuthScrollContext = createContext<AuthScrollApi>({ ensureVisible: () => {} });

/**
 * Clay & Kaplun design tokens — StyleSheet only (no NativeWind on this screen per src/components/clay/AGENTS.md).
 * Synchronized with src/global.css and DESIGN.md §2.
 */
const C = {
  canvas: '#fffaf0', // --color-canvas
  primary: '#0a0a0a', // --color-primary / --color-ink
  primaryActive: '#1f1f1f', // --color-primary-active
  surfaceCard: '#f5f0e0', // --color-surface-card
  buttonSecondary: '#f3f2ed', // --color-button-secondary
  hairline: '#e5e5e5', // --color-hairline
  borderSubtle: 'rgba(209, 205, 199, 0.45)', // --color-border-subtle
  ink: '#0a0a0a', // --color-ink
  muted: '#6a6a6a', // --color-muted
  mutedSoft: '#9a9a9a', // --color-muted-soft
  bodyStrong: '#1a1a1a', // --color-body-strong
  error: '#ef4444', // --color-error
  brandTeal: '#1a3a3a', // --color-brand-teal
  onPrimary: '#ffffff', // --color-on-primary
} as const;

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
    <View style={styles.toggleTrack}>
      <Animated.View style={[styles.togglePill, pillStyle]} />
      {(['login', 'signup'] as AuthMode[]).map((m) => (
        <Pressable
          key={m}
          onPress={() => onChange(m)}
          style={styles.toggleTab}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === m }}
        >
          <Text style={[styles.toggleLabel, mode === m && styles.toggleLabelActive]}>
            {m === 'login' ? 'Log In' : 'Sign Up'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Email Input ───
function EmailField({ value, onChangeText }: { value: string; onChangeText: (v: string) => void }) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const { ensureVisible } = useContext(AuthScrollContext);

  return (
    <TextInput
      ref={inputRef}
      placeholder="Email address"
      value={value}
      onChangeText={onChangeText}
      autoCapitalize="none"
      keyboardType="email-address"
      autoComplete="email"
      textContentType="emailAddress"
      placeholderTextColor={C.mutedSoft}
      style={[styles.input, focused && styles.inputFocused]}
      onFocus={() => {
        setFocused(true);
        ensureVisible(inputRef.current);
      }}
      onBlur={() => setFocused(false)}
    />
  );
}

// ─── Password Input ───
function PasswordInput({ value, onChangeText }: { value: string; onChangeText: (v: string) => void }) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const { ensureVisible } = useContext(AuthScrollContext);

  return (
    <View style={styles.passwordWrap}>
      <TextInput
        ref={inputRef}
        placeholder="Password (min 8 characters)"
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        placeholderTextColor={C.mutedSoft}
        style={[styles.input, styles.passwordInput, focused && styles.inputFocused]}
        onFocus={() => {
          setFocused(true);
          ensureVisible(inputRef.current);
        }}
        onBlur={() => setFocused(false)}
      />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        style={styles.eyeButton}
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
      >
        <Ionicons name={visible ? 'eye-off' : 'eye'} size={20} color={C.muted} />
      </Pressable>
    </View>
  );
}

// ─── OTP Input ───
function OTPInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (c: string) => void;
  disabled: boolean;
}) {
  const inputs = useRef<(TextInput | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const { ensureVisible } = useContext(AuthScrollContext);
  const digits = value.split('');
  while (digits.length < 6) digits.push('');

  function handleChange(text: string, index: number) {
    if (disabled) return;
    const clean = text.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = clean;
    onChange(newDigits.join('').slice(0, 6));
    if (clean && index < 5) inputs.current[index + 1]?.focus();
  }

  function handleKeyPress(e: { nativeEvent: { key: string } }, index: number) {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }

  return (
    <View style={styles.otpRow}>
      {digits.map((digit, index) => (
        <View
          key={index}
          style={[
            styles.otpCell,
            digit ? styles.otpCellFilled : null,
            focusedIndex === index ? styles.otpCellFocused : null,
          ]}
        >
          <TextInput
            ref={(ref) => {
              inputs.current[index] = ref;
            }}
            value={digit}
            onChangeText={(text) => handleChange(text, index)}
            onKeyPress={(e) => handleKeyPress(e, index)}
            onFocus={() => {
              setFocusedIndex(index);
              ensureVisible(inputs.current[index]);
            }}
            onBlur={() => setFocusedIndex(null)}
            keyboardType="number-pad"
            maxLength={1}
            editable={!disabled}
            selectTextOnFocus
            style={styles.otpInput}
          />
        </View>
      ))}
    </View>
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
  const scrollRef = useRef<ScrollView>(null);
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
    (target: View | TextInput | null) => {
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
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? safeTop : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.root}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(topPad, safeTop + 12),
              paddingBottom: bottomPad + keyboardHeight,
              paddingHorizontal: compact ? 20 : 28,
              justifyContent: 'center',
              backgroundColor: C.canvas,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
          bounces={false}
          overScrollMode="never"
        >
          <Animated.View entering={FadeInDown.duration(400).springify()} style={styles.card}>
            {children}
          </Animated.View>
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
    // INPUT_HEIGHT + 6 (50px) matches inputContainer height (44px input + 3px top/bottom padding)
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
        <Text style={[styles.title, isCompact && styles.titleCompact]}>Verify your email</Text>
        <Text style={[styles.subtitle, styles.mb20]}>
          Enter the 6-digit code sent to{' '}
          <Text style={styles.subtitleStrong}>{otpEmail || 'your email'}</Text>
        </Text>

        <Animated.View style={[styles.formWidth, styles.mb20, shakeStyle]}>
          <OTPInput value={otpCode} onChange={setOtpCode} disabled={isLoading} />
        </Animated.View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={[styles.formWidth, styles.mb20]}>
          <ClayAnimatedButton
            variant="primary"
            onPress={handleVerify}
            disabled={otpCode.length !== 6 || isLoading}
            loading={isLoading}
            fullWidth
          >
            Verify & Continue
          </ClayAnimatedButton>
        </View>

        <Text style={styles.helper}>Didn't receive the code?</Text>
        {resendTimer > 0 ? (
          <Text style={[styles.helperMuted, styles.mb16]}>Resend in {resendTimer}s</Text>
        ) : (
          <Pressable onPress={handleResend} style={styles.mb16}>
            <Text style={styles.resend}>Resend code</Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => {
            setOtpCode('');
            setMode(mode);
          }}
        >
          <Text style={styles.helper}>← Change email</Text>
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
      <Text style={[styles.brand, isCompact && styles.brandCompact]}>Kaplun</Text>

      <View style={styles.subtitleSlot}>
        <Animated.View style={[styles.absoluteCenter, loginFadeStyle]}>
          <Text style={styles.subtitle}>Welcome back! Sign in to continue.</Text>
        </Animated.View>
        <Animated.View style={[styles.absoluteCenter, signupFadeStyle]}>
          <Text style={styles.subtitle}>Create your account to get started.</Text>
        </Animated.View>
      </View>

      <View style={styles.mb24}>
        <CapsuleToggle mode={mode} onChange={setMode} />
      </View>

      <View style={styles.formWidth}>
        <View style={styles.inputContainer}>
          <EmailField value={email} onChangeText={setEmail} />
        </View>

        <Animated.View
          style={[
            styles.inputContainer,
            { overflow: 'hidden' },
            passwordContainerStyle,
          ]}
        >
          <PasswordInput value={password} onChangeText={setPassword} />
        </Animated.View>

        {error ? <Text style={[styles.error, styles.mt12]}>{error}</Text> : null}

        <Pressable
          onPress={handleContinue}
          disabled={!canSubmit}
          style={[styles.submitButton, !canSubmit && styles.submitDisabled]}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={C.onPrimary} />
          ) : (
            <View style={styles.submitLabelSlot}>
              <Animated.View style={[styles.absoluteCenter, loginFadeStyle]}>
                <Text style={styles.submitLabel}>Continue with Email</Text>
              </Animated.View>
              <Animated.View style={[styles.absoluteCenter, signupFadeStyle]}>
                <Text style={styles.submitLabel}>Create Account</Text>
              </Animated.View>
            </View>
          )}
        </Pressable>
      </View>

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={[styles.formWidth, styles.mb20]}>
        <ClayAnimatedButton
          variant="secondary"
          onPress={loginWithGoogle}
          disabled={isLoading}
          loading={isLoading}
          fullWidth
        >
          Continue with Google
        </ClayAnimatedButton>
      </View>

      <View style={styles.helperSlot}>
        <Animated.View style={[styles.absoluteCenter, { paddingHorizontal: 24 }, loginFadeStyle]}>
          <Text style={styles.helperMuted}>We'll send you a verification code to sign in.</Text>
        </Animated.View>
        <Animated.View style={[styles.absoluteCenter, { paddingHorizontal: 24 }, signupFadeStyle]}>
          <Text style={styles.helperMuted}>
            By signing up, you agree to our Terms and Privacy Policy.
          </Text>
        </Animated.View>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.canvas,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  formWidth: {
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  inputContainer: {
    width: '100%',
    paddingHorizontal: 3,
    paddingVertical: 3,
  },
  absoluteCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    left: 0,
    right: 0,
  },
  brand: {
    fontFamily: CLAY_FONTS.medium,
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -1,
    color: C.ink,
    textAlign: 'center',
    marginBottom: 10,
  },
  brandCompact: {
    fontSize: 30,
    lineHeight: 34,
  },
  title: {
    fontFamily: CLAY_FONTS.semibold,
    fontSize: 24,
    lineHeight: 31,
    letterSpacing: -0.3,
    color: C.ink,
    textAlign: 'center',
    marginBottom: 10,
  },
  titleCompact: {
    fontSize: 22,
    lineHeight: 28,
  },
  subtitle: {
    fontFamily: CLAY_FONTS.regular,
    fontSize: 16,
    lineHeight: 25,
    color: C.muted,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  subtitleStrong: {
    fontFamily: CLAY_FONTS.semibold,
    color: C.bodyStrong,
  },
  subtitleSlot: {
    height: 52,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  mb16: { marginBottom: 16 },
  mb20: { marginBottom: 20 },
  mb24: { marginBottom: 24 },
  mt12: { marginTop: 12 },
  toggleTrack: {
    width: TOGGLE_WIDTH,
    height: 44,
    backgroundColor: C.surfaceCard,
    borderRadius: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    alignSelf: 'center',
  },
  togglePill: {
    position: 'absolute',
    left: 3,
    width: PILL_WIDTH,
    height: 38,
    backgroundColor: C.primary,
    borderRadius: 9999,
  },
  toggleTab: {
    flex: 1,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  toggleLabel: {
    fontFamily: CLAY_FONTS.semibold,
    fontSize: 14,
    letterSpacing: -0.14,
    color: C.bodyStrong,
  },
  toggleLabelActive: {
    color: C.onPrimary,
  },
  input: {
    width: '100%',
    height: INPUT_HEIGHT,
    backgroundColor: C.canvas,
    borderWidth: 1,
    borderColor: C.hairline,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    fontFamily: CLAY_FONTS.regular,
    fontSize: 16,
    color: C.ink,
  },
  inputFocused: {
    borderColor: C.ink,
    borderWidth: 1.5,
  },
  passwordWrap: {
    width: '100%',
    height: INPUT_HEIGHT,
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeButton: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButton: {
    marginTop: 16,
    width: '100%',
    height: 44,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: {
    opacity: 0.45,
  },
  submitLabelSlot: {
    height: 22,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitLabel: {
    fontFamily: CLAY_FONTS.semibold,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: -0.14,
    includeFontPadding: false,
    color: C.onPrimary,
  },
  dividerRow: {
    width: '100%',
    maxWidth: 340,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.hairline,
  },
  dividerText: {
    fontFamily: CLAY_FONTS.regular,
    fontSize: 13,
    color: C.mutedSoft,
    marginHorizontal: 16,
  },
  helperSlot: {
    height: 40,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helper: {
    fontFamily: CLAY_FONTS.regular,
    fontSize: 13,
    lineHeight: 18,
    color: C.muted,
    textAlign: 'center',
  },
  helperMuted: {
    fontFamily: CLAY_FONTS.regular,
    fontSize: 13,
    lineHeight: 18,
    color: C.mutedSoft,
    textAlign: 'center',
  },
  resend: {
    fontFamily: CLAY_FONTS.semibold,
    fontSize: 13,
    color: C.brandTeal,
    marginTop: 8,
  },
  error: {
    fontFamily: CLAY_FONTS.regular,
    fontSize: 14,
    lineHeight: 20,
    color: C.error,
    textAlign: 'center',
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  otpCell: {
    width: 44,
    height: 52,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderColor: C.hairline,
    backgroundColor: C.canvas,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  otpCellFilled: {
    borderColor: C.primary,
  },
  otpCellFocused: {
    borderColor: C.primary,
    borderWidth: 2,
  },
  otpInput: {
    width: 44,
    height: 52,
    textAlign: 'center',
    fontSize: 22,
    fontFamily: CLAY_FONTS.semibold,
    color: C.ink,
  },
});
