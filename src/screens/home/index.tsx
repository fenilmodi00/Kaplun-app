import React, { useState, useCallback, useRef } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { View, Pressable, useCSSVariable } from '@/tw';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Skeleton,
  Surface,
  Text,
} from 'panelui-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenShell } from '@/components/screen-shell';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetHeader,
  type BottomSheetMethods,
} from '@/components/ui/bottomsheet';
import { sheetContent, cn } from '@/tw/cn';
import { useAppwriteUser } from '@/hooks/useAppwriteUser';
import { useBridge } from '@/lib/bridge-context';
import { fetchProfile, type InstagramProfileResponse } from '@/lib/instagram';
import { startInstagramOAuth } from '@/lib/instagram-oauth';
import { addLog } from '@/lib/logger';
import { getCreatorByClerkId } from '@/lib/repository';
import { getGreeting, profileFromCreator, hasUsableToken, getInitials } from './utils';
import { ErrorShake, Reveal } from './components';

// PanelUI has no Instagram brand glyph — Ionicons keeps it. Brand glyph colours
// on the IG gradient are Instagram's palette, not Kaplun tokens.
const IG_BRAND_GLYPH = '#ffffff';

// ── Sub-components ───────────────────────────────────────────────────

function HeaderAvatar({ name, imageUrl }: { name: string; imageUrl?: string }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push('/(tabs)/(profile)' as never)}
      accessibilityLabel="Profile"
      accessibilityRole="button"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Avatar
        source={imageUrl ? { uri: imageUrl } : undefined}
        fallback={getInitials(name)}
        className="border border-border"
      />
    </Pressable>
  );
}

function ValueBullet({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  const foreground = useCSSVariable('--color-foreground') as string;
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-8 w-8 items-center justify-center rounded-lg bg-secondary">
        <Ionicons name={icon} size={16} color={foreground} />
      </View>
      <Text size="sm" weight="medium" className="flex-1">
        {text}
      </Text>
    </View>
  );
}

function ErrorStrip({ message }: { message: string }) {
  return (
    <ErrorShake>
      <Alert variant="destructive" className="mb-3.5">
        <Alert.Title>Instagram connection failed.</Alert.Title>
        <Alert.Description>{message}</Alert.Description>
      </Alert>
    </ErrorShake>
  );
}

