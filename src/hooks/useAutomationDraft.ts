/**
 * Draft domain logic for the campaign builder (`automate/new`).
 *
 * Owns all draft state, keyword/message handlers, settings toggles, the
 * `AutomationDraft` shape, validation, and the create flow. The screen renders
 * from the returned values and wires callbacks to PanelUI components.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAutomations } from '@/hooks/useAutomations';
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
import type { InstagramMediaResponse } from '@/lib/instagram';
import { addLog } from '@/lib/logger';

export function useAutomationDraft(
  templates: CampaignTemplate[],
  media: InstagramMediaResponse[],
) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { createAutomation, creating } = useAutomations();

  // ── Form state ───────────────────────────────────────────────────────────────
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
  const [savingPaused, setSavingPaused] = useState(false);
  const [selectedTemplateSlug, setSelectedTemplateSlug] = useState<string | null>(null);

  // Derive opening DM mode from button text presence
  useEffect(() => {
    setOpeningDmMode(buttonText.trim() ? 'button' : 'direct');
  }, [buttonText]);

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
    const lowerKeywords = tmpl.keywords.map((k) => k.toLowerCase());
    setKeywords(lowerKeywords);
    const kwInput = lowerKeywords.join(', ');
    setKeywordInput(kwInput);
    setDmMessage(tmpl.dm_message);
  }, [templates]);

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

  return {
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
    openingDmMode,
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
    draft,
    validationErrors,
    isValid,
    handleSubmit,
    handleKeywordInputChange,
    addExampleKeyword,
    handleRemoveKeyword,
    toggleMedia,
    applyTemplate,
    selectedPreviewMedia,
  };
}
