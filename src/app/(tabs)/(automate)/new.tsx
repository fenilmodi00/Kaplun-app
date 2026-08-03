/**
 * Campaign builder screen — sectioned comment-automation flow.
 *
 * Modeled on the ManyChat-style mobile builder:
 * trigger → post picker → keyword filter → DM/reply actions → activate.
 * Uses the existing backend contract (CreateAutomationInput) unchanged.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Switch,
  ScrollView as RNScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, ScrollView, TextInput, Pressable } from '@/tw';
import { Image } from '@/tw/image';
import { cn, clayInput, clayCard } from '@/tw/cn';
import { ClayAnimatedButton } from '@/components/clay/ClayAnimatedButton';
import { useAutomations } from '@/hooks/useAutomations';
import { useAutomationGate } from '@/hooks/useAutomationGate';
import { fetchMedia, type InstagramMediaResponse } from '@/lib/instagram';
import {
  validateAutomationDraft,
  type AutomationDraft,
} from '@/lib/automation-validation';
import type {
  CreateAutomationInput,
  TargetType,
  MatchMode,
  CampaignTemplate,
} from '@/lib/automations';
import { listCampaignTemplates } from '@/lib/automations';
import { addLog } from '@/lib/logger';

const TARGET_OPTIONS: { value: TargetType; label: string; description?: string }[] = [
  { value: 'specific_posts', label: 'a specific post or reel' },
  { value: 'all_posts', label: 'any post or reel' },
  { value: 'next_reel', label: 'next post or reel', description: 'Automatically applies to every new reel you post' },
];

const MATCH_OPTIONS: { value: MatchMode; label: string }[] = [
  { value: 'whole_word', label: 'Whole word' },
  { value: 'partial', label: 'Contains' },
];

const EXAMPLE_KEYWORDS = ['Price', 'Link', 'Shop'];
const DM_MAX_LENGTH = 2000;
const BUTTON_TEXT_MAX_LENGTH = 20;
const REVEAL_MAX_LENGTH = 2000;

function useMediaPicker() {
  const [media, setMedia] = useState<InstagramMediaResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const loadMedia = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMedia();
      setMedia(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load media';
      setError(message);
      addLog(`Media picker error: ${message}`);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [loading]);

  return { media, loading, error, hasLoaded, loadMedia };
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-title-2 font-semibold text-ink" style={{ letterSpacing: -0.3 }}>
      {children}
    </Text>
  );
}

function SectionCaption({ children }: { children: React.ReactNode }) {
  return <Text className="text-body-sm text-muted">{children}</Text>;
}

function RadioCard({
  selected,
  title,
  description,
  onPress,
  children,
}: {
  selected: boolean;
  title: string;
  description?: string;
  onPress: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'will-change-variable overflow-hidden rounded-xl border bg-canvas p-4',
        selected ? 'border-brand-lavender bg-brand-lavender/8' : 'border-hairline'
      )}
    >
      <View className="flex-row items-start gap-3">
        <View
          className={cn(
            'mt-0.5 h-5 w-5 rounded-full border-2',
            selected ? 'border-brand-lavender bg-brand-lavender' : 'border-hairline'
          )}
        />
        <View className="flex-1" style={{ gap: 4 }}>
          <Text className="text-body-md font-medium text-ink">{title}</Text>
          {description ? <Text className="text-body-sm text-muted">{description}</Text> : null}
          {children}
        </View>
      </View>
    </Pressable>
  );
}

function ToggleCard({
  title,
  description,
  value,
  onValueChange,
  disabled = false,
  switchAccessibilityLabel,
}: {
  title: string;
  description?: string;
  value: boolean;
  onValueChange?: (value: boolean) => void;
  disabled?: boolean;
  switchAccessibilityLabel?: string;
}) {
  return (
    <View
      className={cn(
        'will-change-variable flex-row items-center justify-between rounded-xl border bg-canvas p-4',
        disabled ? 'opacity-70' : 'border-hairline'
      )}
    >
      <View className="flex-1 pr-3" style={{ gap: 4 }}>
        <Text className="text-body-md font-medium text-ink">{title}</Text>
        {description ? <Text className="text-body-sm text-muted">{description}</Text> : null}
      </View>
            <Switch
              value={value}
              onValueChange={disabled ? undefined : onValueChange}
              disabled={disabled}
              accessibilityLabel={switchAccessibilityLabel ?? title}
            />
    </View>
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
              'will-change-variable flex-1 items-center justify-center rounded-sm py-2',
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

function KeywordChip({ keyword, onRemove }: { keyword: string; onRemove: () => void }) {
  return (
    <View className="flex-row items-center gap-1 rounded-pill bg-brand-lavender px-3 py-1.5">
      <Text className="text-caption font-medium text-on-dark">{keyword}</Text>
      <Pressable onPress={onRemove} hitSlop={8}>
        <Text className="text-caption font-semibold text-on-dark">×</Text>
      </Pressable>
    </View>
  );
}

function MediaGrid({
  media,
  selectedIds,
  onToggle,
}: {
  media: InstagramMediaResponse[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const displayMedia = showAll ? media : media.slice(0, 4);

  return (
    <View style={{ gap: 10 }}>
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        {displayMedia.map((item) => {
          const selected = selectedIds.includes(item.id);
          const uri = item.thumbnail_url ?? item.media_url ?? undefined;
          const isReel = item.media_product_type === 'REELS' || item.media_type === 'VIDEO';
          return (
            <Pressable
              key={item.id}
              onPress={() => onToggle(item.id)}
              accessibilityLabel={item.caption ?? 'Media thumbnail'}
              className={cn(
                'relative overflow-hidden rounded-lg border-2',
                selected ? 'border-brand-lavender' : 'border-hairline'
              )}
              style={{ width: '23%', aspectRatio: 1 }}
            >
              {uri ? (
                <Image
                  source={{ uri }}
                  className="h-full w-full"
                  resizeMode="cover"
                  accessibilityLabel=""
                />
              ) : (
                <View className="h-full w-full items-center justify-center bg-surface-soft">
                  <Text className="text-caption text-muted">No img</Text>
                </View>
              )}
              {isReel && (
                <View className="absolute left-1 top-1 rounded px-1.5 py-0.5 bg-ink/70">
                  <Text className="text-caption font-semibold text-on-primary">REELS</Text>
                </View>
              )}
              {selected && (
                <View className="absolute inset-0 items-center justify-center bg-brand-lavender/20">
                  <View className="h-6 w-6 items-center justify-center rounded-full bg-brand-lavender">
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  </View>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      {media.length > 4 && (
        <Pressable onPress={() => setShowAll((s) => !s)}>
          <Text className="text-body-sm font-semibold text-primary">
            {showAll ? 'Show less' : 'Show All'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export default function NewAutomationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { createAutomation, creating } = useAutomations();
  const { getToken } = useAuth();
  const { connect: connectInstagram } = useAutomationGate();

  // ── Form state ───────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [targetType, setTargetType] = useState<TargetType>('specific_posts');
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [matchMode, setMatchMode] = useState<MatchMode>('whole_word');
  const [dmMessage, setDmMessage] = useState('');
  const [openingDmMode, setOpeningDmMode] = useState<'direct' | 'button'>('direct');
  const [buttonText, setButtonText] = useState('');
  const [revealMessage, setRevealMessage] = useState('');
  const [publicReplyEnabled, setPublicReplyEnabled] = useState(false);
  const [publicReplyMessage, setPublicReplyMessage] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isConnectingIg, setIsConnectingIg] = useState(false);

  // ── Template picker state ────────────────────────────────────────────────
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplateSlug, setSelectedTemplateSlug] = useState<string | null>(null);

  const { media, loading: mediaLoading, error: mediaError, hasLoaded: mediaHasLoaded, loadMedia } = useMediaPicker();

  // Load media when target switches to specific_posts
  useEffect(() => {
    if (targetType === 'specific_posts' && media.length === 0 && !mediaLoading && !mediaHasLoaded) {
      loadMedia();
    }
  }, [targetType, media.length, mediaLoading, mediaHasLoaded, loadMedia]);

  // Derive opening DM mode from button text presence
  useEffect(() => {
    setOpeningDmMode(buttonText.trim() ? 'button' : 'direct');
  }, [buttonText]);

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
      setKeywordInput('');
      setDmMessage('');
      setButtonText('');
      setRevealMessage('');
      return;
    }
    const tmpl = templates.find((t) => t.slug === slug);
    if (!tmpl) return;
    setName(tmpl.title);
    setKeywords(tmpl.keywords.map((k) => k.toLowerCase()));
    setKeywordInput(tmpl.keywords.map((k) => k.toLowerCase()).join(', '));
    setDmMessage(tmpl.dm_message);
  }, [templates]);

  const syncKeywordsFromInput = useCallback((text: string) => {
    const parsed = text
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    setKeywords([...new Set(parsed)]);
  }, []);

  const handleKeywordInputChange = useCallback((text: string) => {
    setKeywordInput(text);
    syncKeywordsFromInput(text);
  }, [syncKeywordsFromInput]);

  const addExampleKeyword = useCallback((kw: string) => {
    const current = keywordInput
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (current.includes(kw.toLowerCase())) return;
    const next = [...current, kw].join(', ');
    setKeywordInput(next);
    syncKeywordsFromInput(next);
  }, [keywordInput, syncKeywordsFromInput]);

  const handleRemoveKeyword = useCallback((kw: string) => {
    const next = keywords.filter((k) => k !== kw).join(', ');
    setKeywordInput(next);
    syncKeywordsFromInput(next);
  }, [keywords, syncKeywordsFromInput]);

  const toggleMedia = useCallback((id: string) => {
    setSelectedMediaIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  }, []);

  const draft: AutomationDraft = useMemo(
    () => ({
      name,
      targetType,
      selectedMediaIds,
      keywords,
      matchMode,
      dmMessage,
      openingDmMode,
      buttonText,
      revealMessage,
      publicReplyEnabled,
      publicReplyMessage,
    }),
    [name, targetType, selectedMediaIds, keywords, matchMode, dmMessage, openingDmMode, buttonText, revealMessage, publicReplyEnabled, publicReplyMessage]
  );

  const validationErrors = useMemo(() => validateAutomationDraft(draft), [draft]);
  const isValid = validationErrors.length === 0;

  const handleSubmit = useCallback(async () => {
    if (!isValid || creating) return;
    setSubmitError(null);

    const input: CreateAutomationInput = {
      name: name.trim(),
      target_type: targetType,
      keywords,
      match_mode: matchMode,
      dm_message: dmMessage.trim(),
      opening_dm_mode: openingDmMode,
      ...(openingDmMode === 'button'
        ? { button_text: buttonText.trim(), reveal_message: revealMessage.trim() }
        : { button_text: null, reveal_message: null }),
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
    openingDmMode, buttonText, revealMessage,
    publicReplyEnabled, publicReplyMessage, selectedMediaIds,
    createAutomation, router,
  ]);

  const previewMessage = dmMessage.replace(/{username}/g, '@yourfan');

  return (
    <View className="flex-1 bg-canvas">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + 12,
            paddingHorizontal: 16,
            paddingBottom: 16,
            gap: 28,
          }}
        >
          {/* ── Header ── */}
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => router.back()}
              accessibilityLabel="Back"
              className="items-center justify-center"
              style={{ width: 44, height: 44, marginLeft: -8 }}
            >
              <Ionicons name="chevron-back" size={24} color="#0a0a0a" />
            </Pressable>
            <Pressable disabled>
              <Text className="text-body-md font-semibold text-primary">Preview</Text>
            </Pressable>
          </View>

          {/* ── Templates ── */}
          <View style={{ gap: 10 }}>
            <SectionCaption>Start from a template</SectionCaption>
            {templatesLoading ? (
              <Text className="text-body-sm text-muted">Loading templates…</Text>
            ) : (
              <RNScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
              >
                <Pressable
                  onPress={() => applyTemplate(null)}
                  className={cn(
                    'will-change-variable h-20 w-32 items-center justify-center rounded-xl border-2',
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
                        'will-change-variable h-20 w-40 items-center justify-center rounded-xl border-2 px-3',
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

          {/* ── Campaign name ── */}
          <View style={{ gap: 8 }}>
            <TextInput
              className={cn(clayInput)}
              placeholder="Automation name"
              value={name}
              onChangeText={setName}
              accessibilityLabel="Automation name"
            />
          </View>

          {/* ── Trigger ── */}
          <View style={{ gap: 12 }}>
            <SectionTitle>When someone comments on</SectionTitle>
            <View style={{ gap: 10 }}>
              {TARGET_OPTIONS.map((opt) => (
                <RadioCard
                  key={opt.value}
                  selected={targetType === opt.value}
                  title={opt.label}
                  description={opt.description}
                  onPress={() => {
                    setTargetType(opt.value);
                    if (opt.value !== 'specific_posts') {
                      setSelectedMediaIds([]);
                    }
                  }}
                >
                  {opt.value === 'specific_posts' && targetType === 'specific_posts' && (
                    <View className="mt-3 w-full">
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
                          <Pressable
                            onPress={loadMedia}
                            className="self-start rounded-md bg-surface-soft px-3 py-2"
                          >
                            <Text className="text-body-sm font-semibold text-ink">Retry</Text>
                          </Pressable>
                        </View>
                      )}
                      {!mediaLoading && !mediaError && media.length === 0 && (
                        <Text className="text-body-sm text-muted">No posts found</Text>
                      )}
                      {media.length > 0 && (
                        <MediaGrid
                          media={media}
                          selectedIds={selectedMediaIds}
                          onToggle={toggleMedia}
                        />
                      )}
                    </View>
                  )}
                </RadioCard>
              ))}
            </View>
          </View>

          {/* ── Keywords ── */}
          <View style={{ gap: 12 }}>
            <SectionTitle>And this comment has</SectionTitle>
            <RadioCard
              selected
              title="a specific word or words"
              onPress={() => {}}
            >
              <View className="mt-3 w-full" style={{ gap: 10 }}>
                <TextInput
                  className={cn(clayInput)}
                  placeholder="Enter a word or multiple"
                  value={keywordInput}
                  onChangeText={handleKeywordInputChange}
                  accessibilityLabel="Keywords"
                />
                <Text className="text-body-sm text-muted">
                  Use commas to separate words
                </Text>
                <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
                  <Text className="text-body-sm text-muted">For example:</Text>
                  {EXAMPLE_KEYWORDS.map((kw) => (
                    <Pressable
                      key={kw}
                      onPress={() => addExampleKeyword(kw)}
                      className="rounded-pill border border-hairline bg-surface-soft px-3 py-1"
                    >
                      <Text className="text-body-sm text-ink">{kw}</Text>
                    </Pressable>
                  ))}
                </View>
                {keywords.length > 0 && (
                  <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                    {keywords.map((kw) => (
                      <KeywordChip key={kw} keyword={kw} onRemove={() => handleRemoveKeyword(kw)} />
                    ))}
                  </View>
                )}
              </View>
            </RadioCard>

            <View style={{ gap: 6 }}>
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

          {/* ── Opening DM ── */}
          <View style={{ gap: 12 }}>
            <SectionTitle>They will get</SectionTitle>
            <View className={cn(clayCard, 'bg-surface-soft/50')} style={{ gap: 12 }}>
              <View className="flex-row items-center justify-between">
                <Text className="text-body-md font-medium text-ink">an opening DM</Text>
                <Switch value disabled />
              </View>
              <Text className="text-caption text-muted-soft">
                We'll replace {'{username}'} with the commenter's name
              </Text>
              <TextInput
                className={cn(clayInput, 'h-auto py-3')}
                style={{ minHeight: 110, textAlignVertical: 'top' }}
                placeholder="Hey there! I'm so happy you're here..."
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

              <TextInput
                className={cn(clayInput)}
                placeholder="Button text (e.g. Send me the link)"
                value={buttonText}
                onChangeText={setButtonText}
                maxLength={BUTTON_TEXT_MAX_LENGTH}
                accessibilityLabel="Button text"
              />
              {buttonText.trim().length > 0 && (
                <>
                  <Text className="text-caption text-muted-soft">
                    Message revealed after the button is tapped
                  </Text>
                  <TextInput
                    className={cn(clayInput, 'h-auto py-3')}
                    style={{ minHeight: 90, textAlignVertical: 'top' }}
                    placeholder="Write the message with the link..."
                    value={revealMessage}
                    onChangeText={setRevealMessage}
                    multiline
                    maxLength={REVEAL_MAX_LENGTH}
                    accessibilityLabel="Reveal message"
                  />
                </>
              )}
              <Pressable disabled>
                <Text className="text-body-sm text-primary">
                  Why does an Opening DM matter?
                </Text>
              </Pressable>
            </View>

            <ToggleCard
              title="a DM asking to follow you before they get the link"
              description="This is a Pro feature. Upgrade now or continue without it."
              value={false}
              disabled
            />
            <ToggleCard
              title="a DM asking for their email"
              description="This is a Pro feature. Upgrade now or Go live without collecting emails."
              value={false}
              disabled
            />
          </View>

          {/* ── Then they will get ── */}
          {buttonText.trim().length > 0 && (
            <View style={{ gap: 12 }}>
              <SectionTitle>And then, they will get</SectionTitle>
              <View className={cn(clayCard, 'bg-surface-soft/50')} style={{ gap: 12 }}>
                <Text className="text-body-md font-medium text-ink">a DM with a link</Text>
                <TextInput
                  className={cn(clayInput, 'h-auto py-3')}
                  style={{ minHeight: 90, textAlignVertical: 'top' }}
                  placeholder="Write a message"
                  value={revealMessage}
                  onChangeText={setRevealMessage}
                  multiline
                  maxLength={REVEAL_MAX_LENGTH}
                  accessibilityLabel="Link DM message"
                />
                <Pressable
                  disabled
                  className="flex-row items-center justify-center gap-2 rounded-md border border-hairline bg-canvas py-3"
                >
                  <Ionicons name="add" size={18} color="#0a0a0a" />
                  <Text className="text-body-md font-medium text-ink">Add A Link</Text>
                </Pressable>
              </View>
              <ToggleCard
                title="a follow up DM if they don't click the link"
                description="This is a Pro feature. Upgrade now or Go live without a follow-up."
                value={false}
                disabled
              />
            </View>
          )}

          {/* ── Public reply ── */}
          <View style={{ gap: 12 }}>
            <ToggleCard
              title="reply to their comments under the post"
              value={publicReplyEnabled}
              onValueChange={setPublicReplyEnabled}
              switchAccessibilityLabel="Enable public reply"
            />
            {publicReplyEnabled && (
              <>
                <Text className="text-caption text-muted-soft">
                  We'll replace {'{username}'} with the commenter's name
                </Text>
                <TextInput
                  className={cn(clayInput, 'h-auto py-3')}
                  style={{ minHeight: 90, textAlignVertical: 'top' }}
                  placeholder="Write your public reply…"
                  value={publicReplyMessage}
                  onChangeText={setPublicReplyMessage}
                  multiline
                  accessibilityLabel="Public reply message"
                />
              </>
            )}
          </View>

          {/* ── Preview ── */}
          <View style={{ gap: 8 }}>
            <SectionTitle>Preview</SectionTitle>
            <View className={cn(clayCard, 'bg-surface-soft/50')}>
              <Text className="text-body-sm text-muted" selectable>
                {previewMessage || 'Your message will appear here'}
              </Text>
              {buttonText.trim() && (
                <View className="mt-3 self-start rounded-lg bg-primary px-4 py-2">
                  <Text className="text-button font-semibold text-on-primary">{buttonText}</Text>
                </View>
              )}
              {keywords.length > 0 && (
                <View className="mt-3 flex-row flex-wrap" style={{ gap: 6 }}>
                  {keywords.map((kw) => (
                    <View key={kw} className="rounded-pill bg-brand-pink/15 px-2 py-0.5">
                      <Text className="text-caption font-medium text-brand-pink">{kw}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>

          {/* Spacer to push CTA area above sibling CTA if content is short */}
          <View className="flex-1" />
        </ScrollView>

        {/* ── Bottom CTA ── */}
        <View
          className="border-t border-hairline bg-canvas"
          style={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: insets.bottom + 12,
            gap: 12,
          }}
        >
          {submitError === 'instagram_not_connected' && (
            <>
              <View className={cn(clayCard, 'bg-brand-coral/10 border-brand-coral/30 py-4')}>
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
            </>
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
            Preview And Go Live
          </ClayAnimatedButton>
        </View>
      </View>
  );
}
