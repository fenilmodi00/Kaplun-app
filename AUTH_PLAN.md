# Authentication Plan for app-fresh

**Goal:** Implement a complete auth system using Clerk's available features for Expo/React Native.

**Current State:**
- Clerk SDK: `@clerk/clerk-expo` v2.19.31 (installed)
- Has basic email/password login screen (`src/app/login.tsx`)
- No sign-up screen, no OTP flow, no social login
- Appwrite auth bridge exists (`src/lib/auth-bridge.ts`)
- Auth gate blocks entire app if not signed in (`src/app/_layout.tsx`)

---

## 1. Features to Implement

### A. Email OTP Login (Passwordless)
- User enters email → receives 6-digit code → enters code → logged in
- Uses Clerk `useSignIn` with `strategy: "email_code"`
- No password required

### B. Email/Password + OTP Sign-Up
- User enters email + password → account created but unverified
- Clerk sends email OTP for verification
- User enters OTP → email verified → account active
- Uses `useSignUp` + `prepareEmailAddressVerification` + `attemptEmailAddressVerification`

### C. Google Social Login
- One-tap Google OAuth via Clerk
- Uses `useOAuth` hook from `@clerk/clerk-expo`
- Requires Google OAuth client configured in Clerk Dashboard
- Works on iOS, Android, and Web

---

## 2. File Structure Changes

```
src/app/
  _layout.tsx                 ← update AuthGate for new flows
  login.tsx                   ← replace with unified auth entry
  (auth)/
    _layout.tsx               ← auth layout (no tabs, clean stack)
    index.tsx                 ← unified auth screen (mode toggle)
    verify-otp.tsx            ← OTP verification screen (shared)
  (tabs)/
    ...                       ← existing tabs unchanged

src/hooks/
  useAuthFlow.ts              ← unified auth state machine hook

src/components/auth/
  AuthModeToggle.tsx          ← Login | Sign Up switcher
  EmailPasswordForm.tsx       ← reusable email+password inputs
  OTPForm.tsx                 ← 6-digit code input
  SocialLoginButtons.tsx      ← Google OAuth button
  AuthError.tsx               ← error display component
```

---

## 3. Clerk Configuration Required

### Clerk Dashboard Settings (clerk.com)
1. **Email + Password** → Enable (for password sign-up)
2. **Email OTP** → Enable (for passwordless login & verification)
3. **Google OAuth** → Enable and configure:
   - Go to Social Connections → Google
   - Enable "Google One Tap" (optional)
   - Set Authorized redirect URI: `https://accounts.google.com/o/oauth2/v2/auth`
   - Or use Clerk's default shared credentials (easiest for dev)
4. **User Attributes** → Ensure "Email address" is required

### Environment Variables (already set)
```bash
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

---

## 4. Screen-by-Screen Flow

### Unified Auth Entry Screen (`(auth)/index.tsx`)
```
+----------------------------------+
|          [App Logo]              |
|                                  |
|    [  Login  |  Sign Up  ]       |  ← Toggle
|                                  |
|  ┌──────────────────────────┐    |
|  │  Email                   │    |
|  └──────────────────────────┘    |
|  ┌──────────────────────────┐    |
|  │  Password (Sign Up only) │    |  ← conditional
|  └──────────────────────────┘    |
|                                  |
|  [  Continue with Email  ]       |  ← triggers OTP or password login
|                                  |
|  ────────── or ──────────        |
|                                  |
|  [  Continue with Google  ]      |
|                                  |
+----------------------------------+
```

### OTP Verification Screen (`(auth)/verify-otp.tsx`)
```
+----------------------------------+
|   Enter verification code        |
|   sent to user@example.com       |
|                                  |
|  ┌────┬────┬────┬────┬────┬────┐ |
|  │ 1  │ 2  │ 3  │ 4  │ 5  │ 6  │ |  ← 6-digit input
|  └────┴────┴────┴────┴────┴────┘ |
|                                  |
|  [      Verify & Continue      ] |
|                                  |
|  Didn't receive it? Resend       |
+----------------------------------+
```

---

## 5. Auth Flow Logic

### Flow A: Email OTP Login (Passwordless)
```
User enters email (no password) on Login tab
  → Clerk signIn.create({ identifier: email })
  → Clerk signIn.prepareFirstFactor({ strategy: "email_code" })
  → User receives email with 6-digit code
  → Navigate to verify-otp.tsx
  → User enters code
  → Clerk signIn.attemptFirstFactor({ strategy: "email_code", code })
  → setActive({ session: createdSessionId })
  → AuthGate triggers Appwrite bridge
  → router.replace('/(tabs)/(home)')
```

### Flow B: Email/Password + OTP Sign-Up
```
User enters email + password on Sign Up tab
  → Clerk signUp.create({ emailAddress, password })
  → Clerk signUp.prepareEmailAddressVerification({ strategy: "email_code" })
  → User receives email with 6-digit code
  → Navigate to verify-otp.tsx
  → User enters code
  → Clerk signUp.attemptEmailAddressVerification({ code })
  → setActive({ session: createdSessionId })
  → AuthGate triggers Appwrite bridge
  → router.replace('/(tabs)/(home)')
```

### Flow C: Google Social Login
```
User taps "Continue with Google"
  → Clerk startOAuthFlow({ strategy: "oauth_google" })
  → Native Google sign-in sheet opens (iOS/Android)
  → User selects account / enters credentials
  → Callback to app via expo-linking
  → Clerk handles token exchange
  → setActive({ session: createdSessionId })
  → AuthGate triggers Appwrite bridge
  → router.replace('/(tabs)/(home)')
