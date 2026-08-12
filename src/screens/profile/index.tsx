/**
 * Profile screen — creator card, reels, insights, deals, account actions.
 *
 * NOTE: raw React Native + StyleSheet instead of `@/tw` className primitives.
 * The useCssElement bridge drops layout classes on Android (ballooned cards,
 * floating text) — same failure the automate screens had. See src/tw/AGENTS.md
 * for the documented raw-RN escape hatch.
 */

import React, { useEffect, useMemo } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from '@/lib/reanimated-platform';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCreatorProfile } from '@/hooks/useCreatorProfile';
import { useDashboard } from '@/hooks/useDashboard';
import { disconnectInstagram } from '@/lib/instagram';
import { useSession } from '@/lib/session-context';
import { addLog } from '@/lib/logger';
import { ClayAnimatedButton } from '@/components/clay/ClayAnimatedButton';
import { ErrorState } from '@/components/ui/error-state';
import { TAB_BAR_CLEARANCE } from '@/components/screen-shell';
import { useThemeColors, useThemePreference, setThemePreference, type ThemeColors } from '@/lib/theme';
import { ACCENTS, statusMeta, formatCount } from './utils';

const FONT = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
};

type ProfileStyles = ReturnType<typeof buildStyles>;

function SectionTitle({ children, styles }: { children: string; styles: ProfileStyles }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function ThemeToggle({ styles }: { styles: ProfileStyles }) {
  const preference = useThemePreference();
  const options: Array<{ value: 'dark' | 'light'; label: string }> = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
  ];

  return (
    <View style={styles.themeTrack}>
      {options.map((option) => {
        const selected = preference === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => setThemePreference(option.value)}
            style={[
              styles.themeOption,
              selected && styles.themeOptionSelected,
            ]}
          >
            <Text
              style={[
                styles.themeOptionLabel,
                selected ? styles.themeOptionLabelSelected : styles.themeOptionLabelUnselected,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
  const t = useThemeColors();
  const styles = useMemo(() => buildStyles(t), [t]);

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
    paddingHorizontal: 16,
  };

  // Loading state — skeleton, not a full-screen spinner
  if (isLoading || dashboardLoading) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[contentPadding, styles.scrollContent]}
      >
        <View style={styles.skeletonHeader}>
          <View style={styles.skeletonAvatar} />
          <View style={styles.skeletonLineWide} />
          <View style={styles.skeletonLineNarrow} />
        </View>
        <View style={styles.skeletonCard} />
        <View style={styles.skeletonCard} />
      </ScrollView>
    );
  }

  // Error state
  if (error) {
    return <ErrorState error={error} onRetry={refresh} />;
  }

  // Empty state — no creator connected
  if (!creator) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.stateBody}>
          Connect your Instagram to see your profile
        </Text>
        <ClayAnimatedButton variant="secondary" onPress={refresh}>
          Refresh
        </ClayAnimatedButton>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[contentPadding, styles.scrollContent]}
      showsVerticalScrollIndicator={false}
    >
      {/* Creator Card */}
      <View style={styles.card}>
        <View style={styles.creatorRow}>
          <Animated.View style={avatarAnimatedStyle}>
            {creator.profile_pic_url ? (
              <Image
                source={{ uri: creator.profile_pic_url }}
                style={styles.avatar}
                accessibilityLabel={`${creator.full_name} avatar`}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackText}>
                  {(creator.full_name || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </Animated.View>
          <View style={styles.creatorInfo}>
            <Text style={styles.creatorName}>{creator.full_name}</Text>
            <Text style={styles.creatorHandle}>@{creator.ig_username}</Text>
            <View style={styles.countPillsRow}>
              <Text style={styles.countPill}>
                {formatCount(creator.follower_count)} followers
              </Text>
              <Text style={styles.countPill}>
                {formatCount(creator.following_count)} following
              </Text>
              <Text style={styles.countPill}>
                {formatCount(creator.media_count)} posts
              </Text>
            </View>
          </View>
        </View>

        {/* Badges — enrichment fields may be null on partially-synced rows */}
        <View style={styles.badgesRow}>
          {typeof creator.engagement_rate === 'number' && (
            <Text style={[styles.badge, styles.badgeMint]}>
              {creator.engagement_rate.toFixed(1)}% engagement
            </Text>
          )}
          {creator.creator_tier && (
            <Text style={[styles.badge, styles.badgeLavender]}>
              {creator.creator_tier.replace(/_/g, ' ')}
            </Text>
          )}
          {creator.niche && (
            <Text style={[styles.badge, styles.badgePeach]}>
              {creator.niche}
            </Text>
          )}
        </View>
      </View>

      {/* Recent Reels */}
      <View style={styles.section}>
        <SectionTitle styles={styles}>Recent Reels</SectionTitle>
        {recentReels.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.reelsRow}>
              {recentReels.map((reel, index) => (
                <View key={reel.$id ?? index} style={styles.reelCard}>
                  <Image
                    source={{ uri: reel.display_url ?? '' }}
                    style={styles.reelImage}
                  />
                  <View style={styles.reelMeta}>
                    <Text style={styles.reelViews}>
                      {formatCount(reel.video_view_count)} views
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : (
          <Text style={styles.mutedText}>No recent reels</Text>
        )}
      </View>

      {/* Insights Summary */}
      <View style={styles.section}>
        {insights?.data ? (
          <View style={styles.card}>
            <SectionTitle styles={styles}>Insights</SectionTitle>
            <View style={styles.insightsList}>
              {insights.data.map((metric) => (
                <View key={metric.name} style={styles.insightRow}>
                  <Text style={styles.insightName}>
                    {metric.name.replace(/_/g, ' ')}
                  </Text>
                  <Text style={styles.insightValue}>
                    {metric.values?.[0]?.value ?? metric.total_value?.value ?? '—'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <>
            <SectionTitle styles={styles}>Insights</SectionTitle>
            <Text style={styles.mutedText}>
              Insights available for business accounts only
            </Text>
          </>
        )}
      </View>

      {/* Active Deals */}
      <View style={styles.section}>
        <SectionTitle styles={styles}>Active Deals</SectionTitle>
        {dealThreads.length > 0 ? (
          <View style={styles.dealsList}>
            {dealThreads.map((thread) => {
              const meta = statusMeta(t)[thread.status] ?? {
                bg: t.surfaceCard,
                text: t.muted,
              };
              return (
                <View key={thread.$id ?? thread.thread_id} style={styles.card}>
                  <View style={styles.dealRow}>
                    <View style={styles.dealInfo}>
                      <Text style={styles.dealTitle}>{thread.campaign_title}</Text>
                      <Text style={styles.dealAgent}>{thread.agent_assigned}</Text>
                    </View>
                    <View style={styles.dealRight}>
                      <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                        <Text style={[styles.statusPillText, { color: meta.text }]}>
                          {thread.status.replace(/_/g, ' ')}
                        </Text>
                      </View>
                      {thread.unread_count > 0 && (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>
                            {thread.unread_count}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.mutedText}>No active deals</Text>
        )}
      </View>

      {/* Theme */}
      <View style={styles.section}>
        <SectionTitle styles={styles}>Theme</SectionTitle>
        <ThemeToggle styles={styles} />
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <ClayAnimatedButton variant="secondary" onPress={handleDisconnect} fullWidth>
          Disconnect Instagram
        </ClayAnimatedButton>
        <ClayAnimatedButton variant="primary" onPress={handleSignOut} fullWidth>
          Sign Out
        </ClayAnimatedButton>
      </View>
    </ScrollView>
  );
}

function buildStyles(t: ThemeColors) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: t.canvas,
  },
  scrollContent: {
    gap: 12,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 16,
    backgroundColor: t.canvas,
  },
  stateInner: {
    maxWidth: 320,
    alignItems: 'center',
    gap: 16,
  },
  stateError: {
    textAlign: 'center',
    fontFamily: FONT.regular,
    fontSize: 16,
    lineHeight: 24,
    color: ACCENTS.error,
  },
  stateBody: {
    textAlign: 'center',
    fontFamily: FONT.regular,
    fontSize: 16,
    lineHeight: 24,
    color: t.body,
  },

  /* Skeleton */
  skeletonHeader: {
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
  },
  skeletonAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: t.hairline,
    backgroundColor: t.surfaceCard,
  },
  skeletonLineWide: {
    height: 20,
    width: 140,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: t.hairline,
    backgroundColor: t.surfaceCard,
  },
  skeletonLineNarrow: {
    height: 14,
    width: 100,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: t.hairline,
    backgroundColor: t.surfaceCard,
    opacity: 0.6,
  },
  skeletonCard: {
    height: 96,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.hairline,
    backgroundColor: t.surfaceCard,
  },

  /* Cards */
  card: {
    borderWidth: 1,
    borderColor: t.hairline,
    borderRadius: 14,
    backgroundColor: t.canvas,
    padding: 14,
    gap: 10,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontFamily: FONT.semibold,
    fontSize: 18,
    lineHeight: 25,
    letterSpacing: -0.3,
    color: t.ink,
    includeFontPadding: false,
  },
  mutedText: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: t.muted,
    includeFontPadding: false,
  },

  /* Creator */
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENTS.lavender,
  },
  avatarFallbackText: {
    fontFamily: FONT.semibold,
    fontSize: 24,
    color: t.onPrimary,
    includeFontPadding: false,
  },
  creatorInfo: {
    flex: 1,
    gap: 3,
  },
  creatorName: {
    fontFamily: FONT.semibold,
    fontSize: 18,
    lineHeight: 25,
    letterSpacing: -0.3,
    color: t.ink,
    includeFontPadding: false,
  },
  creatorHandle: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: t.muted,
    includeFontPadding: false,
  },
  countPillsRow: {
    marginTop: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  countPill: {
    borderRadius: 999,
    backgroundColor: t.surfaceCard,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 18,
    color: t.body,
    includeFontPadding: false,
    overflow: 'hidden',
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontFamily: FONT.semibold,
    fontSize: 13,
    includeFontPadding: false,
    overflow: 'hidden',
  },
  badgeMint: {
    backgroundColor: ACCENTS.mint,
    color: t.ink,
  },
  badgeLavender: {
    backgroundColor: ACCENTS.lavender,
    color: t.onPrimary,
  },
  badgePeach: {
    backgroundColor: ACCENTS.peach,
    color: t.ink,
  },

  /* Reels */
  reelsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 8,
  },
  reelCard: {
    width: 160,
    borderWidth: 1,
    borderColor: t.hairline,
    borderRadius: 12,
    backgroundColor: t.canvas,
    overflow: 'hidden',
  },
  reelImage: {
    width: 160,
    height: 200,
    backgroundColor: t.surfaceSoft,
  },
  reelMeta: {
    padding: 8,
  },
  reelViews: {
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 18,
    color: t.muted,
    includeFontPadding: false,
  },

  /* Insights */
  insightsList: {
    gap: 8,
  },
  insightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  insightName: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: t.body,
    textTransform: 'capitalize',
  },
  insightValue: {
    fontFamily: FONT.semibold,
    fontSize: 14,
    lineHeight: 20,
    color: t.ink,
    includeFontPadding: false,
  },

  /* Deals */
  dealsList: {
    gap: 8,
  },
  dealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dealInfo: {
    flex: 1,
    gap: 3,
  },
  dealTitle: {
    fontFamily: FONT.semibold,
    fontSize: 14,
    lineHeight: 20,
    color: t.ink,
    includeFontPadding: false,
  },
  dealAgent: {
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 18,
    color: t.muted,
    includeFontPadding: false,
  },
  dealRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: {
    fontFamily: FONT.semibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: 'capitalize',
    includeFontPadding: false,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENTS.error,
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    fontFamily: FONT.semibold,
    fontSize: 13,
    lineHeight: 16,
    color: t.onPrimary,
    includeFontPadding: false,
  },

  themeTrack: {
    flexDirection: 'row',
    backgroundColor: t.surfaceCard,
    borderRadius: 999,
    padding: 3,
  },
  themeOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 999,
  },
  themeOptionSelected: {
    backgroundColor: t.primary,
  },
  themeOptionLabel: {
    fontFamily: FONT.medium,
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
  },
  themeOptionLabelSelected: {
    color: t.onPrimary,
  },
  themeOptionLabelUnselected: {
    color: t.muted,
  },

  /* Actions */
  actions: {
    marginTop: 8,
    gap: 12,
  },
  });
}
