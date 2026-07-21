import React, { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import Animated from 'react-native-reanimated';
import { View, Text, ScrollView } from '@/tw';
import { cn } from '@/tw/cn';
import { useDashboard } from '@/hooks/useDashboard';
import { account } from '@/lib/appwrite';
import {
  disconnectInstagram,
  fetchMedia,
  fetchInsights,
  fetchProfile,
} from '@/lib/instagram';
import { startInstagramOAuth } from '@/lib/instagram-oauth';
import { ClayAnimatedButton } from '@/components/clay/ClayAnimatedButton';
import { ClayFeatureCard } from '@/components/clay/ClayFeatureCard';
import { ClayAnimatedCard } from '@/components/clay/ClayAnimatedCard';
import { ClaySpinner } from '@/components/clay/ClaySpinner';
import { useShakeAnimation, useEntranceAnimation } from '@/hooks/useClayAnimations';

// Shakes its children on mount — used for error messages.
function ErrorShake({ children }: { children: React.ReactNode }) {
  const { shake, animatedStyle } = useShakeAnimation();
  useEffect(() => {
    shake();
  }, [shake]);
  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}

// Fades/slides its children in on mount — used for the login form.
function Entrance({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const { animatedStyle } = useEntranceAnimation(delay);
  return (
    <Animated.View style={[{ width: '100%', alignItems: 'center' }, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

export default function HomeScreen() {
  const { user } = useUser();
  const [isConnected, setIsConnected] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { data: dashboardData, loading: dashboardLoading, error: dashboardError, refresh: refreshDashboard } = useDashboard();

  useEffect(() => {
    async function checkConnection() {
      if (!user) return;
      try {
        const profile = await fetchProfile();
        if (profile) {
          setIsConnected(true);
          setUsername(profile.username);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : '';
        if (message === 'session_expired') {
          setIsConnected(false);
        }
      }
    }
    checkConnection();
  }, [user]);

  async function handleConnect() {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      // Get Appwrite user ID for row permissions
      const appwriteUser = await account.get();
      // Start OAuth — ig-oauth-callback handles token exchange server-side
      const success = await startInstagramOAuth(user.id, appwriteUser.$id);
      if (!success) {
        throw new Error('Instagram connection was not successful');
      }
      // Fetch profile to verify connection and get username
      const profile = await fetchProfile();
      setIsConnected(true);
      setUsername(profile.username);
      // Fetch media and insights
      try { await fetchMedia(); } catch (e: unknown) {
        if (e instanceof Error && e.message === 'session_expired') setIsConnected(false);
      }
      try { await fetchInsights(); } catch (e: unknown) {
        if (e instanceof Error && e.message === 'session_expired') setIsConnected(false);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to connect';
      if (message === 'Instagram OAuth was cancelled') setError('Instagram connection was cancelled');
      else setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDisconnect() {
    setIsLoading(true);
    setError(null);
    try {
      await disconnectInstagram();
      setIsConnected(false);
      setUsername(null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to disconnect';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  // Loading state
  if (isLoading || dashboardLoading) {
    return (
      <View className="flex-1 items-center justify-center gap-2 bg-canvas p-4">
        <ClaySpinner size={40} label="Loading..." />
      </View>
    );
  }

  // Error state
  if (error || dashboardError) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-canvas p-4">
        <ErrorShake>
          <Text className="text-error text-center text-sm">
            {error ?? dashboardError}
          </Text>
        </ErrorShake>
        <ClayAnimatedButton variant="secondary" onPress={refreshDashboard}>
          Retry
        </ClayAnimatedButton>
      </View>
    );
  }

  // Not connected — Instagram connection screen
  if (!isConnected) {
    return (
      <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 items-center justify-center gap-6 px-6 py-12">
          {/* Hero */}
          <Entrance delay={0}>
            <View className="items-center gap-3">
              <View className="w-20 h-20 rounded-full bg-primary items-center justify-center mb-2">
                <Text className="text-canvas text-2xl font-bold">K</Text>
              </View>
              <Text className="text-display-sm font-medium tracking-[-0.5px] text-center text-primary">
                Welcome to Kaplun
              </Text>
              <Text className="text-center text-muted leading-relaxed max-w-[280px]">
                Your creator workspace for managing Instagram campaigns, tracking deals, and connecting with brands.
              </Text>
            </View>
          </Entrance>

          {/* Value cards */}
          <Entrance delay={100}>
            <View className="flex-row flex-wrap gap-3 justify-center">
              <View className="w-[140px]">
                <ClayFeatureCard
                  color="pink"
                  padding="p-4"
                  title="📊"
                  description="Track analytics"
                />
              </View>
              <View className="w-[140px]">
                <ClayFeatureCard
                  color="teal"
                  padding="p-4"
                  title="💼"
                  description="Manage deals"
                />
              </View>
              <View className="w-[140px]">
                <ClayFeatureCard
                  color="lavender"
                  padding="p-4"
                  title="💬"
                  description="Brand DMs"
                />
              </View>
            </View>
          </Entrance>

          {/* CTA */}
          <Entrance delay={200}>
            <View className="w-full max-w-[320px] items-center gap-3">
              <ClayAnimatedButton variant="primary" fullWidth onPress={handleConnect}>
                Connect Instagram
              </ClayAnimatedButton>
              <Text className="text-xs text-muted text-center">
                Uses Instagram's official API — your credentials are never stored
              </Text>
            </View>
          </Entrance>

          {/* Error */}
          {error && (
            <ErrorShake>
              <Text className="text-error text-center text-xs mt-2">{error}</Text>
            </ErrorShake>
          )}
        </View>
      </ScrollView>
    );
  }

  // Empty state — connected but no dashboard data
  if (!dashboardData || (!dashboardData.deals?.length && !dashboardData.threads?.length)) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-canvas p-4">
        <Text className="text-display-sm font-medium tracking-[-0.5px] text-center">
          Welcome, @{username}
        </Text>
        <Text className="text-center text-muted text-sm">
          No campaign data yet — your agent will start outreach soon
        </Text>
        <ClayAnimatedButton variant="secondary" onPress={refreshDashboard}>
          Refresh
        </ClayAnimatedButton>
      </View>
    );
  }

  // Connected with data
  return (
    <ScrollView className="w-full bg-canvas">
      <View className="gap-4 p-4">
        {/* Welcome header */}
        <View>
          <Text className="text-display-sm font-medium tracking-[-0.5px]">
            Welcome, @{username}
          </Text>
          <Text className="text-muted">Here's your campaign overview</Text>
        </View>

        {/* Stats cards */}
        <View className="flex-row flex-wrap gap-3">
          <ClayFeatureCard
            color="pink"
            padding="p-6"
            title={String(dashboardData?.deals?.length ?? 0)}
            description="Active Deals"
          />
          <ClayFeatureCard
            color="teal"
            padding="p-6"
            title={String(dashboardData?.threads?.filter(t => t.unread_count > 0)?.length ?? 0)}
            description="Unread Threads"
          />
          <ClayFeatureCard
            color="ochre"
            padding="p-6"
            title={String(dashboardData?.threads?.filter(t => t.status === 'content_pending')?.length ?? 0)}
            description="Pending Content"
          />
        </View>

        {/* Quick-link cards */}
        <View className="flex-row gap-3">
          <View className="flex-1">
            <ClayAnimatedCard delay={200} onPress={() => router.push('/(tabs)/(messages)')}>
              <View className="items-center gap-2">
                <Text className="font-semibold">View Messages</Text>
                <Text className="text-xs text-muted">Check your threads</Text>
              </View>
            </ClayAnimatedCard>
          </View>
          <View className="flex-1">
            <ClayAnimatedCard delay={200} onPress={() => router.push('/(tabs)/(profile)')}>
              <View className="items-center gap-2">
                <Text className="font-semibold">View Profile</Text>
                <Text className="text-xs text-muted">Your creator profile</Text>
              </View>
            </ClayAnimatedCard>
          </View>
        </View>

        {/* Recent activity */}
        <View className="gap-2">
          <Text className="text-title-md font-semibold">Recent Activity</Text>
          {dashboardData?.threads?.slice(0, 3).map((thread, index) => (
            <ClayAnimatedCard key={thread.$id} delay={index * 100}>
              <View className="gap-1">
                <Text className="font-semibold">{thread.campaign_title}</Text>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-muted">{thread.status}</Text>
                  <Text className="text-xs text-muted">
                    {thread.unread_count > 0 ? `${thread.unread_count} unread` : ''}
                  </Text>
                </View>
              </View>
            </ClayAnimatedCard>
          ))}
          {(!dashboardData?.threads || dashboardData.threads.length === 0) && (
            <Text className="text-xs text-muted">No recent activity</Text>
          )}
        </View>

        {/* Disconnect button */}
        <View className="mt-4">
          <ClayAnimatedButton variant="secondary" onPress={handleDisconnect}>
            Disconnect Instagram
          </ClayAnimatedButton>
        </View>
      </View>
    </ScrollView>
  );
}
