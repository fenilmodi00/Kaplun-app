import React from 'react';
import type { View as RNView } from 'react-native';

import { View, Text } from '@/tw';
import type { ProfileReport } from '@/lib/profile-score';

/** Logical card size (9:16 Stories ratio); the capture upsamples to 1080x1920. */
const CARD_WIDTH = 360;
const CARD_HEIGHT = 640;

// The card is a brand asset, so it is pinned to the canonical light palette
// (cream canvas + ink) regardless of the in-app scheme. Static hexes by design.
const c = {
  canvas: '#fffaf0',
  ink: '#0a0a0a',
  muted: '#6a6a6a',
  mutedSoft: '#9a9a9a',
  surfaceCard: '#f5f0e0',
  brandTeal: '#1a3a3a',
  onPrimary: '#ffffff',
} as const;

/**
 * Marketing-safe 9:16 score card. Rendered off-screen by the Scorecard and
 * turned into a PNG by share.ts (content contract: hero score + label +
 * Kaplun mark ONLY — no metrics, summary, strengths, or weaknesses).
 */
export const ShareCard = React.forwardRef<RNView, { report: ProfileReport }>(
  function ShareCard({ report }, ref) {
    return (
      <View
        ref={ref}
        collapsable={false}
        style={{ width: CARD_WIDTH, height: CARD_HEIGHT, backgroundColor: c.canvas }}
        testID="share-card"
      >
        <View style={{ flex: 1, padding: 32, justifyContent: 'space-between' }}>
          {/* Wordmark */}
          <Text
            className="font-semibold"
            style={{ color: c.ink, fontSize: 13, letterSpacing: 3 }}
          >
            KAPLUN
          </Text>

          {/* Hero: soft clay disc behind the score */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View
              style={{
                position: 'absolute',
                width: 240,
                height: 240,
                borderRadius: 120,
                backgroundColor: c.surfaceCard,
              }}
            />
            <Text
              className="font-semibold"
              style={{ color: c.ink, fontSize: 112, lineHeight: 116, letterSpacing: -4 }}
            >
              {report.overall_score}
            </Text>
            <Text
              className="font-medium"
              style={{ color: c.mutedSoft, fontSize: 16, marginTop: 2 }}
            >
              /100
            </Text>
            <View
              style={{
                marginTop: 18,
                backgroundColor: c.brandTeal,
                borderRadius: 9999,
                paddingVertical: 8,
                paddingHorizontal: 18,
              }}
            >
              <Text
                className="font-semibold"
                style={{ color: c.onPrimary, fontSize: 15, letterSpacing: 0.2 }}
              >
                {report.score_label}
              </Text>
            </View>
          </View>

          {/* Footer */}
          <Text
            className="font-medium"
            style={{ color: c.muted, fontSize: 13, textAlign: 'center' }}
          >
            My AI Profile Score
          </Text>
        </View>
      </View>
    );
  },
);
