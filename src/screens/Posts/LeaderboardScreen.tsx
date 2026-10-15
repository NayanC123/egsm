/**
 * src/screens/Posts/LeaderboardScreen.tsx
 *
 * Phase 5: Live Weekly Leaderboard Screen
 *
 * Features:
 *  - Banner notice at top: "Minimum 1 post in the last 7 days required to stay on the Leaderboard."
 *  - Calls `get_leaderboard()` (with fallback to `get_weekly_leaderboard()` or client query)
 *  - Subscribes to live Supabase Realtime changes on both `posts` and `post_ratings` tables
 *  - Strictly excludes any user who has not published at least 1 post within rolling 7 days
 *  - Displays each qualifying user's:
 *      • Rank (#1, #2, ...) with Gold/Silver/Bronze podium styling
 *      • Display Name (@username)
 *      • Posts This Week counter
 *      • Average Satisfaction Rate (%) with vibrant #00FFCC progress bars
 *  - Fixed `( <- Back to Main Menu )` button at the bottom returning to the Posts feed
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { supabase } from '../../services/supabase';
import type { LeaderboardEntry } from '../../types/database';

interface LeaderboardScreenProps {
  onBack: () => void;
}

export const LeaderboardScreen: React.FC<LeaderboardScreenProps> = ({
  onBack,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const { user } = useAuth();

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  /* ------------------------------------------------------------------ */
  /*  Fetch Leaderboard with RPC & Fallback                             */
  /* ------------------------------------------------------------------ */

  const fetchLeaderboard = useCallback(async () => {
    try {
      // 1. Try get_leaderboard() RPC
      let rpcResult = await supabase.rpc('get_leaderboard');

      // 2. If error, try get_weekly_leaderboard() RPC
      if (rpcResult.error) {
        rpcResult = await supabase.rpc('get_weekly_leaderboard');
      }

      if (!rpcResult.error && rpcResult.data) {
        const rawEntries: any[] = rpcResult.data;
        // Strictly exclude users who haven't published at least 1 post in last 7 days
        const filtered: LeaderboardEntry[] = rawEntries
          .filter((entry) => Number(entry.weekly_post_count) >= 1)
          .map((entry) => ({
            user_id: entry.user_id,
            username: entry.username,
            display_name: entry.display_name,
            avg_satisfaction_rate:
              entry.avg_satisfaction_rate !== null &&
              entry.avg_satisfaction_rate !== undefined
                ? Number(entry.avg_satisfaction_rate)
                : 0,
            weekly_post_count: Number(entry.weekly_post_count),
          }))
          .sort((a, b) => {
            // Sort by satisfaction rate DESC, then by post count DESC
            if (b.avg_satisfaction_rate !== a.avg_satisfaction_rate) {
              return b.avg_satisfaction_rate - a.avg_satisfaction_rate;
            }
            return b.weekly_post_count - a.weekly_post_count;
          });

        setLeaderboard(filtered);
        setLastUpdated(new Date());
        return;
      }

      // 3. Client-side query fallback if RPC is unavailable
      const sevenDaysAgo = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { data: postsData, error: postsErr } = await supabase
        .from('posts')
        .select(`
          id,
          author_id,
          created_at,
          profiles:author_id (
            id,
            username,
            display_name
          ),
          post_ratings (
            score
          )
        `)
        .gte('created_at', sevenDaysAgo);

      if (postsErr || !postsData) {
        console.warn('Leaderboard query error:', postsErr?.message);
        return;
      }

      // Group posts by author
      const authorMap = new Map<
        string,
        {
          user_id: string;
          username: string;
          display_name: string;
          postsCount: number;
          totalScore: number;
          ratingsCount: number;
        }
      >();

      for (const p of postsData as any[]) {
        const authorProfile = Array.isArray(p.profiles)
          ? p.profiles[0]
          : p.profiles;

        if (!authorProfile) continue;

        const uid = p.author_id;
        if (!authorMap.has(uid)) {
          authorMap.set(uid, {
            user_id: uid,
            username: authorProfile.username || 'user',
            display_name: authorProfile.display_name || 'Anonymous',
            postsCount: 0,
            totalScore: 0,
            ratingsCount: 0,
          });
        }

        const entry = authorMap.get(uid)!;
        entry.postsCount += 1;

        const postRatings = Array.isArray(p.post_ratings) ? p.post_ratings : [];
        for (const r of postRatings) {
          if (typeof r.score === 'number') {
            entry.totalScore += r.score;
            entry.ratingsCount += 1;
          }
        }
      }

      // Filter: strictly >= 1 post in last 7 days
      const computedEntries: LeaderboardEntry[] = Array.from(
        authorMap.values(),
      )
        .filter((item) => item.postsCount >= 1)
        .map((item) => {
          const avgScore =
            item.ratingsCount > 0 ? item.totalScore / item.ratingsCount : null;
          const avgSatRate =
            avgScore !== null
              ? Math.round((avgScore / 10) * 1000) / 10
              : 0;

          return {
            user_id: item.user_id,
            username: item.username,
            display_name: item.display_name,
            avg_satisfaction_rate: avgSatRate,
            weekly_post_count: item.postsCount,
          };
        })
        .sort((a, b) => {
          if (b.avg_satisfaction_rate !== a.avg_satisfaction_rate) {
            return b.avg_satisfaction_rate - a.avg_satisfaction_rate;
          }
          return b.weekly_post_count - a.weekly_post_count;
        });

      setLeaderboard(computedEntries);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.warn('Failed to load leaderboard:', err?.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  /* ------------------------------------------------------------------ */
  /*  Realtime Subscriptions on posts & post_ratings                    */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    fetchLeaderboard();

    // Subscribe to live changes on posts and post_ratings
    const channel = supabase
      .channel('public:live-leaderboard-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        () => {
          fetchLeaderboard();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_ratings' },
        () => {
          fetchLeaderboard();
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [fetchLeaderboard]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchLeaderboard();
  };

  /* ------------------------------------------------------------------ */
  /*  Render Qualifying User Item                                       */
  /* ------------------------------------------------------------------ */

  const renderLeaderboardItem = ({
    item,
    index,
  }: {
    item: LeaderboardEntry;
    index: number;
  }) => {
    const rank = index + 1;
    const isTop1 = rank === 1;
    const isTop2 = rank === 2;
    const isTop3 = rank === 3;
    const isCurrentUser = user && item.user_id === user.id;

    // Podium medal colors
    const rankBadgeBg = isTop1
      ? '#FFD700' // Gold
      : isTop2
      ? '#C0C0C0' // Silver
      : isTop3
      ? '#CD7F32' // Bronze
      : theme.mode === 'dark'
      ? '#121F2B'
      : '#E1E9F0';

    const rankNumberColor =
      isTop1 || isTop2 || isTop3 ? '#050A0E' : colors.text;

    const rankCardBorder = isCurrentUser
      ? '#00FFCC'
      : isTop1
      ? '#FFD700'
      : theme.mode === 'dark'
      ? '#172533'
      : '#E2EAF0';

    // Satisfaction rate percentage
    const satRate = item.avg_satisfaction_rate ?? 0;
    const progressWidth = `${Math.min(100, Math.max(0, satRate))}%`;

    return (
      <View
        style={[
          styles.rankCard,
          {
            backgroundColor: colors.surface,
            borderColor: rankCardBorder,
            borderWidth: isCurrentUser || isTop1 ? 1.5 : 1,
          },
        ]}
      >
        <View style={styles.rankCardTopRow}>
          {/* Rank Badge */}
          <View style={[styles.rankCircle, { backgroundColor: rankBadgeBg }]}>
            <Text style={[styles.rankNumber, { color: rankNumberColor }]}>
              {isTop1 ? '🥇' : isTop2 ? '🥈' : isTop3 ? '🥉' : `#${rank}`}
            </Text>
          </View>

          {/* User Details */}
          <View style={styles.userInfoCol}>
            <View style={styles.userNameRow}>
              <Text
                style={[styles.displayName, { color: colors.text }]}
                numberOfLines={1}
              >
                {item.display_name}
              </Text>
              {isCurrentUser && (
                <View style={styles.youBadge}>
                  <Text style={styles.youBadgeText}>YOU</Text>
                </View>
              )}
            </View>

            <View style={styles.userSubRow}>
              <Text
                style={[styles.usernameText, { color: colors.muted }]}
                numberOfLines={1}
              >
                @{item.username}
              </Text>
              <Text style={styles.bulletSeparator}>•</Text>
              {/* Posts this week badge */}
              <View style={styles.postsWeekBadge}>
                <Text style={styles.postsWeekText}>
                  📝 {item.weekly_post_count}{' '}
                  {item.weekly_post_count === 1
                    ? 'post this week'
                    : 'posts this week'}
                </Text>
              </View>
            </View>
          </View>

          {/* Satisfaction Rate Value */}
          <View style={styles.rateValueCol}>
            <Text style={styles.rateValueNumber}>
              {satRate > 0 ? `${satRate.toFixed(1)}%` : 'No ratings'}
            </Text>
            <Text style={[styles.rateValueLabel, { color: colors.muted }]}>
              Satisfaction
            </Text>
          </View>
        </View>

        {/* #00FFCC Progress Bar */}
        <View style={styles.progressBarSection}>
          <View
            style={[
              styles.progressBarTrack,
              {
                backgroundColor:
                  theme.mode === 'dark' ? '#09131B' : '#E8EFF5',
              },
            ]}
          >
            <View
              style={[
                styles.progressBarFill,
                {
                  width: progressWidth as any,
                  backgroundColor: '#00FFCC',
                },
              ]}
            />
          </View>
          <View style={styles.progressBarFooter}>
            <Text style={[styles.progressScaleText, { color: colors.muted }]}>
              0%
            </Text>
            <Text style={[styles.progressScaleText, { color: colors.muted }]}>
              Target: 100%
            </Text>
          </View>
        </View>
      </View>
    );
  };

  /* ------------------------------------------------------------------ */
  /*  Render Screen                                                     */
  /* ------------------------------------------------------------------ */

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.main }]}>
      {/* ── Top Header ── */}
      <View
        style={[
          styles.headerBar,
          {
            backgroundColor: colors.surface,
            borderBottomColor: theme.mode === 'dark' ? '#1A2633' : '#E0E6EC',
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.backNavBtn,
            { opacity: pressed ? 0.75 : 1 },
          ]}
          onPress={onBack}
        >
          <Text style={styles.backNavArrow}>←</Text>
          <Text style={styles.backNavText}>Posts</Text>
        </Pressable>

        <View style={styles.headerTitleCenter}>
          <Text style={styles.headerTrophyEmoji}>🏆</Text>
          <Text style={[styles.headerTitleText, { color: colors.text }]}>
            Live Leaderboard
          </Text>
        </View>

        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      {/* ── MANDATORY TOP BANNER NOTICE ── */}
      <View style={styles.bannerNoticeCard}>
        <Text style={styles.bannerNoticeIcon}>⚠️</Text>
        <Text style={styles.bannerNoticeText}>
          Minimum 1 post in the last 7 days required to stay on the
          Leaderboard.
        </Text>
      </View>

      {/* ── Leaderboard List ── */}
      {isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#00FFCC" />
          <Text style={[styles.loadingText, { color: colors.muted }]}>
            Calculating weekly satisfaction rankings…
          </Text>
        </View>
      ) : (
        <FlatList
          data={leaderboard}
          keyExtractor={(item) => item.user_id}
          renderItem={renderLeaderboardItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor="#00FFCC"
              colors={['#00FFCC']}
            />
          }
          ListHeaderComponent={
            leaderboard.length > 0 ? (
              <View style={styles.listHeaderSummary}>
                <Text
                  style={[styles.listHeaderSummaryText, { color: colors.muted }]}
                >
                  {leaderboard.length}{' '}
                  {leaderboard.length === 1
                    ? 'qualifying member'
                    : 'qualifying members'}{' '}
                  this week • Realtime rankings
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>📊</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                No Active Posts This Week
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                No members have published a post in the rolling last 7 days yet.
                Be the first to publish a post and claim the #1 spot on the
                Leaderboard!
              </Text>
            </View>
          }
        />
      )}

      {/* ── Fixed "( <- Back to Main Menu )" Button at Bottom ── */}
      <View
        style={[
          styles.bottomFixedBar,
          {
            backgroundColor: colors.surface,
            borderTopColor: theme.mode === 'dark' ? '#1A2633' : '#E0E6EC',
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.backToMenuBtn,
            { opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={onBack}
        >
          <Text style={styles.backToMenuText}>( &lt;- Back to Main Menu )</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  /* ── Header ── */
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 8 : 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingRight: 8,
  },
  backNavArrow: {
    fontSize: 18,
    color: '#00FFCC',
    fontWeight: '900',
    marginRight: 4,
  },
  backNavText: {
    color: '#00FFCC',
    fontSize: 15,
    fontWeight: '800',
  },
  headerTitleCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTrophyEmoji: {
    fontSize: 20,
    marginRight: 6,
  },
  headerTitleText: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 255, 204, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#00FFCC',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00FFCC',
    marginRight: 5,
  },
  liveText: {
    color: '#00FFCC',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  /* ── Mandatory Top Banner Notice ── */
  bannerNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 102, 0, 0.12)',
    borderLeftWidth: 4,
    borderLeftColor: '#FF6600',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 102, 0, 0.25)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bannerNoticeIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  bannerNoticeText: {
    color: '#FF6600',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    flex: 1,
  },

  /* ── List ── */
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 110,
  },
  listHeaderSummary: {
    marginBottom: 12,
    alignItems: 'center',
  },
  listHeaderSummaryText: {
    fontSize: 12,
    fontWeight: '600',
  },

  /* ── Rank Card ── */
  rankCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  rankCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  rankCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankNumber: {
    fontSize: 15,
    fontWeight: '900',
  },
  userInfoCol: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  displayName: {
    fontSize: 15,
    fontWeight: '800',
    maxWidth: '75%',
  },
  youBadge: {
    backgroundColor: '#00FFCC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  youBadgeText: {
    color: '#050A0E',
    fontSize: 9,
    fontWeight: '900',
  },
  userSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    flexWrap: 'wrap',
    gap: 4,
  },
  usernameText: {
    fontSize: 12,
    fontWeight: '500',
  },
  bulletSeparator: {
    color: '#8A9BA8',
    fontSize: 10,
  },
  postsWeekBadge: {
    backgroundColor: 'rgba(0, 255, 204, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  postsWeekText: {
    color: '#00FFCC',
    fontSize: 11,
    fontWeight: '700',
  },
  rateValueCol: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  rateValueNumber: {
    color: '#00FFCC',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  rateValueLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },

  /* ── Progress Bar ── */
  progressBarSection: {
    marginTop: 2,
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressBarFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  progressScaleText: {
    fontSize: 9,
    fontWeight: '500',
  },

  /* ── Loading & Empty ── */
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },

  /* ── Fixed Bottom Button: ( <- Back to Main Menu ) ── */
  bottomFixedBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    borderTopWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 8,
  },
  backToMenuBtn: {
    backgroundColor: '#00FFCC',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00FFCC',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  backToMenuText: {
    color: '#050A0E',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});

export default LeaderboardScreen;
