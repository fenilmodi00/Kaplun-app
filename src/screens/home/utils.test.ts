import type { Creator } from '@/lib/types';
import { getGreeting, getInitials, hasUsableToken, profileFromCreator } from './utils';

describe('getGreeting', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns "Good morning" at hour 0', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 0, 1, 0, 0, 0));
    expect(getGreeting()).toBe('Good morning');
  });

  it('returns "Good morning" before hour 12', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 0, 1, 8, 30, 0));
    expect(getGreeting()).toBe('Good morning');
  });

  it('returns "Good afternoon" at hour 12', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    expect(getGreeting()).toBe('Good afternoon');
  });

  it('returns "Good afternoon" before hour 18', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 0, 1, 17, 59, 59));
    expect(getGreeting()).toBe('Good afternoon');
  });

  it('returns "Good evening" at hour 18', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 0, 1, 18, 0, 0));
    expect(getGreeting()).toBe('Good evening');
  });

  it('returns "Good evening" at hour 23', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 0, 1, 23, 59, 59));
    expect(getGreeting()).toBe('Good evening');
  });
});

describe('getInitials', () => {
  it('returns first two initials for a multi-word name', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('returns only the first initial for a single name', () => {
    expect(getInitials('John')).toBe('J');
  });

  it('returns "K" fallback for an empty string', () => {
    expect(getInitials('')).toBe('K');
  });

  it('returns "K" fallback for a whitespace-only string', () => {
    expect(getInitials('   ')).toBe('K');
  });

  it('treats a hyphenated name as one word (one initial)', () => {
    expect(getInitials('Mary-Jane')).toBe('M');
  });

  it('takes only the first two initials for a long name', () => {
    expect(getInitials('John Michael Doe')).toBe('JM');
  });
});

describe('hasUsableToken', () => {
  const base = { access_token: '' } as unknown as Creator;

  it('returns true when access_token is a non-empty string', () => {
    expect(hasUsableToken({ ...base, access_token: 'ig-token' } as Creator)).toBe(true);
  });

  it('returns false when access_token is an empty string', () => {
    expect(hasUsableToken({ ...base, access_token: '' } as Creator)).toBe(false);
  });

  it('returns false when creator is null', () => {
    expect(hasUsableToken(null)).toBe(false);
  });
});

describe('profileFromCreator', () => {
  it('maps a minimal creator row to the profile shape', () => {
    const creator = {
      $id: 'doc-1',
      ig_user_id: 'ig-123',
      username: 'creator_handle',
      ig_username: 'legacy_handle',
      full_name: 'Creator Name',
      bio: 'My bio',
      external_url: 'https://example.com',
      follower_count: 100,
      following_count: 50,
      media_count: 10,
      post_count: 12,
      profile_pic_url: 'https://pic.url/me.jpg',
    } as unknown as Creator;

    expect(profileFromCreator(creator)).toEqual({
      id: 'ig-123',
      username: 'creator_handle',
      name: 'Creator Name',
      biography: 'My bio',
      website: 'https://example.com',
      followers_count: 100,
      follows_count: 50,
      media_count: 10,
      profile_picture_url: 'https://pic.url/me.jpg',
    });
  });

  it('falls back to $id when ig_user_id is empty and to ig_username when username is empty', () => {
    const creator = {
      $id: 'doc-fallback',
      ig_user_id: '',
      username: '',
      ig_username: 'legacy',
      full_name: '',
      bio: '',
      external_url: '',
      follower_count: 0,
      following_count: 0,
      media_count: 0,
      post_count: 0,
      profile_pic_url: '',
    } as unknown as Creator;

    const profile = profileFromCreator(creator);
    expect(profile.id).toBe('doc-fallback');
    expect(profile.username).toBe('legacy');
  });
});
