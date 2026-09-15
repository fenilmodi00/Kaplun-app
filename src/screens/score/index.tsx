import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import { View } from '@/tw';
import { cn, sheetContent } from '@/tw/cn';
import { BottomSheet } from 'panelui-native';
import { useAutomationGate } from '@/hooks/useAutomationGate';
import { useGenerateScore, useLatestScore } from '@/hooks/useProfileScore';
import { addLog } from '@/lib/logger';
import type { ProfileScoreResult } from '@/lib/profile-score';
import { AnalysisCeremony, ScoreRing } from './ceremony';
import {
  EmptyState,
  GateCard,
  InlineErrorStrip,
  ScoreSkeleton,
} from './components';
import { Scorecard } from './scorecard';

/** Imperative handle — `present()`/`dismiss()` over controlled PanelUI `open`. */
export type ScoreSheetRef = {
  present: () => void;
  dismiss: () => void;
};

type CeremonyPhase = 'idle' | 'theater' | 'ring' | 'stagger' | 'done';

/** Ring reveal (1.5s) + label/summary fade tail (350ms). */
const RING_TOTAL_MS = 1850;
/** Last staggered card's delay + entrance; strengths/weaknesses land inside it. */
const STAGGER_TOTAL_MS = 950;

// ── Main screen ──────────────────────────────────────────────────────

export const ScoreSheet = forwardRef<ScoreSheetRef>(function ScoreSheet(_props, ref) {
  const [open, setOpen] = useState(false);
  useImperativeHandle(ref, () => ({
    present: () => setOpen(true),
    dismiss: () => setOpen(false),
  }), []);

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
  const dismissible = phase !== 'theater' && phase !== 'ring';

  return (
    <BottomSheet open={open} onOpenChange={setOpen}>
      <BottomSheet.Content
        size="full"
        dismissible={dismissible}
        showClose={dismissible}
      >
        <View className={cn(sheetContent, 'flex-1')} testID="score-screen">
          <BottomSheet.Header
            title="Score"
            description="Your AI read on the last 30 days — refreshed weekly"
          />
          <BottomSheet.Body contentContainerClassName="gap-3 pb-6">
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
              <AnalysisCeremony />
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
          </BottomSheet.Body>
        </View>
      </BottomSheet.Content>
    </BottomSheet>
  );
});

export default ScoreSheet;