```

---

## 6. Key Implementation Details

### Unified Auth Hook (`useAuthFlow.ts`)
```typescript
type AuthMode = 'login-passwordless' | 'login-password' | 'signup';
type AuthStep = 'idle' | 'otp-sent' | 'verifying' | 'complete' | 'error';

interface UseAuthFlowReturn {
  mode: AuthMode;
  step: AuthStep;
  error: string | null;
  isLoading: boolean;
  setMode: (mode: AuthMode) => void;
  submitEmail: (email: string) => Promise<void>;           // OTP login
  submitEmailPassword: (email: string, password: string) => Promise<void>; // Sign up
  submitOTP: (code: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  resendOTP: () => Promise<void>;
}
```

### OTP Input Component
- 6 individual boxes or single controlled input
- Auto-focus next box on digit entry
- Backspace navigates to previous box
- Paste support for full 6-digit code
- Numeric keyboard only

### Appwrite Bridge Compatibility
- The existing `createAppwriteSession(clerkToken)` works for ALL Clerk auth methods
- No changes needed to `auth-bridge.ts`
- The `AuthGate` in `_layout.tsx` already calls this after sign-in

### Error Handling
- Network errors → "Please check your connection and try again"
- Invalid OTP → "Invalid code. Please try again or request a new one"
- Email already exists (sign-up) → "This email is already registered. Try signing in"
- Invalid credentials (login) → "Invalid email or password"
- Google OAuth cancelled → Silent failure, return to auth screen

---

## 7. UI/UX Decisions

| Decision | Rationale |
|----------|-----------|
| Single auth screen with toggle | Reduces navigation complexity; matches modern app patterns |
| Separate OTP screen | OTP entry is a distinct mental model; dedicated screen reduces clutter |
| Password optional in login | Supports both passwordless (OTP) and password-based login |
| Password required in sign-up | Sets up password as recovery method even if user prefers OTP login |
| Google as primary social | Most common; Apple can be added later if iOS-only |
| No "Forgot Password" in v1 | Clerk's built-in flow available; can add later |
| Auto-redirect after auth | `router.replace()` prevents back-button returning to auth |

---

## 8. Testing Plan

| Test Case | Expected Result |
|-----------|----------------|
| Sign up with email + password | Account created, OTP email sent, verify succeeds, redirected to home |
| Sign up with existing email | Error: "Email already exists" |
| Login with email OTP | OTP email sent, verify succeeds, redirected to home |
| Login with wrong OTP | Error: "Invalid code", can retry |
| Resend OTP | New code sent, old code invalidated |
| Google login success | Account created/exists, redirected to home |
| Google login cancelled | Returns to auth screen, no error |
| Appwrite bridge after auth | Session created in Appwrite, user can access data |
| Sign out | Returns to auth screen, Appwrite session cleared |

---

## 9. Dependencies Check

Already installed (no new packages needed):
- `@clerk/clerk-expo` — Clerk SDK for Expo
- `expo-auth-session` — OAuth helpers (used by Clerk)
- `expo-crypto` — Crypto primitives (used by Clerk)
- `expo-linking` — Deep linking for OAuth callbacks
- `expo-web-browser` — In-app browser for OAuth (web fallback)

---

## 10. Security Considerations

1. **OTP Rate Limiting**: Clerk handles this automatically (max 10 attempts, cooldowns)
2. **Session Persistence**: Clerk stores session securely via `expo-secure-store`
3. **Token Expiry**: Appwrite session should be refreshed or recreated on app launch
4. **Deep Link Security**: OAuth callback URL scheme should be unique to the app
5. **No Password Storage**: Clerk handles all credential storage; app never stores passwords

---

## 11. Implementation Order

1. **Create `useAuthFlow` hook** — State machine for all auth flows
2. **Build OTP input component** — Reusable 6-digit input
3. **Build unified auth screen** — Toggle between login/signup, email/password inputs
4. **Build OTP verification screen** — Code entry + resend
5. **Add Google OAuth** — Social login button + flow
6. **Update `_layout.tsx`** — Route to new auth screens, handle sign-out
7. **Add sign-out to profile tab** — Allow users to sign out
8. **Test all flows** — Manual testing on iOS/Android simulators

---

## 12. Files to Create/Modify

### New Files
- `src/hooks/useAuthFlow.ts`
- `src/components/auth/AuthModeToggle.tsx`
- `src/components/auth/EmailPasswordForm.tsx`
- `src/components/auth/OTPForm.tsx`
- `src/components/auth/SocialLoginButtons.tsx`
- `src/components/auth/AuthError.tsx`
- `src/app/(auth)/_layout.tsx`
- `src/app/(auth)/index.tsx`
- `src/app/(auth)/verify-otp.tsx`

### Modified Files
- `src/app/_layout.tsx` — Update AuthGate routing
- `src/app/login.tsx` — Remove or repurpose
- `src/app/(tabs)/(profile)/index.tsx` — Add sign-out button

---

## 13. Clerk Dashboard Checklist

Before implementation, ensure these are enabled in [Clerk Dashboard](https://dashboard.clerk.com):

- [ ] **Authentication → Email + Password** → Enabled
- [ ] **Authentication → Email verification code** → Enabled (for OTP)
- [ ] **Social Connections → Google** → Enabled
- [ ] **User & Authentication → Email address** → Required
- [ ] **OAuth redirect URLs** → Add `com.yourapp.app://oauth-native-callback` (or your scheme)

---

*Plan created: 2026-07-20*
*Clerk SDK: @clerk/clerk-expo ^2.19.31*
