/**
 * Campaign builder screen — sectioned comment-automation flow.
 *
 * Modeled on the ManyChat-style mobile builder:
 * trigger → post picker → keyword filter → DM/reply actions → activate.
 * Uses the existing backend contract (CreateAutomationInput) unchanged.
 *
 * NOTE: This screen intentionally uses raw React Native components +
 * StyleSheet instead of `@/tw` className primitives. The useCssElement
 * bridge drops layout classes (padding, alignment, fixed sizes) on
 * Android, which made cards and chips balloon to fill the screen.
 * Raw RN is the documented escape hatch for that layout bug
 * (see src/tw/AGENTS.md; precedent: AuthScreen, ClayAnimatedButton).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { listCampaignTemplates, updateAutomation } from '@/lib/automations';
import { addLog } from '@/lib/logger';

/* ── Design tokens (mirrors src/global.css @theme — raw-RN screens can't
   consume Tailwind classes, so the Clay hex values are referenced directly) */
const COLORS = {
  canvas: '#fffaf0',
  ink: '#0a0a0a',
  body: '#3a3a3a',
  muted: '#6a6a6a',
  mutedSoft: '#9a9a9a',
  hairline: '#e5e5e5',
  surfaceSoft: '#faf5e8',
  surfaceStrong: '#ebe6d6',
  lavender: '#b8a4ed',
  lavenderTint: 'rgba(184, 164, 237, 0.10)',
  pink: '#ff4d8b',
  pinkTint: 'rgba(255, 77, 139, 0.12)',
  coral: '#ff6b5a',
  coralTint: 'rgba(255, 107, 90, 0.10)',
  coralBorder: 'rgba(255, 107, 90, 0.30)',
  error: '#ef4444',
  white: '#ffffff',
  inkOverlay: 'rgba(10, 10, 10, 0.7)',
};

const FONT = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
};

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

