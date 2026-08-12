/**
 * Score screen tests.
 *
 * Data layers are mocked at the hook boundaries (useAutomationGate,
 * useProfileScore) so each renderable state — gate boot, not-connected,
 * session expired, empty, ceremony phases, scorecard, generic error — is
 * exercised directly.
 *
 * Ceremony tests use fake timers: jest.useFakeTimers() is installed AFTER the
 * initial render + CTA press (both are timer-free), so AnalysisTheater's stage
 * interval, the ring count-up interval, and the screen's phase timeouts all
 * become advanceable. Modern fake timers also mock Date.now for the count-up.
 */

import React, { type ReactNode } from 'react';
import { act, render, screen, fireEvent, within } from '@testing-library/react-native';
import type { ProfileReport, ProfileScoreResult, ReportMeta } from '@/lib/profile-score';

const mockUseAutomationGate = jest.fn();
jest.mock('@/hooks/useAutomationGate', () => ({
  useAutomationGate: () => mockUseAutomationGate(),
}));

const mockUseLatestScore = jest.fn();
const mockUseGenerateScore = jest.fn();
jest.mock('@/hooks/useProfileScore', () => ({
  useLatestScore: (opts: unknown) => mockUseLatestScore(opts),
  useGenerateScore: () => mockUseGenerateScore(),
}));

jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

// The real sheet gates children behind `visible` (imperative present()) — tests
// assert content directly, so the mock always renders. Refs no-op.
jest.mock('@/components/ui/bottomsheet', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    BottomSheetModal: React.forwardRef(
      ({ children }: { children?: ReactNode }, _ref: unknown) =>
        React.createElement(View, null, children),
    ),
    BottomSheetView: ({ children }: { children?: ReactNode }) =>
      React.createElement(View, null, children),
    BottomSheetHeader: ({ title, subtitle }: { title: string; subtitle?: string }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        subtitle ? React.createElement(Text, null, subtitle) : null,
      ),
  };
});

import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

import ScoreSheet from '@/screens/score';

const mockCaptureRef = jest.mocked(captureRef);
const mockShareAvailable = jest.mocked(Sharing.isAvailableAsync);
const mockShareAsync = jest.mocked(Sharing.shareAsync);

const baseReport: ProfileReport = {
  overall_score: 72,
  score_label: 'Rising',
  one_line_summary: 'Steady growth with strong saves on reels.',
  strengths: ['Saves are 2x your niche benchmark', 'You post consistently every 2 days'],
  weaknesses: ['Reel reach dipped 18% this week'],
  action_plan: [
    {
      priority: 'high' as const,
      action: 'Post a carousel breaking down your top reel',
      why: 'Carousels double the saves of your average post',
      when_to_post: 'Today 19:00-22:00 IST',
    },
    {
      priority: 'medium' as const,
      action: 'Reply to every comment within an hour',
      why: 'Fast replies lift next-post reach',
      when_to_post: 'After each post',
    },
    {
      priority: 'low' as const,
      action: 'Batch 3 reels this weekend',
      why: 'Cadence beats perfection at your stage',
      when_to_post: 'Sat-Sun 10:00-13:00 IST',
    },
  ],
};

const baseMeta: ReportMeta = {
  model: 'test-model',
  tokens: 1234,
  created_at: '2026-08-11T09:00:00Z',
  cached: false,
};

function setGate(overrides: Record<string, unknown> = {}) {
  mockUseAutomationGate.mockReturnValue({
    connected: true,
    loading: false,
    connect: jest.fn(),
    ...overrides,
  });
}

function setLatest(overrides: Record<string, unknown> = {}) {
  mockUseLatestScore.mockReturnValue({
    report: null,
    meta: null,
    loading: false,
    error: null,
    refresh: jest.fn(),
    ...overrides,
  });
}

