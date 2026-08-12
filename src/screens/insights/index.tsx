import React, { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';

import { View, Pressable, useCSSVariable } from '@/tw';
import { Image } from '@/tw/image';
import { ScreenShell } from '@/components/screen-shell';
import {
  Alert,
  Button,
  Card,
  Chip,
  Kpi,
  Skeleton,
  Text,
} from 'panelui-native';
import { useInsights, type TopMediaItem } from '@/hooks/useInsights';
import { useAppwriteUser } from '@/hooks/useAppwriteUser';
import { startInstagramOAuth } from '@/lib/instagram-oauth';
import { addLog } from '@/lib/logger';
import type { InsightPoint } from '@/lib/instagram';
import { dayLabel, formatCompact, sumPoints } from './utils';
import { Reveal } from '@/components/ui/reveal';

type PeriodDays = 7 | 28;
const PERIOD_OPTIONS: readonly PeriodDays[] = [7, 28];

// Scrim-over-photo glyphs sit on the image, not on a themed surface.
const SCRIM_GLYPH = '#ffffff';

// ── Skeleton ─────────────────────────────────────────────────────────

function DataSkeleton() {
  return (
    <View className="gap-4">
      <View className="flex-row gap-2.5">
        <Skeleton className="h-23 flex-1 rounded-2xl" />
        <Skeleton className="h-23 flex-1 rounded-2xl" />
      </View>
      <View className="flex-row gap-2.5">
        <Skeleton className="h-23 flex-1 rounded-2xl" />
        <Skeleton className="h-23 flex-1 rounded-2xl" />
      </View>
      <Skeleton className="h-56 rounded-2xl" />
      <Skeleton className="h-35 rounded-2xl" />
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
  return (
    <View className="flex-row gap-1.5">
      {PERIOD_OPTIONS.map((option) => (
        <Chip
          key={option}
          size="sm"
          selected={option === days}
          onPress={() => onChange(option)}
        >
          {`${option}D`}
        </Chip>
      ))}
    </View>
  );
}

// ── KPI grid ─────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View className="flex-grow" style={{ flexBasis: '48%' }}>
      <Kpi>
        <Kpi.Stat>
          <Kpi.Title className="text-xs uppercase tracking-wider">{label}</Kpi.Title>
          <Kpi.Value className="tracking-tight">{value}</Kpi.Value>
          <Text size="xs" muted>
            {sub}
          </Text>
        </Kpi.Stat>
      </Kpi>
    </View>
  );
}

// ── Reach chart ──────────────────────────────────────────────────────

