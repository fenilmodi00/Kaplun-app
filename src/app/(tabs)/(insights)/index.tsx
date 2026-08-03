import React from 'react';
import { View, Text } from '@/tw';
import { Ionicons } from '@expo/vector-icons';
import { ScreenShell } from '@/components/screen-shell';

export default function InsightsScreen() {
  return (
    <ScreenShell contentContainerStyle={{ paddingHorizontal: 18, gap: 16 }}>
      <Text
        className="font-medium text-ink"
        style={{ fontSize: 32, lineHeight: 37, letterSpacing: -0.5 }}
      >
        Insights
      </Text>
      <View className="bg-white border border-hairline rounded-xl p-6 items-center gap-3">
        <Ionicons name="stats-chart-outline" size={32} color="#9a9a9a" />
        <Text className="text-body-sm text-muted text-center">
          Insights are coming soon — publish your first post to see analytics.
        </Text>
      </View>
    </ScreenShell>
  );
}