type Measurable = {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};

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
      style={[styles.radioCard, selected && styles.radioCardSelected]}
    >
      <View style={styles.radioRow}>
        <View style={[styles.radioDot, selected && styles.radioDotSelected]}>
          {selected && <View style={styles.radioDotInner} />}
        </View>
        <View style={styles.radioBody}>
          <Text style={styles.cardTitle}>{title}</Text>
          {description ? <Text style={styles.cardDesc}>{description}</Text> : null}
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
  switchAccessibilityLabel,
}: {
  title: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  switchAccessibilityLabel?: string;
}) {
  return (
    <View style={styles.toggleCard}>
      <View style={styles.toggleTextWrap}>
        <Text style={styles.cardTitle}>{title}</Text>
        {description ? <Text style={styles.cardDesc}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
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
    <View style={styles.segmented}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
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
    <View style={styles.keywordChip}>
      <Text style={styles.keywordChipText}>{keyword}</Text>
      <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={`Remove ${keyword}`}>
        <Text style={styles.keywordChipRemove}>×</Text>
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
    <View style={styles.mediaGridWrap}>
      <View style={styles.mediaGrid}>
        {displayMedia.map((item) => {
          const selected = selectedIds.includes(item.id);
          const uri = item.thumbnail_url ?? item.media_url ?? undefined;
          const isReel = item.media_product_type === 'REELS' || item.media_type === 'VIDEO';
          return (
            <Pressable
              key={item.id}
              onPress={() => onToggle(item.id)}
              accessibilityLabel={item.caption ?? 'Media thumbnail'}
              style={[styles.mediaThumb, selected && styles.mediaThumbSelected]}
            >
              {uri ? (
                <Image
                  source={{ uri }}
                  style={styles.mediaImage}
                  resizeMode="cover"
                  accessibilityLabel=""
                />
              ) : (
                <View style={styles.mediaFallback}>
                  <Text style={styles.mediaFallbackText}>No img</Text>
                </View>
              )}
              {isReel && (
                <View style={styles.reelsBadge}>
                  <Text style={styles.reelsBadgeText}>REELS</Text>
                </View>
              )}
              {selected && (
                <View style={styles.mediaSelectedOverlay}>
                  <View style={styles.mediaSelectedCheck}>
                    <Ionicons name="checkmark" size={14} color={COLORS.white} />
                  </View>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      {media.length > 4 && (
        <Pressable onPress={() => setShowAll((s) => !s)} style={styles.showAllBtn}>
          <Text style={styles.showAllText}>{showAll ? 'Show less' : 'Show All'}</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function NewAutomationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { createAutomation, creating, refresh: refreshAutomations } = useAutomations();
  const { getToken } = useAuth();
  const { connect: connectInstagram } = useAutomationGate();

  // ── Form state ───────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [targetType, setTargetType] = useState<TargetType>('specific_posts');
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [matchMode, setMatchMode] = useState<MatchMode>('whole_word');
  const [matchAnyWord, setMatchAnyWord] = useState(false);
  const [dmMessage, setDmMessage] = useState('');
  const [openingDmMode, setOpeningDmMode] = useState<'direct' | 'button'>('direct');
  const [buttonText, setButtonText] = useState('');
  const [revealMessage, setRevealMessage] = useState('');
  const [publicReplyEnabled, setPublicReplyEnabled] = useState(false);
  const [publicReplyMessage, setPublicReplyMessage] = useState('');
  const [publicReplyMessages, setPublicReplyMessages] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isConnectingIg, setIsConnectingIg] = useState(false);
  const [savingPaused, setSavingPaused] = useState(false);

  // ── Template picker state ────────────────────────────────────────────────
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplateSlug, setSelectedTemplateSlug] = useState<string | null>(null);

  const { media, loading: mediaLoading, error: mediaError, hasLoaded: mediaHasLoaded, loadMedia } = useMediaPicker();

  // ── Scroll-focused-input-into-view ──────────────────────────────────────
  // On Android 15 edge-to-edge is enforced, so adjustResize is ignored and
  // the window never shrinks; RN's ScrollView has no auto-scroll-to-focus.
  // We track the keyboard height in JS (the channel that works on every
  // platform here) and scroll the focused input above the keyboard.
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const keyboardHeightRef = useRef(0);
  const focusedInputRef = useRef<Measurable | null>(null);
  const focusScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollFocusedInputIntoView = useCallback(() => {
    if (focusScrollTimerRef.current) clearTimeout(focusScrollTimerRef.current);
    focusScrollTimerRef.current = setTimeout(() => {
      const input = focusedInputRef.current;
      if (!input) return;
      input.measureInWindow((_x, y, _w, h) => {
        const visibleBottom =
          Dimensions.get('window').height - keyboardHeightRef.current - 24;
        const overflow = (y + h) - visibleBottom;
        if (overflow > 0) {
          scrollRef.current?.scrollTo({ y: scrollYRef.current + overflow, animated: true });
        }
      });
    }, 250);
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardHeightRef.current = e.endCoordinates.height;
      scrollFocusedInputIntoView();
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      keyboardHeightRef.current = 0;
    });
    return () => {
      showSub.remove();
      hideSub.remove();
      if (focusScrollTimerRef.current) clearTimeout(focusScrollTimerRef.current);
    };
  }, [scrollFocusedInputIntoView]);

  const handleInputFocus = useCallback((input: Measurable | null) => {
    focusedInputRef.current = input;
    // Covers moving between inputs while the keyboard is already open.
    scrollFocusedInputIntoView();
  }, [scrollFocusedInputIntoView]);

  const handleInputBlur = useCallback(() => {
    focusedInputRef.current = null;
  }, []);

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
    setMatchAnyWord(false);
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
      matchAnyWord,
      dmMessage,
      openingDmMode,
      buttonText,
      revealMessage,
      publicReplyEnabled,
      publicReplyMessage,
      publicReplyMessages,
    }),
    [name, targetType, selectedMediaIds, keywords, matchMode, matchAnyWord, dmMessage, openingDmMode, buttonText, revealMessage, publicReplyEnabled, publicReplyMessage, publicReplyMessages]
  );

  const validationErrors = useMemo(() => validateAutomationDraft(draft), [draft]);
  const isValid = validationErrors.length === 0;

  const handleSubmit = useCallback(async (goLive: boolean) => {
    if (!isValid || creating || savingPaused) return;
    setSubmitError(null);

    const input: CreateAutomationInput = {
      name: name.trim(),
      target_type: targetType,
      keywords: matchAnyWord ? [] : keywords,
      match_mode: matchMode,
      match_any_word: matchAnyWord,
      dm_message: dmMessage.trim(),
      opening_dm_mode: openingDmMode,
      ...(openingDmMode === 'button'
        ? { button_text: buttonText.trim(), reveal_message: revealMessage.trim() }
        : { button_text: null, reveal_message: null }),
      public_reply_enabled: publicReplyEnabled,
      ...(targetType === 'specific_posts' ? { media_ids: selectedMediaIds } : {}),
      ...(publicReplyEnabled
        ? {
            public_reply_message: publicReplyMessage.trim() || null,
            public_reply_messages: publicReplyMessages.filter((m) => m.trim()),
          }
        : { public_reply_message: null, public_reply_messages: [] }),
    };

    if (!goLive) setSavingPaused(true);
    try {
      const created = await createAutomation(input);
      if (!created?.$id) {
        setSubmitError('Automation created, but the server returned no id — open it from the list.');
        return;
      }
      if (!goLive) {
        // The engine creates every automation live, so a draft needs a
        // follow-up patch before it starts matching comments.
        await updateAutomation(getToken, created.$id, { status: 'paused' });
        refreshAutomations();
      }
      router.dismissTo(
        `/(tabs)/(automate)/${created.$id}?created=${goLive ? 'live' : 'paused'}` as never,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create automation';
      addLog(`Create automation error: ${message}`);
      if (message.includes('409') || message.includes('instagram_not_connected')) {
        setSubmitError('instagram_not_connected');
      } else {
        setSubmitError(message);
      }
    } finally {
      setSavingPaused(false);
    }
  }, [
    isValid, creating, savingPaused, name, targetType, keywords, matchAnyWord, matchMode, dmMessage,
    openingDmMode, buttonText, revealMessage,
    publicReplyEnabled, publicReplyMessage, publicReplyMessages, selectedMediaIds,
    createAutomation, refreshAutomations, getToken, router,
  ]);

  const previewMessage = dmMessage.replace(/{username}/g, '@yourfan');

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior="padding"
    >
      {/* ── Fixed header (outside ScrollView — content never slides under
             the transparent status bar) ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Back"
          style={styles.headerBtn}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>New Automation</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          scrollYRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        {/* ── Templates ── */}
        <View style={styles.section}>
          <Text style={styles.caption}>Start from a template</Text>
          {templatesLoading ? (
            <Text style={styles.mutedText}>Loading templates…</Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.templateScroll}
            >
              <Pressable
                onPress={() => applyTemplate(null)}
                style={[
                  styles.templateChip,
                  selectedTemplateSlug === null && styles.templateChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.templateChipText,
                    selectedTemplateSlug === null && styles.templateChipTextActive,
                  ]}
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
                    style={[styles.templateChip, active && styles.templateChipActive]}
                  >
                    <Text
                      style={[styles.templateChipText, active && styles.templateChipTextActive]}
                      numberOfLines={2}
                    >
                      {tmpl.title}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* ── Campaign name ── */}
        <View style={styles.section}>
          <TextInput
            style={styles.input}
            placeholder="Automation name"
            placeholderTextColor={COLORS.mutedSoft}
            value={name}
            onChangeText={setName}
            onFocus={(e) => handleInputFocus(e.currentTarget)}
            onBlur={handleInputBlur}
            accessibilityLabel="Automation name"
          />
        </View>

        {/* ── Trigger ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>When someone comments on</Text>
          <View style={styles.cardStack}>
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
                  <View style={styles.mediaPickerWrap}>
                    {mediaLoading && (
                      <Text style={styles.mutedText}>Loading posts…</Text>
                    )}
                    {mediaError && (
                      <View style={styles.mediaErrorWrap}>
                        <Text style={styles.errorText}>
                          {mediaError === 'session_expired'
                            ? 'Session expired. Please reconnect Instagram.'
                            : mediaError}
                        </Text>
                        <Pressable onPress={loadMedia} style={styles.retryBtn}>
                          <Text style={styles.retryBtnText}>Retry</Text>
                        </Pressable>
                      </View>
                    )}
                    {!mediaLoading && !mediaError && media.length === 0 && (
                      <Text style={styles.mutedText}>No posts found</Text>
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
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>And this comment has</Text>
          <View style={styles.cardStack}>
            <RadioCard
              selected={!matchAnyWord}
              title="a specific word or words"
              onPress={() => setMatchAnyWord(false)}
            >
              {!matchAnyWord && (
                <View style={styles.keywordInner}>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter a word or multiple"
                    placeholderTextColor={COLORS.mutedSoft}
                    value={keywordInput}
                    onChangeText={handleKeywordInputChange}
                    onFocus={(e) => handleInputFocus(e.currentTarget)}
                    onBlur={handleInputBlur}
                    accessibilityLabel="Keywords"
                  />
                  <Text style={styles.mutedText}>Use commas to separate words</Text>
                  <View style={styles.exampleRow}>
                    <Text style={styles.mutedText}>For example:</Text>
                    {EXAMPLE_KEYWORDS.map((kw) => (
                      <Pressable
                        key={kw}
                        onPress={() => addExampleKeyword(kw)}
                        style={styles.exampleChip}
                      >
                        <Text style={styles.exampleChipText}>{kw}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {keywords.length > 0 && (
                    <View style={styles.keywordChipsRow}>
                      {keywords.map((kw) => (
                        <KeywordChip key={kw} keyword={kw} onRemove={() => handleRemoveKeyword(kw)} />
                      ))}
                    </View>
                  )}
                </View>
              )}
            </RadioCard>
            <RadioCard
              selected={matchAnyWord}
              title="any word"
              description="Every comment gets the DM — no keyword filter. Use with care."
              onPress={() => setMatchAnyWord(true)}
            />
          </View>

          {!matchAnyWord && (
            <View style={styles.matchWrap}>
              <SegmentedControl
                options={MATCH_OPTIONS}
                value={matchMode}
                onChange={setMatchMode}
              />
              {matchMode === 'whole_word' && (
                <Text style={styles.caption}>"link" won't match "linking"</Text>
              )}
            </View>
          )}
        </View>

        {/* ── Opening DM ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>They will get</Text>
          <View style={styles.dmCard}>
            <Text style={styles.cardTitle}>an opening DM</Text>
            <Text style={styles.caption}>
              We'll replace {'{username}'} with the commenter's name
            </Text>
            <TextInput
              style={styles.inputMultiline}
              placeholder="Hey there! I'm so happy you're here..."
              placeholderTextColor={COLORS.mutedSoft}
              value={dmMessage}
              onChangeText={setDmMessage}
              onFocus={(e) => handleInputFocus(e.currentTarget)}
              onBlur={handleInputBlur}
              multiline
              maxLength={DM_MAX_LENGTH}
              accessibilityLabel="DM message"
            />
            <Text
              style={[
                styles.charCounter,
                dmMessage.length >= DM_MAX_LENGTH && styles.charCounterError,
              ]}
            >
              {dmMessage.length}/{DM_MAX_LENGTH}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Button text (e.g. Send me the link)"
              placeholderTextColor={COLORS.mutedSoft}
              value={buttonText}
              onChangeText={setButtonText}
              onFocus={(e) => handleInputFocus(e.currentTarget)}
              onBlur={handleInputBlur}
              maxLength={BUTTON_TEXT_MAX_LENGTH}
              accessibilityLabel="Button text"
            />
          </View>

          {/* Pro features — no plan exists yet, so present them as one
              compact "coming soon" card instead of dead disabled toggles */}
          <View style={styles.proCard}>
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
            <Text style={styles.proText}>
              Follow-to-unlock, email capture, and follow-up DMs — coming soon
            </Text>
          </View>
        </View>

        {/* ── Then they will get (button-tap reveal DM) ── */}
        {buttonText.trim().length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>And then, they will get</Text>
            <View style={styles.dmCard}>
              <Text style={styles.cardTitle}>a DM with a link</Text>
              <Text style={styles.caption}>
                Message revealed after the button is tapped
              </Text>
              <TextInput
                style={styles.inputMultiline}
                placeholder="Write the message with the link..."
                placeholderTextColor={COLORS.mutedSoft}
                value={revealMessage}
                onChangeText={setRevealMessage}
                onFocus={(e) => handleInputFocus(e.currentTarget)}
                onBlur={handleInputBlur}
                multiline
                maxLength={REVEAL_MAX_LENGTH}
                accessibilityLabel="Link DM message"
              />
            </View>
          </View>
        )}

        {/* ── Public reply ── */}
        <View style={styles.section}>
          <ToggleCard
            title="reply to their comments under the post"
            value={publicReplyEnabled}
            onValueChange={setPublicReplyEnabled}
            switchAccessibilityLabel="Enable public reply"
          />
          {publicReplyEnabled && (
            <>
              <Text style={styles.caption}>
                We'll replace {'{username}'} with the commenter's name
              </Text>
              <TextInput
                style={styles.inputMultiline}
                placeholder="Write your public reply…"
                placeholderTextColor={COLORS.mutedSoft}
                value={publicReplyMessage}
                onChangeText={setPublicReplyMessage}
                onFocus={(e) => handleInputFocus(e.currentTarget)}
                onBlur={handleInputBlur}
                multiline
                accessibilityLabel="Public reply message"
              />
              <Text style={styles.caption}>
                Add more replies (one per line) — one will be randomly selected each time
              </Text>
              <TextInput
                style={styles.inputMultiline}
                placeholder="Thanks for commenting!&#10;Glad you liked it!&#10;Appreciate the support!"
                placeholderTextColor={COLORS.mutedSoft}
                value={publicReplyMessages.join('\n')}
                onChangeText={(text) => setPublicReplyMessages(text.split('\n'))}
                onFocus={(e) => handleInputFocus(e.currentTarget)}
                onBlur={handleInputBlur}
                multiline
                accessibilityLabel="Additional public reply messages"
              />
              {publicReplyMessages.filter((m) => m.trim()).length > 0 && (
                <Text style={styles.poolCount}>
                  Pool: {publicReplyMessages.filter((m) => m.trim()).length + (publicReplyMessage.trim() ? 1 : 0)} messages
                </Text>
              )}
            </>
          )}
        </View>

        {/* ── Preview (Instagram-DM-style bubble) ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preview</Text>
          <View style={styles.previewCard}>
            <View style={styles.previewRow}>
              <View style={styles.previewAvatar}>
                <Ionicons name="person" size={14} color={COLORS.white} />
              </View>
              <View style={styles.previewBubble}>
                <Text
                  style={[
                    styles.previewBubbleText,
                    !previewMessage && styles.previewBubblePlaceholder,
                  ]}
                  selectable
                >
                  {previewMessage || 'Your message will appear here'}
                </Text>
              </View>
            </View>
            {buttonText.trim().length > 0 && (
              <View style={styles.previewButtonWrap}>
                <View style={styles.previewButton}>
                  <Text style={styles.previewButtonText}>{buttonText}</Text>
                </View>
              </View>
            )}
            {matchAnyWord && (
              <View style={styles.previewKeywords}>
                <View style={styles.previewAnyChip}>
                  <Text style={styles.previewAnyChipText}>any comment</Text>
                </View>
              </View>
            )}
            {!matchAnyWord && keywords.length > 0 && (
              <View style={styles.previewKeywords}>
                {keywords.map((kw) => (
                  <View key={kw} style={styles.previewKeywordChip}>
                    <Text style={styles.previewKeywordText}>{kw}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* ── Pinned bottom CTA ── */}
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: insets.bottom + 12 },
        ]}
      >
        {submitError === 'instagram_not_connected' && (
          <>
            <View style={styles.igErrorCard}>
              <Text style={styles.igErrorText}>
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
          <Text style={styles.submitErrorText}>{submitError}</Text>
        )}
        {!isValid && !submitError && validationErrors.length > 0 && (
          <Text style={styles.validationCaption}>{validationErrors[0]}</Text>
        )}
        <ClayAnimatedButton
          onPress={() => handleSubmit(true)}
          disabled={!isValid || savingPaused}
          loading={creating}
          fullWidth
        >
          Go Live
        </ClayAnimatedButton>
        <Pressable
          onPress={() => handleSubmit(false)}
          disabled={!isValid || creating || savingPaused}
          accessibilityLabel="Save as paused"
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.draftBtn,
            (!isValid || creating) && styles.draftBtnDisabled,
            pressed && styles.draftBtnPressed,
          ]}
        >
          <Text style={styles.draftBtnText}>
            {savingPaused ? 'Saving…' : 'Save as paused'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.canvas,
  },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 10,
    backgroundColor: COLORS.canvas,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.hairline,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONT.semibold,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.2,
    color: COLORS.ink,
    includeFontPadding: false,
  },

  /* ── Scroll layout ── */
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 24,
  },
  section: {
    gap: 10,
  },
  cardStack: {
    gap: 10,
  },
  sectionTitle: {
    fontFamily: FONT.semibold,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.2,
    color: COLORS.ink,
    includeFontPadding: false,
  },
  caption: {
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.mutedSoft,
    includeFontPadding: false,
  },
  mutedText: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.muted,
    includeFontPadding: false,
  },
  errorText: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.error,
    includeFontPadding: false,
  },

  /* ── Inputs ── */
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: COLORS.hairline,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: COLORS.canvas,
    fontFamily: FONT.regular,
    fontSize: 16,
    color: COLORS.ink,
  },
  inputMultiline: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: COLORS.hairline,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.canvas,
    fontFamily: FONT.regular,
    fontSize: 16,
    lineHeight: 22,
    color: COLORS.ink,
    textAlignVertical: 'top',
  },
  charCounter: {
    alignSelf: 'flex-end',
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.mutedSoft,
    includeFontPadding: false,
  },
  charCounterError: {
    color: COLORS.error,
  },
  poolCount: {
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.lavender,
    includeFontPadding: false,
  },

  /* ── Template chips ── */
  templateScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  templateChip: {
    minHeight: 40,
    maxWidth: 170,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.hairline,
    backgroundColor: COLORS.surfaceSoft,
  },
  templateChipActive: {
    borderColor: COLORS.ink,
    backgroundColor: COLORS.surfaceStrong,
  },
  templateChipText: {
    fontFamily: FONT.semibold,
    fontSize: 13,
    lineHeight: 17,
    color: COLORS.ink,
    textAlign: 'center',
    includeFontPadding: false,
  },
  templateChipTextActive: {
    color: COLORS.ink,
  },

  /* ── Radio / toggle cards ── */
  radioCard: {
    borderWidth: 1.5,
    borderColor: COLORS.hairline,
    borderRadius: 14,
    backgroundColor: COLORS.canvas,
    padding: 14,
  },
  radioCardSelected: {
    borderColor: COLORS.lavender,
    backgroundColor: COLORS.lavenderTint,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  radioDot: {
    width: 20,
    height: 20,
    marginTop: 1,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDotSelected: {
    borderColor: COLORS.lavender,
  },
  radioDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.lavender,
  },
  radioBody: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontFamily: FONT.medium,
    fontSize: 15,
    lineHeight: 21,
    color: COLORS.ink,
    includeFontPadding: false,
  },
  cardDesc: {
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.muted,
    includeFontPadding: false,
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.hairline,
    borderRadius: 14,
    backgroundColor: COLORS.canvas,
    padding: 14,
  },
  toggleTextWrap: {
    flex: 1,
    gap: 4,
  },

  /* ── Media picker ── */
  mediaPickerWrap: {
    marginTop: 10,
    gap: 8,
  },
  mediaErrorWrap: {
    gap: 8,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: COLORS.surfaceSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  retryBtnText: {
    fontFamily: FONT.semibold,
    fontSize: 13,
    color: COLORS.ink,
    includeFontPadding: false,
  },
  mediaGridWrap: {
    gap: 10,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mediaThumb: {
    position: 'relative',
    width: '23%',
    aspectRatio: 1,
    overflow: 'hidden',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.hairline,
  },
  mediaThumbSelected: {
    borderColor: COLORS.lavender,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  mediaFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceSoft,
  },
  mediaFallbackText: {
    fontFamily: FONT.regular,
    fontSize: 12,
    color: COLORS.muted,
  },
  reelsBadge: {
    position: 'absolute',
    left: 4,
    top: 4,
    borderRadius: 4,
    backgroundColor: COLORS.inkOverlay,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  reelsBadgeText: {
    fontFamily: FONT.semibold,
    fontSize: 10,
    color: COLORS.white,
    includeFontPadding: false,
  },
  mediaSelectedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(184, 164, 237, 0.25)',
  },
  mediaSelectedCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.lavender,
  },
  showAllBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  showAllText: {
    fontFamily: FONT.semibold,
    fontSize: 14,
    color: COLORS.ink,
    includeFontPadding: false,
  },

  /* ── Keywords ── */
  keywordInner: {
    marginTop: 10,
    gap: 10,
  },
  exampleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  exampleChip: {
    height: 30,
    justifyContent: 'center',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.hairline,
    backgroundColor: COLORS.surfaceSoft,
    paddingHorizontal: 12,
  },
  exampleChipText: {
    fontFamily: FONT.regular,
    fontSize: 13,
    color: COLORS.ink,
    includeFontPadding: false,
  },
  keywordChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  keywordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.lavender,
    paddingHorizontal: 12,
  },
  keywordChipText: {
    fontFamily: FONT.medium,
    fontSize: 13,
    color: COLORS.white,
    includeFontPadding: false,
  },
  keywordChipRemove: {
    fontFamily: FONT.semibold,
    fontSize: 15,
    lineHeight: 18,
    color: COLORS.white,
    includeFontPadding: false,
  },
  matchWrap: {
    gap: 6,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: 10,
    backgroundColor: COLORS.surfaceSoft,
    padding: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 8,
  },
  segmentActive: {
    backgroundColor: COLORS.canvas,
    elevation: 1,
  },
  segmentText: {
    fontFamily: FONT.medium,
    fontSize: 13,
    color: COLORS.muted,
    includeFontPadding: false,
  },
  segmentTextActive: {
    color: COLORS.ink,
  },

  /* ── DM card ── */
  dmCard: {
    borderWidth: 1,
    borderColor: COLORS.hairline,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceSoft,
    padding: 14,
    gap: 10,
  },

  /* ── Pro coming-soon card ── */
  proCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.hairline,
    borderRadius: 14,
    backgroundColor: COLORS.canvas,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  proBadge: {
    borderRadius: 6,
    backgroundColor: COLORS.ink,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  proBadgeText: {
    fontFamily: FONT.semibold,
    fontSize: 11,
    letterSpacing: 1,
    color: COLORS.white,
    includeFontPadding: false,
  },
  proText: {
    flex: 1,
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.muted,
    includeFontPadding: false,
  },

  /* ── Preview ── */
  previewCard: {
    borderWidth: 1,
    borderColor: COLORS.hairline,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceSoft,
    padding: 14,
    gap: 10,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  previewAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.lavender,
  },
  previewBubble: {
    maxWidth: '80%',
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    backgroundColor: COLORS.surfaceStrong,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  previewBubbleText: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.ink,
  },
  previewBubblePlaceholder: {
    color: COLORS.mutedSoft,
  },
  previewButtonWrap: {
    flexDirection: 'row',
    paddingLeft: 36,
  },
  previewButton: {
    borderRadius: 16,
    backgroundColor: COLORS.ink,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  previewButtonText: {
    fontFamily: FONT.semibold,
    fontSize: 13,
    color: COLORS.white,
    includeFontPadding: false,
  },
  previewKeywords: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingLeft: 36,
  },
  previewKeywordChip: {
    borderRadius: 12,
    backgroundColor: COLORS.pinkTint,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  previewKeywordText: {
    fontFamily: FONT.medium,
    fontSize: 12,
    color: COLORS.pink,
    includeFontPadding: false,
  },

  /* ── Bottom bar ── */
  bottomBar: {
    borderTopWidth: 1,
    borderTopColor: COLORS.hairline,
    backgroundColor: COLORS.canvas,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  igErrorCard: {
    borderWidth: 1,
    borderColor: COLORS.coralBorder,
    borderRadius: 12,
    backgroundColor: COLORS.coralTint,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  igErrorText: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.coral,
  },
  submitErrorText: {
    textAlign: 'center',
    fontFamily: FONT.regular,
    fontSize: 14,
    color: COLORS.error,
  },
  validationCaption: {
    textAlign: 'center',
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.mutedSoft,
    includeFontPadding: false,
  },
  draftBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: 8,
  },
  draftBtnDisabled: {
    opacity: 0.4,
  },
  draftBtnPressed: {
    opacity: 0.6,
  },
  draftBtnText: {
    fontFamily: FONT.semibold,
    fontSize: 14,
    color: COLORS.muted,
    includeFontPadding: false,
  },
  previewAnyChip: {
    borderRadius: 12,
    backgroundColor: COLORS.lavenderTint,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  previewAnyChipText: {
    fontFamily: FONT.medium,
    fontSize: 12,
    color: COLORS.ink,
    includeFontPadding: false,
  },
});