function ReachChartCard({
  points,
  windowDays,
}: {
  points: InsightPoint[];
  windowDays: PeriodDays;
}) {
  // Selection latches the last index the pan gesture touched — the chart's own
  // active band resets when the finger lifts, so the readout and Reset survive.
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const total = useMemo(() => sumPoints(points), [points]);
  const selectedPoint =
    selectedIdx != null && selectedIdx < points.length ? points[selectedIdx] : null;

  const hasData = points.length > 0 && total > 0;
  const headerValue = selectedPoint ? selectedPoint.value : total;
  const headerSub = selectedPoint ? dayLabel(selectedPoint.endTime) : `Last ${windowDays} days`;

  const chartData = useMemo(
    () => points.map((p) => ({ day: dayLabel(p.endTime), value: p.value })),
    [points]
  );

  const muted = useCSSVariable('--color-muted-foreground') as string;
  const primary = useCSSVariable('--color-primary') as string;
  return (
    <Card className="gap-3.5 p-4.5">
      <View className="flex-row items-end justify-between">
        <View className="gap-0.5">
          <Text size="xs" weight="semibold" muted className="uppercase tracking-wider">
            Reach
          </Text>
          <Text size="2xl" weight="bold" className="tracking-tight">
            {formatCompact(headerValue)}
          </Text>
          <Text size="xs" muted>
            {headerSub}
          </Text>
        </View>
        {selectedPoint != null && (
          <Button variant="ghost" size="sm" onPress={() => setSelectedIdx(null)}>
            Reset
          </Button>
        )}
      </View>

      {hasData ? (
        <View className="gap-1">
          <View className="flex-row items-end gap-0.5" style={{ height: 120 }}>
            {chartData.map((d, i) => {
              const max = Math.max(...chartData.map((c) => c.value), 1);
              const h = Math.max((d.value / max) * 100, 3);
              const isSelected = selectedIdx === i;
              return (
                <Pressable
                  key={i}
                  onPress={() => setSelectedIdx(selectedIdx === i ? null : i)}
                  className="flex-1 items-center justify-end"
                  style={{ height: '100%' }}
                >
                  <View
                    className="w-full rounded-t-sm"
                    style={{
                      height: `${h}%`,
                      backgroundColor: isSelected ? primary : muted,
                      opacity: isSelected ? 1 : 0.5,
                    }}
                  />
                </Pressable>
              );
            })}
          </View>
          {chartData.length > 0 && (
            <View className="flex-row justify-between">
              <Text size="xs" muted>{chartData[0].day}</Text>
              <Text size="xs" muted>{chartData[chartData.length - 1].day}</Text>
            </View>
          )}
        </View>
      ) : (
        <View className="h-30 items-center justify-center gap-1.5">
          <Ionicons name="stats-chart-outline" size={22} color={muted} />
          <Text size="sm" muted className="max-w-60 text-center">
            No reach data yet — Meta can take up to 48h to report new insights.
          </Text>
        </View>
      )}
    </Card>
  );
}

