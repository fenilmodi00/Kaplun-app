import React, { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';

import { View, Text, Pressable } from '@/tw';
import { Image } from '@/tw/image';
import { ScreenShell } from '@/components/screen-shell';
import { ClayAnimatedButton } from '@/components/clay/ClayAnimatedButton';
import { useInsights, type TopMediaItem } from '@/hooks/useInsights';
import { useAppwriteUser } from '@/hooks/useAppwriteUser';
import { startInstagramOAuth } from '@/lib/instagram-oauth';
import { addLog } from '@/lib/logger';
import { useThemeColors } from '@/lib/theme';
import type { InsightPoint } from '@/lib/instagram';
import { dayLabel, formatCompact, sumPoints } from './utils';
import { Reveal, SkeletonBlock } from './components';

type PeriodDays = 7 | 28;
const PERIOD_OPTIONS: readonly PeriodDays[] = [7, 28];

// ── Skeleton ─────────────────────────────────────────────────────────

function DataSkeleton() {
  return (
    <View style={{ gap: 16 }}>
      <View className="flex-row" style={{ gap: 10 }}>
        <SkeletonBlock height={92} style={{ flex: 1 }} />
        <SkeletonBlock height={92} style={{ flex: 1 }} />
      </View>
      <View className="flex-row" style={{ gap: 10 }}>
        <SkeletonBlock height={92} style={{ flex: 1 }} />
        <SkeletonBlock height={92} style={{ flex: 1 }} />
      </View>
      <SkeletonBlock height={220} />
      <SkeletonBlock height={140} />
    </View>
  );
}

// ── Header pieces ────────────────────────────────────────────────────

function PeriodToggle({
  days,
  onChange,
}: {
  days: PeriodDays;
  onChange: (d: PeriodDays) => void;
}) {
  const t = useThemeColors();
  return (
    <View
      className="flex-row bg-surface-card border border-hairline"
      style={{ borderRadius: 9999, padding: 3 }}
    >
      {PERIOD_OPTIONS.map((option) => {
        const active = option === days;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            hitSlop={6}
            style={{
              borderRadius: 9999,
              paddingVertical: 10,
              paddingHorizontal: 16,
              minWidth: 48,
              alignItems: 'center',
              backgroundColor: active ? t.ink : 'transparent',
            }}
          >
            <Text
              className="font-semibold"
              style={{ fontSize: 12.5, color: active ? t.onPrimary : t.muted }}
            >
              {option}D
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── KPI grid ─────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View
      className="bg-surface-card border border-hairline rounded-lg"
      style={{ flexBasis: '48%', flexGrow: 1, padding: 14, gap: 2 }}
    >
      <Text
        className="font-semibold uppercase text-muted"
        style={{ fontSize: 11, letterSpacing: 1.2 }}
      >
        {label}
      </Text>
      <Text className="font-semibold text-ink" style={{ fontSize: 24, letterSpacing: -0.4 }}>
        {value}
      </Text>
      <Text className="text-muted-soft" style={{ fontSize: 12 }}>
        {sub}
      </Text>
    </View>
  );
}

// ── Reach chart ──────────────────────────────────────────────────────

const CHART_HEIGHT = 120;

function ReachChartCard({
  points,
  windowDays,
}: {
  points: InsightPoint[];
  windowDays: PeriodDays;
}) {
  // Selection is keyed by day (endTime), not index — it survives refetches and
  // resolves to null automatically when the period toggle drops the day.
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const total = useMemo(() => sumPoints(points), [points]);
  const max = useMemo(() => points.reduce((m, p) => Math.max(m, p.value), 0), [points]);
  const maxIdx = useMemo(
    () => (max > 0 ? points.findIndex((p) => p.value === max) : -1),
    [points, max]
  );
  const selectedPoint = useMemo(
    () => points.find((p) => p.endTime === selectedTime) ?? null,
    [points, selectedTime]
  );

  const hasData = points.length > 0 && total > 0;
  const headerValue = selectedPoint ? selectedPoint.value : total;
  const headerSub = selectedPoint ? dayLabel(selectedPoint.endTime) : `Last ${windowDays} days`;

  const axisIdx = useMemo(() => {
    if (points.length < 2) return [];
    const last = points.length - 1;
    return [0, Math.floor(last / 3), Math.floor((2 * last) / 3), last].filter(
      (v, i, arr) => arr.indexOf(v) === i
    );
  }, [points]);

  const barRadius = windowDays <= 7 ? 6 : 3;

  const t = useThemeColors();
  return (
    <View className="bg-surface-card border border-hairline rounded-xl" style={{ padding: 18, gap: 14 }}>
      <View className="flex-row items-end justify-between">
        <View style={{ gap: 2 }}>
          <Text
            className="font-semibold uppercase text-muted"
            style={{ fontSize: 11, letterSpacing: 1.2 }}
          >
            Reach
          </Text>
          <Text className="font-semibold text-ink" style={{ fontSize: 28, letterSpacing: -0.5 }}>
            {formatCompact(headerValue)}
          </Text>
          <Text className="text-muted-soft" style={{ fontSize: 12 }}>
            {headerSub}
          </Text>
        </View>
        {selectedPoint != null && (
          <Pressable
            onPress={() => setSelectedTime(null)}
            style={{ paddingVertical: 6, paddingHorizontal: 8 }}
          >
            <Text className="font-medium text-muted" style={{ fontSize: 12.5 }}>
              Reset
            </Text>
          </Pressable>
        )}
      </View>

      {hasData ? (
        <View>
          <View className="flex-row items-end" style={{ height: CHART_HEIGHT, gap: windowDays <= 7 ? 6 : 2 }}>
            {points.map((point, i) => {
              const pct = max > 0 ? point.value / max : 0;
              const isSelected = selectedTime === point.endTime;
              const isMax = i === maxIdx && selectedTime == null;
              const barClass = isSelected ? 'bg-ink' : isMax ? 'bg-brand-ochre' : 'bg-surface-strong';
              return (
                <Pressable
                  key={point.endTime}
                  onPress={() => setSelectedTime(isSelected ? null : point.endTime)}
                  className={`flex-1 ${barClass}`}
                  style={{
                    height: `${Math.max(pct * 100, 2.5)}%`,
                    borderTopLeftRadius: barRadius,
                    borderTopRightRadius: barRadius,
                  }}
                  accessibilityLabel={`Reach ${point.value} on ${dayLabel(point.endTime)}`}
                />
              );
            })}
          </View>
          <View className="flex-row justify-between" style={{ marginTop: 8 }}>
            {axisIdx.map((i) => (
              <Text key={i} className="text-muted-soft" style={{ fontSize: 10.5 }}>
                {dayLabel(points[i].endTime)}
              </Text>
            ))}
          </View>
        </View>
      ) : (
        <View className="items-center" style={{ height: CHART_HEIGHT, justifyContent: 'center', gap: 6 }}>
          <Ionicons name="stats-chart-outline" size={22} color={t.mutedSoft} />
          <Text className="text-body-sm text-muted text-center" style={{ maxWidth: 240 }}>
            No reach data yet — Meta can take up to 48h to report new insights.
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Followers card (saturated Clay feature card) ─────────────────────

function FollowersCard({
  followers,
  series,
  windowDays,
}: {
  followers: number | null;
  series: InsightPoint[];
  windowDays: PeriodDays;
}) {
  const current = followers ?? (series.length > 0 ? series[series.length - 1].value : null);
  const delta =
    series.length >= 2 ? series[series.length - 1].value - series[0].value : null;

  const min = series.reduce((m, p) => Math.min(m, p.value), Infinity);
  const max = series.reduce((m, p) => Math.max(m, p.value), -Infinity);
  const range = max - min;

  return (
    <View className="bg-brand-teal rounded-xl" style={{ padding: 18, gap: 12 }}>
      <View className="flex-row items-start justify-between">
        <View style={{ gap: 2 }}>
          <Text
            className="font-semibold uppercase"
            style={{ fontSize: 11, letterSpacing: 1.2, color: 'rgba(255,255,255,0.7)' }}
          >
            Followers
          </Text>
          <Text className="font-semibold text-white" style={{ fontSize: 28, letterSpacing: -0.5 }}>
            {current != null ? formatCompact(current) : '—'}
          </Text>
        </View>
        {delta != null && (
          <View
            className="flex-row items-center"
            style={{
              gap: 4,
              backgroundColor: 'rgba(255,255,255,0.15)',
              borderRadius: 9999,
              paddingVertical: 4,
              paddingHorizontal: 10,
            }}
          >
            <Ionicons
              name={delta > 0 ? 'trending-up' : delta < 0 ? 'trending-down' : 'remove'}
              size={12}
              color="#ffffff"
            />
            <Text className="font-semibold text-white" style={{ fontSize: 12 }}>
              {delta > 0 ? `+${formatCompact(delta)}` : delta === 0 ? 'No change' : formatCompact(delta)}
            </Text>
          </View>
        )}
      </View>

      {series.length >= 2 ? (
        <View className="flex-row items-end" style={{ height: 44, gap: 2 }}>
          {series.map((point, i) => {
            const pct = range > 0 ? (point.value - min) / range : 0;
            const isLast = i === series.length - 1;
            return (
              <View
                key={point.endTime}
                className="flex-1"
                style={{
                  height: `${25 + pct * 75}%`,
                  backgroundColor: isLast ? '#ffffff' : 'rgba(255,255,255,0.35)',
                  borderTopLeftRadius: 2,
                  borderTopRightRadius: 2,
                }}
              />
            );
          })}
        </View>
      ) : (
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Ionicons name="lock-closed-outline" size={13} color="rgba(255,255,255,0.8)" />
          <Text style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.8)', flex: 1 }}>
            Daily follower trends unlock at 100 followers — a Meta threshold.
          </Text>
        </View>
      )}

      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
        Last {windowDays} days
      </Text>
    </View>
  );
}

// ── Top posts ────────────────────────────────────────────────────────

function mediaTypeIcon(item: TopMediaItem): React.ComponentProps<typeof Ionicons>['name'] | null {
  if (item.media_product_type === 'REELS' || item.media_type === 'VIDEO') return 'videocam';
  if (item.media_type === 'CAROUSEL_ALBUM') return 'copy';
  return null;
}

function TopPostTile({ item }: { item: TopMediaItem }) {
  const typeIcon = mediaTypeIcon(item);
  const t = useThemeColors();
  const open = useCallback(() => {
    if (item.permalink) {
      Linking.openURL(item.permalink).catch((err: unknown) =>
        addLog(`insights: open permalink failed — ${err instanceof Error ? err.message : String(err)}`)
      );
    }
  }, [item.permalink]);

  return (
    <Pressable onPress={open} style={{ flexBasis: '48%', flexGrow: 1, gap: 6 }}>
      <View
        className="bg-surface-card border border-hairline"
        style={{ aspectRatio: 1, borderRadius: 12, overflow: 'hidden' }}
      >
        {item.imageUri ? (
          <Image
            source={{ uri: item.imageUri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Ionicons name="image-outline" size={22} color={t.mutedSoft} />
          </View>
        )}
        {typeIcon && (
          <View
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              backgroundColor: 'rgba(0,0,0,0.5)',
              borderRadius: 9999,
              padding: 5,
            }}
          >
            <Ionicons name={typeIcon} size={11} color={t.onPrimary} />
          </View>
        )}
      </View>
      <View className="flex-row items-center" style={{ gap: 12 }}>
        <View className="flex-row items-center" style={{ gap: 4 }}>
          <Ionicons name="heart" size={12} color={t.ink} />
          <Text className="font-medium text-ink" style={{ fontSize: 12 }}>
            {formatCompact(item.like_count ?? 0)}
          </Text>
        </View>
        <View className="flex-row items-center" style={{ gap: 4 }}>
          <Ionicons name="chatbubble" size={11} color={t.ink} />
          <Text className="font-medium text-ink" style={{ fontSize: 12 }}>
            {formatCompact(item.comments_count ?? 0)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function TopPostsCard({ items }: { items: TopMediaItem[] }) {
  const t = useThemeColors();
  return (
    <View className="bg-surface-card border border-hairline rounded-xl" style={{ padding: 18, gap: 14 }}>
      <View style={{ gap: 2 }}>
        <Text
          className="font-semibold uppercase text-muted"
          style={{ fontSize: 11, letterSpacing: 1.2 }}
        >
          Top posts
        </Text>
        <Text className="text-muted-soft" style={{ fontSize: 12 }}>
          Ranked by likes + comments
        </Text>
      </View>
      {items.length > 0 ? (
        <View className="flex-row flex-wrap" style={{ gap: 12 }}>
          {items.map((item) => (
            <TopPostTile key={item.id} item={item} />
          ))}
        </View>
      ) : (
        <View className="items-center" style={{ paddingVertical: 18, gap: 6 }}>
          <Ionicons name="images-outline" size={22} color={t.mutedSoft} />
          <Text className="text-body-sm text-muted text-center" style={{ maxWidth: 240 }}>
            No posts yet — share a post on Instagram and its performance lands here.
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Error states ─────────────────────────────────────────────────────

function ReconnectCard({
  variant,
  loading,
  onReconnect,
}: {
  variant: 'session_expired' | 'insights_permission';
  loading: boolean;
  onReconnect: () => void;
}) {
  const t = useThemeColors();
  const copy =
    variant === 'insights_permission'
      ? {
          icon: 'key-outline' as const,
          title: 'Reconnect to unlock insights',
          body: "Meta's analytics permission was added after your Instagram was connected. Reconnect once to grant it — your data stays put.",
        }
      : {
          icon: 'log-in-outline' as const,
          title: 'Instagram disconnected',
          body: 'Your Instagram session expired. Reconnect to load your analytics.',
        };

  return (
    <View
      className="bg-surface-card border border-hairline rounded-xl items-center"
      style={{ padding: 24, gap: 12 }}
    >
      <View
        className="bg-brand-lavender items-center justify-center"
        style={{ width: 52, height: 52, borderRadius: 26 }}
      >
        <Ionicons name={copy.icon} size={24} color={t.ink} />
      </View>
      <Text
        className="font-semibold text-ink text-center"
        style={{ fontSize: 19, letterSpacing: -0.3 }}
      >
        {copy.title}
      </Text>
      <Text className="text-body-sm text-muted text-center" style={{ maxWidth: 280 }}>
        {copy.body}
      </Text>
      <ClayAnimatedButton variant="primary" fullWidth loading={loading} onPress={onReconnect} height={48}>
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Ionicons name="logo-instagram" size={16} color={t.onPrimary} />
          <Text className="font-semibold text-white" style={{ fontSize: 14.5 }}>
            {loading ? 'Waiting for Instagram…' : 'Reconnect Instagram'}
          </Text>
        </View>
      </ClayAnimatedButton>
    </View>
  );
}

function InlineErrorStrip({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View
      className="flex-row items-center bg-surface-card border border-hairline rounded-lg"
      style={{ padding: 12, gap: 10 }}
    >
      <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
      <Text className="text-muted" style={{ fontSize: 12.5, flex: 1 }} numberOfLines={2}>
        Couldn’t load insights — {message}
      </Text>
      <Pressable onPress={onRetry} style={{ paddingVertical: 6, paddingHorizontal: 8 }}>
        <Text className="font-semibold text-ink" style={{ fontSize: 12.5 }}>
          Retry
        </Text>
      </Pressable>
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────

export default function InsightsScreen() {
  const { data: user } = useAppwriteUser();
  const queryClient = useQueryClient();
  const [windowDays, setWindowDays] = useState<PeriodDays>(28);
  const { profile, insights, topMedia, isLoading, isRefreshing, error, refresh } =
    useInsights(windowDays);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const handleReconnect = useCallback(async () => {
    if (!user) return;
    setIsReconnecting(true);
    try {
      await startInstagramOAuth(user.$id, user.$id);
      await queryClient.invalidateQueries({ queryKey: ['insightsProfile'] });
      await queryClient.invalidateQueries({ queryKey: ['insightsAccount'] });
      await queryClient.invalidateQueries({ queryKey: ['insightsMedia'] });
      await queryClient.invalidateQueries({ queryKey: ['creator'] });
      await queryClient.invalidateQueries({ queryKey: ['automationGate'] });
      refresh();
    } catch (err: unknown) {
      addLog(
        `insights: reconnect failed — ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsReconnecting(false);
    }
  }, [user, queryClient, refresh]);

  const isReconnectError = error === 'session_expired' || error === 'insights_permission';
  const reachTotal = insights ? sumPoints(insights.reach) : null;
  const reachAvg = insights && insights.reach.length > 0
    ? Math.round(sumPoints(insights.reach) / insights.reach.length)
    : null;
  const followerSeries = insights?.followerCount ?? [];
  const followerDelta =
    followerSeries.length >= 2
      ? followerSeries[followerSeries.length - 1].value - followerSeries[0].value
      : null;

  return (
    <ScreenShell contentContainerStyle={{ gap: 16 }}>
      {/* Header */}
      <Reveal delay={0} style={{ width: '100%' }}>
        <View style={{ gap: 6 }}>
          <View className="flex-row items-center justify-between">
            <Text
              className="font-medium text-ink"
              style={{ fontSize: 32, lineHeight: 37, letterSpacing: -0.5 }}
            >
              Insights
            </Text>
            <View className="flex-row items-center" style={{ gap: 10 }}>
              {isRefreshing && !isLoading ? (
                <View className="flex-row items-center" style={{ gap: 5 }}>
                  <View
                    className="bg-brand-ochre"
                    style={{ width: 6, height: 6, borderRadius: 3 }}
                  />
                  <Text className="text-muted-soft" style={{ fontSize: 11.5 }}>
                    Updating…
                  </Text>
                </View>
              ) : null}
              <PeriodToggle days={windowDays} onChange={setWindowDays} />
            </View>
          </View>
          <Text className="text-muted" style={{ fontSize: 13 }}>
            {profile?.username ? `@${profile.username} · ` : ''}Last {windowDays} days
          </Text>
        </View>
      </Reveal>

      {isLoading ? (
        <Reveal delay={50} style={{ width: '100%' }}>
          <DataSkeleton />
        </Reveal>
      ) : isReconnectError ? (
        <Reveal delay={50} style={{ width: '100%' }}>
          <ReconnectCard
            variant={error as 'session_expired' | 'insights_permission'}
            loading={isReconnecting}
            onReconnect={handleReconnect}
          />
        </Reveal>
      ) : (
        <>
          {error && (
            <Reveal delay={50} style={{ width: '100%' }}>
              <InlineErrorStrip message={error} onRetry={refresh} />
            </Reveal>
          )}

          {/* KPI grid */}
          <Reveal delay={60} style={{ width: '100%' }}>
            <View className="flex-row flex-wrap" style={{ gap: 10 }}>
              <KpiCard
                label="Followers"
                value={
                  profile?.followers_count != null
                    ? formatCompact(profile.followers_count)
                    : followerSeries.length > 0
                      ? formatCompact(followerSeries[followerSeries.length - 1].value)
                      : '—'
                }
                sub={
                  followerDelta != null
                    ? followerDelta > 0
                      ? `+${formatCompact(followerDelta)} this period`
                      : followerDelta < 0
                        ? `${formatCompact(followerDelta)} this period`
                        : 'No change this period'
                    : 'Trends at 100+ followers'
                }
              />
              <KpiCard
                label="Reach"
                value={reachTotal != null ? formatCompact(reachTotal) : '—'}
                sub={reachAvg != null ? `avg ${formatCompact(reachAvg)}/day` : `Last ${windowDays} days`}
              />
              <KpiCard
                label="Views"
                value={insights?.viewsTotal != null ? formatCompact(insights.viewsTotal) : '—'}
                sub={insights?.viewsTotal != null ? `Last ${windowDays} days` : 'Unavailable yet'}
              />
              <KpiCard
                label="Engaged"
                value={
                  insights?.accountsEngagedTotal != null
                    ? formatCompact(insights.accountsEngagedTotal)
                    : '—'
                }
                sub={
                  insights?.accountsEngagedTotal != null
                    ? `Accounts · ${windowDays}D`
                    : 'Unavailable yet'
                }
              />
            </View>
          </Reveal>

          {/* Reach chart */}
          <Reveal delay={110} style={{ width: '100%' }}>
            <ReachChartCard points={insights?.reach ?? []} windowDays={windowDays} />
          </Reveal>

          {/* Followers */}
          <Reveal delay={160} style={{ width: '100%' }}>
            <FollowersCard
              followers={profile?.followers_count ?? null}
              series={followerSeries}
              windowDays={windowDays}
            />
          </Reveal>

          {/* Top posts */}
          <Reveal delay={210} style={{ width: '100%' }}>
            <TopPostsCard items={topMedia} />
          </Reveal>
        </>
      )}
    </ScreenShell>
  );
}
