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
  dmMessage: string;
  publicReplyEnabled: boolean;
  publicReplyMessage: string;
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

  if (draft.keywords.length === 0) {
    errors.push('At least one keyword is required');
  }

  if (!draft.dmMessage.trim()) {
    errors.push('DM message is required');
  }

  if (draft.targetType === 'specific_posts' && draft.selectedMediaIds.length === 0) {
    errors.push('Select at least one post');
  }

  if (draft.publicReplyEnabled && !draft.publicReplyMessage.trim()) {
    errors.push('Public reply text is required when enabled');
  }

  return errors;
}