// ── Followers card (accent surface, sparkline + trend badge) ─────────

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

  const muted = useCSSVariable('--color-muted-foreground') as string;
  const primary = useCSSVariable('--color-primary') as string;
  return (
    <Kpi surface={false} colorIndex={3} className="gap-2 rounded-2xl bg-success-soft p-4">
      <Kpi.Header>
        <Kpi.Title className="text-xs uppercase tracking-wider">Followers</Kpi.Title>
        {delta != null && (
          <Kpi.Trend
            variant="badge"
            value={delta}
            format={(v) =>
              v > 0 ? `+${formatCompact(v)}` : v < 0 ? formatCompact(v) : 'No change'
            }
          />
        )}
      </Kpi.Header>
      <Kpi.Value className="text-3xl tracking-tight">
        {current != null ? formatCompact(current) : '—'}
      </Kpi.Value>

      {series.length >= 2 ? (
        <View className="flex-row items-end gap-px" style={{ height: 44 }}>
          {series.map((p, i) => {
            const max = Math.max(...series.map((s) => s.value), 1);
            const min = Math.min(...series.map((s) => s.value), 0);
            const range = max - min || 1;
            const h = Math.max(((p.value - min) / range) * 100, 4);
            return (
              <View
                key={i}
                className="flex-1 rounded-sm"
                style={{
                  height: `${h}%`,
                  backgroundColor: primary,
                  opacity: 0.4 + (i / series.length) * 0.6,
                }}
              />
            );
          })}
        </View>
      ) : (
        <View className="flex-row items-center gap-2">
          <Ionicons name="lock-closed-outline" size={13} color={muted} />
          <Text size="sm" muted className="flex-1">
            Daily follower trends unlock at 100 followers — a Meta threshold.
          </Text>
        </View>
      )}

      <Text size="xs" muted>
        Last {windowDays} days
      </Text>
    </Kpi>
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
  const foreground = useCSSVariable('--color-foreground') as string;
  const muted = useCSSVariable('--color-muted-foreground') as string;
  const open = useCallback(() => {
    if (item.permalink) {
      Linking.openURL(item.permalink).catch((err: unknown) =>
        addLog(`insights: open permalink failed — ${err instanceof Error ? err.message : String(err)}`)
      );
    }
  }, [item.permalink]);

  return (
    <Pressable onPress={open} className="flex-grow gap-1.5" style={{ flexBasis: '48%' }}>
      <View className="aspect-square overflow-hidden rounded-xl border border-border bg-card">
        {item.imageUri ? (
          <Image
            source={{ uri: item.imageUri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Ionicons name="image-outline" size={22} color={muted} />
          </View>
        )}
        {typeIcon && (
          <View className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5">
            <Ionicons name={typeIcon} size={11} color={SCRIM_GLYPH} />
          </View>
        )}
      </View>
      <View className="flex-row items-center gap-3">
        <View className="flex-row items-center gap-1">
          <Ionicons name="heart" size={12} color={foreground} />
          <Text size="xs" weight="medium">
            {formatCompact(item.like_count ?? 0)}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Ionicons name="chatbubble" size={11} color={foreground} />
          <Text size="xs" weight="medium">
            {formatCompact(item.comments_count ?? 0)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function TopPostsCard({ items }: { items: TopMediaItem[] }) {
  const muted = useCSSVariable('--color-muted-foreground') as string;
  return (
    <Card>
      <Card.Header>
        <Card.Title>Top posts</Card.Title>
        <Card.Description>Ranked by likes + comments</Card.Description>
      </Card.Header>
      <Card.Content>
        {items.length > 0 ? (
          <View className="flex-row flex-wrap gap-3">
            {items.map((item) => (
              <TopPostTile key={item.id} item={item} />
            ))}
          </View>
        ) : (
          <View className="items-center gap-1.5 py-5">
            <Ionicons name="images-outline" size={22} color={muted} />
            <Text size="sm" muted className="max-w-60 text-center">
              No posts yet — share a post on Instagram and its performance lands here.
            </Text>
          </View>
        )}
      </Card.Content>
    </Card>
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
  const foreground = useCSSVariable('--color-foreground') as string;
  const primaryForeground = useCSSVariable('--color-primary-foreground') as string;
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
    <Card className="items-center gap-3 p-6">
      <View className="h-13 w-13 items-center justify-center rounded-full bg-info-soft">
        <Ionicons name={copy.icon} size={24} color={foreground} />
      </View>
      <Text size="lg" weight="semibold" className="text-center tracking-tight">
        {copy.title}
      </Text>
      <Text size="sm" muted className="max-w-70 text-center">
        {copy.body}
      </Text>
      <Button
        variant="primary"
        fullWidth
        loading={loading}
        onPress={onReconnect}
        startContent={<Ionicons name="logo-instagram" size={16} color={primaryForeground} />}
      >
        {loading ? 'Waiting for Instagram…' : 'Reconnect Instagram'}
      </Button>
    </Card>
  );
}

function InlineErrorStrip({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive" className="items-center">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description numberOfLines={2}>
          Couldn’t load insights — {message}
        </Alert.Description>
      </Alert.Content>
      <Button variant="secondary" size="sm" onPress={onRetry}>
        Retry
      </Button>
    </Alert>
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
    <ScreenShell contentContainerStyle={{ gap: 12 }}>
      {/* Header */}
      <Reveal delay={0} style={{ width: '100%' }}>
        <View className="gap-1.5">
          <View className="flex-row items-center justify-between">
            <Text size="3xl" weight="medium" className="tracking-tight">
              Insights
            </Text>
            <View className="flex-row items-center gap-2.5">
              {isRefreshing && !isLoading ? (
                <View className="flex-row items-center gap-1.5">
                  <View className="h-1.5 w-1.5 rounded-full bg-warning" />
                  <Text size="xs" muted>
                    Updating…
                  </Text>
                </View>
              ) : null}
              <PeriodToggle days={windowDays} onChange={setWindowDays} />
            </View>
          </View>
          <Text size="sm" muted>
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
            <View className="flex-row flex-wrap gap-2.5">
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
