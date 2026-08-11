import React from 'react';
import { Text, View } from 'react-native';
import type { AutomationLog } from '@/lib/automations';
import { useThemeColors } from '@/lib/theme';
import { formatRelativeTime } from '@/lib/format-time';
import { actionMeta } from './utils';
import type { AutomationStyles } from './index';

export function StatCell({ value, label, styles }: { value: string; label: string; styles: AutomationStyles }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function LogRow({ log, styles }: { log: AutomationLog; styles: AutomationStyles }) {
  const t = useThemeColors();
  const meta = actionMeta(t)[log.action] ?? actionMeta(t).pending;

  return (
    <View style={styles.logRow}>
      <View style={styles.logBody}>
        <View style={styles.logTopRow}>
          <Text style={styles.logUsername} numberOfLines={1}>
            {log.commenter_username ?? 'Unknown'}
          </Text>
          <Text style={styles.logTime}>{formatRelativeTime(log.created_at)}</Text>
        </View>
        <Text style={styles.logComment} numberOfLines={1}>
          {log.comment_text ?? '—'}
        </Text>
        <View style={styles.logBadgeRow}>
          {log.matched_keyword ? (
            <View style={styles.keywordChip}>
              <Text style={styles.keywordChipText}>{log.matched_keyword}</Text>
            </View>
          ) : null}
          <View style={[styles.actionBadge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.actionBadgeText, { color: meta.text }]}>
              {meta.label}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
