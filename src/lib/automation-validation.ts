/**
 * Pure validation for automation draft forms.
 *
 * Exported so it can be unit-tested without rendering React components.
 */

export interface AutomationDraft {
  name: string;
  targetType: 'all_posts' | 'specific_posts' | 'next_reel';
  selectedMediaIds: string[];
  keywords: string[];
  matchMode: 'whole_word' | 'partial';
  matchAnyWord: boolean;
  dmMessage: string;
  openingDmMode: 'direct' | 'button';
  buttonText: string;
  revealMessage: string;
  publicReplyEnabled: boolean;
  publicReplyMessage: string;
  publicReplyMessages: string[];
  requireFollow: boolean;
  followPromptMessage: string;
  followPromptButtonLabel: string;
  followUpEnabled: boolean;
  followUpMessage: string;
  followUpDelayMinutes: number;
  dmTriggerEnabled: boolean;
}

/**
 * Validates an automation draft. Returns an array of human-readable error
 * strings. An empty array means the draft is valid.
 */
export function validateAutomationDraft(draft: AutomationDraft): string[] {
  const errors: string[] = [];

  if (!draft.name.trim()) {
    errors.push('Campaign name is required');
  }

  if (!draft.matchAnyWord && draft.keywords.length === 0) {
    errors.push('At least one keyword is required');
  }

  if (!draft.dmMessage.trim()) {
    errors.push('DM message is required');
  }

  if (draft.targetType === 'specific_posts' && draft.selectedMediaIds.length === 0) {
    errors.push('Select at least one post');
  }

  if (draft.publicReplyEnabled && !draft.publicReplyMessage.trim() && (!draft.publicReplyMessages || draft.publicReplyMessages.length === 0)) {
    errors.push('Public reply text is required when enabled');
  }

  if (draft.openingDmMode === 'button') {
    if (!draft.buttonText.trim()) {
      errors.push('Button text is required in button mode');
    }
    if (!draft.revealMessage.trim()) {
      errors.push('Reveal message is required in button mode');
    }
  }

  if (draft.requireFollow) {
    if (!draft.followPromptMessage.trim()) {
      errors.push('Follow prompt message is required when follow gate is enabled');
    }
    if (!draft.followPromptButtonLabel.trim()) {
      errors.push('Follow prompt button label is required when follow gate is enabled');
    }
  }

  if (draft.followUpEnabled) {
    if (!draft.followUpMessage.trim()) {
      errors.push('Follow-up message is required when follow-up is enabled');
    }
    if (!draft.followUpDelayMinutes || draft.followUpDelayMinutes < 1 || draft.followUpDelayMinutes > 1440) {
      errors.push('Follow-up delay must be between 1 and 1440 minutes');
    }
  }

  return errors;
}
