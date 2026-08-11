import React, { useCallback, useEffect, useRef, useState } from 'react';

import { View, Text } from '@/tw';
import { ScreenShell } from '@/components/screen-shell';
import { useAutomationGate } from '@/hooks/useAutomationGate';
import { useGenerateScore, useLatestScore } from '@/hooks/useProfileScore';
import { addLog } from '@/lib/logger';
import type { ProfileScoreResult } from '@/lib/profile-score';
import { AnalysisTheater, ScoreRing } from './ceremony';
import {
  EmptyState,
  GateCard,
  InlineErrorStrip,
  ScoreSkeleton,
} from './components';
import { Scorecard } from './scorecard';

type CeremonyPhase = 'idle' | 'theater' | 'ring' | 'stagger' | 'done';

/** Ring reveal (1.5s) + label/summary fade tail (350ms). */
const RING_TOTAL_MS = 1850;
/** Last staggered card's delay + entrance; strengths/weaknesses land inside it. */
const STAGGER_TOTAL_MS = 950;

// ── Main screen ──────────────────────────────────────────────────────

export default function ScoreScreen() {
  const gate = useAutomationGate();
  const { report, meta, loading, error, refresh } = useLatestScore({
    enabled: gate.connected,
  });
  const { generate, generating, error: generateError } = useGenerateScore();
  const [connecting, setConnecting] = useState(false);
  const [phase, setPhase] = useState<CeremonyPhase>('idle');
  const [ringScore, setRingScore] = useState<number | null>(null);
  /** True once a ceremony has played in this mount — drives Scorecard cascade delays. */
  const didCeremonyRef = useRef(false);

  useEffect(() => {
    if (phase === 'ring') {
      const t = setTimeout(() => setPhase('stagger'), RING_TOTAL_MS);
      return () => clearTimeout(t);
    }
    if (phase === 'stagger') {
      const t = setTimeout(() => setPhase('done'), STAGGER_TOTAL_MS);
      return () => clearTimeout(t);
    }
  }, [phase]);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      await gate.connect();
    } catch (err: unknown) {
      addLog(`score: connect failed — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setConnecting(false);
    }
  }, [gate]);

  const handleGenerate = useCallback(() => {
    setPhase('theater');
    generate()
      .then((result: ProfileScoreResult) => {
        didCeremonyRef.current = true;
        setRingScore(result.report.overall_score);
        setPhase('ring');
      })
      .catch((err: unknown) => {
        setPhase('idle');
        addLog(`score: generate failed — ${err instanceof Error ? err.message : String(err)}`);
      });
  }, [generate]);

  const sessionExpired = error === 'session_expired' || generateError === 'session_expired';
  const booting = gate.loading || (gate.connected && loading);
  const genericError = generateError && !sessionExpired ? generateError : null;

  return (
    <ScreenShell contentContainerStyle={{ gap: 16 }} testID="score-screen">
      {/* Header */}
      <View style={{ gap: 6 }}>
        <Text
          className="font-medium text-ink"
          style={{ fontSize: 32, lineHeight: 37, letterSpacing: -0.5 }}
        >
          Score
        </Text>
        <Text className="text-muted" style={{ fontSize: 13 }}>
          Your AI read on the last 30 days — refreshed weekly
        </Text>
      </View>

      {booting ? (
        <ScoreSkeleton />
      ) : !gate.connected ? (
        <GateCard
          icon="logo-instagram"
          title="Connect Instagram to get scored"
          body="Your score is computed from your real Instagram insights. Connect your professional account once — takes 30 seconds."
          ctaLabel="Connect Instagram"
          loading={connecting}
          onPress={handleConnect}
        />
      ) : sessionExpired ? (
        <GateCard
          icon="log-in-outline"
          title="Instagram disconnected"
          body="Your Instagram session expired. Reconnect to generate your score."
          ctaLabel="Reconnect Instagram"
          loading={connecting}
          onPress={handleConnect}
        />
      ) : phase === 'theater' ? (
        <AnalysisTheater />
      ) : phase === 'ring' ? (
        <ScoreRing
          score={ringScore ?? report?.overall_score ?? 0}
          label={report?.score_label}
          summary={report?.one_line_summary}
        />
      ) : report ? (
        // 'idle' + cached report and post-ceremony 'done' land here — no celebration on reopen.
        <>
          {genericError ? (
            <InlineErrorStrip message={genericError} onRetry={handleGenerate} />
          ) : null}
          <Scorecard report={report} meta={meta} ceremony={didCeremonyRef.current} onRefresh={handleGenerate} />
        </>
      ) : (
        <>
          {error && !sessionExpired ? (
            <InlineErrorStrip message={error} onRetry={refresh} />
          ) : null}
          <EmptyState generating={generating} onGenerate={handleGenerate} />
          {genericError ? (
            <InlineErrorStrip message={genericError} onRetry={handleGenerate} />
          ) : null}
        </>
      )}
    </ScreenShell>
  );
}
