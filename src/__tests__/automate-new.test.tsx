/**
 * Campaign builder screen tests.
 *
 * Covers validation pure function and UI behavior.
 */

jest.mock('@/hooks/useAutomations', () => ({
  useAutomations: jest.fn(),
}));

jest.mock('@/lib/instagram', () => ({
  fetchMedia: jest.fn(),
}));

jest.mock('@/lib/with-fresh-session', () => ({
  withFreshSession: jest.fn((_fn: any, _getToken: any) => _fn()),
}));

import React from 'react';
import { render, waitFor, fireEvent, cleanup, act } from '@testing-library/react-native';
import NewAutomationScreen from '@/app/(tabs)/(automate)/new';
import { useAutomations } from '@/hooks/useAutomations';
import { fetchMedia } from '@/lib/instagram';
import { validateAutomationDraft } from '@/lib/automation-validation';
import type { AutomationDraft } from '@/lib/automation-validation';

const mockUseAutomations = useAutomations as jest.Mock;
const mockFetchMedia = fetchMedia as jest.Mock;

function makeDraft(overrides: Partial<AutomationDraft> = {}): AutomationDraft {
  return {
    name: '',
    targetType: 'all_posts',
    selectedMediaIds: [],
    keywords: [],
    matchMode: 'whole_word',
    dmMessage: '',
    publicReplyEnabled: false,
    publicReplyMessage: '',
    ...overrides,
  };
}

describe('validateAutomationDraft', () => {
  it('returns empty array when draft is fully valid', () => {
    const draft = makeDraft({
      name: 'Welcome campaign',
      keywords: ['hello'],
      dmMessage: 'Thanks for commenting!',
    });
    expect(validateAutomationDraft(draft)).toEqual([]);
  });

  it('errors when name is empty', () => {
    const draft = makeDraft({ keywords: ['hello'], dmMessage: 'Hi!' });
    expect(validateAutomationDraft(draft)).toContain('Campaign name is required');
  });

  it('errors when name is whitespace only', () => {
    const draft = makeDraft({ name: '   ', keywords: ['hello'], dmMessage: 'Hi!' });
    expect(validateAutomationDraft(draft)).toContain('Campaign name is required');
  });

  it('errors when no keywords provided', () => {
    const draft = makeDraft({ name: 'Test', dmMessage: 'Hi!' });
    expect(validateAutomationDraft(draft)).toContain('At least one keyword is required');
  });

  it('errors when dm_message is empty', () => {
    const draft = makeDraft({ name: 'Test', keywords: ['hello'] });
    expect(validateAutomationDraft(draft)).toContain('DM message is required');
  });

  it('errors when dm_message is whitespace only', () => {
    const draft = makeDraft({ name: 'Test', keywords: ['hello'], dmMessage: '   ' });
    expect(validateAutomationDraft(draft)).toContain('DM message is required');
  });

  it('errors when target is specific_posts but no media selected', () => {
    const draft = makeDraft({
      name: 'Test',
      keywords: ['hello'],
      dmMessage: 'Hi!',
      targetType: 'specific_posts',
      selectedMediaIds: [],
    });
    expect(validateAutomationDraft(draft)).toContain('Select at least one post');
  });

  it('passes when target is specific_posts and media are selected', () => {
    const draft = makeDraft({
      name: 'Test',
      keywords: ['hello'],
      dmMessage: 'Hi!',
      targetType: 'specific_posts',
      selectedMediaIds: ['media_1'],
    });
    expect(validateAutomationDraft(draft)).toEqual([]);
  });

  it('errors when public_reply_enabled is true but message is empty', () => {
    const draft = makeDraft({
      name: 'Test',
      keywords: ['hello'],
      dmMessage: 'Hi!',
      publicReplyEnabled: true,
      publicReplyMessage: '',
    });
    expect(validateAutomationDraft(draft)).toContain(
      'Public reply text is required when enabled'
    );
  });

  it('passes when public_reply_enabled is true and message is provided', () => {
    const draft = makeDraft({
      name: 'Test',
      keywords: ['hello'],
      dmMessage: 'Hi!',
      publicReplyEnabled: true,
      publicReplyMessage: 'Thanks!',
    });
    expect(validateAutomationDraft(draft)).toEqual([]);
  });

  it('returns multiple errors when multiple fields are invalid', () => {
    const draft = makeDraft();
    const errors = validateAutomationDraft(draft);
    expect(errors).toContain('Campaign name is required');
    expect(errors).toContain('At least one keyword is required');
    expect(errors).toContain('DM message is required');
  });
});

