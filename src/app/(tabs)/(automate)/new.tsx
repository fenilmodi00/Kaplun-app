/**
 * Campaign builder screen — sectioned comment-automation flow.
 *
 * Styled with NativeWind v5 className via `@/tw` primitives +
 * `src/components/ui/*` gluestack-shaped component library +
 * `@expo/ui` native controls.
 *
 * NOTE: verify layout on Android before editing — this screen previously
 * suffered from a `useCssElement` layout bug (ballooned cards, floating text).
 * Raw KeyboardAvoidingView is the documented escape hatch.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  UIManager,
  View as RNView,
  ScrollView as RNScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type LayoutChangeEvent,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function animateFormLayout() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SegmentedControl } from '@expo/ui/community/segmented-control';
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
import { View, Text, Pressable, ScrollView } from '@/tw';
import { Image } from '@/tw/image';
import { cn } from '@/tw/cn';
import { AnimatedView } from '@/tw/animated';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from '@/lib/reanimated-platform';
import { Card } from '@/components/ui/card';
import { Badge, BadgeText } from '@/components/ui/badge';
import { RadioGroup, Radio, RadioIndicator, RadioLabel } from '@/components/ui/radio';
import { Input, InputField, type InputFieldRef } from '@/components/ui/input';
import { Textarea, TextareaInput, type TextareaInputRef } from '@/components/ui/textarea';
import { ToggleCard } from '@/components/ui/toggle-card';
import { Reveal, Pop } from '@/components/ui/reveal';
import { AutomationDmPreview } from '@/components/automation/AutomationDmPreview';

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

const STEPS = [
  { id: 'trigger', label: 'Trigger' },
  { id: 'keywords', label: 'Keywords' },
  { id: 'message', label: 'Message' },
  { id: 'extras', label: 'Extras' },
] as const;

const TEMPLATE_PALETTE = [
  { bg: 'bg-brand-lavender', text: 'text-on-dark', border: 'border-brand-lavender' },
  { bg: 'bg-brand-pink', text: 'text-on-dark', border: 'border-brand-pink' },
  { bg: 'bg-brand-teal', text: 'text-on-dark', border: 'border-brand-teal' },
  { bg: 'bg-brand-peach', text: 'text-on-dark', border: 'border-brand-peach' },
  { bg: 'bg-brand-ochre', text: 'text-ink', border: 'border-brand-ochre' },
  { bg: 'bg-brand-mint', text: 'text-ink', border: 'border-brand-mint' },
];

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

function usePressFeedback(scaleDown = 0.97) {
  const scale = useSharedValue(1);
  const onPressIn = useCallback(() => {
    scale.value = withTiming(scaleDown, { duration: 100 });
  }, [scale, scaleDown]);
  const onPressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
  }, [scale]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: scale.value < 1 ? 0.9 : 1,
  }));
  return { onPressIn, onPressOut, animatedStyle };
}

function PressableScale({
  children,
  onPress,
  disabled,
  style,
  className,
  ...rest
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: React.ComponentProps<typeof AnimatedView>['style'];
  className?: string;
} & Omit<React.ComponentProps<typeof Pressable>, 'onPress' | 'disabled' | 'style' | 'className'>) {
  const { onPressIn, onPressOut, animatedStyle } = usePressFeedback(0.97);
  const handlePressIn = useCallback(() => {
    if (disabled) return;
    onPressIn();
  }, [disabled, onPressIn]);
  const handlePressOut = useCallback(() => {
    if (disabled) return;
    onPressOut();
  }, [disabled, onPressOut]);
  return (
    <AnimatedView style={[animatedStyle, style]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        disabled={disabled}
        className={className}
        {...rest}
      >
        {children}
      </Pressable>
    </AnimatedView>
  );
}

function KeywordChip({ keyword, onRemove }: { keyword: string; onRemove: () => void }) {
  return (
    <Badge action="info" variant="solid" size="sm" className="h-[30px] px-3">
      <BadgeText action="info" variant="solid" className="font-medium text-on-primary">
        {keyword}
      </BadgeText>
      <PressableScale onPress={onRemove} hitSlop={8} accessibilityLabel={`Remove ${keyword}`} style={{ marginLeft: 4 }}>
        <Text className="font-semibold text-on-primary" style={{ fontSize: 15, lineHeight: 18 }}>
          ×
        </Text>
      </PressableScale>
    </Badge>
  );
}

function MediaCarousel({
  media,
  selectedIds,
  onToggle,
}: {
  media: InstagramMediaResponse[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
    >
      {media.map((item) => {
        const selected = selectedIds.includes(item.id);
        const uri = item.thumbnail_url ?? item.media_url ?? undefined;
        const isReel = item.media_product_type === 'REELS' || item.media_type === 'VIDEO';
        return (
          <PressableScale
            key={item.id}
            onPress={() => onToggle(item.id)}
            style={{ width: 108, height: 192 }}
            className={cn(
              'relative overflow-hidden rounded-xl',
              selected ? 'border-2 border-brand-lavender' : 'border-2 border-transparent'
            )}
            accessibilityLabel={item.caption ?? 'Media thumbnail'}
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
                <Text className="text-muted" style={{ fontSize: 12 }}>No img</Text>
              </View>
            )}
            {isReel && (
              <View className="absolute left-2 top-2 rounded bg-ink/70 px-1.5 py-0.5">
                <Text className="font-semibold text-on-primary" style={{ fontSize: 10 }}>REELS</Text>
              </View>
            )}
            {selected && (
              <View className="absolute inset-0 items-center justify-center bg-brand-lavender/40">
                <Pop>
                  <View className="h-7 w-7 items-center justify-center rounded-pill bg-brand-lavender shadow-sm">
                    <Ionicons name="checkmark" size={18} color="#ffffff" />
                  </View>
                </Pop>
              </View>
            )}
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

export default function NewAutomationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
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
  const [matchAnyWord, setMatchAnyWord] = useState(false);
  const [dmMessage, setDmMessage] = useState('');
  const [openingDmMode, setOpeningDmMode] = useState<'direct' | 'button'>('direct');
  const [buttonText, setButtonText] = useState('');
  const [revealMessage, setRevealMessage] = useState('');
  const [publicReplyEnabled, setPublicReplyEnabled] = useState(false);
  const [publicReplyMessage, setPublicReplyMessage] = useState('');
  const [publicReplyMessages, setPublicReplyMessages] = useState<string[]>([]);
  const [requireFollow, setRequireFollow] = useState(false);
  const [followPromptMessage, setFollowPromptMessage] = useState('');
  const [followPromptButtonLabel, setFollowPromptButtonLabel] = useState('');
  const [followUpEnabled, setFollowUpEnabled] = useState(false);
  const [followUpMessage, setFollowUpMessage] = useState('');
  const [followUpDelayMinutes, setFollowUpDelayMinutes] = useState(1440);
  const [dmTriggerEnabled, setDmTriggerEnabled] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isConnectingIg, setIsConnectingIg] = useState(false);
  const [savingPaused, setSavingPaused] = useState(false);

  // ── Stepper state ────────────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState('trigger');
  const currentStepRef = useRef<(typeof STEPS)[number]['id']>('trigger');
  const sectionPositions = useRef<Record<string, number>>({});
  const scrollContentRef = useRef<RNView>(null);
  const sectionRefs = useRef<Partial<Record<string, RNView | null>>>({});

  const remeasureSections = useCallback(() => {
    const container = scrollContentRef.current;
    if (!container) return;
    for (const step of STEPS) {
      const node = sectionRefs.current[step.id];
      if (!node) continue;
      node.measureLayout(
        container,
        (_x, y) => {
          sectionPositions.current[step.id] = y;
        },
        () => {}
      );
    }
  }, []);

  // ── Template picker state ────────────────────────────────────────────────
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplateSlug, setSelectedTemplateSlug] = useState<string | null>(null);

  const { media, loading: mediaLoading, error: mediaError, hasLoaded: mediaHasLoaded, loadMedia } = useMediaPicker();

  // ── Programmatic-write refs ─────────────────────────────────────────────
  const nameRef = useRef<InputFieldRef>(null);
  const keywordInputRef = useRef<InputFieldRef>(null);
  const dmMessageRef = useRef<TextareaInputRef>(null);
  const buttonTextRef = useRef<InputFieldRef>(null);
  const revealMessageRef = useRef<TextareaInputRef>(null);

  // ── Scroll-focused-input-into-view ──────────────────────────────────────
  const scrollRef = useRef<RNScrollView>(null);
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

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    scrollYRef.current = y;

    const viewportAnchor = y + 160;

    let active: (typeof STEPS)[number]['id'] = STEPS[0].id;
    for (let i = STEPS.length - 1; i >= 0; i--) {
      const pos = sectionPositions.current[STEPS[i].id];
      if (pos !== undefined && viewportAnchor >= pos) {
        active = STEPS[i].id;
        break;
      }
    }
    if (currentStepRef.current !== active) {
      currentStepRef.current = active;
      setCurrentStep(active);
    }
  }, []);

  const handleSectionLayout = useCallback((id: string) => (e: LayoutChangeEvent) => {
    sectionPositions.current[id] = e.nativeEvent.layout.y;
  }, []);

  const bindSectionRef = useCallback(
    (id: string) => (node: RNView | null) => {
      sectionRefs.current[id] = node;
    },
    []
  );

  const scrollToSection = useCallback((id: string) => {
    const y = sectionPositions.current[id];
    if (y !== undefined && scrollRef.current) {
      scrollRef.current.scrollTo({ y: Math.max(0, y - 120), animated: true });
    }
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardHeightRef.current = e.endCoordinates.height;
      scrollFocusedInputIntoView();
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      keyboardHeightRef.current = 0;
      focusedInputRef.current = null;
      nameRef.current?.blur();
      keywordInputRef.current?.blur();
      dmMessageRef.current?.blur();
      buttonTextRef.current?.blur();
      revealMessageRef.current?.blur();
    });
    return () => {
      showSub.remove();
      hideSub.remove();
      if (focusScrollTimerRef.current) clearTimeout(focusScrollTimerRef.current);
    };
  }, [scrollFocusedInputIntoView]);

  const handleInputFocus = useCallback((wrapRef: React.RefObject<RNView | null>) => {
    focusedInputRef.current = wrapRef.current as unknown as Measurable | null;
    scrollFocusedInputIntoView();
  }, [scrollFocusedInputIntoView]);

  const handleInputBlur = useCallback(() => {
    focusedInputRef.current = null;
  }, []);

  // Measurement wrapper refs for each input
  const nameWrapRef = useRef<RNView>(null);
  const keywordInputWrapRef = useRef<RNView>(null);
  const dmMessageWrapRef = useRef<RNView>(null);
  const buttonTextWrapRef = useRef<RNView>(null);
  const followPromptMessageWrapRef = useRef<RNView>(null);
  const followPromptButtonLabelWrapRef = useRef<RNView>(null);
  const revealMessageWrapRef = useRef<RNView>(null);
  const publicReplyMessageWrapRef = useRef<RNView>(null);
  const publicReplyMessagesWrapRef = useRef<RNView>(null);
  const followUpMessageWrapRef = useRef<RNView>(null);
  const followUpDelayMinutesWrapRef = useRef<RNView>(null);

  // Load media when target switches to specific_posts
  useEffect(() => {
    if (targetType === 'specific_posts' && media.length === 0 && !mediaLoading && !mediaHasLoaded) {
      loadMedia();
    }
  }, [targetType, media.length, mediaLoading, mediaHasLoaded, loadMedia]);

  // Derive opening DM mode from button text presence
  const hadButtonTextRef = useRef(false);
  useEffect(() => {
    setOpeningDmMode(buttonText.trim() ? 'button' : 'direct');
    const hasButton = buttonText.trim().length > 0;
    if (hasButton !== hadButtonTextRef.current) {
      hadButtonTextRef.current = hasButton;
      animateFormLayout();
      setTimeout(remeasureSections, 250);
    }
  }, [buttonText, remeasureSections]);

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

  useEffect(() => {
    const timer = setTimeout(remeasureSections, 350);
    return () => clearTimeout(timer);
  }, [remeasureSections, templatesLoading, media.length, targetType, matchAnyWord, buttonText, publicReplyEnabled, followUpEnabled]);

  const applyTemplate = useCallback((slug: string | null) => {
    setSelectedTemplateSlug(slug);
    setMatchAnyWord(false);
    if (slug === null) {
      setName('');
      nameRef.current?.setText('');
      setKeywords([]);
      setKeywordInput('');
      keywordInputRef.current?.setText('');
      setDmMessage('');
      dmMessageRef.current?.setText('');
      setButtonText('');
      buttonTextRef.current?.setText('');
      setRevealMessage('');
      revealMessageRef.current?.setText('');
      return;
    }
    const tmpl = templates.find((t) => t.slug === slug);
    if (!tmpl) return;
    setName(tmpl.title);
    nameRef.current?.setText(tmpl.title);
    const lowerKeywords = tmpl.keywords.map((k) => k.toLowerCase());
    setKeywords(lowerKeywords);
    const kwInput = lowerKeywords.join(', ');
    setKeywordInput(kwInput);
    keywordInputRef.current?.setText(kwInput);
    setDmMessage(tmpl.dm_message);
    dmMessageRef.current?.setText(tmpl.dm_message);
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
    keywordInputRef.current?.setText(next);
  }, [keywordInput, syncKeywordsFromInput]);

  const handleRemoveKeyword = useCallback((kw: string) => {
    const next = keywords.filter((k) => k !== kw).join(', ');
    setKeywordInput(next);
    syncKeywordsFromInput(next);
    keywordInputRef.current?.setText(next);
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
      requireFollow,
      followPromptMessage,
      followPromptButtonLabel,
      followUpEnabled,
      followUpMessage,
      followUpDelayMinutes,
      dmTriggerEnabled,
    }),
    [name, targetType, selectedMediaIds, keywords, matchMode, matchAnyWord, dmMessage, openingDmMode, buttonText, revealMessage, publicReplyEnabled, publicReplyMessage, publicReplyMessages, requireFollow, followPromptMessage, followPromptButtonLabel, followUpEnabled, followUpMessage, followUpDelayMinutes, dmTriggerEnabled]
  );

  const validationErrors = useMemo(() => validateAutomationDraft(draft), [draft]);
  const isValid = validationErrors.length === 0;

  const handleSubmit = useCallback(async (goLive: boolean) => {
    setSubmitAttempted(true);
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
      require_follow: requireFollow,
      ...(requireFollow
        ? {
            follow_prompt_message: followPromptMessage.trim() || null,
            follow_prompt_button_label: followPromptButtonLabel.trim() || null,
          }
        : { follow_prompt_message: null, follow_prompt_button_label: null }),
      dm_trigger_enabled: dmTriggerEnabled,
      follow_up_enabled: followUpEnabled,
      ...(followUpEnabled
        ? {
            follow_up_message: followUpMessage.trim() || null,
            follow_up_delay_minutes: followUpDelayMinutes,
          }
        : { follow_up_message: null, follow_up_delay_minutes: null }),
      ...(targetType === 'specific_posts' ? { media_ids: selectedMediaIds } : {}),
      ...(publicReplyEnabled
        ? {
            public_reply_message: publicReplyMessage.trim() || null,
            public_reply_messages: publicReplyMessages.filter((m) => m.trim()),
          }
        : { public_reply_message: null, public_reply_messages: [] }),
      status: goLive ? 'active' : 'paused',
    };

    if (!goLive) setSavingPaused(true);
    try {
      const created = await createAutomation(input);
      if (!created?.$id) {
        setSubmitError('Automation created, but the server returned no id — open it from the list.');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['automations'] });
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
    requireFollow, followPromptMessage, followPromptButtonLabel,
    followUpEnabled, followUpMessage, followUpDelayMinutes, dmTriggerEnabled,
    createAutomation, queryClient, router,
  ]);

  const selectedPreviewMedia = useMemo(() => {
    if (targetType !== 'specific_posts' || selectedMediaIds.length === 0) return null;
    const firstId = selectedMediaIds[0];
    return media.find((m) => m.id === firstId) ?? null;
  }, [targetType, selectedMediaIds, media]);

  const dismissKeyboard = useCallback(() => {
    Keyboard.dismiss();
    focusedInputRef.current = null;
  }, []);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 56}>
      {/* ── Fixed header ── */}
      <View
        className="flex-row items-center justify-between px-2 pb-2.5 bg-canvas border-b border-hairline"
        style={{ paddingTop: insets.top + 8 }}
      >
        <PressableScale
          onPress={() => router.back()}
          accessibilityLabel="Back"
          className="w-10 h-10 items-center justify-center"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color="#0a0a0a" />
        </PressableScale>
        <Text className="font-semibold text-ink" style={{ fontSize: 17, lineHeight: 22, letterSpacing: -0.2 }}>
          New Automation
        </Text>
        <View className="w-10 h-10" />
      </View>

      {/* ── Stepper ── */}
      <View className="flex-row items-center justify-center gap-2 py-3 bg-canvas border-b border-hairline">
        {STEPS.map((step, index) => (
          <React.Fragment key={step.id}>
            <Pressable
              onPress={() => scrollToSection(step.id)}
              className="flex-row items-center gap-1.5"
              accessibilityLabel={`Go to ${step.label}`}
              accessibilityRole="button"
            >
              <View
                className={cn(
                  'w-6 h-6 rounded-pill items-center justify-center',
                  currentStep === step.id ? 'bg-brand-lavender' : 'bg-surface-soft'
                )}
              >
                <Text
                  className={cn(
                    'text-xs font-semibold',
                    currentStep === step.id ? 'text-on-primary' : 'text-muted'
                  )}
                >
                  {index + 1}
                </Text>
              </View>
              <Text
                className={cn(
                  'text-sm font-medium',
                  currentStep === step.id ? 'text-ink' : 'text-muted'
                )}
              >
                {step.label}
              </Text>
            </Pressable>
            {index < STEPS.length - 1 && (
              <View className="w-3 h-[1px] bg-hairline" />
            )}
          </React.Fragment>
        ))}
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={dismissKeyboard}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <RNView ref={scrollContentRef} collapsable={false} style={{ gap: 24 }}>
        {/* ── Step: Trigger ── */}
        <RNView ref={bindSectionRef('trigger')} onLayout={handleSectionLayout('trigger')}>
        {/* Templates */}
        <Reveal delay={0}>
          <View className="gap-3">
            <Text className="text-muted-soft" style={{ fontSize: 13, lineHeight: 18 }}>
              Start from a template
            </Text>
            {templatesLoading ? (
              <Text className="text-muted" style={{ fontSize: 14, lineHeight: 20 }}>Loading templates…</Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingVertical: 4, paddingHorizontal: 2 }}
              >
                <PressableScale
                  onPress={() => applyTemplate(null)}
                  style={{ width: 132, minHeight: 72 }}
                  className={cn(
                    'rounded-xl border-2 px-4 py-3 justify-center',
                    selectedTemplateSlug === null ? 'border-brand-lavender bg-brand-lavender' : 'border-hairline bg-white'
                  )}
                >
                  <Text
                    className={cn('font-semibold text-sm', selectedTemplateSlug === null ? 'text-on-dark' : 'text-ink')}
                    numberOfLines={2}
                  >
                    Blank
                  </Text>
                </PressableScale>
                {templates.map((tmpl, idx) => {
                  const active = selectedTemplateSlug === tmpl.slug;
                  const palette = TEMPLATE_PALETTE[idx % TEMPLATE_PALETTE.length];
                  return (
                    <PressableScale
                      key={tmpl.slug}
                      onPress={() => applyTemplate(tmpl.slug)}
                      style={{ width: 132, minHeight: 72 }}
                      className={cn(
                        'rounded-xl border-2 px-4 py-3 justify-center',
                        active ? `${palette.border} ${palette.bg}` : 'border-hairline bg-white'
                      )}
                    >
                      <Text
                        className={cn('font-semibold text-sm', active ? palette.text : 'text-ink')}
                        numberOfLines={2}
                      >
                        {tmpl.title}
                      </Text>
                    </PressableScale>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </Reveal>

        {/* Campaign name */}
        <Reveal delay={60}>
            <View className="gap-2.5">
              <Text className="text-muted-soft" style={{ fontSize: 13, lineHeight: 18 }}>
                Campaign name
              </Text>
              <RNView ref={nameWrapRef}>
                <Input>
                  <InputField
                    ref={nameRef}
                    placeholder="e.g. Product Link Drop"
                    onChangeText={setName}
                    onFocus={() => handleInputFocus(nameWrapRef)}
                    onBlur={handleInputBlur}
                    accessibilityLabel="Automation name"
                  />
                </Input>
              </RNView>
            </View>
        </Reveal>

        {/* Trigger radios */}
        <Reveal delay={120}>
            <View className="gap-2.5">
              <Text className="font-semibold text-ink" style={{ fontSize: 16, lineHeight: 22, letterSpacing: -0.2 }}>
                When someone comments on
              </Text>
              <RadioGroup
                value={targetType}
                onChange={(value) => {
                  animateFormLayout();
                  setTargetType(value as TargetType);
                  if (value !== 'specific_posts') {
                    setSelectedMediaIds([]);
                  }
                  setTimeout(remeasureSections, 250);
                }}
                className="gap-2.5"
              >
                {TARGET_OPTIONS.map((opt) => (
                  <Card
                    key={opt.value}
                    variant="outline"
                    size="md"
                    className={cn(
                      'gap-3 bg-white border-2',
                      targetType === opt.value ? 'border-brand-lavender bg-brand-lavender/15' : 'border-hairline'
                    )}
                  >
                    <Radio value={opt.value}>
                      <RadioIndicator />
                      <View className="flex-1 gap-1">
                        <RadioLabel>{opt.label}</RadioLabel>
                        {opt.description ? (
                          <Text className="text-muted" style={{ fontSize: 13, lineHeight: 18 }}>{opt.description}</Text>
                        ) : null}
                      </View>
                    </Radio>
                    {opt.value === 'specific_posts' && targetType === 'specific_posts' ? (
                      <View className="gap-2">
                        {mediaLoading && (
                          <Text className="text-muted" style={{ fontSize: 14, lineHeight: 20 }}>Loading posts…</Text>
                        )}
                        {mediaError && (
                          <View className="gap-2">
                            <Text className="text-error" style={{ fontSize: 14, lineHeight: 20 }}>
                              {mediaError === 'session_expired'
                                ? 'Session expired. Please reconnect Instagram.'
                                : mediaError}
                            </Text>
                            <PressableScale onPress={loadMedia} className="self-start rounded-md bg-surface-soft px-3 py-2">
                              <Text className="font-semibold text-ink" style={{ fontSize: 13 }}>Retry</Text>
                            </PressableScale>
                          </View>
                        )}
                        {!mediaLoading && !mediaError && media.length === 0 && (
                          <Text className="text-muted" style={{ fontSize: 14, lineHeight: 20 }}>No posts found</Text>
                        )}
                        {media.length > 0 && (
                          <MediaCarousel
                            media={media}
                            selectedIds={selectedMediaIds}
                            onToggle={toggleMedia}
                          />
                        )}
                      </View>
                    ) : null}
                  </Card>
                ))}
              </RadioGroup>

              <ToggleCard
                title="also reply to DMs containing keywords"
                description="Auto-reply to inbound DMs that match your keywords"
                value={dmTriggerEnabled}
                onValueChange={setDmTriggerEnabled}
                accessibilityLabel="Enable DM trigger"
                className={cn('bg-white border-2', dmTriggerEnabled ? 'border-brand-lavender' : 'border-hairline')}
              />
            </View>
        </Reveal>
        </RNView>

        {/* ── Step: Keywords ── */}
        <RNView ref={bindSectionRef('keywords')} onLayout={handleSectionLayout('keywords')}>
        <Reveal delay={180}>
            <View className="gap-2.5">
              <Text className="font-semibold text-ink" style={{ fontSize: 16, lineHeight: 22, letterSpacing: -0.2 }}>
                And this comment has
              </Text>
              <RadioGroup
                value={matchAnyWord ? 'any_word' : 'specific_words'}
                onChange={(value) => {
                  animateFormLayout();
                  setMatchAnyWord(value === 'any_word');
                  setTimeout(remeasureSections, 250);
                }}
                className="gap-2.5"
              >
                <Card
                  variant="outline"
                  size="md"
                  className={cn(
                    'gap-3 bg-white border-2',
                    !matchAnyWord ? 'border-brand-lavender bg-brand-lavender/15' : 'border-hairline'
                  )}
                >
                  <Radio value="specific_words">
                    <RadioIndicator />
                    <View className="flex-1 gap-1">
                      <RadioLabel>a specific word or words</RadioLabel>
                    </View>
                  </Radio>
                  {!matchAnyWord ? (
                    <View className="gap-2.5">
                      <RNView ref={keywordInputWrapRef}>
                        <Input>
                          <InputField
                            ref={keywordInputRef}
                            placeholder="Enter a word or multiple"
                            onChangeText={handleKeywordInputChange}
                            onFocus={() => handleInputFocus(keywordInputWrapRef)}
                            onBlur={handleInputBlur}
                            accessibilityLabel="Keywords"
                          />
                        </Input>
                      </RNView>
                      <Text className="text-muted" style={{ fontSize: 14, lineHeight: 20 }}>
                        Use commas to separate words
                      </Text>
                      <View className="flex-row flex-wrap items-center gap-2">
                        <Text className="text-muted" style={{ fontSize: 14, lineHeight: 20 }}>For example:</Text>
                        {EXAMPLE_KEYWORDS.map((kw) => (
                          <PressableScale
                            key={kw}
                            onPress={() => addExampleKeyword(kw)}
                            className="h-[30px] justify-center rounded-pill border border-hairline bg-surface-soft px-3"
                          >
                            <Text className="text-ink" style={{ fontSize: 13 }}>{kw}</Text>
                          </PressableScale>
                        ))}
                      </View>
                      {keywords.length > 0 && (
                        <View className="flex-row flex-wrap gap-2">
                          {keywords.map((kw) => (
                            <KeywordChip key={kw} keyword={kw} onRemove={() => handleRemoveKeyword(kw)} />
                          ))}
                        </View>
                      )}
                    </View>
                  ) : null}
                </Card>
                <Card
                  variant="outline"
                  size="md"
                  className={cn(
                    'gap-3 bg-white border-2',
                    matchAnyWord ? 'border-brand-lavender bg-brand-lavender/15' : 'border-hairline'
                  )}
                >
                  <Radio value="any_word">
                    <RadioIndicator />
                    <View className="flex-1 gap-1">
                      <RadioLabel>any word</RadioLabel>
                      <Text className="text-muted" style={{ fontSize: 13, lineHeight: 18 }}>
                        Every comment gets the DM — no keyword filter. Use with care.
                      </Text>
                    </View>
                  </Radio>
                </Card>
              </RadioGroup>

              {!matchAnyWord ? (
                <View className="gap-1.5">
                  <SegmentedControl
                    values={MATCH_OPTIONS.map((o) => o.label)}
                    selectedIndex={MATCH_OPTIONS.findIndex((o) => o.value === matchMode)}
                    onChange={(event) => setMatchMode(MATCH_OPTIONS[event.nativeEvent.selectedSegmentIndex].value)}
                    appearance="light"
                    tintColor="#b8a4ed"
                  />
                  {matchMode === 'whole_word' && (
                    <Text className="text-muted-soft" style={{ fontSize: 13, lineHeight: 18 }}>
                      &quot;link&quot; won&apos;t match &quot;linking&quot;
                    </Text>
                  )}
                </View>
              ) : null}
            </View>
        </Reveal>
        </RNView>

        {/* ── Step: Message ── */}
        <RNView ref={bindSectionRef('message')} onLayout={handleSectionLayout('message')}>
        <Reveal delay={240}>
            <View className="gap-2.5">
              <Text className="font-semibold text-ink" style={{ fontSize: 16, lineHeight: 22, letterSpacing: -0.2 }}>
                They will get
              </Text>
              <Card variant="outline" size="md" className="gap-2.5 bg-white border-2 border-hairline">
                <Text className="font-medium text-ink" style={{ fontSize: 15, lineHeight: 21 }}>
                  an opening DM
                </Text>
                <Text className="text-muted-soft" style={{ fontSize: 13, lineHeight: 18 }}>
                  We&apos;ll replace {'{username}'} with the commenter&apos;s name
                </Text>
                <RNView ref={dmMessageWrapRef}>
                  <Textarea>
                    <TextareaInput
                      ref={dmMessageRef}
                      placeholder="Hey there! I'm so happy you're here..."
                      onChangeText={setDmMessage}
                      onFocus={() => handleInputFocus(dmMessageWrapRef)}
                      onBlur={handleInputBlur}
                      maxLength={DM_MAX_LENGTH}
                      accessibilityLabel="DM message"
                    />
                  </Textarea>
                </RNView>
                <Text
                  className={cn(
                    'self-end text-muted-soft',
                    dmMessage.length >= DM_MAX_LENGTH && 'text-error'
                  )}
                  style={{ fontSize: 12, lineHeight: 16 }}
                >
                  {dmMessage.length}/{DM_MAX_LENGTH}
                </Text>

                <RNView ref={buttonTextWrapRef}>
                  <Input>
                    <InputField
                      ref={buttonTextRef}
                      placeholder="Button text (e.g. Send me the link)"
                      onChangeText={setButtonText}
                      onFocus={() => handleInputFocus(buttonTextWrapRef)}
                      onBlur={handleInputBlur}
                      maxLength={BUTTON_TEXT_MAX_LENGTH}
                      accessibilityLabel="Button text"
                    />
                  </Input>
                </RNView>
              </Card>

              {/* ── Follow gate ── */}
              <ToggleCard
                title="require them to follow you"
                description="Only send the link to people who follow your account"
                value={requireFollow}
                onValueChange={setRequireFollow}
                accessibilityLabel="Enable follow gate"
                className={cn('bg-white border-2', requireFollow ? 'border-brand-lavender' : 'border-hairline')}
              >
                <Text className="text-muted-soft" style={{ fontSize: 13, lineHeight: 18 }}>
                  Message shown to non-followers (we&apos;ll replace {'{username}'} with their name)
                </Text>
                <RNView ref={followPromptMessageWrapRef}>
                  <Textarea>
                    <TextareaInput
                      placeholder="Follow me to unlock the link!"
                      onChangeText={setFollowPromptMessage}
                      onFocus={() => handleInputFocus(followPromptMessageWrapRef)}
                      onBlur={handleInputBlur}
                      accessibilityLabel="Follow prompt message"
                    />
                  </Textarea>
                </RNView>
                <RNView ref={followPromptButtonLabelWrapRef}>
                  <Input>
                    <InputField
                      placeholder="Button label (e.g. Follow)"
                      onChangeText={setFollowPromptButtonLabel}
                      onFocus={() => handleInputFocus(followPromptButtonLabelWrapRef)}
                      onBlur={handleInputBlur}
                      maxLength={20}
                      accessibilityLabel="Follow prompt button label"
                    />
                  </Input>
                </RNView>
              </ToggleCard>

              {buttonText.trim().length > 0 ? (
                <View className="gap-2.5">
                  <Text className="font-semibold text-ink" style={{ fontSize: 16, lineHeight: 22, letterSpacing: -0.2 }}>
                    And then, they will get
                  </Text>
                  <Card variant="outline" size="md" className="gap-2.5 bg-white border-2 border-hairline">
                    <Text className="font-medium text-ink" style={{ fontSize: 15, lineHeight: 21 }}>
                      a DM with a link
                    </Text>
                    <Text className="text-muted-soft" style={{ fontSize: 13, lineHeight: 18 }}>
                      Message revealed after the button is tapped
                    </Text>
                    <RNView ref={revealMessageWrapRef}>
                      <Textarea>
                        <TextareaInput
                          ref={revealMessageRef}
                          placeholder="Write the message with the link..."
                          onChangeText={setRevealMessage}
                          onFocus={() => handleInputFocus(revealMessageWrapRef)}
                          onBlur={handleInputBlur}
                          maxLength={REVEAL_MAX_LENGTH}
                          accessibilityLabel="Link DM message"
                        />
                      </Textarea>
                    </RNView>
                  </Card>
                </View>
              ) : null}
            </View>
        </Reveal>
        </RNView>

        {/* ── Step: Extras ── */}
        <RNView ref={bindSectionRef('extras')} onLayout={handleSectionLayout('extras')}>
        <Reveal delay={360}>
            <View className="gap-2.5">
              <ToggleCard
                title="reply to their comments under the post"
                value={publicReplyEnabled}
                onValueChange={setPublicReplyEnabled}
                accessibilityLabel="Enable public reply"
                className={cn('bg-white border-2', publicReplyEnabled ? 'border-brand-lavender' : 'border-hairline')}
              >
                <Text className="text-muted-soft" style={{ fontSize: 13, lineHeight: 18 }}>
                  We&apos;ll replace {'{username}'} with the commenter&apos;s name
                </Text>
                <RNView ref={publicReplyMessageWrapRef}>
                  <Textarea>
                    <TextareaInput
                      placeholder="Write your public reply…"
                      onChangeText={setPublicReplyMessage}
                      onFocus={() => handleInputFocus(publicReplyMessageWrapRef)}
                      onBlur={handleInputBlur}
                      accessibilityLabel="Public reply message"
                    />
                  </Textarea>
                </RNView>
                <Text className="text-muted-soft" style={{ fontSize: 13, lineHeight: 18 }}>
                  Add more replies (one per line) — one will be randomly selected each time
                </Text>
                <RNView ref={publicReplyMessagesWrapRef}>
                  <Textarea>
                    <TextareaInput
                      placeholder="Thanks for commenting!&#10;Glad you liked it!&#10;Appreciate the support!"
                      onChangeText={(text) => setPublicReplyMessages(text.split('\n'))}
                      onFocus={() => handleInputFocus(publicReplyMessagesWrapRef)}
                      onBlur={handleInputBlur}
                      accessibilityLabel="Additional public reply messages"
                    />
                  </Textarea>
                </RNView>
                {publicReplyMessages.filter((m) => m.trim()).length > 0 && (
                  <Text className="text-brand-lavender" style={{ fontSize: 13, lineHeight: 18 }}>
                    Pool: {publicReplyMessages.filter((m) => m.trim()).length + (publicReplyMessage.trim() ? 1 : 0)} messages
                  </Text>
                )}
              </ToggleCard>
            </View>
        </Reveal>

        <Reveal delay={420}>
            <View className="gap-2.5">
              <ToggleCard
                title="send a follow-up message"
                description="Send an appreciation message after the link is delivered"
                value={followUpEnabled}
                onValueChange={setFollowUpEnabled}
                accessibilityLabel="Enable follow-up message"
                className={cn('bg-white border-2', followUpEnabled ? 'border-brand-lavender' : 'border-hairline')}
              >
                <Text className="text-muted-soft" style={{ fontSize: 13, lineHeight: 18 }}>
                  We&apos;ll replace {'{username}'} with the commenter&apos;s name
                </Text>
                <RNView ref={followUpMessageWrapRef}>
                  <Textarea>
                    <TextareaInput
                      placeholder="Thanks for your interest! Let me know if you have any questions 😊"
                      onChangeText={setFollowUpMessage}
                      onFocus={() => handleInputFocus(followUpMessageWrapRef)}
                      onBlur={handleInputBlur}
                      accessibilityLabel="Follow-up message"
                    />
                  </Textarea>
                </RNView>
                <Text className="text-muted-soft" style={{ fontSize: 13, lineHeight: 18 }}>
                  Delay before sending (in minutes)
                </Text>
                <RNView ref={followUpDelayMinutesWrapRef}>
                  <Input>
                    <InputField
                      placeholder="1440 (24 hours)"
                      onChangeText={(text) => {
                        const num = parseInt(text, 10);
                        if (!isNaN(num) && num > 0) {
                          setFollowUpDelayMinutes(num);
                        } else if (text === '') {
                          setFollowUpDelayMinutes(0);
                        }
                      }}
                      onFocus={() => handleInputFocus(followUpDelayMinutesWrapRef)}
                      onBlur={() => {
                        handleInputBlur();
                        const num = parseInt(String(followUpDelayMinutes), 10);
                        if (!isNaN(num)) {
                          setFollowUpDelayMinutes(Math.max(1, Math.min(1440, num)));
                        }
                      }}
                      keyboardType="number-pad"
                      accessibilityLabel="Follow-up delay in minutes"
                    />
                  </Input>
                </RNView>
              </ToggleCard>
            </View>
        </Reveal>

        {/* Preview */}
        <Reveal delay={480}>
          <View className="gap-2.5">
            <Text className="font-semibold text-ink" style={{ fontSize: 16, lineHeight: 22, letterSpacing: -0.2 }}>
              Preview
            </Text>
            <AutomationDmPreview
              dmMessage={dmMessage}
              buttonText={buttonText}
              revealMessage={revealMessage}
              requireFollow={requireFollow}
              followPromptMessage={followPromptMessage}
              followPromptButtonLabel={followPromptButtonLabel}
              followUpEnabled={followUpEnabled}
              followUpMessage={followUpMessage}
              selectedMedia={selectedPreviewMedia}
            />
            {(matchAnyWord || keywords.length > 0) && (
              <View className="flex-row flex-wrap items-center gap-2">
                {matchAnyWord ? (
                  <View className="rounded-pill bg-brand-lavender/15 px-3 py-1.5">
                    <Text className="font-medium text-brand-lavender" style={{ fontSize: 13 }}>
                      Triggers on any comment
                    </Text>
                  </View>
                ) : (
                  keywords.map((kw) => (
                    <View key={kw} className="rounded-pill bg-brand-pink/15 px-3 py-1.5">
                      <Text className="font-medium text-brand-pink" style={{ fontSize: 13 }}>
                        {kw}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        </Reveal>
        </RNView>
        </RNView>
      </ScrollView>

      {/* ── Pinned bottom CTA ── */}
      <View
        className="border-t border-hairline bg-canvas px-4 pt-2.5 gap-2"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        {submitError === 'instagram_not_connected' && (
          <>
            <View className="border border-brand-coral/30 rounded-md bg-brand-coral/10 px-3.5 py-3">
              <Text className="text-brand-coral" style={{ fontSize: 14, lineHeight: 20 }}>
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
          <Text className="text-center text-error" style={{ fontSize: 14 }}>{submitError}</Text>
        )}
        {!isValid && !submitError && submitAttempted && validationErrors.length > 0 && (
          <Text className="text-center text-muted-soft" style={{ fontSize: 12, lineHeight: 16 }}>
            {validationErrors[0]}
          </Text>
        )}
        <ClayAnimatedButton
          onPress={() => handleSubmit(true)}
          disabled={!isValid || savingPaused}
          loading={creating}
          fullWidth
        >
          Go Live
        </ClayAnimatedButton>
        <PressableScale
          onPress={() => handleSubmit(false)}
          disabled={!isValid || creating || savingPaused}
          accessibilityLabel="Save as paused"
          accessibilityRole="button"
          style={{ alignSelf: 'center' }}
        >
          <Text className={cn('font-semibold text-muted text-sm', (!isValid || creating || savingPaused) && 'opacity-40')}>
            {savingPaused ? 'Saving…' : 'Save as paused'}
          </Text>
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}
