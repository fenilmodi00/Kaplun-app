import React, { useCallback, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { View as RNView } from 'react-native';

import { View, Text, Pressable } from '@/tw';
import { cn } from '@/tw/cn';
import { ClayAnimatedButton } from '@/components/clay/ClayAnimatedButton';
import { ClayAnimatedCard } from '@/components/clay/ClayAnimatedCard';
import { ClayFeatureCard } from '@/components/clay/ClayFeatureCard';
import { addLog } from '@/lib/logger';
import { useThemeColors } from '@/lib/theme';
import type { ActionPriority, ProfileReport, ReportMeta } from '@/lib/profile-score';
import { SectionLabel } from './components';
import { StaggeredCard } from './ceremony';
import { ShareCard } from './share-card';
import { shareScoreCard } from './share';

const PRIORITY_STYLE: Record<ActionPriority, { bg: string; text: string; label: string }> = {
  high: { bg: 'bg-brand-pink', text: 'text-on-dark', label: 'High' },
  medium: { bg: 'bg-brand-ochre', text: 'text-ink', label: 'Medium' },
  low: { bg: 'bg-brand-lavender', text: 'text-on-dark', label: 'Low' },
};

function BulletRows({
  icon,
  items,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  items: string[];
}) {
  const t = useThemeColors();
  return (
    <View style={{ gap: 10 }}>
      {items.map((item, i) => (
        <View key={i} className="flex-row items-start" style={{ gap: 8 }}>
          <Ionicons name={icon} size={15} color={t.ink} style={{ marginTop: 2 }} />
          <Text className="text-body-sm text-ink" style={{ flex: 1 }}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function Scorecard({
  report,
  meta,
  ceremony,
  onRefresh,
}: {
  report: ProfileReport;
  meta: ReportMeta | null;
  ceremony: boolean;
  onRefresh: () => void;
}) {
  const t = useThemeColors();
  const cardRef = useRef<RNView | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const handleShare = useCallback(async () => {
    setShareError(null);
    setSharing(true);
    try {
      await shareScoreCard(cardRef);
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : String(err);
      addLog(`score: share failed — ${code}`);
      setShareError(
        code === 'share_unavailable'
          ? 'Sharing isn’t available on this device.'
          : 'Couldn’t create the share image — tap Share to try again.',
      );
    } finally {
      setSharing(false);
    }
  }, []);

  const actionCount = report.action_plan.length;
  // Ceremony: actions cascade in first, strengths/weaknesses follow after.
  // Cached view: legacy quick ramp.
  const strengthsDelay = ceremony ? actionCount * 100 + 100 : 240;
  const weaknessesDelay = ceremony ? actionCount * 100 + 200 : 320;
  return (
    <>
      {/* Off-screen 9:16 capture target — mounted + laid out so view-shot can grab it. */}
      <View pointerEvents="none" style={{ position: 'absolute', left: -9999, top: 0 }}>
        <ShareCard ref={cardRef} report={report} />
      </View>

      {/* Hero score */}
      <ClayFeatureCard color="teal">
        <View className="flex-row items-end" style={{ gap: 8 }}>
          <Text
            className="font-semibold"
            style={{ fontSize: 56, lineHeight: 59, letterSpacing: -2, color: t.onPrimary }}
          >
            {report.overall_score}
          </Text>
          <Text className="text-white/60" style={{ fontSize: 16, marginBottom: 8 }}>
            /100
          </Text>
        </View>
        <View
          className="bg-white/15"
          style={{
            alignSelf: 'flex-start',
            borderRadius: 9999,
            paddingVertical: 4,
            paddingHorizontal: 10,
          }}
        >
          <Text className="font-semibold" style={{ fontSize: 12, color: t.onPrimary }}>
            {report.score_label}
          </Text>
        </View>
        <Text className="text-body-sm text-white/85">
          {report.one_line_summary}
        </Text>
      </ClayFeatureCard>

      {/* Action plan */}
      {actionCount > 0 && (
        <View style={{ gap: 10 }}>
          <SectionLabel>Do this next</SectionLabel>
          {report.action_plan.map((item, i) => {
            const pill = PRIORITY_STYLE[item.priority] ?? PRIORITY_STYLE.medium;
            return (
              <StaggeredCard key={i} index={i} ceremony={ceremony} padding="p-5">
                <View style={{ gap: 8 }}>
                  <View
                    className={cn(pill.bg, 'self-start')}
                    style={{ borderRadius: 9999, paddingVertical: 3, paddingHorizontal: 9 }}
                  >
                    <Text
                      className={cn(pill.text, 'font-semibold uppercase')}
                      style={{ fontSize: 10.5, letterSpacing: 0.8 }}
                    >
                      {pill.label}
                    </Text>
                  </View>
                  <Text
                    className="font-semibold text-ink"
                    style={{ fontSize: 16.5, letterSpacing: -0.2 }}
                  >
                    {item.action}
                  </Text>
                  <Text className="text-body-sm text-muted">{item.why}</Text>
                  <View className="flex-row items-start" style={{ gap: 6 }}>
                    <Ionicons name="time-outline" size={13} color={t.mutedSoft} style={{ marginTop: 1 }} />
                    <Text className="text-muted-soft" style={{ fontSize: 12.5, flex: 1 }}>
                      {item.when_to_post}
                    </Text>
                  </View>
                </View>
              </StaggeredCard>
            );
          })}
        </View>
      )}

      {/* Strengths */}
      {report.strengths.length > 0 && (
        <ClayAnimatedCard delay={strengthsDelay}>
          <View style={{ gap: 12 }}>
            <SectionLabel>What’s working</SectionLabel>
            <BulletRows icon="checkmark-circle" items={report.strengths} />
          </View>
        </ClayAnimatedCard>
      )}

      {/* Weaknesses */}
      {report.weaknesses.length > 0 && (
        <ClayAnimatedCard delay={weaknessesDelay}>
          <View style={{ gap: 12 }}>
            <SectionLabel>What to fix</SectionLabel>
            <BulletRows icon="alert-circle-outline" items={report.weaknesses} />
          </View>
        </ClayAnimatedCard>
      )}

      {meta ? (
        <Text className="text-muted-soft text-center" style={{ fontSize: 12 }}>
          Generated {new Date(meta.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
        </Text>
      ) : null}

      <ClayAnimatedButton
        variant="primary"
        fullWidth
        loading={sharing}
        onPress={handleShare}
        height={48}
      >
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Ionicons name="share-social-outline" size={16} color={t.onPrimary} />
          <Text className="font-semibold text-white" style={{ fontSize: 14.5 }}>
            Share my score
          </Text>
        </View>
      </ClayAnimatedButton>
      {shareError ? (
        <Text className="text-center" style={{ color: t.error, fontSize: 12.5 }}>
          {shareError}
        </Text>
      ) : null}

      <Pressable
        onPress={onRefresh}
        hitSlop={10}
        className="flex-row items-center self-center"
        style={{ gap: 6, paddingVertical: 8, paddingHorizontal: 12 }}
        testID="score-refresh"
      >
        <Ionicons name="refresh-outline" size={14} color={t.muted} />
        <Text className="text-muted" style={{ fontSize: 12.5 }}>
          Refresh analysis
        </Text>
      </Pressable>
    </>
  );
}
