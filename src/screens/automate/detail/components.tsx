import React, { type ReactNode } from 'react';
import { Badge, Item, Text } from 'panelui-native';
import { View } from '@/tw';
import type { AutomationLog } from '@/lib/automations';
import { formatRelativeTime } from '@/lib/format-time';
import { actionBadgeVariant, actionLabel } from './utils';

export function ConfigRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="flex-row justify-between gap-3">
      <Text size="sm" muted>{label}</Text>
      {children}
    </View>
  );
}

export function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <View className="items-center gap-0.5">
      <Text weight="semibold">{value}</Text>
      <Text size="sm" muted>{label}</Text>
    </View>
  );
}

export function LogRow({ log }: { log: AutomationLog }) {
  return (
    <Item className="border-b border-border">
      <Item.Content>
        <View className="flex-row items-center justify-between gap-2">
          <Item.Title numberOfLines={1} className="shrink">
            {log.commenter_username ?? 'Unknown'}
          </Item.Title>
          <Text size="xs" muted>
            {formatRelativeTime(log.created_at)}
          </Text>
        </View>
        <Item.Description numberOfLines={1}>
          {log.comment_text ?? '—'}
        </Item.Description>
        <View className="mt-0.5 flex-row items-center gap-2">
          {log.matched_keyword ? (
            <Badge variant="secondary">{log.matched_keyword}</Badge>
          ) : null}
          <Badge variant={actionBadgeVariant(log.action)}>
            {actionLabel(log.action)}
          </Badge>
        </View>
      </Item.Content>
    </Item>
  );
}
