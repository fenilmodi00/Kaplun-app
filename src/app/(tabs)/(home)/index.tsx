import React, { useState, useEffect, useCallback } from 'react';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, ScrollView } from '@/tw';
import { Image } from '@/tw/image';
import { AnimatedView } from '@/tw/animated';
import { cn } from '@/tw/cn';
import { useDashboard } from '@/hooks/useDashboard';
import { ensureAppwriteSession } from '@/lib/auth-bridge';
import {
  disconnectInstagram,
  fetchMedia,
  fetchInsights,
  fetchProfile,
  type InstagramProfileResponse,
} from '@/lib/instagram';
import { startInstagramOAuth } from '@/lib/instagram-oauth';
import { ClayAnimatedButton } from '@/components/clay/ClayAnimatedButton';
import { ClayFeatureCard } from '@/components/clay/ClayFeatureCard';
import { ClayAnimatedCard } from '@/components/clay/ClayAnimatedCard';
import { ClaySpinner } from '@/components/clay/ClaySpinner';
import { useShakeAnimation, useEntranceAnimation } from '@/hooks/useClayAnimations';
import type { DealThread } from '@/lib/types';

// ── Helpers ──────────────────────────────────────────────────────────

/** Formats large counts: 1500 -> "1.5K", 1_500_000 -> "1.5M". */
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

/** Clay-color-coded status badges for deal-thread lifecycle. */
const STATUS_META: Record<DealThread['status'], { label: string; className: string }> = {
  invited: { label: 'Invited', className: 'bg-surface-strong text-body' },
  negotiating: { label: 'Negotiating', className: 'bg-brand-ochre text-ink' },
  contracted: { label: 'Contracted', className: 'bg-brand-teal text-on-dark' },
  content_pending: { label: 'Content Pending', className: 'bg-brand-peach text-ink' },
  live: { label: 'Live', className: 'bg-brand-mint text-ink' },
  completed: { label: 'Completed', className: 'bg-surface-card text-muted' },
  declined: { label: 'Declined', className: 'bg-surface-strong text-muted' },
};

// ── Animation wrappers (web-safe via @/tw/animated, NOT raw reanimated) ──

/** Shakes its children on mount — used for error messages. */
function ErrorShake({ children }: { children: React.ReactNode }) {
  const { shake, animatedStyle } = useShakeAnimation();
  useEffect(() => {
    shake();
  }, [shake]);
  return <AnimatedView style={animatedStyle}>{children}</AnimatedView>;
}

/** Fades + slides its children in on mount with a stagger delay. */
function Entrance({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const { animatedStyle } = useEntranceAnimation(delay);
  return (
    <AnimatedView style={[{ width: '100%', alignItems: 'center' }, animatedStyle]}>
      {children}
    </AnimatedView>
  );
}

// ── Status badge ─────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DealThread['status'] }) {
  const meta = STATUS_META[status];
  return (
    <View className={cn('rounded-pill px-2.5 py-1 self-start', meta.className)}>
      <Text className="text-caption font-medium">{meta.label}</Text>
    </View>
  );
}

// ── Profile avatar (image or initials fallback) ──────────────────────

