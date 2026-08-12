/**
 * Profile screen — creator card, reels, insights, deals, account actions.
 *
 * PanelUI components (Card, Avatar, Badge, Switch, Button, Skeleton, Text)
 * on semantic tokens; layout stays on `@/tw` primitives.
 */

import React, { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from '@/lib/reanimated-platform';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
  Switch,
  Text,
} from 'panelui-native';
import { ScrollView, View } from '@/tw';
import { Image } from '@/tw/image';
import { useCreatorProfile } from '@/hooks/useCreatorProfile';
import { useDashboard } from '@/hooks/useDashboard';
import { disconnectInstagram } from '@/lib/instagram';
import { useSession } from '@/lib/session-context';
import { addLog } from '@/lib/logger';
import { TAB_BAR_CLEARANCE } from '@/components/screen-shell';
import { useThemePreference, setThemePreference } from '@/lib/theme';
import { formatCount, statusBadgeVariant } from './utils';

function SectionTitle({ children }: { children: string }) {
  return (
    <Text size="lg" weight="semibold">
      {children}
    </Text>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { signOut } = useSession();
  const {
    creator,
    dealThreads,
    recentReels,
    insights,
    isLoading,
    error,
    refresh,
  } = useCreatorProfile();
  const { loading: dashboardLoading } = useDashboard();
  const themePreference = useThemePreference();

  async function handleSignOut() {
    await signOut();
  }

  // Avatar scale-in entrance (reanimated-platform is web/native safe)
  const avatarScale = useSharedValue(0);
  useEffect(() => {
    avatarScale.value = withSpring(1, { damping: 12, stiffness: 140 });
  }, [avatarScale]);
  const avatarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: avatarScale.value }],
  }));

  async function handleDisconnect() {
    try {
      await disconnectInstagram();
      refresh();
    } catch (err: unknown) {
      // User can retry; log so silent failures are visible in SplashLogger.
      addLog(
        `profile: disconnect failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const contentPadding = {
    paddingTop: insets.top + 12,
    paddingBottom: insets.bottom + TAB_BAR_CLEARANCE,
  };

  // Loading state — skeleton, not a full-screen spinner
  if (isLoading || dashboardLoading) {
    return (
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-3 px-4"
        contentContainerStyle={contentPadding}
      >
        <View className="mt-6 items-center gap-2.5">
          <Skeleton className="h-20 w-20 rounded-full" />
          <Skeleton className="h-5 w-36 rounded-lg" />
          <Skeleton className="h-4 w-24 rounded-md" />
        </View>
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </ScrollView>
    );
  }

  // Error state
  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <EmptyState>
          <EmptyState.Header>
            <EmptyState.Title>Something went wrong</EmptyState.Title>
            <EmptyState.Description>{error}</EmptyState.Description>
          </EmptyState.Header>
          <EmptyState.Content>
            <Button variant="outline" onPress={refresh}>
              Retry
            </Button>
          </EmptyState.Content>
        </EmptyState>
      </View>
    );
  }

  // Empty state — no creator connected
  if (!creator) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <EmptyState>
          <EmptyState.Header>
            <EmptyState.Title>Connect Instagram</EmptyState.Title>
            <EmptyState.Description>
              Connect your Instagram to see your profile
            </EmptyState.Description>
          </EmptyState.Header>
          <EmptyState.Content>
            <Button variant="outline" onPress={refresh}>
              Refresh
            </Button>
          </EmptyState.Content>
        </EmptyState>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 px-4"
      contentContainerStyle={contentPadding}
      showsVerticalScrollIndicator={false}
    >
      {/* Creator Card */}
      <Card>
        <Card.Content className="gap-2.5">
          <View className="flex-row items-center gap-3.5">
            <Animated.View style={avatarAnimatedStyle}>
              <Avatar
                size="lg"
                source={
                  creator.profile_pic_url ? { uri: creator.profile_pic_url } : undefined
                }
                fallback={(creator.full_name || '?').charAt(0).toUpperCase()}
                accessibilityLabel={`${creator.full_name} avatar`}
              />
            </Animated.View>
            <View className="flex-1 gap-0.5">
              <Text size="lg" weight="semibold">
                {creator.full_name}
              </Text>
              <Text size="sm" muted>
                @{creator.ig_username}
              </Text>
              <View className="mt-1 flex-row flex-wrap gap-2">
                <Badge variant="secondary">
                  {`${formatCount(creator.follower_count)} followers`}
                </Badge>
                <Badge variant="secondary">
                  {`${formatCount(creator.following_count)} following`}
                </Badge>
                <Badge variant="secondary">
                  {`${formatCount(creator.media_count)} posts`}
                </Badge>
              </View>
            </View>
          </View>

          {/* Badges — enrichment fields may be null on partially-synced rows */}
          <View className="flex-row flex-wrap gap-2">
            {typeof creator.engagement_rate === 'number' && (
              <Badge variant="success">
                {`${creator.engagement_rate.toFixed(1)}% engagement`}
              </Badge>
            )}
            {creator.creator_tier && (
              <Badge variant="info" labelClassName="capitalize">
                {creator.creator_tier.replace(/_/g, ' ')}
              </Badge>
            )}
            {creator.niche && (
              <Badge variant="warning">{creator.niche}</Badge>
            )}
          </View>
        </Card.Content>
      </Card>

      {/* Recent Reels */}
      <View className="gap-2">
        <SectionTitle>Recent Reels</SectionTitle>
        {recentReels.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-3 pb-2">
              {recentReels.map((reel, index) => (
                <View
                  key={reel.$id ?? index}
                  className="w-40 overflow-hidden rounded-xl border border-border bg-card"
                >
                  <Image
                    source={{ uri: reel.display_url ?? '' }}
                    className="h-52 w-40 bg-muted"
                  />
                  <View className="p-2">
                    <Text size="xs" muted>
                      {formatCount(reel.video_view_count)} views
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : (
          <Text size="sm" muted>
            No recent reels
          </Text>
        )}
      </View>

      {/* Insights Summary */}
      {insights?.data ? (
        <Card>
          <Card.Header>
            <Card.Title>Insights</Card.Title>
          </Card.Header>
          <Card.Content className="gap-2">
            {insights.data.map((metric) => (
              <View key={metric.name} className="flex-row justify-between gap-3">
                <Text size="sm" className="capitalize">
                  {metric.name.replace(/_/g, ' ')}
                </Text>
                <Text size="sm" weight="semibold">
                  {metric.values?.[0]?.value ?? metric.total_value?.value ?? '—'}
                </Text>
              </View>
            ))}
          </Card.Content>
        </Card>
      ) : (
        <View className="gap-2">
          <SectionTitle>Insights</SectionTitle>
          <Text size="sm" muted>
            Insights available for business accounts only
          </Text>
        </View>
      )}

      {/* Active Deals */}
      <View className="gap-2">
        <SectionTitle>Active Deals</SectionTitle>
        {dealThreads.length > 0 ? (
          <View className="gap-2">
            {dealThreads.map((thread) => (
              <Card key={thread.$id ?? thread.thread_id}>
                <Card.Content className="flex-row items-center justify-between gap-2.5">
                  <View className="flex-1 gap-0.5">
                    <Text weight="semibold">{thread.campaign_title}</Text>
                    <Text size="sm" muted>
                      {thread.agent_assigned}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Badge
                      variant={statusBadgeVariant(thread.status)}
                      labelClassName="capitalize"
                    >
                      {thread.status.replace(/_/g, ' ')}
                    </Badge>
                    {thread.unread_count > 0 && (
                      <Badge variant="destructive" count={thread.unread_count} />
                    )}
                  </View>
                </Card.Content>
              </Card>
            ))}
          </View>
        ) : (
          <Text size="sm" muted>
            No active deals
          </Text>
        )}
      </View>

      {/* Theme — setThemePreference is the single seam (store + Uniwind) */}
      <View className="gap-2">
        <SectionTitle>Theme</SectionTitle>
        <View className="flex-row items-center justify-between py-1">
          <View className="flex-1 gap-0.5">
            <Text weight="medium">Dark mode</Text>
            <Text size="sm" muted>
              Switch between dark and light.
            </Text>
          </View>
          <Switch
            value={themePreference === 'dark'}
            onValueChange={(next) => setThemePreference(next ? 'dark' : 'light')}
          />
        </View>
      </View>

      {/* Action Buttons */}
      <View className="mt-1 gap-3">
        <Button variant="secondary" onPress={handleDisconnect} fullWidth>
          Disconnect Instagram
        </Button>
        <Button onPress={handleSignOut} fullWidth>
          Sign Out
        </Button>
      </View>
    </ScrollView>
  );
}
