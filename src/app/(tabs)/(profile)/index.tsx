import React, { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useUser, useAuth, useClerk } from "@clerk/expo";
import { View, Text, ScrollView } from '@/tw';
import { Image } from '@/tw/image';
import { cn } from '@/tw/cn';
import { useCreatorProfile } from '@/hooks/useCreatorProfile';
import { useDashboard } from '@/hooks/useDashboard';
import { disconnectInstagram } from '@/lib/instagram';
import { ClaySpinner } from '@/components/clay/ClaySpinner';
import { ClayAnimatedCard } from '@/components/clay/ClayAnimatedCard';
import { ClayAnimatedButton } from '@/components/clay/ClayAnimatedButton';
import { ClayFeatureCard } from '@/components/clay/ClayFeatureCard';
import { ClayAvatar } from '@/components/clay/ClayAvatar';
import { useShakeAnimation } from '@/hooks/useClayAnimations';

/** Status chip color styling per DESIGN.md §3.3 & §5.4 */
const STATUS_META: Record<string, { bg: string; text: string }> = {
  invited: { bg: 'bg-brand-teal', text: 'text-on-dark' },
  negotiating: { bg: 'bg-brand-ochre', text: 'text-ink' },
  contracted: { bg: 'bg-brand-mint', text: 'text-ink' },
  content_pending: { bg: 'bg-brand-lavender', text: 'text-on-dark' },
  live: { bg: 'bg-brand-mint', text: 'text-ink' },
  completed: { bg: 'bg-surface-card', text: 'text-muted' },
  declined: { bg: 'bg-error', text: 'text-on-dark' },
};

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  const { shake, animatedStyle } = useShakeAnimation();

  useEffect(() => {
    shake();
  }, [shake]);

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-canvas p-4">
      <Animated.View style={animatedStyle}>
        <View className="max-w-[320px] items-center gap-4">
          <Text className="text-center text-body-md text-error">
            {error}
          </Text>
          <ClayAnimatedButton variant="secondary" onPress={onRetry}>
            Retry
          </ClayAnimatedButton>
        </View>
      </Animated.View>
    </View>
  );
}

