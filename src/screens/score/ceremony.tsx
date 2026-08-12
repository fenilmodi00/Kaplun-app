/**
 * Score ceremony components (ticket 06).
 * Phase A: AnalysisCeremony, Phase B: ScoreRing, Phase C: StaggeredCard.
 */
import React, { useEffect, useState } from 'react';
import { View, useCSSVariable } from '@/tw';
import { AnimatedView } from '@/tw/animated';
import { Card, Plan, Shimmer, Text, ThinkingOrb } from 'panelui-native';
import { Reveal } from '@/components/ui/reveal';
import {
  Easing,
  IS_REANIMATED_AVAILABLE,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from '@/lib/reanimated-platform';

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
    <Reveal delay={ceremony ? index * 100 : 60 + index * 40}>
      <Card className={padding}>{children}</Card>
    </Reveal>
  );
}

const THEATER_STAGES = [
  { label: 'Reading your last posts…', orb: 'searching' as const },
  { label: 'Checking engagement & saves…', orb: 'working' as const },
  { label: 'Finding your best posting window…', orb: 'solving' as const },
  { label: 'Writing your action plan…', orb: 'composing' as const },
];
const ORB_STATES = ['searching', 'working', 'solving', 'composing'] as const;
const THEATER_STAGE_MS = 2400;

export function AnalysisCeremony() {
  const [stage, setStage] = useState(0);

  // Stages advance on the clock; the API landing (not this timer) ends the theater.
  useEffect(() => {
    const id = setInterval(
      () => setStage((s) => Math.min(s + 1, THEATER_STAGES.length - 1)),
      THEATER_STAGE_MS,
    );
    return () => clearInterval(id);
  }, []);

  const orbState = ORB_STATES[stage] ?? 'composing';

  return (
    <Card className="gap-4 p-5" testID="analysis-theater">
      <View className="flex-row items-center gap-2.5">
        <ThinkingOrb state={orbState} size={32} />
        <Text size="lg" weight="semibold" className="tracking-tight">
          Analyzing your profile
        </Text>
      </View>
      <Plan isStreaming={stage < THEATER_STAGES.length - 1}>
        <Plan.Steps>
          {THEATER_STAGES.map((s, i) => (
            <Plan.Step key={s.label} status={i < stage ? 'done' : i === stage ? 'active' : 'pending'}>
              {s.label}
            </Plan.Step>
          ))}
        </Plan.Steps>
      </Plan>
      <Text size="xs" muted>
        Crunching your stats — this can take up to a minute. Keep the app open.
      </Text>
    </Card>
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
  const primary = useCSSVariable('--color-primary') as string;
  const primaryForeground = useCSSVariable('--color-primary-foreground') as string;
  const border = useCSSVariable('--color-border') as string;
  const mutedFg = useCSSVariable('--color-muted-foreground') as string;
  const fg = useCSSVariable('--color-foreground') as string;
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
    borderTopColor: primary,
    borderRightColor: primary,
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
            borderColor: border,
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
            weight="semibold"
            style={{ fontSize: 64, lineHeight: 68, letterSpacing: -2 }}
          >
            {shown}
          </Text>
          <Text size="sm" muted>
            /100
          </Text>
        </View>
      </View>
      <AnimatedView
        style={[contentStyle, { alignItems: 'center', gap: 10, paddingHorizontal: 24 }]}
      >
        {label ? (
          <View
            className="rounded-full bg-primary px-2.5 py-1"
          >
            <Text
              size="xs"
              weight="semibold"
              style={{ color: primaryForeground }}
            >
              {label}
            </Text>
          </View>
        ) : null}
        {summary ? (
          <Shimmer
            once
            baseColor={mutedFg}
            shimmerColor={fg}
            textClassName="text-sm max-w-70 text-center"
          >
            {summary}
          </Shimmer>
        ) : null}
      </AnimatedView>
    </View>
  );
}