function PermissionsPanel({ open }: { open: boolean }) {
  if (!open) return null;

  const scopes = [
    { label: 'See your profile and media', code: 'instagram_business_basic' },
    { label: 'Read and reply to your DMs', code: 'instagram_business_manage_messages' },
    { label: 'Read your analytics', code: 'instagram_business_manage_insights' },
    { label: 'Read and reply to comments', code: 'instagram_business_manage_comments' },
  ];

  return (
    <Surface variant="secondary" className="mt-3">
      <Text size="xs" weight="semibold" muted className="mb-3 uppercase tracking-wider">
        What Kaplun can do
      </Text>
      <View className="gap-2.5 mb-3.5">
        {scopes.map((s) => (
          <View key={s.code} className="flex-row gap-2.5 items-start">
            <View className="mt-1.5 h-2 w-2 rounded-full bg-primary" />
            <View className="flex-1">
              <Text size="sm">{s.label}</Text>
              <Text size="xs" muted className="mt-0.5 font-mono">
                {s.code}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <View className="border-t border-border pt-3">
        <Text size="xs" muted className="leading-5">
          Secure sign-in via Meta. Kaplun never sees your password. Disconnect anytime from Profile.
        </Text>
        <Text size="xs" muted className="mt-2 leading-5">
          Requires an Instagram Business or Creator account.{' '}
          <Text size="xs" weight="medium">How to switch</Text>
        </Text>
      </View>
    </Surface>
  );
}

function ConnectionChip({ profile }: { profile: InstagramProfileResponse }) {
  return (
    <Surface
      padding="none"
      bordered
      className="mb-4 flex-row items-center gap-3 rounded-full p-2 pr-4"
    >
      {/* Instagram brand gradient — IG palette, not Kaplun tokens */}
      <LinearGradient
        colors={['#f9ce34', '#ee2a7b', '#6228d7']}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="logo-instagram" size={17} color={IG_BRAND_GLYPH} />
      </LinearGradient>
      <View className="flex-1 min-w-0">
        <Text weight="semibold" numberOfLines={1}>
          @{profile.username}
        </Text>
        <Text size="xs" muted>
          Instagram Business
        </Text>
      </View>
      <Badge variant="success">Connected</Badge>
    </Surface>
  );
}

function Module({
  title,
  subtitle,
  emptyTitle,
  emptyBody,
  buttonText,
  buttonRoute,
  tintClass,
}: {
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyBody: string;
  buttonText: string;
  buttonRoute: string;
  tintClass: string;
}) {
  const router = useRouter();
  return (
    <Card className={cn('mb-3.5', tintClass)}>
      <Card.Header>
        <Card.Title>{title}</Card.Title>
        <Card.Description>{subtitle}</Card.Description>
      </Card.Header>
      <Card.Content>
        <View className="items-center gap-1 rounded-2xl border border-dashed border-border p-4">
          <Text size="sm" weight="semibold">
            {emptyTitle}
          </Text>
          <Text size="xs" muted className="text-center leading-5">
            {emptyBody}
          </Text>
        </View>
      </Card.Content>
      <Card.Footer>
        <Button variant="secondary" size="sm" onPress={() => router.push(buttonRoute as never)}>
          {buttonText}
        </Button>
      </Card.Footer>
    </Card>
  );
}

function QuickActions() {
  const router = useRouter();
  const foreground = useCSSVariable('--color-foreground') as string;
  const actions = [
    { label: 'Reply to DMs', icon: 'chatbubble-outline' as const, route: '/(tabs)/(messages)' },
    { label: 'View insights', icon: 'stats-chart-outline' as const, route: '/(tabs)/(insights)' },
  ];

  return (
    <View className="flex-row gap-2.5">
      {actions.map((a) => (
        <Pressable
          key={a.label}
          onPress={() => router.push(a.route as never)}
          className="min-h-16 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card"
        >
          <Ionicons name={a.icon} size={17} color={foreground} />
          <Text size="xs" weight="semibold">
            {a.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────

export default function HomeScreen() {
  const { data: user } = useAppwriteUser();
  const { isReady: bridgeReady } = useBridge();
  const insets = useSafeAreaInsets();
  const placeholderSheetRef = useRef<BottomSheetMethods>(null);
  const mutedForeground = useCSSVariable('--color-muted-foreground') as string;
  const primaryForeground = useCSSVariable('--color-primary-foreground') as string;
  const foreground = useCSSVariable('--color-foreground') as string;

  const [profile, setProfile] = useState<InstagramProfileResponse | null>(null);
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPermissions, setShowPermissions] = useState(false);
  const [skipped, setSkipped] = useState(false);



  // Re-check on every focus so Profile → Disconnect immediately shows
  // the connect UI when the user returns to Home (tabs stay mounted).
  const appwriteUserId = user?.$id;
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function checkConnection() {
        if (!appwriteUserId) {
          setIsCheckingConnection(false);
          return;
        }
        if (!bridgeReady) {
          setIsCheckingConnection(true);
          return;
        }
        try {
          // Prefer Appwrite TablesDB as source of truth. Only call Graph when we
          // already have a usable token — otherwise fetchProfile throws
          // session_expired and the catch below used to wipe the row.
          const creator = await getCreatorByClerkId(appwriteUserId);
          if (creator && creator.is_onboarded && creator.username && hasUsableToken(creator)) {
            if (!cancelled) setProfile(profileFromCreator(creator));
          } else if (hasUsableToken(creator)) {
            const p = await fetchProfile();
            if (!cancelled) setProfile(p);
          } else if (!cancelled) {
            // Token cleared (e.g. Profile disconnect) — show connect UI.
            setProfile(null);
          }
        } catch (_err: unknown) {
          // Do not clear the stored token here. Graph 190 cleanup belongs in
          // @/lib/instagram (after a failed ig_refresh_token). Wiping on every
          // session_expired made reconnect appear to succeed while leaving an
          // empty access_token on the creators row.
          if (!(_err instanceof Error && _err.message === 'session_expired')) {
            // non-session errors are ignored for the connect gate
          }
        } finally {
          if (!cancelled) setIsCheckingConnection(false);
        }
      }
      checkConnection();
      return () => {
        cancelled = true;
      };
    }, [appwriteUserId, bridgeReady]),
  );

  const handleConnect = useCallback(async () => {
    if (!user) return;
    setIsConnecting(true);
    setError(null);
    addLog(`home-connect: start uid=${user.$id.slice(0, 12)}…`);
    try {
      const success = await startInstagramOAuth(user.$id, user.$id);
      if (!success) throw new Error('Instagram connection was not successful');

      // Appwrite is the source of truth — the OAuth callback must have written
      // a usable plaintext access_token. Do not treat "username present" alone
      // as connected (that false-positive hid empty-token reconnect failures).
      const creator = await getCreatorByClerkId(user.$id);
      const tokenLen = creator?.access_token?.length ?? 0;
      addLog(
        `home-connect: post-oauth username=${creator?.username ?? '(none)'} token_len=${tokenLen} onboarded=${creator?.is_onboarded ?? false}`
      );
      if (creator && creator.is_onboarded && creator.username && hasUsableToken(creator)) {
        setProfile(profileFromCreator(creator));
      } else {
        throw new Error(
          'Instagram authorization finished but no usable token was saved. Ensure EXPO_PUBLIC_IG_APP_ID matches backend INSTAGRAM_APP_ID (Instagram App ID from Meta dashboard, not the Facebook App ID).'
        );
      }

      // Best-effort live profile enrichment from Graph. Keep Appwrite profile
      // if this fails — do not surface as a connection failure.
      try {
        const p = await fetchProfile();
        setProfile(p);
        addLog(`home-connect: graph profile ok @${p.username}`);
      } catch (enrichErr: unknown) {
        addLog(
          `home-connect: graph enrich skipped err=${enrichErr instanceof Error ? enrichErr.message : String(enrichErr)}`
        );
      }
      addLog('home-connect: ok');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      addLog(`home-connect: failed err=${message}`);
      if (message === 'Instagram OAuth was cancelled') {
        // Silent return — no error shown
      } else {
        setError(message);
      }
    } finally {
      setIsConnecting(false);
    }
  }, [user]);

  const firstName = user?.name || 'Creator';
  const displayName = user?.name || firstName;

  // Instant shell: real chrome + soft placeholders — never a full-screen lag spinner.
  // Once we have a profile (or skip), keep the real page even if bridge status flickers.
  if ((isCheckingConnection || !bridgeReady) && !profile && !skipped) {
    return (
      <ScreenShell>
        <View className="flex-row items-center justify-between mb-3.5">
          <Text size="xl" weight="semibold" className="tracking-tight">
            Kaplun
          </Text>
        </View>
        <Skeleton className="h-7 w-[55%] mb-4" />
        <Skeleton className="h-28 rounded-2xl mb-3.5" />
        <Skeleton className="h-24 rounded-2xl mb-3.5" />
        <View className="flex-row gap-2.5">
          <Skeleton className="h-16 flex-1 rounded-xl" />
          <Skeleton className="h-16 flex-1 rounded-xl" />
          <Skeleton className="h-16 flex-1 rounded-xl" />
        </View>
      </ScreenShell>
    );
  }

  const isConnected = !!profile || skipped;

  return (
    <ScreenShell>


      {/* Header */}
      <Reveal delay={0} style={{ width: '100%' }}>
        <View className="flex-row items-center justify-between mb-3.5">
          <Text size="xl" weight="semibold" className="tracking-tight">
            Kaplun
          </Text>
          <HeaderAvatar name={displayName} imageUrl={profile?.profile_picture_url} />
        </View>
      </Reveal>

      {/* Greeting */}
      <Reveal delay={50} style={{ width: '100%' }}>
        <View className="mb-4">
          <Text size="sm" muted className="mb-0.5">
            {getGreeting()}
          </Text>
          <Text size="2xl" weight="medium" className="tracking-tight">
            {firstName}
          </Text>
        </View>
      </Reveal>

      <Reveal delay={75} style={{ width: '100%' }}>
        <Button
          variant="outline"
          fullWidth
          accessibilityLabel="Open bottom sheet"
          onPress={() => placeholderSheetRef.current?.present()}
          className="mb-4"
        >
          Open bottom sheet
        </Button>
      </Reveal>

      {!isConnected ? (
        <Reveal delay={100} style={{ width: '100%' }}>
          {/* Connect hero card */}
          <Surface bordered padding="lg" className={cn(isConnecting && 'opacity-75')}>
            {/* Hero visual placeholder */}
            <View className="mb-4 h-28 items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-secondary">
              <Ionicons name="logo-instagram" size={34} color={mutedForeground} />
              <Text size="xs" muted>
                TODO: hero visual — clay phone with Instagram glyph
              </Text>
            </View>

            {/* Eyebrow */}
            <Text size="xs" weight="semibold" muted className="mb-2 uppercase tracking-widest">
              Step 1 of 1
            </Text>

            {/* H1 */}
            <Text size="3xl" weight="medium" className="mb-2 tracking-tight">
              Connect your Instagram
            </Text>

            {/* Lede */}
            <Text className="mb-3.5 leading-6">
              Kaplun reads your DMs, insights and posts so your creator workspace comes alive.
            </Text>

            {/* Value bullets */}
            <View className="gap-3 mb-5">
              <ValueBullet
                icon="chatbubble-outline"
                text="Answer Instagram DMs from one inbox"
              />
              <ValueBullet
                icon="stats-chart-outline"
                text="See post & audience insights without switching apps"
              />
            </View>

            {/* Error strip */}
            {error && <ErrorStrip message={error} />}

            {/* CTA */}
            <Button
              fullWidth
              size="lg"
              loading={isConnecting}
              onPress={handleConnect}
              startContent={<Ionicons name="logo-instagram" size={17} color={primaryForeground} />}
            >
              {error ? 'Try again' : isConnecting ? 'Waiting for Instagram…' : 'Connect Instagram'}
            </Button>

            {/* CTA caption */}
            <Text size="xs" muted className="mt-2.5 text-center">
              {isConnecting
                ? 'Complete sign-in in the Instagram window to continue.'
                : 'Secure sign-in via Meta · takes about 30 seconds'}
            </Text>

            {/* Why we ask toggle */}
            <Button
              variant="ghost"
              size="sm"
              onPress={() => setShowPermissions((p) => !p)}
              className="mt-3 self-center"
              labelClassName="underline"
              accessibilityState={{ expanded: showPermissions }}
              endContent={
                <Ionicons
                  name="chevron-down"
                  size={14}
                  color={foreground}
                  style={{ transform: [{ rotate: showPermissions ? '180deg' : '0deg' }] }}
                />
              }
            >
              Why we ask for this
            </Button>
          </Surface>

          {/* Permissions panel */}
          <PermissionsPanel open={showPermissions} />

          {/* Skip block */}
          <View className="items-center mt-4">
            <Button
              variant="ghost"
              onPress={() => setSkipped(true)}
              labelClassName="text-muted-foreground"
            >
              Continue without Instagram
            </Button>
            <Text size="xs" muted className="mt-1 px-6 text-center leading-5">
              You can connect later from Profile. Some features stay locked.
            </Text>
          </View>
        </Reveal>
      ) : (
        <Reveal delay={100} style={{ width: '100%' }}>
          {/* Connected home */}
          {profile && <ConnectionChip profile={profile} />}

          <Module
            title="Instagram DMs"
            subtitle="Your unified inbox"
            emptyTitle="Waiting for first sync"
            emptyBody="Unread threads will appear here as soon as your messages finish syncing."
            buttonText="Open Messages"
            buttonRoute="/(tabs)/(messages)"
            tintClass="bg-info-soft"
          />

          <Module
            title="Latest post performance"
            subtitle="Reach, likes and comments"
            emptyTitle="No posts synced yet"
            emptyBody="Share a post on Instagram and its performance will land here."
            buttonText="View insights"
            buttonRoute="/(tabs)/(insights)"
            tintClass="bg-success-soft"
          />

          <QuickActions />
        </Reveal>
      )}

      <BottomSheetModal ref={placeholderSheetRef} snapPoints={['40%', '75%']}>
        <BottomSheetView style={{ paddingBottom: insets.bottom + 8 }}>
          <View className={cn(sheetContent)}>
            <BottomSheetHeader
              title="Placeholder sheet"
              subtitle="Swap this for real actions later"
              onClose={() => placeholderSheetRef.current?.dismiss()}
            />
            <Text>
              Bottom sheet is wired on Home. Swipe down or tap Close to dismiss.
            </Text>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </ScreenShell>
  );
}
