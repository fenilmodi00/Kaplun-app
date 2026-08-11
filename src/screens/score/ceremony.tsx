/**
 * Score ceremony components (ticket 06).
 * Phase A: AnalysisTheater, Phase B: ScoreRing, Phase C: StaggeredCard.
 */
import React, { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { View, Text } from '@/tw';
import { AnimatedView } from '@/tw/animated';
import { ClayAnimatedCard } from '@/components/clay/ClayAnimatedCard';
import { ClaySpinner } from '@/components/clay/ClaySpinner';
import {
  Easing,
  IS_REANIMATED_AVAILABLE,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from '@/lib/reanimated-platform';
import { useThemeColors } from '@/lib/theme';

/** Action card that cascades in during the ceremony; cached view uses the quick ramp. */
export function StaggeredCard({
  index,
  ceremony,
  padding = 'p-6',
  children,
}: {
  index: number;
  ceremony: boolean;
  padding?: string;
  children: React.ReactNode;
}) {
  return (
    <ClayAnimatedCard delay={ceremony ? index * 100 : 60 + index * 40} padding={padding}>
      {children}
    </ClayAnimatedCard>
  );
}

const THEATER_STAGES: { label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { label: 'Reading your last posts…', icon: 'newspaper-outline' },
  { label: 'Checking engagement & saves…', icon: 'pulse-outline' },
  { label: 'Finding your best posting window…', icon: 'time-outline' },
  { label: 'Writing your action plan…', icon: 'create-outline' },
];
const THEATER_STAGE_MS = 2400;

export function AnalysisTheater() {
  const t = useThemeColors();
  const [stage, setStage] = useState(0);

  // Stages advance on the clock; the API landing (not this timer) ends the theater.
  useEffect(() => {
    const id = setInterval(
      () => setStage((s) => Math.min(s + 1, THEATER_STAGES.length - 1)),
      THEATER_STAGE_MS,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <View
      className="bg-surface-card border border-hairline rounded-xl"
      style={{ padding: 20, gap: 16 }}
      testID="analysis-theater"
    >
      <View className="flex-row items-center" style={{ gap: 10 }}>
        <Ionicons name="sparkles" size={16} color={t.ink} />
        <Text className="font-semibold text-ink" style={{ fontSize: 19, letterSpacing: -0.3 }}>
          Analyzing your profile
        </Text>
      </View>
      <View style={{ gap: 14 }}>
        {THEATER_STAGES.map((s, i) => {
          const status = i < stage ? 'done' : i === stage ? 'current' : 'pending';
          return (
            <View
              key={s.label}
              className="flex-row items-center"
              style={{ gap: 10, opacity: status === 'pending' ? 0.45 : 1 }}
              testID={`theater-stage-${i}`}
            >
              <View
                style={{ width: 22, alignItems: 'center' }}
                testID={`theater-stage-${i}-${status}`}
              >
                {status === 'done' ? (
                  <Ionicons name="checkmark-circle" size={18} color={t.ink} />
                ) : status === 'current' ? (
                  <ClaySpinner size={18} color="primary" />
                ) : (
                  <Ionicons name="ellipse-outline" size={18} color={t.mutedSoft} />
                )}
              </View>
              <Text className="text-body-sm text-ink" style={{ flex: 1 }}>
                {s.label}
              </Text>
            </View>
          );
        })}
      </View>
      <Text className="text-muted-soft" style={{ fontSize: 12 }}>
        Crunching your stats — this can take up to a minute. Keep the app open.
      </Text>
    </View>
  );
}

// Pure-View ring (react-native-svg / createAnimatedComponent are unusable here:
// both are absent from the jest reanimated mock and the web fallback). Two
// overflow-hidden masks clip the circle into halves; each half-mask holds a full
// circle with only top+right borders colored (a 180° arc spanning [rot-45°, rot+135°]).
// rot = 3.6*progress - 135 for both layers (right clamped ≤45°, left ≥45°).
const RING_SIZE = 220;
const RING_STROKE = 14;
const RING_MS = 1500;
const RING_LABEL_DELAY_MS = 1400;

export function ScoreRing({
  score,
  label,
  summary,
}: {
  score: number;
  label?: string;
  summary?: string;
}) {
  const t = useThemeColors();
  const completed = !IS_REANIMATED_AVAILABLE;
  const progress = useSharedValue(completed ? score : 0);
  const contentOpacity = useSharedValue(completed ? 1 : 0);
  const [shown, setShown] = useState(() => (completed ? score : 0));

  useEffect(() => {
    if (completed) return;
    progress.value = withSpring(score, { damping: 60, stiffness: 45, mass: 1.2 });
    contentOpacity.value = withDelay(
      RING_LABEL_DELAY_MS,
      withTiming(1, { duration: 350, easing: Easing.out(Easing.cubic) }),
    );
    // The numeral counts up on the JS thread — shared values can't reach Text.
    const startedAt = Date.now();
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - startedAt) / RING_MS);
      setShown(Math.round(score * (1 - Math.pow(1 - p, 3))));
      if (p >= 1) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [completed, score, progress, contentOpacity]);

  const rightStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${Math.min(45, progress.value * 3.6 - 135)}deg` }],
  }));
  const leftStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${Math.max(45, progress.value * 3.6 - 135)}deg` }],
  }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));

  const arc = (left: number) => ({
    position: 'absolute' as const,
    top: 0,
    left,
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_STROKE,
    borderTopColor: t.primary,
    borderRightColor: t.primary,
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  });

  return (
    <View
      className="items-center"
      style={{ gap: 18, paddingVertical: 12 }}
      testID="score-ring"
    >
      <View
        style={{ width: RING_SIZE, height: RING_SIZE }}
        accessibilityLabel={`Score ${score} out of 100`}
      >
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: RING_SIZE,
            height: RING_SIZE,
            borderRadius: RING_SIZE / 2,
            borderWidth: RING_STROKE,
            borderColor: t.hairline,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: RING_SIZE / 2,
            width: RING_SIZE / 2,
            height: RING_SIZE,
            overflow: 'hidden',
          }}
        >
          <AnimatedView style={[arc(-RING_SIZE / 2), rightStyle]} />
        </View>
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: RING_SIZE / 2,
            height: RING_SIZE,
            overflow: 'hidden',
          }}
        >
          <AnimatedView style={[arc(0), leftStyle]} />
        </View>
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            className="font-semibold text-ink"
            style={{ fontSize: 64, lineHeight: 68, letterSpacing: -2 }}
          >
            {shown}
          </Text>
          <Text className="text-muted-soft" style={{ fontSize: 14 }}>
            /100
          </Text>
        </View>
      </View>
      <AnimatedView
        style={[contentStyle, { alignItems: 'center', gap: 10, paddingHorizontal: 24 }]}
      >
        {label ? (
          <View
            style={{
              backgroundColor: t.primary,
              borderRadius: 9999,
              paddingVertical: 4,
              paddingHorizontal: 10,
            }}
          >
            <Text className="font-semibold" style={{ fontSize: 12, color: t.onPrimary }}>
              {label}
            </Text>
          </View>
        ) : null}
        {summary ? (
          <Text
            className="text-body-sm text-muted text-center"
            style={{ maxWidth: 280 }}
          >
            {summary}
          </Text>
        ) : null}
      </AnimatedView>
    </View>
  );
}