function setGenerate(overrides: Record<string, unknown> = {}) {
  mockUseGenerateScore.mockReturnValue({
    generate: jest.fn(),
    generating: false,
    error: null,
    ...overrides,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * RNTL 14 fireEvent is not act-wrapped — state queued by a press only renders
 * after an explicit (async) act flush. Without this, assertions sample the
 * pre-press tree and leaked act scopes corrupt the NEXT tests' renders.
 */
async function press(target: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(target);
  });
}

/** Stage interval 2400ms / ring 1500ms+350ms tail / stagger 950ms — mirrors screen + components. */
const RING_TOTAL_MS = 1850;
const STAGGER_TOTAL_MS = 950;

beforeEach(() => {
  mockUseAutomationGate.mockReset();
  mockUseLatestScore.mockReset();
  mockUseGenerateScore.mockReset();
  mockCaptureRef.mockReset().mockResolvedValue('file:///tmp/kaplun-score.png');
  mockShareAvailable.mockReset().mockResolvedValue(true);
  mockShareAsync.mockReset().mockResolvedValue(undefined);
  setGate();
  setLatest();
  setGenerate();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ScoreScreen', () => {
  it('loading: renders header with a skeleton below', async () => {
    setLatest({ loading: true });
    await render(<ScoreSheet />);

    expect(screen.getByText('Score')).toBeTruthy();
    expect(screen.queryByText('Generate my score')).toBeNull();
    expect(screen.queryByText('Connect Instagram')).toBeNull();
  });

  it('skips the latest fetch while the gate is not connected', async () => {
    setGate({ connected: false });
    await render(<ScoreSheet />);

    expect(mockUseLatestScore).toHaveBeenCalledWith({ enabled: false });
  });

  it('not connected: steers to the Instagram connect flow', async () => {
    const connect = jest.fn().mockResolvedValue(undefined);
    setGate({ connected: false, connect });
    await render(<ScoreSheet />);

    expect(screen.getByText('Connect Instagram to get scored')).toBeTruthy();
    await press(screen.getByText('Connect Instagram'));
    expect(connect).toHaveBeenCalled();
  });

  it('session_expired: shows the reconnect card', async () => {
    setLatest({ error: 'session_expired' });
    await render(<ScoreSheet />);

    expect(screen.getByText('Instagram disconnected')).toBeTruthy();
    expect(screen.getByText('Reconnect Instagram')).toBeTruthy();
    expect(screen.queryByText('Generate my score')).toBeNull();
  });

  it('empty state: explicit Generate CTA, no auto-start', async () => {
    const generate = jest.fn().mockReturnValue(new Promise(() => {}));
    setGenerate({ generate });
    await render(<ScoreSheet />);

    expect(screen.getByText('Get your AI Profile Score')).toBeTruthy();
    await press(screen.getByText('Generate my score'));
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('theater: generate swaps the empty state for staged analysis rows', async () => {
    const generate = jest.fn().mockReturnValue(new Promise(() => {}));
    setGenerate({ generate });
    await render(<ScoreSheet />);
    await press(screen.getByText('Generate my score'));

    expect(screen.getByTestId('analysis-theater')).toBeTruthy();
    expect(screen.getByText('Reading your last posts…')).toBeTruthy();
    expect(screen.getByText('Checking engagement & saves…')).toBeTruthy();
    expect(screen.getByText('Finding your best posting window…')).toBeTruthy();
    expect(screen.getByText('Writing your action plan…')).toBeTruthy();
    expect(screen.getByText(/can take up to a minute/)).toBeTruthy();
    // The lone-spinner empty state is replaced, not stacked.
    expect(screen.queryByText('Get your AI Profile Score')).toBeNull();
    expect(screen.getByLabelText('Searching')).toBeTruthy();
  });

  it('theater: stages advance while the generate call is in flight', async () => {
    const generate = jest.fn().mockReturnValue(new Promise(() => {}));
    setGenerate({ generate });
    await render(<ScoreSheet />);

    // Fake timers before the press so the theater mounts onto the fake clock.
    jest.useFakeTimers();
    await press(screen.getByText('Generate my score'));
    await act(async () => {
      jest.advanceTimersByTime(2500);
    });

    expect(screen.getByLabelText('Working')).toBeTruthy();
  });

  it('ring: after generate succeeds, the score ring counts up to the score', async () => {
    const d = deferred<ProfileScoreResult>();
    const generate = jest.fn().mockReturnValue(d.promise);
    setGenerate({ generate });
    await render(<ScoreSheet />);

    jest.useFakeTimers();
    await press(screen.getByText('Generate my score'));
    // The mocked hook has no setQueryData side effect — latest flips to the fresh report.
    mockUseLatestScore.mockReturnValue({
      report: baseReport,
      meta: baseMeta,
      loading: false,
      error: null,
      refresh: jest.fn(),
    });
    await act(async () => {
      d.resolve({ report: baseReport, meta: baseMeta });
    });

    expect(screen.queryByTestId('analysis-theater')).toBeNull();
    expect(screen.getByTestId('score-ring')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(1500);
    });

    expect(screen.getByText('72')).toBeTruthy();
    expect(screen.getByText('/100')).toBeTruthy();
    // Label + summary render for the fade-in after the ring completes.
    expect(screen.getByText('Rising')).toBeTruthy();
    expect(screen.getByText('Steady growth with strong saves on reels.')).toBeTruthy();
  });

  it('stagger: after the ring, the full scorecard lands actions-first', async () => {
    const d = deferred<ProfileScoreResult>();
    const generate = jest.fn().mockReturnValue(d.promise);
    setGenerate({ generate });
    await render(<ScoreSheet />);

    jest.useFakeTimers();
    await press(screen.getByText('Generate my score'));
    // The mocked hook has no setQueryData side effect — latest flips to the fresh report.
    mockUseLatestScore.mockReturnValue({
      report: baseReport,
      meta: baseMeta,
      loading: false,
      error: null,
      refresh: jest.fn(),
    });
    await act(async () => {
      d.resolve({ report: baseReport, meta: baseMeta });
    });

    await act(async () => {
      jest.advanceTimersByTime(RING_TOTAL_MS + STAGGER_TOTAL_MS);
    });

    expect(screen.queryByTestId('score-ring')).toBeNull();
    expect(screen.queryByTestId('analysis-theater')).toBeNull();
    // Two instances: scorecard hero + the hidden 9:16 share card capture target.
    expect(screen.getAllByText('72')).toHaveLength(2);
    expect(screen.getByText('Do this next')).toBeTruthy();
    expect(screen.getByText('Post a carousel breaking down your top reel')).toBeTruthy();
    expect(screen.getByText('What’s working')).toBeTruthy();
    expect(screen.getByText('What to fix')).toBeTruthy();
  });

  it('cached reopen: scorecard renders directly, no theater or ring', async () => {
    setLatest({ report: baseReport, meta: baseMeta });
    await render(<ScoreSheet />);

    expect(screen.queryByTestId('analysis-theater')).toBeNull();
    expect(screen.queryByTestId('score-ring')).toBeNull();

    // Hero — two instances each: scorecard + the hidden 9:16 share card.
    expect(screen.getByTestId('share-card')).toBeTruthy();
    expect(screen.getAllByText('72')).toHaveLength(2);
    expect(screen.getAllByText('Rising')).toHaveLength(2);
    expect(screen.getByText('Steady growth with strong saves on reels.')).toBeTruthy();

    // Actions cascade before strengths/weaknesses.
    expect(screen.getByText('Do this next')).toBeTruthy();
    expect(screen.getByText('What’s working')).toBeTruthy();
    expect(screen.getByText('What to fix')).toBeTruthy();
    expect(screen.getByText('High')).toBeTruthy();
    expect(screen.getByText('Medium')).toBeTruthy();
    expect(screen.getByText('Low')).toBeTruthy();
    expect(screen.getByText('Post a carousel breaking down your top reel')).toBeTruthy();
    expect(screen.getByText('Today 19:00-22:00 IST')).toBeTruthy();
    expect(screen.getByText('Saves are 2x your niche benchmark')).toBeTruthy();
    expect(screen.getByText('Reel reach dipped 18% this week')).toBeTruthy();

    // No regenerate/auto CTA on a cached view — refresh is explicit.
    expect(screen.queryByText('Generate my score')).toBeNull();
    expect(screen.getByTestId('score-refresh')).toBeTruthy();
  });

  it('refresh: re-runs the full ceremony on the cached view', async () => {
    setLatest({ report: baseReport, meta: baseMeta });
    const d = deferred<ProfileScoreResult>();
    const generate = jest.fn().mockReturnValue(d.promise);
    setGenerate({ generate });
    await render(<ScoreSheet />);

    jest.useFakeTimers();
    await press(screen.getByTestId('score-refresh'));

    // Theater replaces the scorecard during refresh.
    expect(screen.getByTestId('analysis-theater')).toBeTruthy();
    expect(screen.queryByText('Do this next')).toBeNull();

    const refreshed: ProfileReport = { ...baseReport, overall_score: 90 };
    mockUseLatestScore.mockReturnValue({
      report: refreshed,
      meta: baseMeta,
      loading: false,
      error: null,
      refresh: jest.fn(),
    });
    await act(async () => {
      d.resolve({ report: refreshed, meta: baseMeta });
    });

    expect(screen.getByTestId('score-ring')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(RING_TOTAL_MS + STAGGER_TOTAL_MS);
    });

    expect(screen.queryByTestId('score-ring')).toBeNull();
    // Scorecard hero + hidden share card both reflect the refreshed score.
    expect(screen.getAllByText('90')).toHaveLength(2);
    expect(screen.getByText('Do this next')).toBeTruthy();
  });

  it('generate failure: returns to the empty state with the error strip', async () => {
    const d = deferred<ProfileScoreResult>();
    const generate = jest.fn().mockReturnValue(d.promise);
    setGenerate({ generate });
    await render(<ScoreSheet />);
    await press(screen.getByText('Generate my score'));
    expect(screen.getByTestId('analysis-theater')).toBeTruthy();

    mockUseGenerateScore.mockReturnValue({
      generate,
      generating: false,
      error: 'profile-score request failed (500)',
    });
    await act(async () => {
      d.reject(new Error('profile-score request failed (500)'));
    });

    expect(screen.queryByTestId('analysis-theater')).toBeNull();
    expect(screen.queryByTestId('score-ring')).toBeNull();
    expect(screen.getByText('Get your AI Profile Score')).toBeTruthy();
    expect(screen.getByText(/Couldn’t load your score/)).toBeTruthy();
  });

  it('generic error: inline retry strip above the empty state', async () => {
    const refresh = jest.fn();
    setLatest({ error: 'Network request failed', refresh });
    await render(<ScoreSheet />);

    expect(screen.getByText(/Couldn’t load your score/)).toBeTruthy();
    await press(screen.getByText('Retry'));
    expect(refresh).toHaveBeenCalled();
    // Empty state CTA still available
    expect(screen.getByText('Generate my score')).toBeTruthy();
  });

  it('share: captures the hidden 9:16 card and opens the OS sheet', async () => {
    setLatest({ report: baseReport, meta: baseMeta });
    await render(<ScoreSheet />);

    await press(screen.getByText('Share my score'));

    expect(mockCaptureRef).toHaveBeenCalledTimes(1);
    const options = mockCaptureRef.mock.calls[0]?.[1];
    expect(options).toMatchObject({ format: 'png', width: 1080, height: 1920, result: 'tmpfile' });
    expect(mockShareAvailable).toHaveBeenCalled();
    expect(mockShareAsync).toHaveBeenCalledWith(
      'file:///tmp/kaplun-score.png',
      expect.objectContaining({ mimeType: 'image/png' }),
    );
  });

  it('share card content: hero score + label + mark only, no private metrics', async () => {
    setLatest({ report: baseReport, meta: baseMeta });
    await render(<ScoreSheet />);

    const card = within(screen.getByTestId('share-card'));
    expect(card.getByText('72')).toBeTruthy();
    expect(card.getByText('Rising')).toBeTruthy();
    expect(card.getByText('KAPLUN')).toBeTruthy();
    expect(card.queryByText('Steady growth with strong saves on reels.')).toBeNull();
    expect(card.queryByText('Reel reach dipped 18% this week')).toBeNull();
    expect(card.queryByText(/high|medium|low/i)).toBeNull();
  });

  it('share failure: friendly inline message, CTA stays retryable', async () => {
    mockCaptureRef.mockRejectedValueOnce(new Error('boom'));
    setLatest({ report: baseReport, meta: baseMeta });
    await render(<ScoreSheet />);

    await press(screen.getByText('Share my score'));

    expect(screen.getByText(/Couldn’t create the share image/)).toBeTruthy();
    expect(mockShareAsync).not.toHaveBeenCalled();

    await press(screen.getByText('Share my score'));
    expect(mockShareAsync).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Couldn’t create the share image/)).toBeNull();
  });

  it('share unavailable: named error maps to a device-specific message', async () => {
    mockShareAvailable.mockResolvedValueOnce(false);
    setLatest({ report: baseReport, meta: baseMeta });
    await render(<ScoreSheet />);

    await press(screen.getByText('Share my score'));

    expect(screen.getByText('Sharing isn’t available on this device.')).toBeTruthy();
    expect(mockShareAsync).not.toHaveBeenCalled();
  });
});