export default function ProfileScreen() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const {
    creator,
    dealThreads,
    recentReels,
    insights,
    isLoading,
    error,
    refresh,
  } = useCreatorProfile();
  const { data: dashboardData, loading: dashboardLoading } = useDashboard();

  // Avatar scale-in entrance
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
    } catch {
      // Silently handle — user can retry
    }
  }

  // Loading state
  if (isLoading || dashboardLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas p-4">
        <ClaySpinner size={40} label="Loading profile..." />
      </View>
    );
  }

  // Error state
  if (error) {
    return <ErrorState error={error} onRetry={refresh} />;
  }

  // Empty state — no creator connected
  if (!creator) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-canvas p-4">
        <Text className="text-center text-body-md text-body">
          Connect your Instagram to see your profile
        </Text>
        <ClayAnimatedButton variant="secondary" onPress={refresh}>
          Refresh
        </ClayAnimatedButton>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-canvas">
      <View className="gap-4 p-4">
        {/* Creator Card */}
        <ClayAnimatedCard delay={0}>
          <View className="flex-row items-center gap-4">
            <Animated.View style={avatarAnimatedStyle}>
              <ClayAvatar src={creator.profile_pic_url} size={64} />
            </Animated.View>
            <View className="flex-1 gap-1">
              <Text className="text-title-md font-semibold tracking-[-0.3px] text-ink">
                {creator.full_name}
              </Text>
              <Text className="text-body-sm text-muted">
                @{creator.ig_username}
              </Text>
              <View className="mt-1 flex-row flex-wrap gap-2">
                <Text className="rounded-pill bg-surface-card px-2 py-1 text-caption text-body">
                  {formatCount(creator.follower_count)} followers
                </Text>
                <Text className="rounded-pill bg-surface-card px-2 py-1 text-caption text-body">
                  {formatCount(creator.following_count)} following
                </Text>
                <Text className="rounded-pill bg-surface-card px-2 py-1 text-caption text-body">
                  {formatCount(creator.media_count)} posts
                </Text>
              </View>
            </View>
          </View>

          {/* Badges */}
          <View className="mt-3 flex-row flex-wrap gap-2">
            <Text className="rounded-pill bg-brand-mint px-3 py-1 text-caption font-semibold text-ink">
              {creator.engagement_rate.toFixed(1)}% engagement
            </Text>
            <Text className="rounded-pill bg-brand-lavender px-3 py-1 text-caption font-semibold text-on-dark">
              {creator.creator_tier.replace(/_/g, ' ')}
            </Text>
            <Text className="rounded-pill bg-brand-peach px-3 py-1 text-caption font-semibold text-on-dark">
              {creator.niche}
            </Text>
          </View>
        </ClayAnimatedCard>

        {/* Recent Reels */}
        <View className="gap-2">
          <Text className="text-title-md font-semibold tracking-[-0.3px] text-ink">
            Recent Reels
          </Text>
          {recentReels.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-3 pb-2">
                {recentReels.map((reel, index) => (
                  <ClayAnimatedCard
                    key={reel.$id ?? index}
                    delay={index * 100}
                    padding="p-0"
                  >
                    <View className="w-40">
                      <Image
                        source={{ uri: reel.display_url ?? '' }}
                        className="h-[200px] w-40 rounded-sm"
                      />
                      <View className="p-2">
                        <Text className="text-caption text-muted">
                          {formatCount(reel.video_view_count)} views
                        </Text>
                      </View>
                    </View>
                  </ClayAnimatedCard>
                ))}
              </View>
            </ScrollView>
          ) : (
            <Text className="text-body-sm text-muted">
              No recent reels
            </Text>
          )}
        </View>

        {/* Insights Summary */}
        <View className="gap-2">
          {insights?.data ? (
            <ClayFeatureCard color="cream" title="Insights" delay={200}>
              <View className="gap-2">
                {insights.data.map((metric, index) => (
                  <View key={index} className="flex-row justify-between">
                    <Text className="text-body-sm capitalize text-body">
                      {metric.name.replace(/_/g, ' ')}
                    </Text>
                    <Text className="text-body-sm font-semibold text-ink">
                      {metric.values[0]?.value ?? '—'}
                    </Text>
                  </View>
                ))}
              </View>
            </ClayFeatureCard>
          ) : (
            <View className="gap-2">
              <Text className="text-title-md font-semibold tracking-[-0.3px] text-ink">
                Insights
              </Text>
              <Text className="text-body-sm text-muted">
                Insights available for business accounts only
              </Text>
            </View>
          )}
        </View>

        {/* Active Deals */}
        <View className="gap-2">
          <Text className="text-title-md font-semibold tracking-[-0.3px] text-ink">
            Active Deals
          </Text>
          {dealThreads.length > 0 ? (
            <View className="gap-2">
              {dealThreads.map((thread, index) => {
                const meta = STATUS_META[thread.status] ?? { bg: 'bg-surface-card', text: 'text-muted' };
                return (
                  <ClayAnimatedCard
                    key={thread.$id ?? thread.thread_id}
                    delay={index * 100}
                    padding="p-4"
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 gap-1">
                        <Text className="text-body-sm font-semibold text-ink">
                          {thread.campaign_title}
                        </Text>
                        <Text className="text-caption text-muted">
                          {thread.agent_assigned}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-2">
                        <View className={cn('rounded-pill px-2.5 py-1', meta.bg)}>
                          <Text className={cn('text-caption-uppercase font-semibold', meta.text)}>
                            {thread.status.replace(/_/g, ' ')}
                          </Text>
                        </View>
                        {thread.unread_count > 0 && (
                          <Text className="h-[22px] min-w-[22px] rounded-pill bg-error px-1.5 text-center text-caption leading-[22px] text-on-primary">
                            {thread.unread_count}
                          </Text>
                        )}
                      </View>
                    </View>
                  </ClayAnimatedCard>
                );
              })}
            </View>
          ) : (
            <Text className="text-body-sm text-muted">
              No active deals
            </Text>
          )}
        </View>

        {/* Action Buttons */}
        <View className="mt-4 gap-3">
          <ClayAnimatedButton variant="secondary" onPress={handleDisconnect} fullWidth>
            Disconnect Instagram
          </ClayAnimatedButton>
          <ClayAnimatedButton variant="primary" onPress={() => signOut()} fullWidth>
            Sign Out
          </ClayAnimatedButton>
        </View>
      </View>
    </ScrollView>
  );
}
