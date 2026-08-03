/**
 * Campaign builder screen tests.
 *
 * Covers validation pure function and UI behavior.
 */

jest.mock('@/hooks/useAutomations', () => ({
  useAutomations: jest.fn(),
}));

jest.mock('@/hooks/useAutomationGate', () => ({
  useAutomationGate: jest.fn(),
}));

jest.mock('@/lib/instagram', () => ({
  fetchMedia: jest.fn(),
}));

jest.mock('@/lib/automations', () => ({
  listCampaignTemplates: jest.fn().mockResolvedValue([]),
  updateAutomation: jest.fn().mockResolvedValue({}),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: jest.fn().mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import React from 'react';
import { render, waitFor, fireEvent, cleanup, act } from '@testing-library/react-native';
import NewAutomationScreen from '@/app/(tabs)/(automate)/new';
import { useAutomations } from '@/hooks/useAutomations';
import { useAutomationGate } from '@/hooks/useAutomationGate';
import { fetchMedia } from '@/lib/instagram';
import { updateAutomation } from '@/lib/automations';
import { validateAutomationDraft } from '@/lib/automation-validation';
import type { AutomationDraft } from '@/lib/automation-validation';

const mockUseAutomations = useAutomations as jest.Mock;
const mockUseAutomationGate = useAutomationGate as jest.Mock;
const mockFetchMedia = fetchMedia as jest.Mock;

function makeDraft(overrides: Partial<AutomationDraft> = {}): AutomationDraft {
  return {
    name: '',
    targetType: 'all_posts',
    selectedMediaIds: [],
    keywords: [],
    matchMode: 'whole_word',
    matchAnyWord: false,
    dmMessage: '',
    openingDmMode: 'direct',
    buttonText: '',
    revealMessage: '',
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

  it('passes with no keywords when matchAnyWord is true', () => {
    const draft = makeDraft({ name: 'Test', dmMessage: 'Hi!', matchAnyWord: true });
    expect(validateAutomationDraft(draft)).toEqual([]);
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
    jest.mocked(useAutomationGate).mockReturnValue({
      connected: true,
      loading: false,
      connect: jest.fn().mockResolvedValue(undefined),
    });
  });

  it('renders all form sections', async () => {
    const { getByLabelText, getByText } = await render(<NewAutomationScreen />);
    expect(getByLabelText('Automation name')).toBeTruthy();
    expect(getByLabelText('Keywords')).toBeTruthy();
    expect(getByLabelText('DM message')).toBeTruthy();
    expect(getByLabelText('Enable public reply')).toBeTruthy();
    expect(getByText('Go Live')).toBeTruthy();
  });

  it('does not submit when required fields are empty', async () => {
    const mockCreate = jest.fn().mockResolvedValue({});
    mockUseAutomations.mockReturnValue({
      createAutomation: mockCreate,
      creating: false,
    });

    const { getByText } = await render(<NewAutomationScreen />);
    await fireEvent(getByText('Go Live'), 'press');

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('submits when required fields are filled', async () => {
    const mockCreate = jest.fn().mockResolvedValue({});
    mockUseAutomations.mockReturnValue({
      createAutomation: mockCreate,
      creating: false,
    });

    const { getByLabelText, getByText } = await render(<NewAutomationScreen />);

    await fireEvent.changeText(getByLabelText('Automation name'), 'Test Campaign');
    await fireEvent.changeText(getByLabelText('Keywords'), 'hello');
    await fireEvent(getByText('any post or reel'), 'press');
    await fireEvent.changeText(getByLabelText('DM message'), 'Thanks for your comment!');

    await fireEvent(getByText('Go Live'), 'press');

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  it('shows media picker when specific post or reel is selected', async () => {
    mockFetchMedia.mockResolvedValue([
      { id: 'media_1', caption: 'First post', media_type: 'IMAGE' },
      { id: 'media_2', caption: 'Second post', media_type: 'VIDEO' },
    ]);

    const { getByLabelText } = await render(<NewAutomationScreen />);

    await waitFor(() => {
      expect(getByLabelText('First post')).toBeTruthy();
      expect(getByLabelText('Second post')).toBeTruthy();
    });
  });

  it('shows explainer when next post or reel is selected', async () => {
    const { getByText } = await render(<NewAutomationScreen />);
    await fireEvent(getByText('next post or reel'), 'press');
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

    await fireEvent.changeText(getByLabelText('Automation name'), 'Test');
    await fireEvent.changeText(getByLabelText('Keywords'), 'hello');
    await fireEvent(getByText('any post or reel'), 'press');
    await fireEvent.changeText(getByLabelText('DM message'), 'Hi!');

    await fireEvent(getByLabelText('Enable public reply'), 'valueChange', true);

    await fireEvent(getByText('Go Live'), 'press');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('calls createAutomation with correct payload on submit', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ $id: 'auto_1' });
    mockUseAutomations.mockReturnValue({
      createAutomation: mockCreate,
      creating: false,
    });

    const { getByLabelText, getByText } = await render(<NewAutomationScreen />);

    await fireEvent.changeText(getByLabelText('Automation name'), 'Test Campaign');
    await fireEvent.changeText(getByLabelText('Keywords'), 'hello');
    await fireEvent(getByText('any post or reel'), 'press');
    await fireEvent.changeText(getByLabelText('DM message'), 'Thanks!');

    await fireEvent(getByText('Go Live'), 'press');

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

    await fireEvent.changeText(getByLabelText('Automation name'), 'Test');
    await fireEvent.changeText(getByLabelText('Keywords'), 'hello');
    await fireEvent(getByText('any post or reel'), 'press');
    await fireEvent.changeText(getByLabelText('DM message'), 'Thanks!');

    await fireEvent(getByText('Go Live'), 'press');

    expect(
      await findByText(/Instagram account not connected/)
    ).toBeTruthy();
  });

  it('submits with match_any_word and no keywords when any word is selected', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ $id: 'auto_1' });
    mockUseAutomations.mockReturnValue({
      createAutomation: mockCreate,
      creating: false,
    });

    const { getByLabelText, getByText, queryByLabelText } = await render(<NewAutomationScreen />);

    await fireEvent.changeText(getByLabelText('Automation name'), 'Test Campaign');
    await fireEvent(getByText('any post or reel'), 'press');
    await fireEvent(getByText('any word'), 'press');
    await fireEvent.changeText(getByLabelText('DM message'), 'Thanks!');

    expect(queryByLabelText('Keywords')).toBeNull();

    await fireEvent(getByText('Go Live'), 'press');

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.match_any_word).toBe(true);
    expect(callArg.keywords).toEqual([]);
  });

  it('save as paused creates then patches status to paused', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ $id: 'auto_1' });
    const mockRefresh = jest.fn();
    mockUseAutomations.mockReturnValue({
      createAutomation: mockCreate,
      creating: false,
      refresh: mockRefresh,
    });
    const mockUpdate = jest.mocked(updateAutomation);
    mockUpdate.mockResolvedValue({} as never);

    const { getByLabelText, getByText } = await render(<NewAutomationScreen />);

    await fireEvent.changeText(getByLabelText('Automation name'), 'Test');
    await fireEvent.changeText(getByLabelText('Keywords'), 'hello');
    await fireEvent(getByText('any post or reel'), 'press');
    await fireEvent.changeText(getByLabelText('DM message'), 'Hi!');

    await fireEvent(getByText('Save as paused'), 'press');

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockUpdate).toHaveBeenCalledWith(expect.any(Function), 'auto_1', { status: 'paused' });
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});
