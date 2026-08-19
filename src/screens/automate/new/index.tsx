/**
 * Campaign builder screen — sectioned comment-automation flow.
 *
 * Styled with Uniwind className via `@/tw` primitives +
 * PanelUI components (`panelui-native`).
 *
 * NOTE: verify layout on Android before editing — this screen previously
 * suffered from a `useCssElement` layout bug (ballooned cards, floating text).
 * Raw KeyboardAvoidingView is the documented escape hatch.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  View as RNView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { Button, Card, Input, Textarea, Switch } from 'panelui-native';
import { useAutomationGate } from '@/hooks/useAutomationGate';
import { useAutomationDraft } from '@/hooks/useAutomationDraft';
import { useScrollRevealLayout } from '@/hooks/useScrollRevealLayout';
import type { TargetType, MatchMode, CampaignTemplate } from '@/lib/automations';
import { listCampaignTemplates } from '@/lib/automations';
import { addLog } from '@/lib/logger';
import { View, Text, Pressable, ScrollView } from '@/tw';
import { cn } from '@/tw/cn';
import { Reveal } from '@/components/ui/reveal';
import { AutomationDmPreview } from '@/components/automation/AutomationDmPreview';
import { useMediaPicker } from './hooks';
import { PressableScale, KeywordChip, MediaCarousel } from './components';

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

const SECTION_IDS = STEPS.map((s) => s.id);

const TEMPLATE_PALETTE = [
  { bg: 'bg-primary', text: 'text-primary-foreground', border: 'border-primary' },
  { bg: 'bg-secondary', text: 'text-secondary-foreground', border: 'border-secondary' },
  { bg: 'bg-accent', text: 'text-accent-foreground', border: 'border-accent' },
  { bg: 'bg-destructive', text: 'text-destructive-foreground', border: 'border-destructive' },
  { bg: 'bg-muted', text: 'text-foreground', border: 'border-muted' },
  { bg: 'bg-secondary', text: 'text-foreground', border: 'border-secondary' },
];

export default function NewAutomationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { connect: connectInstagram } = useAutomationGate();
  const foregroundColor = useCSSVariable('--color-foreground') as string;

  // ── Stepper state ────────────────────────────────────────────────────────
  const {
    activeSection: currentStep,
    scrollRef,
    scrollContentRef,
    handleScroll,
    handleSectionLayout,
    bindSectionRef,
    registerRef,
    scrollToSection,
    remeasureSections,
    handleInputFocus,
    handleInputBlur,
    dismissKeyboard,
    animateFormLayout,
  } = useScrollRevealLayout(SECTION_IDS);

  // ── Template picker state ────────────────────────────────────────────────
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  const { media, loading: mediaLoading, error: mediaError, hasLoaded: mediaHasLoaded, loadMedia } = useMediaPicker();

  const {
    name,
    setName,
    targetType,
    setTargetType,
    selectedMediaIds,
    setSelectedMediaIds,
    keywords,
    keywordInput,
    matchMode,
    setMatchMode,
    matchAnyWord,
    setMatchAnyWord,
    dmMessage,
    setDmMessage,
    buttonText,
    setButtonText,
    revealMessage,
    setRevealMessage,
    publicReplyEnabled,
    setPublicReplyEnabled,
    publicReplyMessage,
    setPublicReplyMessage,
    publicReplyMessages,
    setPublicReplyMessages,
    requireFollow,
    setRequireFollow,
    followPromptMessage,
    setFollowPromptMessage,
    followPromptButtonLabel,
    setFollowPromptButtonLabel,
    followUpEnabled,
    setFollowUpEnabled,
    followUpMessage,
    setFollowUpMessage,
    followUpDelayMinutes,
    setFollowUpDelayMinutes,
    dmTriggerEnabled,
    setDmTriggerEnabled,
    submitError,
    submitAttempted,
    savingPaused,
    creating,
    selectedTemplateSlug,
    validationErrors,
    isValid,
    handleSubmit,
    handleKeywordInputChange,
    addExampleKeyword,
    handleRemoveKeyword,
    toggleMedia,
    applyTemplate,
    selectedPreviewMedia,
  } = useAutomationDraft(templates, media);

  const [isConnectingIg, setIsConnectingIg] = useState(false);

  // Load media when target switches to specific_posts
  useEffect(() => {
    if (targetType === 'specific_posts' && media.length === 0 && !mediaLoading && !mediaHasLoaded) {
      loadMedia();
    }
  }, [targetType, media.length, mediaLoading, mediaHasLoaded, loadMedia]);

  // Reflow layout when the button-text presence flips (opening DM mode is derived in the hook)
  const hadButtonTextRef = useRef(false);
  useEffect(() => {
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
        const data = await listCampaignTemplates();
        if (!cancelled) setTemplates(data);
      } catch (err) {
        addLog(`Failed to load templates: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = setTimeout(remeasureSections, 350);
    return () => clearTimeout(timer);
  }, [remeasureSections, templatesLoading, media.length, targetType, matchAnyWord, buttonText, publicReplyEnabled, followUpEnabled]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 56}>
      {/* ── Fixed header ── */}
      <View
        className="flex-row items-center justify-between px-2 pb-2.5 bg-background border-b border-border"
        style={{ paddingTop: insets.top + 8 }}
      >
        <PressableScale
          onPress={() => router.back()}
          accessibilityLabel="Back"
          className="w-10 h-10 items-center justify-center"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={foregroundColor} />
        </PressableScale>
        <Text className="font-semibold text-foreground" style={{ fontSize: 17, lineHeight: 22, letterSpacing: -0.2 }}>
          New Automation
        </Text>
        <View className="w-10 h-10" />
      </View>

      <View className="flex-row items-center justify-center gap-2 py-3 bg-background border-b border-border">
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
                  'w-6 h-6 rounded-full items-center justify-center',
                  currentStep === step.id ? 'bg-primary' : 'bg-muted'
                )}
              >
                <Text
                  className={cn(
                    'text-xs font-semibold',
                    currentStep === step.id ? 'text-primary-foreground' : 'text-muted-foreground'
                  )}
                >
                  {index + 1}
                </Text>
              </View>
              <Text
                className={cn(
                  'text-sm font-medium',
                  currentStep === step.id ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {step.label}
              </Text>
            </Pressable>
            {index < STEPS.length - 1 && (
              <View className="w-3 h-[1px] bg-border" />
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
            <Text className="text-muted-foreground" style={{ fontSize: 13, lineHeight: 18 }}>
              Start from a template
            </Text>
            {templatesLoading ? (
              <Text className="text-muted-foreground" style={{ fontSize: 14, lineHeight: 20 }}>Loading templates…</Text>
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
                    selectedTemplateSlug === null ? 'border-primary bg-primary' : 'border-border bg-card'
                  )}
                >
                  <Text
                    className={cn('font-semibold text-sm', selectedTemplateSlug === null ? 'text-primary-foreground' : 'text-foreground')}
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
                        active ? `${palette.border} ${palette.bg}` : 'border-border bg-card'
                      )}
                    >
                      <Text
                        className={cn('font-semibold text-sm', active ? palette.text : 'text-foreground')}
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
              <Text className="text-muted-foreground" style={{ fontSize: 13, lineHeight: 18 }}>
                Campaign name
              </Text>
              <RNView ref={registerRef('name')}>
                <Input
                  value={name}
                  placeholder="e.g. Product Link Drop"
                  onChangeText={setName}
                  onFocus={() => handleInputFocus('name')}
                  onBlur={handleInputBlur}
                  accessibilityLabel="Automation name"
                />
              </RNView>
            </View>
        </Reveal>

        {/* Trigger radios */}
        <Reveal delay={120}>
            <View className="gap-2.5">
              <Text className="font-semibold text-foreground" style={{ fontSize: 16, lineHeight: 22, letterSpacing: -0.2 }}>
                When someone comments on
              </Text>
              <View className="gap-2.5">
                {TARGET_OPTIONS.map((opt) => {
                  const selected = targetType === opt.value;
                  return (
                    <Card
                      key={opt.value}
                      className={cn(
                        'gap-3 p-4',
                        selected ? 'border-2 border-primary bg-primary/10' : 'border-2 border-border bg-card'
                      )}
                    >
                      <Pressable
                        onPress={() => {
                          animateFormLayout();
                          setTargetType(opt.value);
                          if (opt.value !== 'specific_posts') {
                            setSelectedMediaIds([]);
                          }
                          setTimeout(remeasureSections, 250);
                        }}
                        className="flex-row items-center gap-3"
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                      >
                        <View
                          className={cn(
                            'h-[22px] w-[22px] rounded-full border-2 items-center justify-center',
                            selected ? 'border-primary bg-primary' : 'border-border bg-transparent'
                          )}
                        >
                          {selected && (
                            <Ionicons name="checkmark" size={13} color={foregroundColor} />
                          )}
                        </View>
                        <View className="flex-1 gap-1">
                          <Text className="font-medium text-foreground" style={{ fontSize: 15, lineHeight: 20 }}>{opt.label}</Text>
                          {opt.description ? (
                            <Text className="text-muted-foreground" style={{ fontSize: 13, lineHeight: 18 }}>{opt.description}</Text>
                          ) : null}
                        </View>
                      </Pressable>
                      {opt.value === 'specific_posts' && targetType === 'specific_posts' ? (
                        <View className="gap-2">
                          {mediaLoading && (
                            <Text className="text-muted-foreground" style={{ fontSize: 14, lineHeight: 20 }}>Loading posts…</Text>
                          )}
                          {mediaError && (
                            <View className="gap-2">
                              <Text className="text-destructive" style={{ fontSize: 14, lineHeight: 20 }}>
                                {mediaError === 'session_expired'
                                  ? 'Session expired. Please reconnect Instagram.'
                                  : mediaError}
                              </Text>
                              <PressableScale onPress={loadMedia} className="self-start rounded-md bg-muted px-3 py-2">
                                <Text className="font-semibold text-foreground" style={{ fontSize: 13 }}>Retry</Text>
                              </PressableScale>
                            </View>
                          )}
                          {!mediaLoading && !mediaError && media.length === 0 && (
                            <Text className="text-muted-foreground" style={{ fontSize: 14, lineHeight: 20 }}>No posts found</Text>
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
                  );
                })}
              </View>

              <Card className={cn('gap-3 p-4', dmTriggerEnabled ? 'border-2 border-primary bg-card' : 'border-2 border-border bg-card')}>
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1 gap-0.5">
                    <Text className="font-medium text-foreground" style={{ fontSize: 15, lineHeight: 20 }}>also reply to DMs containing keywords</Text>
                    <Text className="text-muted-foreground" style={{ fontSize: 13, lineHeight: 18 }}>Auto-reply to inbound DMs that match your keywords</Text>
                  </View>
                  <Pressable
                    accessible
                    accessibilityLabel="Enable DM trigger"
                    accessibilityRole="switch"
                    onPress={() => setDmTriggerEnabled(!dmTriggerEnabled)}
                  >
                    <Switch
                      value={dmTriggerEnabled}
                      onValueChange={setDmTriggerEnabled}
                    />
                  </Pressable>
                </View>
              </Card>
            </View>
        </Reveal>
        </RNView>

        {/* ── Step: Keywords ── */}
        <RNView ref={bindSectionRef('keywords')} onLayout={handleSectionLayout('keywords')}>
        <Reveal delay={180}>
            <View className="gap-2.5">
              <Text className="font-semibold text-foreground" style={{ fontSize: 16, lineHeight: 22, letterSpacing: -0.2 }}>
                And this comment has
              </Text>
              <View className="gap-2.5">
                <Card
                  className={cn(
                    'gap-3 p-4',
                    !matchAnyWord ? 'border-2 border-primary bg-primary/10' : 'border-2 border-border bg-card'
                  )}
                >
                  <Pressable
                    onPress={() => {
                      animateFormLayout();
                      setMatchAnyWord(false);
                      setTimeout(remeasureSections, 250);
                    }}
                    className="flex-row items-center gap-3"
                    accessibilityRole="radio"
                    accessibilityState={{ selected: !matchAnyWord }}
                  >
                    <View
                      className={cn(
                        'h-[22px] w-[22px] rounded-full border-2 items-center justify-center',
                        !matchAnyWord ? 'border-primary bg-primary' : 'border-border bg-transparent'
                      )}
                    >
                      {!matchAnyWord && (
                        <Ionicons name="checkmark" size={13} color={foregroundColor} />
                      )}
                    </View>
                    <View className="flex-1 gap-1">
                      <Text className="font-medium text-foreground" style={{ fontSize: 15, lineHeight: 20 }}>a specific word or words</Text>
                    </View>
                  </Pressable>
                  {!matchAnyWord ? (
                    <View className="gap-2.5">
                      <RNView ref={registerRef('keywordInput')}>
                        <Input
                      value={keywordInput}
                          placeholder="Enter a word or multiple"
                          onChangeText={handleKeywordInputChange}
                          onFocus={() => handleInputFocus('keywordInput')}
                          onBlur={handleInputBlur}
                          accessibilityLabel="Keywords"
                        />
                      </RNView>
                      <Text className="text-muted-foreground" style={{ fontSize: 14, lineHeight: 20 }}>
                        Use commas to separate words
                      </Text>
                      <View className="flex-row flex-wrap items-center gap-2">
                        <Text className="text-muted-foreground" style={{ fontSize: 14, lineHeight: 20 }}>For example:</Text>
                        {EXAMPLE_KEYWORDS.map((kw) => (
                          <PressableScale
                            key={kw}
                            onPress={() => addExampleKeyword(kw)}
                            className="h-[30px] justify-center rounded-full border border-border bg-muted px-3"
                          >
                            <Text className="text-foreground" style={{ fontSize: 13 }}>{kw}</Text>
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
                  className={cn(
                    'gap-3 p-4',
                    matchAnyWord ? 'border-2 border-primary bg-primary/10' : 'border-2 border-border bg-card'
                  )}
                >
                  <Pressable
                    onPress={() => {
                      animateFormLayout();
                      setMatchAnyWord(true);
                      setTimeout(remeasureSections, 250);
                    }}
                    className="flex-row items-center gap-3"
                    accessibilityRole="radio"
                    accessibilityState={{ selected: matchAnyWord }}
                  >
                    <View
                      className={cn(
                        'h-[22px] w-[22px] rounded-full border-2 items-center justify-center',
                        matchAnyWord ? 'border-primary bg-primary' : 'border-border bg-transparent'
                      )}
                    >
                      {matchAnyWord && (
                        <Ionicons name="checkmark" size={13} color={foregroundColor} />
                      )}
                    </View>
                    <View className="flex-1 gap-1">
                      <Text className="font-medium text-foreground" style={{ fontSize: 15, lineHeight: 20 }}>any word</Text>
                      <Text className="text-muted-foreground" style={{ fontSize: 13, lineHeight: 18 }}>
                        Every comment gets the DM — no keyword filter. Use with care.
                      </Text>
                    </View>
                  </Pressable>
                </Card>
              </View>

              {!matchAnyWord ? (
                <View className="gap-1.5">
                  <View className="flex-row rounded-lg bg-muted p-0.5">
                    {MATCH_OPTIONS.map((opt) => {
                      const selected = matchMode === opt.value;
                      return (
                        <Pressable
                          key={opt.value}
                          onPress={() => setMatchMode(opt.value)}
                          className={cn(
                            'flex-1 items-center py-1.5 rounded-md',
                            selected ? 'bg-card' : 'bg-transparent'
                          )}
                        >
                          <Text className={cn('text-sm font-medium', selected ? 'text-foreground' : 'text-muted-foreground')}>
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {matchMode === 'whole_word' && (
                    <Text className="text-muted-foreground" style={{ fontSize: 13, lineHeight: 18 }}>
                      "link" won't match "linking"
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
              <Text className="font-semibold text-foreground" style={{ fontSize: 16, lineHeight: 22, letterSpacing: -0.2 }}>
                They will get
              </Text>
              <Card className="gap-2.5 p-4 border-2 border-border bg-card">
                <Text className="font-medium text-foreground" style={{ fontSize: 15, lineHeight: 21 }}>
                  an opening DM
                </Text>
                <Text className="text-muted-foreground" style={{ fontSize: 13, lineHeight: 18 }}>
                  We'll replace {'{username}'} with the commenter's name
                </Text>
                <RNView ref={registerRef('dmMessage')}>
                  <Textarea
                    value={dmMessage}
                    placeholder="Hey there! I'm so happy you're here..."
                    onChangeText={setDmMessage}
                    onFocus={() => handleInputFocus('dmMessage')}
                    onBlur={handleInputBlur}
                    maxLength={DM_MAX_LENGTH}
                    accessibilityLabel="DM message"
                  />
                </RNView>
                <Text
                  className={cn(
                    'self-end text-muted-foreground',
                    dmMessage.length >= DM_MAX_LENGTH && 'text-destructive'
                  )}
                  style={{ fontSize: 12, lineHeight: 16 }}
                >
                  {dmMessage.length}/{DM_MAX_LENGTH}
                </Text>

                <RNView ref={registerRef('buttonText')}>
                  <Input
                    value={buttonText}
                    placeholder="Button text (e.g. Send me the link)"
                    onChangeText={setButtonText}
                    onFocus={() => handleInputFocus('buttonText')}
                    onBlur={handleInputBlur}
                    maxLength={BUTTON_TEXT_MAX_LENGTH}
                    accessibilityLabel="Button text"
                  />
                </RNView>
              </Card>

              <Card className={cn('gap-3 p-4', requireFollow ? 'border-2 border-primary bg-card' : 'border-2 border-border bg-card')}>
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1 gap-0.5">
                    <Text className="font-medium text-foreground" style={{ fontSize: 15, lineHeight: 20 }}>require them to follow you</Text>
                    <Text className="text-muted-foreground" style={{ fontSize: 13, lineHeight: 18 }}>Only send the link to people who follow your account</Text>
                  </View>
                  <Pressable
                    accessible
                    accessibilityLabel="Enable follow gate"
                    accessibilityRole="switch"
                    onPress={() => setRequireFollow(!requireFollow)}
                  >
                    <Switch
                      value={requireFollow}
                      onValueChange={setRequireFollow}
                    />
                  </Pressable>
                </View>
                {requireFollow ? (
                  <View className="gap-3 border-t border-border pt-3">
                    <Text className="text-muted-foreground" style={{ fontSize: 13, lineHeight: 18 }}>
                      Message shown to non-followers (we'll replace {'{username}'} with their name)
                    </Text>
                    <RNView ref={registerRef('followPromptMessage')}>
                      <Textarea
                        value={followPromptMessage}
                        placeholder="Follow me to unlock the link!"
                        onChangeText={setFollowPromptMessage}
                        onFocus={() => handleInputFocus('followPromptMessage')}
                        onBlur={handleInputBlur}
                        accessibilityLabel="Follow prompt message"
                      />
                    </RNView>
                    <RNView ref={registerRef('followPromptButtonLabel')}>
                      <Input
                        value={followPromptButtonLabel}
                        placeholder="Button label (e.g. Follow)"
                        onChangeText={setFollowPromptButtonLabel}
                        onFocus={() => handleInputFocus('followPromptButtonLabel')}
                        onBlur={handleInputBlur}
                        maxLength={20}
                        accessibilityLabel="Follow prompt button label"
                      />
                    </RNView>
                  </View>
                ) : null}
              </Card>

              {buttonText.trim().length > 0 ? (
                <View className="gap-2.5">
                  <Text className="font-semibold text-foreground" style={{ fontSize: 16, lineHeight: 22, letterSpacing: -0.2 }}>
                    And then, they will get
                  </Text>
                  <Card className="gap-2.5 p-4 border-2 border-border bg-card">
                    <Text className="font-medium text-foreground" style={{ fontSize: 15, lineHeight: 21 }}>
                      a DM with a link
                    </Text>
                    <Text className="text-muted-foreground" style={{ fontSize: 13, lineHeight: 18 }}>
                      Message revealed after the button is tapped
                    </Text>
                    <RNView ref={registerRef('revealMessage')}>
                      <Textarea
                        value={revealMessage}
                        placeholder="Write the message with the link..."
                        onChangeText={setRevealMessage}
                        onFocus={() => handleInputFocus('revealMessage')}
                        onBlur={handleInputBlur}
                        maxLength={REVEAL_MAX_LENGTH}
                        accessibilityLabel="Link DM message"
                      />
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
              <Card className={cn('gap-3 p-4', publicReplyEnabled ? 'border-2 border-primary bg-card' : 'border-2 border-border bg-card')}>
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1 gap-0.5">
                    <Text className="font-medium text-foreground" style={{ fontSize: 15, lineHeight: 20 }}>reply to their comments under the post</Text>
                  </View>
                  <Pressable
                    accessible
                    accessibilityLabel="Enable public reply"
                    accessibilityRole="switch"
                    onPress={() => setPublicReplyEnabled(!publicReplyEnabled)}
                  >
                    <Switch
                      value={publicReplyEnabled}
                      onValueChange={setPublicReplyEnabled}
                    />
                  </Pressable>
                </View>
                {publicReplyEnabled ? (
                  <View className="gap-3 border-t border-border pt-3">
                    <Text className="text-muted-foreground" style={{ fontSize: 13, lineHeight: 18 }}>
                      We'll replace {'{username}'} with the commenter's name
                    </Text>
                    <RNView ref={registerRef('publicReplyMessage')}>
                      <Textarea
                        value={publicReplyMessage}
                        placeholder="Write your public reply…"
                        onChangeText={setPublicReplyMessage}
                        onFocus={() => handleInputFocus('publicReplyMessage')}
                        onBlur={handleInputBlur}
                        accessibilityLabel="Public reply message"
                      />
                    </RNView>
                    <Text className="text-muted-foreground" style={{ fontSize: 13, lineHeight: 18 }}>
                      Add more replies (one per line) — one will be randomly selected each time
                    </Text>
                    <RNView ref={registerRef('publicReplyMessages')}>
                      <Textarea
                        placeholder="Thanks for commenting!&#10;Glad you liked it!&#10;Appreciate the support!"
                        onChangeText={(text) => setPublicReplyMessages(text.split('\n'))}
                        onFocus={() => handleInputFocus('publicReplyMessages')}
                        onBlur={handleInputBlur}
                        accessibilityLabel="Additional public reply messages"
                      />
                    </RNView>
                    {publicReplyMessages.filter((m) => m.trim()).length > 0 && (
                      <Text className="text-primary" style={{ fontSize: 13, lineHeight: 18 }}>
                        Pool: {publicReplyMessages.filter((m) => m.trim()).length + (publicReplyMessage.trim() ? 1 : 0)} messages
                      </Text>
                    )}
                  </View>
                ) : null}
              </Card>
            </View>
        </Reveal>

        <Reveal delay={420}>
            <View className="gap-2.5">
              <Card className={cn('gap-3 p-4', followUpEnabled ? 'border-2 border-primary bg-card' : 'border-2 border-border bg-card')}>
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1 gap-0.5">
                    <Text className="font-medium text-foreground" style={{ fontSize: 15, lineHeight: 20 }}>send a follow-up message</Text>
                    <Text className="text-muted-foreground" style={{ fontSize: 13, lineHeight: 18 }}>Send an appreciation message after the link is delivered</Text>
                  </View>
                  <Pressable
                    accessible
                    accessibilityLabel="Enable follow-up message"
                    accessibilityRole="switch"
                    onPress={() => setFollowUpEnabled(!followUpEnabled)}
                  >
                    <Switch
                      value={followUpEnabled}
                      onValueChange={setFollowUpEnabled}
                    />
                  </Pressable>
                </View>
                {followUpEnabled ? (
                  <View className="gap-3 border-t border-border pt-3">
                    <Text className="text-muted-foreground" style={{ fontSize: 13, lineHeight: 18 }}>
                      We'll replace {'{username}'} with the commenter's name
                    </Text>
                    <RNView ref={registerRef('followUpMessage')}>
                      <Textarea
                        value={followUpMessage}
                        placeholder="Thanks for your interest! Let me know if you have any questions 😊"
                        onChangeText={setFollowUpMessage}
                        onFocus={() => handleInputFocus('followUpMessage')}
                        onBlur={handleInputBlur}
                        accessibilityLabel="Follow-up message"
                      />
                    </RNView>
                    <Text className="text-muted-foreground" style={{ fontSize: 13, lineHeight: 18 }}>
                      Delay before sending (in minutes)
                    </Text>
                    <RNView ref={registerRef('followUpDelayMinutes')}>
                      <Input
                        value={followUpDelayMinutes ? String(followUpDelayMinutes) : ''}
                        placeholder="1440 (24 hours)"
                        onChangeText={(text) => {
                          const num = parseInt(text, 10);
                          if (!isNaN(num) && num > 0) {
                            setFollowUpDelayMinutes(num);
                          } else if (text === '') {
                            setFollowUpDelayMinutes(0);
                          }
                        }}
                        onFocus={() => handleInputFocus('followUpDelayMinutes')}
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
                    </RNView>
                  </View>
                ) : null}
              </Card>
            </View>
        </Reveal>

        {/* Preview */}
        <Reveal delay={480}>
          <View className="gap-2.5">
            <Text className="font-semibold text-foreground" style={{ fontSize: 16, lineHeight: 22, letterSpacing: -0.2 }}>
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
                  <View className="rounded-full bg-primary/15 px-3 py-1.5">
                    <Text className="font-medium text-primary" style={{ fontSize: 13 }}>
                      Triggers on any comment
                    </Text>
                  </View>
                ) : (
                  keywords.map((kw) => (
                    <View key={kw} className="rounded-full bg-secondary/15 px-3 py-1.5">
                      <Text className="font-medium text-secondary-foreground" style={{ fontSize: 13 }}>
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
        className="border-t border-border bg-background px-4 pt-2.5 gap-2"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        {submitError === 'instagram_not_connected' && (
          <>
            <View className="border border-destructive/30 rounded-md bg-destructive/10 px-3.5 py-3">
              <Text className="text-destructive" style={{ fontSize: 14, lineHeight: 20 }}>
                Instagram account not connected. Connect your account to enable automations.
              </Text>
            </View>
            <Button
              fullWidth
              loading={isConnectingIg}
              onPress={async () => {
                setIsConnectingIg(true);
                try {
                  await connectInstagram();
                } catch {
                } finally {
                  setIsConnectingIg(false);
                }
              }}
            >
              Connect Instagram
            </Button>
          </>
        )}
        {submitError && submitError !== 'instagram_not_connected' && (
          <Text className="text-center text-destructive" style={{ fontSize: 14 }}>{submitError}</Text>
        )}
        {!isValid && !submitError && submitAttempted && validationErrors.length > 0 && (
          <Text className="text-center text-muted-foreground" style={{ fontSize: 12, lineHeight: 16 }}>
            {validationErrors[0]}
          </Text>
        )}
        <Button
          onPress={() => handleSubmit(true)}
          disabled={!isValid || savingPaused}
          loading={creating}
          fullWidth
        >
          Go Live
        </Button>
        <PressableScale
          onPress={() => handleSubmit(false)}
          disabled={!isValid || creating || savingPaused}
          accessibilityLabel="Save as paused"
          accessibilityRole="button"
          style={{ alignSelf: 'center' }}
        >
          <Text className={cn('font-semibold text-muted-foreground text-sm', (!isValid || creating || savingPaused) && 'opacity-40')}>
            {savingPaused ? 'Saving…' : 'Save as paused'}
          </Text>
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}