describe('NewAutomationScreen', () => {
  afterEach(async () => {
    await act(async () => {});
    cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAutomations.mockReturnValue({
      createAutomation: jest.fn().mockResolvedValue({}),
      creating: false,
    });
    mockFetchMedia.mockResolvedValue([]);
  });

  it('renders all form sections', async () => {
    const { getByLabelText, getByText } = await render(<NewAutomationScreen />);
    expect(getByLabelText('Campaign name')).toBeTruthy();
    expect(getByLabelText('Keyword input')).toBeTruthy();
    expect(getByLabelText('DM message')).toBeTruthy();
    expect(getByLabelText('Enable public reply')).toBeTruthy();
    expect(getByText('Activate campaign')).toBeTruthy();
  });

  it('does not submit when required fields are empty', async () => {
    const mockCreate = jest.fn().mockResolvedValue({});
    mockUseAutomations.mockReturnValue({
      createAutomation: mockCreate,
      creating: false,
    });

    const { getByText } = await render(<NewAutomationScreen />);
    await fireEvent(getByText('Activate campaign'), 'press');

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('submits when required fields are filled', async () => {
    const mockCreate = jest.fn().mockResolvedValue({});
    mockUseAutomations.mockReturnValue({
      createAutomation: mockCreate,
      creating: false,
    });

    const { getByLabelText, getByText } = await render(<NewAutomationScreen />);

    await fireEvent.changeText(getByLabelText('Campaign name'), 'Test Campaign');
    await fireEvent.changeText(getByLabelText('Keyword input'), 'hello');
    await fireEvent(getByText('Add'), 'press');
    await fireEvent.changeText(getByLabelText('DM message'), 'Thanks for your comment!');

    await fireEvent(getByText('Activate campaign'), 'press');

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  it('shows media picker when Specific posts is selected', async () => {
    mockFetchMedia.mockResolvedValue([
      { id: 'media_1', caption: 'First post', media_type: 'IMAGE' },
      { id: 'media_2', caption: 'Second post', media_type: 'VIDEO' },
    ]);

    const { getByText } = await render(<NewAutomationScreen />);

    await fireEvent(getByText('Specific posts'), 'press');

    await waitFor(() => {
      expect(getByText('First post')).toBeTruthy();
      expect(getByText('Second post')).toBeTruthy();
    });
  });

  it('shows explainer when Next reel is selected', async () => {
    const { getByText } = await render(<NewAutomationScreen />);
    await fireEvent(getByText('Next reel'), 'press');
    expect(
      getByText('Automatically applies to every new reel you post')
    ).toBeTruthy();
  });

  it('shows public reply input when toggle is on', async () => {
    const { getByLabelText, queryByLabelText } = await render(<NewAutomationScreen />);
    expect(queryByLabelText('Public reply message')).toBeNull();

    await fireEvent(getByLabelText('Enable public reply'), 'valueChange', true);

    expect(getByLabelText('Public reply message')).toBeTruthy();
  });

  it('does not submit when public reply is enabled but empty', async () => {
    const mockCreate = jest.fn().mockResolvedValue({});
    mockUseAutomations.mockReturnValue({
      createAutomation: mockCreate,
      creating: false,
    });

    const { getByLabelText, getByText } = await render(<NewAutomationScreen />);

    await fireEvent.changeText(getByLabelText('Campaign name'), 'Test');
    await fireEvent.changeText(getByLabelText('Keyword input'), 'hello');
    await fireEvent(getByText('Add'), 'press');
    await fireEvent.changeText(getByLabelText('DM message'), 'Hi!');

    await fireEvent(getByLabelText('Enable public reply'), 'valueChange', true);

    await fireEvent(getByText('Activate campaign'), 'press');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('calls createAutomation with correct payload on submit', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ $id: 'auto_1' });
    mockUseAutomations.mockReturnValue({
      createAutomation: mockCreate,
      creating: false,
    });

    const { getByLabelText, getByText } = await render(<NewAutomationScreen />);

    await fireEvent.changeText(getByLabelText('Campaign name'), 'Test Campaign');
    await fireEvent.changeText(getByLabelText('Keyword input'), 'hello');
    await fireEvent(getByText('Add'), 'press');
    await fireEvent.changeText(getByLabelText('DM message'), 'Thanks!');

    await fireEvent(getByText('Activate campaign'), 'press');

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.name).toBe('Test Campaign');
    expect(callArg.target_type).toBe('all_posts');
    expect(callArg.keywords).toEqual(['hello']);
    expect(callArg.dm_message).toBe('Thanks!');
    expect(callArg.public_reply_enabled).toBe(false);
  });

  it('shows instagram_not_connected gate on 409 error', async () => {
    const mockCreate = jest.fn().mockRejectedValue(
      new Error('automations request failed (409): {"detail":"instagram_not_connected"}')
    );
    mockUseAutomations.mockReturnValue({
      createAutomation: mockCreate,
      creating: false,
    });

    const { getByLabelText, getByText, findByText } = await render(<NewAutomationScreen />);

    await fireEvent.changeText(getByLabelText('Campaign name'), 'Test');
    await fireEvent.changeText(getByLabelText('Keyword input'), 'hello');
    await fireEvent(getByText('Add'), 'press');
    await fireEvent.changeText(getByLabelText('DM message'), 'Thanks!');

    await fireEvent(getByText('Activate campaign'), 'press');

    expect(
      await findByText(/Instagram account not connected/)
    ).toBeTruthy();
  });
});
