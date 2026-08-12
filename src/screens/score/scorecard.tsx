import React, { useCallback, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { View as RNView } from 'react-native';

import { View, Pressable, useCSSVariable } from '@/tw';
import { Badge, Button, Card, Kpi, Task, Text } from 'panelui-native';
import { addLog } from '@/lib/logger';
import type { ActionPriority, ProfileReport, ReportMeta } from '@/lib/profile-score';
import { SectionLabel } from './components';
import { Reveal } from '@/components/ui/reveal';
import { ShareCard } from './share-card';
import { shareScoreCard } from './share';

const PRIORITY_BADGE: Record<
  ActionPriority,
  { variant: 'destructive' | 'warning' | 'info'; label: string }
> = {
  high: { variant: 'destructive', label: 'High' },
  medium: { variant: 'warning', label: 'Medium' },
  low: { variant: 'info', label: 'Low' },
};

function BulletRows({
  icon,
  items,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  items: string[];
}) {
  const foreground = useCSSVariable('--color-foreground') as string;
  return (
    <View className="gap-2.5">
      {items.map((item, i) => (
        <View key={i} className="flex-row items-start gap-2">
          <Ionicons name={icon} size={15} color={foreground} style={{ marginTop: 2 }} />
          <Text size="sm" className="flex-1">
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
  const muted = useCSSVariable('--color-muted-foreground') as string;
  const primaryForeground = useCSSVariable('--color-primary-foreground') as string;
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
      <Kpi surface={false} className="gap-2.5 rounded-2xl bg-success-soft p-5">
        <View className="flex-row items-end gap-2">
          <Kpi.Value className="text-5xl tracking-tighter">{report.overall_score}</Kpi.Value>
          <Text size="base" muted className="mb-1.5">
            /100
          </Text>
        </View>
        <Badge variant="success" className="self-start">
          {report.score_label}
        </Badge>
        <Text size="sm" muted>
          {report.one_line_summary}
        </Text>
      </Kpi>

      {/* Action plan */}
      {actionCount > 0 && (
        <View className="gap-2.5">
          <SectionLabel>Do this next</SectionLabel>
          {report.action_plan.map((item, i) => {
            const pill = PRIORITY_BADGE[item.priority] ?? PRIORITY_BADGE.medium;
            return (
              <Reveal key={i} delay={ceremony ? i * 100 : 60 + i * 40}>
                <Badge variant={pill.variant} className="self-start mb-1">
                  {pill.label}
                </Badge>
                <Task status="complete">
                  <Task.Trigger title={item.action} />
                  <Task.Content>
                    <Task.Item>{item.why}</Task.Item>
                    <Task.Item>{item.when_to_post}</Task.Item>
                  </Task.Content>
                </Task>
              </Reveal>
            );
          })}
        </View>
      )}

      {/* Strengths */}
      {report.strengths.length > 0 && (
        <Reveal delay={strengthsDelay}>
          <Card className="gap-3 p-5">
            <SectionLabel>What’s working</SectionLabel>
            <BulletRows icon="checkmark-circle" items={report.strengths} />
          </Card>
        </Reveal>
      )}

      {/* Weaknesses */}
      {report.weaknesses.length > 0 && (
        <Reveal delay={weaknessesDelay}>
          <Card className="gap-3 p-5">
            <SectionLabel>What to fix</SectionLabel>
            <BulletRows icon="alert-circle-outline" items={report.weaknesses} />
          </Card>
        </Reveal>
      )}

      {meta ? (
        <Text size="xs" muted className="text-center">
          Generated {new Date(meta.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
        </Text>
      ) : null}

      <Button
        variant="primary"
        fullWidth
        loading={sharing}
        onPress={handleShare}
        startContent={<Ionicons name="share-social-outline" size={16} color={primaryForeground} />}
      >
        Share my score
      </Button>
      {shareError ? (
        <Text size="sm" className="text-center text-destructive">
          {shareError}
        </Text>
      ) : null}

      <Pressable
        onPress={onRefresh}
        hitSlop={10}
        className="flex-row items-center self-center gap-1.5 px-3 py-2"
        testID="score-refresh"
      >
        <Ionicons name="refresh-outline" size={14} color={muted} />
        <Text size="xs" muted>
          Refresh analysis
        </Text>
      </Pressable>
    </>
  );
}
