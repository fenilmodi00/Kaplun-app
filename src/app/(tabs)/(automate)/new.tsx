/**
 * Campaign builder screen — single-scroll form for creating comment automations.
 *
 * Sections: Name, Target, Keywords, Opening DM, Public reply, Preview, Activate.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Switch, ScrollView as RNScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { View, Text, ScrollView, TextInput, Pressable } from '@/tw';
import { cn, clayInput, clayCard } from '@/tw/cn';
import { ClayAnimatedButton } from '@/components/clay/ClayAnimatedButton';
import { useAutomations } from '@/hooks/useAutomations';
import { useAutomationGate } from '@/hooks/useAutomationGate';
import { fetchMedia, type InstagramMediaResponse } from '@/lib/instagram';
import { withFreshSession } from '@/lib/with-fresh-session';
import {
  validateAutomationDraft,
  type AutomationDraft,
} from '@/lib/automation-validation';
import type { CreateAutomationInput, TargetType, MatchMode, CampaignTemplate } from '@/lib/automations';
import { listCampaignTemplates } from '@/lib/automations';
import { addLog } from '@/lib/logger';

const TARGET_OPTIONS: { value: TargetType; label: string }[] = [
  { value: 'all_posts', label: 'All posts' },
  { value: 'specific_posts', label: 'Specific posts' },
  { value: 'next_reel', label: 'Next reel' },
];

const MATCH_OPTIONS: { value: MatchMode; label: string }[] = [
  { value: 'whole_word', label: 'Whole word' },
  { value: 'partial', label: 'Contains' },
];

const DM_MAX_LENGTH = 2000;

function useMediaPicker() {
  const { getToken } = useAuth();
  const [media, setMedia] = useState<InstagramMediaResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMedia = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await withFreshSession(() => fetchMedia(), getToken);
      setMedia(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load media';
      setError(message);
      addLog(`Media picker error: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  return { media, loading, error, loadMedia };
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-caption-uppercase font-semibold text-muted">
      {children}
    </Text>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View className="flex-row rounded-md bg-surface-soft p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            className={cn(
              'flex-1 items-center justify-center rounded-sm py-2',
              active && 'bg-canvas shadow-sm'
            )}
          >
            <Text
              className={cn(
                'text-body-sm font-medium',
                active ? 'text-ink' : 'text-muted'
              )}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function KeywordChip({
  keyword,
  onRemove,
}: {
  keyword: string;
  onRemove: () => void;
}) {
  return (
    <View className="flex-row items-center gap-1 rounded-pill bg-brand-lavender px-3 py-1.5">
      <Text className="text-caption font-medium text-on-dark">{keyword}</Text>
      <Pressable onPress={onRemove} hitSlop={8}>
        <Text className="text-caption font-semibold text-on-dark">×</Text>
      </Pressable>
    </View>
  );
}

function MediaItem({
  item,
  selected,
  onToggle,
}: {
  item: InstagramMediaResponse;
  selected: boolean;
  onToggle: () => void;
}) {
  const caption = item.caption ?? 'No caption';
  return (
    <Pressable
      onPress={onToggle}
      className={cn(
        'flex-row items-center gap-3 rounded-lg border p-3',
        selected
          ? 'border-brand-lavender bg-brand-lavender/10'
          : 'border-hairline bg-canvas'
      )}
    >
      <View
        className={cn(
          'h-5 w-5 rounded-full border-2',
          selected ? 'border-brand-lavender bg-brand-lavender' : 'border-hairline'
        )}
      />
      <Text className="flex-1 text-body-sm text-body" numberOfLines={2}>
        {caption}
      </Text>
    </Pressable>
  );
}

export default function NewAutomationScreen() {
  const router = useRouter();
  const { createAutomation, creating } = useAutomations();

  const [name, setName] = useState('');
  const [targetType, setTargetType] = useState<TargetType>('all_posts');
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [matchMode, setMatchMode] = useState<MatchMode>('whole_word');
  const [dmMessage, setDmMessage] = useState('');
  const [publicReplyEnabled, setPublicReplyEnabled] = useState(false);
  const [publicReplyMessage, setPublicReplyMessage] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Template picker state ──────────────────────────────────────────────
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplateSlug, setSelectedTemplateSlug] = useState<string | null>(null);
  const { getToken } = useAuth();

  const { media, loading: mediaLoading, error: mediaError, loadMedia } = useMediaPicker();
  const { connect: connectInstagram } = useAutomationGate();
  const [isConnectingIg, setIsConnectingIg] = useState(false);

  // Load media when target switches to specific_posts
  useEffect(() => {
    if (targetType === 'specific_posts' && media.length === 0 && !mediaLoading) {
      loadMedia();
    }
  }, [targetType, media.length, mediaLoading, loadMedia]);

  // Fetch templates on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listCampaignTemplates(getToken);
        if (!cancelled) setTemplates(data);
      } catch (err) {
        addLog(`Failed to load templates: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getToken]);

  const applyTemplate = useCallback((slug: string | null) => {
    setSelectedTemplateSlug(slug);
    if (slug === null) {
      setName('');
      setKeywords([]);
      setDmMessage('');
      return;
    }
    const tmpl = templates.find((t) => t.slug === slug);
    if (!tmpl) return;
    setName(tmpl.title);
    setKeywords(tmpl.keywords.map((k) => k.toLowerCase()));
    setDmMessage(tmpl.dm_message);
  }, [templates]);

  const draft: AutomationDraft = useMemo(
    () => ({
      name,
      targetType,
      selectedMediaIds,
      keywords,
      matchMode,
      dmMessage,
      publicReplyEnabled,
      publicReplyMessage,
    }),
    [name, targetType, selectedMediaIds, keywords, matchMode, dmMessage, publicReplyEnabled, publicReplyMessage]
  );

  const validationErrors = useMemo(() => validateAutomationDraft(draft), [draft]);
  const isValid = validationErrors.length === 0;

  const handleAddKeyword = useCallback(() => {
    const trimmed = keywordInput.trim().toLowerCase();
    if (trimmed && !keywords.includes(trimmed)) {
      setKeywords((prev) => [...prev, trimmed]);
      setKeywordInput('');
    }
  }, [keywordInput, keywords]);

  const handleRemoveKeyword = useCallback((kw: string) => {
    setKeywords((prev) => prev.filter((k) => k !== kw));
  }, []);

  const toggleMedia = useCallback((id: string) => {
    setSelectedMediaIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!isValid || creating) return;
    setSubmitError(null);

    const input: CreateAutomationInput = {
      name: name.trim(),
      target_type: targetType,
      keywords,
      match_mode: matchMode,
      dm_message: dmMessage.trim(),
      public_reply_enabled: publicReplyEnabled,
      ...(targetType === 'specific_posts' ? { media_ids: selectedMediaIds } : {}),
      ...(publicReplyEnabled ? { public_reply_message: publicReplyMessage.trim() } : { public_reply_message: null }),
    };

    try {
      await createAutomation(input);
      router.back();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create automation';
      addLog(`Create automation error: ${message}`);
      if (message.includes('409') || message.includes('instagram_not_connected')) {
        setSubmitError('instagram_not_connected');
      } else {
        setSubmitError(message);
      }
    }
  }, [
    isValid, creating, name, targetType, keywords, matchMode, dmMessage,
    publicReplyEnabled, publicReplyMessage, selectedMediaIds,
    createAutomation, router,
  ]);

  const previewMessage = dmMessage.replace(/{username}/g, '@yourfan');

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ padding: 16, gap: 24 }}>
      {/* ── 0. Template picker ── */}
      <View style={{ gap: 8 }}>
        <SectionLabel>Start from a template</SectionLabel>
        {templatesLoading ? (
          <Text className="text-body-sm text-muted">Loading templates…</Text>
        ) : (
          <RNScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
          >
            {/* Blank card */}
            <Pressable
              onPress={() => applyTemplate(null)}
              className={cn(
                'h-20 w-32 items-center justify-center rounded-xl border-2',
                selectedTemplateSlug === null
                  ? 'border-primary bg-primary/10'
                  : 'border-hairline bg-surface-soft'
              )}
            >
              <Text
                className={cn(
                  'text-body-sm font-semibold text-center',
                  selectedTemplateSlug === null ? 'text-primary' : 'text-muted'
                )}
              >
                Blank
              </Text>
            </Pressable>
            {templates.map((tmpl) => {
              const active = selectedTemplateSlug === tmpl.slug;
              return (
                <Pressable
                  key={tmpl.slug}
                  onPress={() => applyTemplate(tmpl.slug)}
                  className={cn(
                    'h-20 w-40 items-center justify-center rounded-xl border-2 px-3',
                    active
                      ? 'border-primary bg-primary/10'
                      : 'border-hairline bg-surface-soft'
                  )}
                >
                  <Text
                    className={cn(
                      'text-caption font-semibold text-center',
                      active ? 'text-primary' : 'text-ink'
                    )}
                    numberOfLines={2}
                  >
                    {tmpl.title}
                  </Text>
                </Pressable>
              );
            })}
          </RNScrollView>
        )}
      </View>

      {/* ── 1. Name ── */}
      <View style={{ gap: 8 }}>
        <SectionLabel>Campaign name</SectionLabel>
        <TextInput
          className={cn(clayInput)}
          placeholder="e.g. Welcome new followers"
          value={name}
          onChangeText={setName}
          accessibilityLabel="Campaign name"
        />
      </View>

      {/* ── 2. Target ── */}
      <View style={{ gap: 8 }}>
        <SectionLabel>Target</SectionLabel>
        <SegmentedControl
          options={TARGET_OPTIONS}
          value={targetType}
          onChange={(val) => {
            setTargetType(val);
            if (val !== 'specific_posts') {
              setSelectedMediaIds([]);
            }
          }}
        />
        {targetType === 'next_reel' && (
          <Text className="text-body-sm text-muted">
            Automatically applies to every new reel you post
          </Text>
        )}
        {targetType === 'specific_posts' && (
          <View style={{ gap: 8, marginTop: 8 }}>
            {mediaLoading && (
              <Text className="text-body-sm text-muted">Loading posts…</Text>
            )}
            {mediaError && (
              <View style={{ gap: 8 }}>
                <Text className="text-body-sm text-error">
                  {mediaError === 'session_expired'
                    ? 'Session expired. Please reconnect Instagram.'
                    : mediaError}
                </Text>
                <ClayAnimatedButton variant="secondary" onPress={loadMedia}>
                  Retry
                </ClayAnimatedButton>
              </View>
            )}
            {!mediaLoading && !mediaError && media.length === 0 && (
              <Text className="text-body-sm text-muted">No posts found</Text>
            )}
            {media.map((item) => (
              <MediaItem
                key={item.id}
                item={item}
                selected={selectedMediaIds.includes(item.id)}
                onToggle={() => toggleMedia(item.id)}
              />
            ))}
          </View>
        )}
      </View>

      {/* ── 3. Keywords ── */}
      <View style={{ gap: 8 }}>
        <SectionLabel>Keywords</SectionLabel>
        <View className="flex-row gap-2">
          <TextInput
            className={cn(clayInput, 'flex-1')}
            placeholder="Type a keyword…"
            value={keywordInput}
            onChangeText={setKeywordInput}
            onSubmitEditing={handleAddKeyword}
            returnKeyType="done"
            accessibilityLabel="Keyword input"
          />
          <Pressable
            onPress={handleAddKeyword}
            className="h-11 items-center justify-center rounded-md bg-primary px-4"
          >
            <Text className="text-button font-semibold text-on-primary">Add</Text>
          </Pressable>
        </View>
        {keywords.length > 0 && (
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {keywords.map((kw) => (
              <KeywordChip key={kw} keyword={kw} onRemove={() => handleRemoveKeyword(kw)} />
            ))}
          </View>
        )}
        <View style={{ gap: 4 }}>
          <SegmentedControl
            options={MATCH_OPTIONS}
            value={matchMode}
            onChange={setMatchMode}
          />
          {matchMode === 'whole_word' && (
            <Text className="text-caption text-muted-soft">
              "link" won't match "linking"
            </Text>
          )}
        </View>
      </View>

      {/* ── 4. Opening DM ── */}
      <View style={{ gap: 8 }}>
        <SectionLabel>Opening DM</SectionLabel>
        <Text className="text-caption text-muted-soft">
          We'll replace {'{username}'} with the commenter's name
        </Text>
        <TextInput
          className={cn(clayInput, 'h-auto py-3')}
          style={{ minHeight: 100, textAlignVertical: 'top' }}
          placeholder="Write your direct message…"
          value={dmMessage}
          onChangeText={setDmMessage}
          multiline
          maxLength={DM_MAX_LENGTH}
          accessibilityLabel="DM message"
        />
        <Text
          className={cn(
            'text-right text-caption',
            dmMessage.length >= DM_MAX_LENGTH ? 'text-error' : 'text-muted-soft'
          )}
        >
          {dmMessage.length}/{DM_MAX_LENGTH}
        </Text>
      </View>

      {/* ── 5. Public reply ── */}
      <View style={{ gap: 8 }}>
        <View className="flex-row items-center justify-between">
          <SectionLabel>Public reply</SectionLabel>
          <Switch
            value={publicReplyEnabled}
            onValueChange={setPublicReplyEnabled}
            accessibilityLabel="Enable public reply"
          />
        </View>
        {publicReplyEnabled && (
          <>
            <Text className="text-caption text-muted-soft">
              We'll replace {'{username}'} with the commenter's name
            </Text>
            <TextInput
              className={cn(clayInput, 'h-auto py-3')}
              style={{ minHeight: 80, textAlignVertical: 'top' }}
              placeholder="Write your public reply…"
              value={publicReplyMessage}
              onChangeText={setPublicReplyMessage}
              multiline
              accessibilityLabel="Public reply message"
            />
          </>
        )}
      </View>

      {/* ── 6. Preview card ── */}
      <View style={{ gap: 8 }}>
        <SectionLabel>Preview</SectionLabel>
        <View className={cn(clayCard, 'bg-surface-soft')}>
          <Text className="text-body-sm text-muted" selectable>
            {previewMessage || 'Your message will appear here'}
          </Text>
          {keywords.length > 0 && (
            <View className="mt-3 flex-row flex-wrap" style={{ gap: 6 }}>
              {keywords.map((kw) => (
                <View
                  key={kw}
                  className="rounded-pill bg-brand-pink/15 px-2 py-0.5"
                >
                  <Text className="text-caption font-medium text-brand-pink">
                    {kw}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* ── 7. Activate ── */}
      <View style={{ gap: 12, paddingBottom: 32 }}>
        {submitError === 'instagram_not_connected' && (
          <View style={{ gap: 8 }}>
            <View className={cn(clayCard, 'bg-brand-coral/10 border-brand-coral/30')}>
              <Text className="text-body-sm text-brand-coral">
                Instagram account not connected. Connect your account to enable automations.
              </Text>
            </View>
            <ClayAnimatedButton
              variant="primary"
              fullWidth
              loading={isConnectingIg}
              onPress={async () => {
                setIsConnectingIg(true);
                try {
                  await connectInstagram();
                } catch {
                  // OAuth cancellation is expected
                } finally {
                  setIsConnectingIg(false);
                }
              }}
            >
              Connect Instagram
            </ClayAnimatedButton>
          </View>
        )}
        {submitError && submitError !== 'instagram_not_connected' && (
          <Text className="text-center text-body-sm text-error">{submitError}</Text>
        )}
        <ClayAnimatedButton
          onPress={handleSubmit}
          disabled={!isValid}
          loading={creating}
          fullWidth
        >
          Activate campaign
        </ClayAnimatedButton>
      </View>
    </ScrollView>
  );
}
