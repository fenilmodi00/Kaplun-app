import React, { useState, useEffect, useCallback } from 'react';
import { useUser, useAuth } from "@clerk/expo";
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, ScrollView, Pressable } from '@/tw';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ClayAnimatedButton } from '@/components/clay/ClayAnimatedButton';
import { ClaySpinner } from '@/components/clay/ClaySpinner';
import { useShakeAnimation, useEntranceAnimation } from '@/hooks/useClayAnimations';
import { AnimatedView } from '@/tw/animated';
import { ensureAppwriteSession } from '@/lib/auth-bridge';
import { fetchProfile, type InstagramProfileResponse } from '@/lib/instagram';
import { startInstagramOAuth } from '@/lib/instagram-oauth';

// ── Helpers ──────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getInitials(name: string): string {
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

// ── Animation wrappers ───────────────────────────────────────────────

function ErrorShake({ children }: { children: React.ReactNode }) {
  const { shake, animatedStyle } = useShakeAnimation();
  useEffect(() => {
    shake();
  }, [shake]);
  return <AnimatedView style={animatedStyle}>{children}</AnimatedView>;
}

function Entrance({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const { animatedStyle } = useEntranceAnimation(delay);
  return (
    <AnimatedView style={[{ width: '100%' }, animatedStyle]}>
      {children}
    </AnimatedView>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function HeaderAvatar({ name }: { name: string }) {
  return (
    <View
      className="bg-brand-ochre items-center justify-center"
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        borderWidth: 1,
        borderColor: '#e5e5e5',
      }}
    >
      <Text className="font-semibold text-ink" style={{ fontSize: 15 }}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

function ValueBullet({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View className="flex-row items-center gap-[11px]">
      <View
        className="items-center justify-center"
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          backgroundColor: 'rgba(255,255,255,0.7)',
        }}
      >
        <Ionicons name={icon} size={16} color="#0a0a0a" />
      </View>
      <Text className="font-medium text-ink" style={{ fontSize: 14.5, lineHeight: 20 }}>
        {text}
      </Text>
    </View>
  );
}

function ErrorStrip({ message }: { message: string }) {
  return (
    <ErrorShake>
      <View
        className="flex-row items-start gap-[9px] rounded-md"
        style={{
          backgroundColor: 'rgba(239,68,68,0.1)',
          borderWidth: 1,
          borderColor: 'rgba(239,68,68,0.5)',
          padding: 11,
          paddingHorizontal: 12,
          marginBottom: 14,
        }}
      >
        <Ionicons name="alert-circle-outline" size={15} color="#ef4444" style={{ marginTop: 1 }} />
        <Text className="text-[13px] leading-[1.45]" style={{ color: '#1a1a1a', flex: 1 }}>
          <Text className="font-semibold" style={{ color: '#1a1a1a' }}>
            Instagram connection failed.
          </Text>{' '}
          {message}
        </Text>
      </View>
    </ErrorShake>
  );
}

function PermissionsPanel({ open }: { open: boolean }) {
  if (!open) return null;

  const scopes = [
    { label: 'See your profile and media', code: 'instagram_business_basic' },
    { label: 'Read and reply to your DMs', code: 'instagram_business_manage_messages' },
    { label: 'Read your analytics', code: 'instagram_business_manage_insights' },
    { label: 'Publish posts you approve', code: 'instagram_business_content_publish' },
    { label: 'Read and reply to comments', code: 'instagram_business_manage_comments' },
  ];

  return (
    <View
      className="bg-white border border-hairline rounded-lg"
      style={{ padding: 16, marginTop: 12 }}
    >
      <Text
        className="font-semibold uppercase text-muted"
        style={{ fontSize: 13, letterSpacing: 1.2, marginBottom: 12 }}
      >
        What Kaplun can do
      </Text>
      <View className="gap-[10px]" style={{ marginBottom: 14 }}>
        {scopes.map((s) => (
          <View key={s.code} className="flex-row gap-[10px] items-start">
            <View
              className="bg-brand-lavender"
              style={{ width: 7, height: 7, borderRadius: 3.5, marginTop: 5 }}
            />
            <View className="flex-1">
              <Text className="text-[13.5px] leading-[1.4]" style={{ color: '#0a0a0a' }}>
                {s.label}
              </Text>
              <Text
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 11,
                  color: '#6a6a6a',
                  marginTop: 1,
                }}
              >
                {s.code}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <View
        style={{ borderTopWidth: 1, borderTopColor: '#e5e5e5', paddingTop: 12 }}
      >
        <Text className="text-[12.5px] leading-[1.5] text-muted">
          Secure sign-in via Meta. Kaplun never sees your password. Disconnect anytime from Profile.
        </Text>
        <Text className="text-[12.5px] leading-[1.5] text-muted" style={{ marginTop: 8 }}>
          Requires an Instagram Business or Creator account.{" "}
          <Text style={{ color: '#0a0a0a', fontWeight: '500' }}>How to switch</Text>
        </Text>
      </View>
    </View>
  );
}

function ConnectionChip({ profile }: { profile: InstagramProfileResponse }) {
  return (
    <View
      className="flex-row items-center gap-[11px] bg-white border border-hairline"
      style={{
        borderRadius: 9999,
        padding: 8,
        paddingRight: 16,
        marginBottom: 16,
      }}
    >
      <LinearGradient
        colors={['#f9ce34', '#ee2a7b', '#6228d7']}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="logo-instagram" size={17} color="#ffffff" />
      </LinearGradient>
      <View className="flex-1" style={{ minWidth: 0 }}>
        <Text className="font-semibold text-ink" style={{ fontSize: 14.5, letterSpacing: -0.2 }}>
          @{profile.username}
        </Text>
        <Text className="text-[12px] text-muted">Instagram Business</Text>
      </View>
      <View className="flex-row items-center gap-[6px]">
        <View className="bg-success" style={{ width: 8, height: 8, borderRadius: 4 }} />
        <Text className="font-semibold text-[12.5px]" style={{ color: '#15803d' }}>
          Connected
        </Text>
      </View>
    </View>
  );
}

function Module({
  title,
  subtitle,
  emptyTitle,
  emptyBody,
  buttonText,
  buttonRoute,
  bgClass,
}: {
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyBody: string;
  buttonText: string;
  buttonRoute: string;
  bgClass: string;
}) {
  const router = useRouter();
  return (
    <View className={`${bgClass} rounded-xl`} style={{ padding: 20, marginBottom: 14 }}>
      <Text
        className="font-semibold text-white"
        style={{ fontSize: 19, letterSpacing: -0.3, marginBottom: 4 }}
      >
        {title}
      </Text>
      <Text className="text-[13px] text-white" style={{ opacity: 0.82, marginBottom: 16 }}>
        {subtitle}
      </Text>
      <View
        className="items-center"
        style={{
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: 'rgba(255,255,255,0.65)',
          borderRadius: 16,
          padding: 16,
          paddingHorizontal: 14,
        }}
      >
        <Text className="font-semibold text-white" style={{ fontSize: 14.5, marginBottom: 3 }}>
          {emptyTitle}
        </Text>
        <Text className="text-[12.5px] text-white" style={{ opacity: 0.8, lineHeight: 18, textAlign: 'center' }}>
          {emptyBody}
        </Text>
      </View>
      <Pressable
        onPress={() => router.push(buttonRoute as never)}
        className="flex-row items-center self-start gap-[7px] text-white"
        style={{
          marginTop: 14,
          backgroundColor: 'rgba(255,255,255,0.12)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.3)',
          borderRadius: 12,
          paddingVertical: 9,
          paddingHorizontal: 14,
          minHeight: 44,
        }}
      >
        <Text className="font-semibold text-white" style={{ fontSize: 13.5 }}>
          {buttonText}
        </Text>
      </Pressable>
    </View>
  );
}

function QuickActions() {
  const router = useRouter();
  const actions = [
    { label: 'New post', icon: 'add-circle-outline' as const, route: '/(tabs)/(publish)' },
    { label: 'Reply to DMs', icon: 'chatbubble-outline' as const, route: '/(tabs)/(messages)' },
    { label: 'View insights', icon: 'stats-chart-outline' as const, route: '/(tabs)/(insights)' },
  ];

  return (
    <View className="flex-row gap-[9px]">
      {actions.map((a) => (
        <Pressable
          key={a.label}
          onPress={() => router.push(a.route as never)}
          className="flex-1 items-center justify-center bg-white border border-hairline"
          style={{ borderRadius: 12, minHeight: 64, gap: 6 }}
        >
          <Ionicons name={a.icon} size={17} color="#0a0a0a" />
          <Text className="font-semibold text-ink" style={{ fontSize: 12 }}>
            {a.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────

export default function HomeScreen() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<InstagramProfileResponse | null>(null);
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPermissions, setShowPermissions] = useState(false);
  const [skipped, setSkipped] = useState(false);

  // Check Instagram connection on mount
  useEffect(() => {
    let cancelled = false;
    async function checkConnection() {
      if (!user) {
        setIsCheckingConnection(false);
        return;
      }
      try {
        const p = await fetchProfile();
        if (!cancelled) setProfile(p);
      } catch (_err: unknown) {
        // session_expired or not connected yet — leave profile null
      } finally {
        if (!cancelled) setIsCheckingConnection(false);
      }
    }
    checkConnection();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleConnect = useCallback(async () => {
    if (!user) return;
    setIsConnecting(true);
    setError(null);
    try {
      const appwriteUser = await ensureAppwriteSession(getToken);
      const success = await startInstagramOAuth(user.id, appwriteUser.$id);
      if (!success) throw new Error('Instagram connection was not successful');
      const p = await fetchProfile();
      setProfile(p);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      if (message === 'Instagram OAuth was cancelled') {
        // Silent return — no error shown
      } else {
        setError(message);
      }
    } finally {
      setIsConnecting(false);
    }
  }, [user, getToken]);

  const firstName = user?.firstName || 'Creator';
  const displayName = user?.fullName || firstName;

  // ── Loading state ──
  if (isCheckingConnection) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ClaySpinner size={40} label="Loading…" />
      </View>
    );
  }

  const isConnected = !!profile || skipped;

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 18,
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 110,
      }}
    >
      {/* Header */}
      <Entrance delay={0}>
        <View className="flex-row items-center justify-between" style={{ marginBottom: 14 }}>
          <Text className="font-semibold text-ink" style={{ fontSize: 21, letterSpacing: -0.4 }}>
            Kaplun
          </Text>
          <HeaderAvatar name={displayName} />
        </View>
      </Entrance>

      {/* Greeting */}
      <Entrance delay={50}>
        <View style={{ marginBottom: 16 }}>
          <Text className="text-[13px] text-muted" style={{ marginBottom: 2 }}>
            {getGreeting()}
          </Text>
          <Text className="font-medium text-ink" style={{ fontSize: 24, letterSpacing: -0.5 }}>
            {firstName}
          </Text>
        </View>
      </Entrance>

      {!isConnected ? (
        <Entrance delay={100}>
          {/* Connect hero card */}
          <View
            className="bg-brand-lavender rounded-xl"
            style={{ padding: 18, opacity: isConnecting ? 0.78 : 1 }}
          >
            {/* Hero visual placeholder */}
            <View
              className="items-center justify-center"
              style={{
                height: 118,
                borderRadius: 16,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: 'rgba(10,10,10,0.38)',
                backgroundColor: 'rgba(255,255,255,0.55)',
                marginBottom: 16,
                gap: 8,
              }}
            >
              <Ionicons name="logo-instagram" size={34} color="rgba(10,10,10,0.6)" />
              <Text className="font-medium" style={{ fontSize: 11.5, letterSpacing: 0.2, color: 'rgba(10,10,10,0.6)' }}>
                TODO: hero visual — clay phone with Instagram glyph
              </Text>
            </View>

            {/* Eyebrow */}
            <Text
              className="font-semibold uppercase"
              style={{
                fontSize: 11,
                letterSpacing: 1.5,
                color: 'rgba(10,10,10,0.62)',
                marginBottom: 8,
              }}
            >
              Step 1 of 1
            </Text>

            {/* H1 */}
            <Text
              className="font-medium text-ink"
              style={{ fontSize: 29, lineHeight: 32.5, letterSpacing: -0.5, marginBottom: 8 }}
            >
              Connect your Instagram
            </Text>

            {/* Lede */}
            <Text
              className="text-body-strong"
              style={{ fontSize: 15, lineHeight: 22.5, marginBottom: 14 }}
            >
              Kaplun reads your DMs, insights and posts so your creator workspace comes alive.
            </Text>

            {/* Value bullets */}
            <View className="gap-[11px]" style={{ marginBottom: 18 }}>
              <ValueBullet
                icon="chatbubble-outline"
                text="Answer Instagram DMs from one inbox"
              />
              <ValueBullet
                icon="stats-chart-outline"
                text="See post & audience insights without switching apps"
              />
              <ValueBullet
                icon="calendar-outline"
                text="Publish and schedule content in one place"
              />
            </View>

            {/* Error strip */}
            {error && <ErrorStrip message={error} />}

            {/* CTA */}
            <ClayAnimatedButton
              variant="primary"
              fullWidth
              loading={isConnecting}
              onPress={handleConnect}
              height={50}
            >
              <View className="flex-row items-center gap-[9px]">
                <Ionicons name="logo-instagram" size={17} color="#ffffff" />
                <Text className="font-semibold text-white" style={{ fontSize: 15, letterSpacing: -0.2 }}>
                  {error ? 'Try again' : isConnecting ? 'Waiting for Instagram…' : 'Connect Instagram'}
                </Text>
              </View>
            </ClayAnimatedButton>

            {/* CTA caption */}
            <Text
              className="text-center"
              style={{
                fontSize: 12.5,
                color: 'rgba(10,10,10,0.65)',
                marginTop: 10,
              }}
            >
              {isConnecting
                ? 'Complete sign-in in the Instagram window to continue.'
                : 'Secure sign-in via Meta · takes about 30 seconds'}
            </Text>

            {/* Why we ask toggle */}
            <Pressable
              onPress={() => setShowPermissions((p) => !p)}
              className="self-center"
              style={{ marginTop: 13, paddingVertical: 6, paddingHorizontal: 8 }}
            >
              <Text
                className="font-medium text-ink"
                style={{ fontSize: 14, textDecorationLine: 'underline' }}
              >
                Why we ask for this{' '}
                <Text style={{ transform: [{ rotate: showPermissions ? '180deg' : '0deg' }] }}>
                  ▾
                </Text>
              </Text>
            </Pressable>
          </View>

          {/* Permissions panel */}
          <PermissionsPanel open={showPermissions} />

          {/* Skip block */}
          <View className="items-center" style={{ marginTop: 16 }}>
            <Pressable
              onPress={() => setSkipped(true)}
              style={{ paddingVertical: 10, paddingHorizontal: 14, minHeight: 44 }}
            >
              <Text className="font-medium text-muted" style={{ fontSize: 14 }}>
                Continue without Instagram
              </Text>
            </Pressable>
            <Text
              className="text-center text-muted-soft"
              style={{ fontSize: 12, lineHeight: 17.4, paddingHorizontal: 22 }}
            >
              You can connect later from Profile. Some features stay locked.
            </Text>
          </View>
        </Entrance>
      ) : (
        <Entrance delay={100}>
          {/* Connected home */}
          {profile && <ConnectionChip profile={profile} />}

          <Module
            title="Instagram DMs"
            subtitle="Your unified inbox"
            emptyTitle="Waiting for first sync"
            emptyBody="Unread threads will appear here as soon as your messages finish syncing."
            buttonText="Open Messages"
            buttonRoute="/(tabs)/(messages)"
            bgClass="bg-brand-pink"
          />

          <Module
            title="Latest post performance"
            subtitle="Reach, likes and comments"
            emptyTitle="No posts synced yet"
            emptyBody="Publish your first post from Kaplun and its insights will land here."
            buttonText="View insights"
            buttonRoute="/(tabs)/(insights)"
            bgClass="bg-brand-teal"
          />

          <QuickActions />
        </Entrance>
      )}
    </ScrollView>
  );
}
