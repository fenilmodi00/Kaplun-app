/**
 * Instagram DM-style automation preview.
 * Simulates the commenter's inbox: creator messages on the left,
 * fan tap-reply on the right, then the reveal DM.
 */

import React, { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from 'panelui-native';
import { useCreatorProfile } from '@/hooks/useCreatorProfile';
import { View, Text, ScrollView } from '@/tw';
import { Image } from '@/tw/image';
import type { InstagramMediaResponse } from '@/lib/instagram';

const SAMPLE_FAN = '@yourfan';
const IG_BLUE = '#0095F6';
const IG_MUTED = '#a8a8a8';
const IG_BG = '#000000';
const IG_RECEIVED = '#262626';
const IG_SENT = '#8e3ad8';
const FAN_REPLY = 'Sure!';

function formatCount(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return m >= 10 ? `${Math.round(m)}M` : `${m.toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

function substituteUsername(text: string): string {
  return text.replace(/{username}/gi, SAMPLE_FAN);
}

function initials(name: string): string {
  const letters = name.trim().split(/\s+/).map((word) => word.charAt(0)).join('');
  return letters.slice(0, 2).toUpperCase() || '?';
}

function VerifiedBadge({ size = 14 }: { size?: number }) {
  return <Ionicons name="checkmark-circle" size={size} color={IG_BLUE} />;
}

/** IG structured message: text body + embedded tap button in one card */
function StructuredMessage({ body, buttonLabel }: { body: string; buttonLabel: string }) {
  return (
    <View className="max-w-[85%] self-start overflow-hidden rounded-2xl" style={{ backgroundColor: IG_RECEIVED }}>
      {body.length > 0 ? (
        <View className="px-3.5 pt-3 pb-2.5">
          <Text style={{ fontSize: 14, lineHeight: 20, color: '#ffffff' }} selectable>
            {body}
          </Text>
        </View>
      ) : null}
      <View style={{ height: 1, backgroundColor: '#3a3a3a' }} />
      <View className="items-center px-3.5 py-2.5">
        <Text className="font-semibold" style={{ fontSize: 14, lineHeight: 18, color: '#ffffff' }}>
          {buttonLabel}
        </Text>
      </View>
    </View>
  );
}

function ReceivedBubble({ children }: { children: React.ReactNode }) {
  return (
    <View className="max-w-[85%] self-start rounded-[20px] rounded-bl-sm px-3.5 py-2.5" style={{ backgroundColor: IG_RECEIVED }}>
      {children}
    </View>
  );
}

function SentBubble({ children }: { children: React.ReactNode }) {
  return (
    <LinearGradient
      colors={['#5B51D8', '#C13584']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ maxWidth: '85%', alignSelf: 'flex-end', borderRadius: 20, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10 }}
    >
      {children}
    </LinearGradient>
  );
}

function PreviewHeader({
  avatarUri,
  displayName,
  username,
  isVerified,
}: {
  avatarUri?: string;
  displayName: string;
  username: string;
  isVerified: boolean;
}) {
  return (
    <View className="flex-row items-center border-b px-3 py-2.5" style={{ borderColor: '#262626', backgroundColor: IG_BG }}>
      <Ionicons name="chevron-back" size={22} color="#ffffff" />
      <Avatar
        source={avatarUri ? { uri: avatarUri } : undefined}
        fallback={initials(displayName)}
        size="sm"
        className="ml-1"
      />
      <View className="ml-2 flex-1" style={{ minWidth: 0 }}>
        <View className="flex-row items-center gap-1">
          <Text className="font-bold" style={{ fontSize: 16, lineHeight: 20, color: '#ffffff' }} numberOfLines={1}>
            {displayName}
          </Text>
          {isVerified ? <VerifiedBadge size={15} /> : null}
        </View>
        <Text style={{ fontSize: 13, lineHeight: 17, color: IG_MUTED }} numberOfLines={1}>
          {username}
        </Text>
      </View>
      <View className="flex-row items-center gap-4 pr-1">
        <Ionicons name="call-outline" size={20} color="#ffffff" />
        <Ionicons name="videocam-outline" size={22} color="#ffffff" />
        <Ionicons name="information-circle-outline" size={22} color="#ffffff" />
      </View>
    </View>
  );
}

function MessageInputBar() {
  return (
    <View className="flex-row items-center gap-2.5 px-3 py-2" style={{ backgroundColor: IG_BG, borderTopWidth: 1, borderTopColor: '#262626' }}>
      <View className="h-9 w-9 items-center justify-center rounded-pill" style={{ backgroundColor: IG_BLUE }}>
        <Ionicons name="camera" size={20} color="#ffffff" />
      </View>
      <View
        className="h-10 flex-1 flex-row items-center rounded-[22px] px-4"
        style={{ backgroundColor: '#262626' }}
      >
        <Text style={{ flex: 1, fontSize: 14, color: IG_MUTED }}>Message…</Text>
        <View className="flex-row items-center gap-3">
          <Ionicons name="mic-outline" size={18} color="#ffffff" />
          <Ionicons name="image-outline" size={18} color="#ffffff" />
          <Ionicons name="add-circle-outline" size={18} color="#ffffff" />
        </View>
      </View>
    </View>
  );
}

export interface AutomationDmPreviewProps {
  dmMessage: string;
  buttonText: string;
  revealMessage: string;
  requireFollow: boolean;
  followPromptMessage: string;
  followPromptButtonLabel: string;
  followUpEnabled: boolean;
  followUpMessage: string;
  selectedMedia?: InstagramMediaResponse | null;
}

export function AutomationDmPreview({
  dmMessage,
  buttonText,
  revealMessage,
  requireFollow,
  followPromptMessage,
  followPromptButtonLabel,
  followUpEnabled,
  followUpMessage,
  selectedMedia,
}: AutomationDmPreviewProps) {
  const { creator, isLoading } = useCreatorProfile();

  const profile = useMemo(() => {
    if (!creator) {
      return {
        avatarUri: undefined,
        displayName: 'Your account',
        username: 'your_account',
        isVerified: false,
        followerCount: 0,
        postCount: 0,
      };
    }
    const username = creator.username || creator.ig_username || 'your_account';
    const handle = username.startsWith('@') ? username : `@${username}`;
    return {
      avatarUri: creator.profile_pic_url || undefined,
      displayName: creator.full_name?.trim() || username.replace(/^@/, ''),
      username: handle.replace(/^@/, ''),
      isVerified: creator.is_verified ?? false,
      followerCount: creator.follower_count ?? 0,
      postCount: creator.media_count ?? creator.post_count ?? 0,
    };
  }, [creator]);

  const openingText = substituteUsername(dmMessage.trim());
  const followText = substituteUsername(followPromptMessage.trim());
  const revealText = substituteUsername(revealMessage.trim());
  const followUpText = substituteUsername(followUpMessage.trim());
  const hasButton = buttonText.trim().length > 0;
  const buttonLabel = buttonText.trim() || 'Tap here';
  const hasFlow =
    openingText.length > 0 ||
    hasButton ||
    (requireFollow && followText.length > 0) ||
    revealText.length > 0 ||
    (followUpEnabled && followUpText.length > 0);

  const mediaUri = selectedMedia?.thumbnail_url ?? selectedMedia?.media_url ?? undefined;

  return (
    <View className="overflow-hidden rounded-2xl border-2 border-hairline" style={{ backgroundColor: IG_BG }}>
      <PreviewHeader
        avatarUri={profile.avatarUri}
        displayName={isLoading ? '…' : profile.displayName}
        username={isLoading ? 'loading' : profile.username}
        isVerified={profile.isVerified}
      />

      <View style={{ height: 440 }}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <View className="items-center py-10">
              <Text style={{ fontSize: 14, color: IG_MUTED }}>Loading profile…</Text>
            </View>
          ) : !hasFlow ? (
            <View className="items-center gap-2 px-4 py-6">
              <Avatar
                source={profile.avatarUri ? { uri: profile.avatarUri } : undefined}
                fallback={initials(profile.displayName)}
                size="xl"
              />
              <View className="flex-row items-center gap-1.5">
                <Text className="font-bold" style={{ fontSize: 16, color: '#ffffff' }}>
                  {profile.displayName}
                </Text>
                {profile.isVerified ? <VerifiedBadge size={15} /> : null}
              </View>
              <Text className="text-center" style={{ fontSize: 14, color: IG_MUTED }}>
                {formatCount(profile.followerCount)} followers · {formatCount(profile.postCount)} posts
              </Text>
              <Text className="text-center" style={{ fontSize: 13, color: IG_MUTED }}>
                Type a message above to preview the automation flow
              </Text>
            </View>
          ) : (
            <>
              {mediaUri ? (
                <View className="mb-1 self-center overflow-hidden rounded-xl" style={{ width: '60%', aspectRatio: 9 / 16 }}>
                  <Image source={{ uri: mediaUri }} className="h-full w-full" resizeMode="cover" accessibilityLabel="Trigger post" />
                  <View className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5">
                    <Text className="font-semibold text-white" style={{ fontSize: 10 }}>Trigger post</Text>
                  </View>
                </View>
              ) : null}

              {/* Step 1: Opening DM with embedded button */}
              {(openingText.length > 0 || hasButton) && (
                hasButton ? (
                  <StructuredMessage body={openingText} buttonLabel={buttonLabel} />
                ) : (
                  <ReceivedBubble>
                    <Text style={{ fontSize: 14, lineHeight: 20, color: '#ffffff' }} selectable>
                      {openingText}
                    </Text>
                  </ReceivedBubble>
                )
              )}

              {/* Step 2: Fan taps the button */}
              {hasButton && (
                <SentBubble>
                  <Text style={{ fontSize: 14, lineHeight: 20, color: '#ffffff' }}>{buttonLabel}</Text>
                </SentBubble>
              )}

              {/* Step 3: Follow gate (if enabled) */}
              {requireFollow && followText.length > 0 && (
                followPromptButtonLabel.trim().length > 0 ? (
                  <StructuredMessage body={followText} buttonLabel={followPromptButtonLabel.trim()} />
                ) : (
                  <ReceivedBubble>
                    <Text style={{ fontSize: 14, lineHeight: 20, color: '#ffffff' }} selectable>
                      {followText}
                    </Text>
                  </ReceivedBubble>
                )
              )}

              {requireFollow && followPromptButtonLabel.trim().length > 0 && hasButton && (
                <SentBubble>
                  <Text style={{ fontSize: 14, lineHeight: 20, color: '#ffffff' }}>
                    {followPromptButtonLabel.trim()}
                  </Text>
                </SentBubble>
              )}

              {/* Step 4: Reveal DM after button tap */}
              {hasButton && revealText.length > 0 && (
                <ReceivedBubble>
                  <Text style={{ fontSize: 14, lineHeight: 20, color: '#ffffff' }} selectable>
                    {revealText}
                  </Text>
                </ReceivedBubble>
              )}

              {/* Optional fan acknowledgment */}
              {hasButton && revealText.length > 0 && (
                <SentBubble>
                  <Text style={{ fontSize: 14, lineHeight: 20, color: '#ffffff' }}>{FAN_REPLY}</Text>
                </SentBubble>
              )}

              {/* Step 5: Follow-up */}
              {followUpEnabled && followUpText.length > 0 && (
                <ReceivedBubble>
                  <Text style={{ fontSize: 14, lineHeight: 20, color: '#ffffff' }} selectable>
                    {followUpText}
                  </Text>
                </ReceivedBubble>
              )}
            </>
          )}
        </ScrollView>
      </View>

      <MessageInputBar />
    </View>
  );
}