function ProfileAvatar({ url, name, size = 56 }: { url?: string; name: string; size?: number }) {
  const initials =
    name
      .split(' ')
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'K';

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        className="bg-surface-strong"
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  return (
    <View
      className="bg-primary items-center justify-center"
      style={{ width: size, height: size, borderRadius: size / 2, borderCurve: 'continuous' }}
    >
      <Text className="text-on-primary font-semibold" style={{ fontSize: size * 0.36 }}>
        {initials}
      </Text>
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────

export default function HomeScreen() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    data: dashboardData,
    loading: dashboardLoading,
    error: dashboardError,
    refresh: refreshDashboard,
  } = useDashboard();

  const [profile, setProfile] = useState<InstagramProfileResponse | null>(null);
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check Instagram connection on mount (prevents onboarding flash before resolve)
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
      } catch (_e: unknown) {
        // session_expired or not connected yet — leave profile null so onboarding shows
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
      try {
        await fetchMedia();
      } catch (e: unknown) {
        if (e instanceof Error && e.message === 'session_expired') setProfile(null);
      }
      try {
        await fetchInsights();
      } catch (e: unknown) {
        if (e instanceof Error && e.message === 'session_expired') setProfile(null);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to connect';
      setError(
        message === 'Instagram OAuth was cancelled'
          ? 'Instagram connection was cancelled'
          : message,
      );
    } finally {
      setIsConnecting(false);
    }
  }, [user, getToken]);

  const handleDisconnect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      await disconnectInstagram();
      setProfile(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to disconnect');
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // ── Derived state ──
  const isLoading = isCheckingConnection || isConnecting || dashboardLoading;
  const username =
    profile?.username ??
    dashboardData.creator?.ig_username ??
    dashboardData.creator?.username ??
    null;
  const displayName = profile?.name ?? dashboardData.creator?.full_name ?? username ?? 'Creator';
  const avatarUrl =
    profile?.profile_picture_url ?? dashboardData.creator?.profile_pic_url ?? undefined;
  const followerCount = profile?.followers_count ?? dashboardData.creator?.follower_count ?? null;

  // ── Loading state ──
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ClaySpinner size={40} label="Loading…" />
      </View>
    );
  }

  // ── Error state (dashboard load errors only) ──
  if (dashboardError && profile) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-canvas p-6">
        <ErrorShake>
          <Text className="text-error text-center text-body-sm" selectable>
            {dashboardError}
          </Text>
        </ErrorShake>
        <ClayAnimatedButton
          variant="secondary"
          onPress={() => {
            setError(null);
            void refreshDashboard();
          }}
        >
          Retry
        </ClayAnimatedButton>
      </View>
    );
  }

  // ── Not connected — Instagram onboarding hero ──
  if (!profile) {
    return (
      <View
        className="flex-1 bg-canvas"
        style={{
          paddingHorizontal: 24,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 16,
        }}
      >
        {/* Top block */}
        <Entrance delay={0}>
          <View className="items-center gap-3">
            <View
              className="bg-primary items-center justify-center"
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                borderCurve: 'continuous',
                boxShadow: '0 8px 24px rgba(10, 10, 10, 0.18)',
              }}
            >
              <Text
                className="text-on-primary font-medium"
                style={{ fontSize: 24, lineHeight: 28, letterSpacing: -0.5 }}
              >
                K
              </Text>
            </View>
            <Text className="text-display-sm font-medium tracking-[-0.5px] text-center text-primary">
              Welcome to Kaplun
            </Text>
            <Text className="text-center text-muted leading-relaxed max-w-[300px]">
              Your creator workspace for brand deals and Instagram growth.
            </Text>
          </View>
        </Entrance>

        {/* Middle block — feature rows */}
        <Entrance delay={100}>
          <View className="w-full gap-4 mt-4">
            <View className="flex-row items-center gap-3">
              <View
                className="bg-brand-pink items-center justify-center"
                style={{ width: 40, height: 40, borderRadius: 12, borderCurve: 'continuous' }}
              >
                <Text style={{ fontSize: 18 }}>📊</Text>
              </View>
              <View className="flex-1 gap-0.5">
                <Text className="text-title-sm font-semibold">Track analytics</Text>
                <Text className="text-body-sm text-muted">Follower growth and reel performance</Text>
              </View>
            </View>

            <View className="flex-row items-center gap-3">
              <View
                className="bg-brand-teal items-center justify-center"
                style={{ width: 40, height: 40, borderRadius: 12, borderCurve: 'continuous' }}
              >
                <Text style={{ fontSize: 18 }}>💼</Text>
              </View>
              <View className="flex-1 gap-0.5">
                <Text className="text-title-sm font-semibold">Manage deals</Text>
                <Text className="text-body-sm text-muted">Every brand deal in one pipeline</Text>
              </View>
            </View>

            <View className="flex-row items-center gap-3">
              <View
                className="bg-brand-lavender items-center justify-center"
                style={{ width: 40, height: 40, borderRadius: 12, borderCurve: 'continuous' }}
              >
                <Text style={{ fontSize: 18 }}>💬</Text>
              </View>
              <View className="flex-1 gap-0.5">
                <Text className="text-title-sm font-semibold">Brand DMs</Text>
                <Text className="text-body-sm text-muted">Never miss a brand DM</Text>
              </View>
            </View>
          </View>
        </Entrance>

        {/* Bottom block — anchored */}
        <Entrance delay={200}>
          <View className="w-full items-center gap-3" style={{ marginTop: 'auto' }}>
            {error && (
              <ErrorShake>
                <Text className="text-error text-center text-body-sm" selectable>
                  {error}
                </Text>
              </ErrorShake>
            )}
            <ClayAnimatedButton
              variant="primary"
              fullWidth
              loading={isConnecting}
              onPress={handleConnect}
            >
              Connect Instagram
            </ClayAnimatedButton>
            <Text className="text-xs text-muted-soft text-center">
              Uses Instagram's official API — your credentials are never stored
            </Text>
          </View>
        </Entrance>
      </View>
    );
  }

  // ── Connected but no dashboard data — empty state ──
  if (!dashboardData || (!dashboardData.deals?.length && !dashboardData.threads?.length)) {
    return (
      <View
        className="flex-1 bg-canvas"
        style={{
          paddingHorizontal: 24,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 16,
        }}
      >
        <View className="flex-1 items-center justify-center gap-4">
          <ProfileAvatar url={avatarUrl} name={displayName} size={72} />
          <Text
            className="text-display-sm font-medium tracking-[-0.5px] text-center"
            selectable
          >
            Welcome, @{username}
          </Text>
          <Text className="text-center text-muted text-body-sm max-w-[280px]">
            No campaign data yet — your agent will start outreach soon
          </Text>
          <ClayAnimatedButton variant="secondary" onPress={() => void refreshDashboard()}>
            Refresh
          </ClayAnimatedButton>
        </View>
      </View>
    );
  }

  // ── Connected with data — dashboard ──
  const activeDeals = dashboardData.deals?.length ?? 0;
  const unreadThreads =
    dashboardData.threads?.filter((t) => t.unread_count > 0).length ?? 0;
  const pendingContent =
    dashboardData.threads?.filter((t) => t.status === 'content_pending').length ?? 0;
  const recentThreads = dashboardData.threads?.slice(0, 3) ?? [];

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        gap: 16,
        paddingHorizontal: 16,
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 16,
      }}
    >
      {error && (
        <ErrorShake>
          <Text className="text-error text-center text-body-sm" selectable>
            {error}
          </Text>
        </ErrorShake>
      )}

      {/* Profile header */}
      <View className="flex-row items-center gap-3">
        <ProfileAvatar url={avatarUrl} name={displayName} size={48} />
        <View className="flex-1 gap-0.5">
          <Text
            className="text-display-sm font-medium tracking-[-0.5px]"
            numberOfLines={1}
            selectable
          >
            Welcome, @{username}
          </Text>
          <Text className="text-muted">Here&apos;s your campaign overview</Text>
          {followerCount != null && (
            <Text
              className="text-muted-soft text-caption"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {formatCount(followerCount)} followers
            </Text>
          )}
        </View>
      </View>

      {/* Stats — pink -> teal -> ochre (cycle, no adjacent repeats) */}
      <View className="flex-row flex-wrap gap-3">
        <View className="flex-1 min-w-[100px]">
          <ClayFeatureCard
            color="pink"
            padding="p-4"
            title={String(activeDeals)}
            description="Active Deals"
          />
        </View>
        <View className="flex-1 min-w-[100px]">
          <ClayFeatureCard
            color="teal"
            padding="p-4"
            title={String(unreadThreads)}
            description="Unread Threads"
          />
        </View>
        <View className="flex-1 min-w-[100px]">
          <ClayFeatureCard
            color="ochre"
            padding="p-4"
            title={String(pendingContent)}
            description="Pending Content"
          />
        </View>
      </View>

      {/* Quick links */}
      <View className="flex-row gap-3">
        <View className="flex-1">
          <ClayAnimatedCard delay={200} onPress={() => router.push('/(tabs)/(messages)')}>
            <View className="items-center gap-2">
              <Text className="font-semibold">View Messages</Text>
              <Text className="text-xs text-muted">Check your threads</Text>
            </View>
          </ClayAnimatedCard>
        </View>
        <View className="flex-1">
          <ClayAnimatedCard delay={200} onPress={() => router.push('/(tabs)/(profile)')}>
            <View className="items-center gap-2">
              <Text className="font-semibold">View Profile</Text>
              <Text className="text-xs text-muted">Your creator profile</Text>
            </View>
          </ClayAnimatedCard>
        </View>
      </View>

      {/* Recent activity */}
      <View className="gap-2.5">
        <Text className="text-title-md font-semibold">Recent Activity</Text>
        {recentThreads.map((thread, index) => (
          <ClayAnimatedCard key={thread.$id ?? index} delay={index * 100}>
            <View className="gap-2">
              <Text className="font-semibold" selectable>
                {thread.campaign_title}
              </Text>
              <View className="flex-row justify-between items-center">
                <StatusBadge status={thread.status} />
                {thread.unread_count > 0 && (
                  <Text
                    className="text-xs text-muted"
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {thread.unread_count} unread
                  </Text>
                )}
              </View>
            </View>
          </ClayAnimatedCard>
        ))}
        {recentThreads.length === 0 && (
          <Text className="text-xs text-muted">No recent activity</Text>
        )}
      </View>

      {/* Disconnect */}
      <View className="items-center mt-2">
        <ClayAnimatedButton variant="text-link" onPress={handleDisconnect}>
          Disconnect Instagram
        </ClayAnimatedButton>
      </View>
    </ScrollView>
  );
}
