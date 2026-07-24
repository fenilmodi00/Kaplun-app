import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, ScrollView } from '@/tw';
import { Ionicons } from '@expo/vector-icons';

export default function PublishScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 18,
        gap: 16,
      }}
    >
      <Text
        className="font-medium text-ink"
        style={{ fontSize: 32, lineHeight: 37, letterSpacing: -0.5 }}
      >
        Publish
      </Text>
      <View className="bg-white border border-hairline rounded-xl p-6 items-center gap-3">
        <Ionicons name="add-circle-outline" size={32} color="#9a9a9a" />
        <Text className="text-body-sm text-muted text-center">
          Publishing is coming soon — connect Instagram to get ready.
        </Text>
      </View>
    </ScrollView>
  );
}
