/**
 * src/screens/Posts/PostsListScreen.tsx
 *
 * Phase 4: Posts Feed Screen
 *
 * Features:
 *  - Header bar with "Leaderboard" button (#00FFCC) at top right
 *  - Fetches posts joined with author `display_name`, `username`, and `post_ratings`
 *  - Pinned Announcements: All `is_announcement = true` posts pinned at the very top,
 *    styled with distinct #FF6600 (Accent Orange) card border, badge, and background tint
 *  - Regular posts follow below in reverse chronological order
 *  - Post cards show: Author Display Name (@username), Subject, Announcement badge,
 *    current Satisfaction Rate (%), content preview, media attachments, and interactive 0-10 rating
 *  - Floating / docked "(+ New)" button (#00FFCC background, #050A0E bold text)
 *  - Embedded Leaderboard Modal with Weekly Satisfaction rankings and "( <- Back to Main Menu)" button
 *  - Full-screen Modal hosting `CreatePostScreen`
 *  - Realtime subscriptions on `posts` and `post_ratings`
 *  - STRICTLY NO delete button anywhere
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { supabase } from '../../services/supabase';
import CreatePostScreen from './CreatePostScreen';
import PostDetailScreen from './PostDetailScreen';
import LeaderboardScreen from './LeaderboardScreen';
import type {
  LeaderboardEntry,
  PostAttachmentDoc,
  PostWithAuthor,
} from '../../types/database';

interface PostItemData extends PostWithAuthor {
  myRating?: number | null;
}

const PostsListScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const { user } = useAuth();

  const [posts, setPosts] = useState<PostItemData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals & Navigation
  const [selectedPost, setSelectedPost] = useState<PostItemData | null>(null);
  const [createPostVisible, setCreatePostVisible] = useState(false);
  const [leaderboardVisible, setLeaderboardVisible] = useState(false);

  // Rating interaction states: post ID currently open for rating
  const [activeRatingPostId, setActiveRatingPostId] = useState<string | null>(null);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  /* ------------------------------------------------------------------ */
  /*  Fetch Posts & Compute Ratings                                     */
  /* ------------------------------------------------------------------ */

  const fetchPosts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          id,
          author_id,
          subject,
          content,
          image_urls,
          document_urls,
          is_announcement,
          created_at,
          profiles:author_id (
            username,
            display_name
          ),
          post_ratings (
            rater_id,
            score
          )
        `)
        .order('created_at', { ascending: false });

      if (error || !data) {
        console.warn('Error fetching posts:', error?.message);
        return;
      }

      // Map raw data into PostItemData
      const mappedPosts: PostItemData[] = data.map((item: any) => {
        const authorProfile = Array.isArray(item.profiles)
          ? item.profiles[0]
          : item.profiles;

        const ratings = Array.isArray(item.post_ratings) ? item.post_ratings : [];
        const ratingsCount = ratings.length;
        const totalScore = ratings.reduce(
          (sum: number, r: { score: number }) => sum + (r.score ?? 0),
          0,
        );
        const avgScore =
          ratingsCount > 0 ? totalScore / ratingsCount : null;
        const satisfactionRate =
          avgScore !== null
            ? Math.round((avgScore / 10) * 1000) / 10
            : undefined;

        const myRatingEntry = user
          ? ratings.find((r: { rater_id: string }) => r.rater_id === user.id)
          : null;

        return {
          id: item.id,
          author_id: item.author_id,
          subject: item.subject,
          content: item.content,
          image_urls: item.image_urls,
          document_urls: item.document_urls,
          is_announcement: Boolean(item.is_announcement),
          created_at: item.created_at,
          author: {
            username: authorProfile?.username ?? 'anonymous',
            display_name: authorProfile?.display_name ?? 'Anonymous User',
          },
          ratings_count: ratingsCount,
          average_score: avgScore,
          satisfaction_rate: satisfactionRate,
          myRating: myRatingEntry ? myRatingEntry.score : null,
        };
      });

      // Sort order:
      // 1. All posts with is_announcement = true pinned at the very top (sorted by created_at DESC)
      // 2. Regular posts follow below in reverse chronological order
      const sorted = mappedPosts.sort((a, b) => {
        if (a.is_announcement && !b.is_announcement) return -1;
        if (!a.is_announcement && b.is_announcement) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setPosts(sorted);
    } catch (err: any) {
      console.warn('Failed to load posts:', err?.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user]);

  /* ------------------------------------------------------------------ */
  /*  Realtime Subscriptions                                            */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    fetchPosts();

    // Subscribe to realtime updates on posts and post_ratings
    const channel = supabase
      .channel('public:posts-feed-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        () => {
          fetchPosts();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_ratings' },
        () => {
          fetchPosts();
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [fetchPosts]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchPosts();
  };

  /* ------------------------------------------------------------------ */
  /*  Rating Submission Handler                                         */
  /* ------------------------------------------------------------------ */

  const handleRatePost = async (postId: string, score: number) => {
    if (!user) {
      Alert.alert('Authentication Required', 'Please log in to rate posts.');
      return;
    }

    setRatingSubmitting(true);
    try {
      const { error } = await supabase.from('post_ratings').upsert(
        {
          post_id: postId,
          rater_id: user.id,
          score,
        },
        { onConflict: 'post_id,rater_id' },
      );

      if (error) {
        Alert.alert('Rating Error', error.message);
      } else {
        setActiveRatingPostId(null);
        await fetchPosts();
      }
    } catch (err: any) {
      Alert.alert('Rating Error', err?.message || 'Could not submit rating.');
    } finally {
      setRatingSubmitting(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Weekly Leaderboard Navigation                                     */
  /* ------------------------------------------------------------------ */

  const openLeaderboard = () => {
    setLeaderboardVisible(true);
  };

  /* ------------------------------------------------------------------ */
  /*  Date Formatting Helper                                            */
  /* ------------------------------------------------------------------ */

  const formatRelativeDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDays = Math.floor(diffHour / 24);

      if (diffSec < 60) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHour < 24) return `${diffHour}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Render Individual Post Card                                       */
  /* ------------------------------------------------------------------ */

  const renderPostCard = ({ item }: { item: PostItemData }) => {
    const isAnnouncement = item.is_announcement;
    const authorName = item.author?.display_name || 'Anonymous';
    const authorUsername = item.author?.username || 'user';
    const isRatingOpen = activeRatingPostId === item.id;

    // Distinct styles for announcement vs standard post
    const cardBorderColor = isAnnouncement
      ? '#FF6600'
      : theme.mode === 'dark'
      ? '#1A2633'
      : '#E0E6EC';

    const cardBgColor = isAnnouncement
      ? theme.mode === 'dark'
        ? 'rgba(255, 102, 0, 0.08)'
        : 'rgba(255, 102, 0, 0.04)'
      : colors.surface;

    return (
      <View
        style={[
          styles.postCard,
          {
            backgroundColor: cardBgColor,
            borderColor: cardBorderColor,
            borderWidth: isAnnouncement ? 2 : 1,
          },
        ]}
      >
        <Pressable
          onPress={() => setSelectedPost(item)}
          style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}
        >
          {/* ── Announcement Top Badge ── */}
          {isAnnouncement && (
            <View style={styles.announcementBadgeRow}>
              <View style={styles.announcementBadge}>
                <Text style={styles.announcementBadgeIcon}>📢</Text>
                <Text style={styles.announcementBadgeText}>
                  PINNED ANNOUNCEMENT
                </Text>
              </View>
            </View>
          )}

          {/* ── Author Bar ── */}
          <View style={styles.authorRow}>
            <View
              style={[
                styles.avatarCircle,
                {
                  backgroundColor: isAnnouncement
                    ? '#FF6600'
                    : colors.primary,
                },
              ]}
            >
              <Text style={styles.avatarLetter}>
                {authorName.charAt(0).toUpperCase()}
              </Text>
            </View>

            <View style={styles.authorMeta}>
              <View style={styles.authorNameRow}>
                <Text
                  style={[styles.authorDisplayName, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {authorName}
                </Text>
                <Text
                  style={[styles.authorUsername, { color: colors.muted }]}
                  numberOfLines={1}
                >
                  @{authorUsername}
                </Text>
              </View>
              <Text style={[styles.postTimestamp, { color: colors.muted }]}>
                {formatRelativeDate(item.created_at)}
              </Text>
            </View>

            {/* ── Satisfaction Rate Pill ── */}
            <View
              style={[
                styles.satisfactionPill,
                {
                  backgroundColor:
                    item.satisfaction_rate !== undefined
                      ? 'rgba(0, 255, 204, 0.12)'
                      : theme.mode === 'dark'
                      ? '#131F2A'
                      : '#EBF0F5',
                  borderColor:
                    item.satisfaction_rate !== undefined
                      ? '#00FFCC'
                      : 'transparent',
                },
              ]}
            >
              <Text
                style={[
                  styles.satisfactionText,
                  {
                    color:
                      item.satisfaction_rate !== undefined
                        ? '#00FFCC'
                        : colors.muted,
                  },
                ]}
              >
                {item.satisfaction_rate !== undefined
                  ? `${item.satisfaction_rate}% ★`
                  : 'No ratings'}
              </Text>
            </View>
          </View>

          {/* ── Post Subject ── */}
          <Text style={[styles.postSubject, { color: colors.text }]}>
            {item.subject}
          </Text>

          {/* ── Post Content ── */}
          <Text
            style={[
              styles.postContent,
              { color: theme.mode === 'dark' ? '#E1E8EE' : '#2D3748' },
            ]}
            numberOfLines={4}
          >
            {item.content}
          </Text>

          {/* ── Image Attachments Preview ── */}
          {item.image_urls && item.image_urls.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.imageScrollContainer}
            >
              <View style={styles.imageGalleryRow}>
                {item.image_urls.map((imgUrl, imgIdx) => (
                  <View key={`img-${item.id}-${imgIdx}`} style={styles.imageWrapper}>
                    <Image source={{ uri: imgUrl }} style={styles.postImage} />
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          {/* ── Document Attachments ── */}
          {item.document_urls && item.document_urls.length > 0 && (
            <View style={styles.documentContainer}>
              {item.document_urls.map((doc: PostAttachmentDoc, docIdx: number) => (
                <View
                  key={`doc-${item.id}-${docIdx}`}
                  style={[
                    styles.docPill,
                    {
                      backgroundColor:
                        theme.mode === 'dark' ? '#141E28' : '#F0F4F8',
                      borderColor:
                        theme.mode === 'dark' ? '#1F2E3D' : '#DDE3EA',
                    },
                  ]}
                >
                  <Text style={styles.docIcon}>📄</Text>
                  <Text
                    style={[styles.docFileName, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {doc.name}
                  </Text>
                  {doc.size ? (
                    <Text style={[styles.docFileSize, { color: colors.muted }]}>
                      {(doc.size / 1024).toFixed(0)} KB
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}

          {/* ── Tap Hint Bar ── */}
          <View style={styles.tapToDetailRow}>
            <Text style={[styles.tapToDetailText, { color: '#00FFCC' }]}>
              Tap to view full post, files & 0–10 ratings ➔
            </Text>
          </View>
        </Pressable>

        {/* ── Rating Footer Bar ── */}
        <View
          style={[
            styles.cardFooterBar,
            {
              borderTopColor:
                theme.mode === 'dark' ? '#1A2633' : '#E8EEF4',
            },
          ]}
        >
          <View style={styles.ratingsSummaryRow}>
            <Text style={[styles.ratingsCountText, { color: colors.muted }]}>
              {item.ratings_count ?? 0}{' '}
              {(item.ratings_count ?? 0) === 1 ? 'rating' : 'ratings'}
              {item.myRating !== null && item.myRating !== undefined
                ? ` • You rated: ${item.myRating}/10`
                : ''}
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.rateButton,
              {
                backgroundColor: 'rgba(0, 255, 204, 0.1)',
                borderColor: '#00FFCC',
                opacity: pressed ? 0.8 : 1,
              },
            ]}
            onPress={() => setSelectedPost(item)}
          >
            <Text
              style={[
                styles.rateButtonText,
                { color: '#00FFCC' },
              ]}
            >
              ⭐ Rate Post (0–10)
            </Text>
          </Pressable>
        </View>

        {/* ── Interactive 0–10 Rating Selector ── */}
        {isRatingOpen && (
          <View
            style={[
              styles.ratingSelectorBox,
              {
                backgroundColor:
                  theme.mode === 'dark' ? '#091016' : '#F7FAFC',
                borderColor: '#00FFCC',
              },
            ]}
          >
            <Text style={[styles.ratingSelectorPrompt, { color: colors.text }]}>
              Select your rating for this post (0 = lowest, 10 = highest):
            </Text>

            {ratingSubmitting ? (
              <ActivityIndicator
                size="small"
                color="#00FFCC"
                style={{ marginVertical: 12 }}
              />
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.ratingButtonsScroll}
              >
                <View style={styles.ratingNumberRow}>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => {
                    const isSelected = item.myRating === score;
                    return (
                      <Pressable
                        key={`rate-btn-${score}`}
                        style={({ pressed }) => [
                          styles.ratingScoreCircle,
                          {
                            backgroundColor: isSelected
                              ? '#00FFCC'
                              : theme.mode === 'dark'
                              ? '#131F2A'
                              : '#E2E8F0',
                            borderColor: isSelected
                              ? '#00FFCC'
                              : theme.mode === 'dark'
                              ? '#1E2F40'
                              : '#CBD5E0',
                            opacity: pressed ? 0.75 : 1,
                          },
                        ]}
                        onPress={() => handleRatePost(item.id, score)}
                      >
                        <Text
                          style={[
                            styles.ratingScoreNumber,
                            {
                              color: isSelected
                                ? '#050A0E'
                                : colors.text,
                            },
                          ]}
                        >
                          {score}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>
        )}
      </View>
    );
  };

  /* ------------------------------------------------------------------ */
  /*  Render Main Layout                                                */
  /* ------------------------------------------------------------------ */

  return (
    <View style={[styles.container, { backgroundColor: colors.main }]}>
      {/* ── Top Header Bar with #00FFCC Leaderboard Button ── */}
      <View
        style={[
          styles.headerBar,
          {
            backgroundColor: colors.surface,
            borderBottomColor: theme.mode === 'dark' ? '#1A2633' : '#E0E6EC',
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Feed
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.muted }]}>
            Community Posts & Announcements
          </Text>
        </View>

        {/* Top Right: Leaderboard Button (#00FFCC) */}
        <Pressable
          style={({ pressed }) => [
            styles.leaderboardButton,
            { opacity: pressed ? 0.75 : 1 },
          ]}
          onPress={openLeaderboard}
        >
          <Text style={styles.leaderboardButtonText}>🏆 Leaderboard</Text>
        </Pressable>
      </View>

      {/* ── Feed List ── */}
      {isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#00FFCC" />
          <Text style={[styles.loadingText, { color: colors.muted }]}>
            Loading posts feed…
          </Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderPostCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor="#00FFCC"
              colors={['#00FFCC']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>📝</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                No Posts Yet
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                Be the first to publish a post to the community!
              </Text>
            </View>
          }
        />
      )}

      {/* ── Floating / Bottom-Docked (+ New) Button (#00FFCC background, #050A0E bold text) ── */}
      <Pressable
        style={({ pressed }) => [
          styles.floatingNewButton,
          { opacity: pressed ? 0.85 : 1 },
        ]}
        onPress={() => setCreatePostVisible(true)}
      >
        <Text style={styles.floatingNewButtonText}>(+ New)</Text>
      </Pressable>

      {/* ── Create Post Screen Modal ── */}
      <Modal
        visible={createPostVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setCreatePostVisible(false)}
      >
        <CreatePostScreen
          onClose={() => setCreatePostVisible(false)}
          onPostCreated={() => {
            fetchPosts();
          }}
        />
      </Modal>

      {/* ── Post Detail Screen Modal ── */}
      <Modal
        visible={Boolean(selectedPost)}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSelectedPost(null)}
      >
        {selectedPost && (
          <PostDetailScreen
            postId={selectedPost.id}
            initialPost={selectedPost}
            onBack={() => {
              setSelectedPost(null);
              fetchPosts();
            }}
            onRatingChanged={() => {
              fetchPosts();
            }}
          />
        )}
      </Modal>

      {/* ── Live Leaderboard Screen Modal ── */}
      <Modal
        visible={leaderboardVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setLeaderboardVisible(false)}
      >
        <LeaderboardScreen onBack={() => setLeaderboardVisible(false)} />
      </Modal>
    </View>
  );
};

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 54 : 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  leaderboardButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#00FFCC',
    backgroundColor: 'rgba(0, 255, 204, 0.08)',
  },
  leaderboardButtonText: {
    color: '#00FFCC',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 14,
    marginTop: 10,
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 90,
  },

  /* ── Post Card ── */
  postCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  announcementBadgeRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  announcementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  announcementBadgeIcon: {
    fontSize: 12,
    marginRight: 6,
  },
  announcementBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  /* ── Author Bar ── */
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarLetter: {
    color: '#050A0E',
    fontSize: 16,
    fontWeight: '900',
  },
  authorMeta: {
    flex: 1,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  authorDisplayName: {
    fontSize: 15,
    fontWeight: '700',
    maxWidth: '55%',
  },
  authorUsername: {
    fontSize: 13,
    fontWeight: '500',
    maxWidth: '45%',
  },
  postTimestamp: {
    fontSize: 11,
    marginTop: 2,
  },
  satisfactionPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  satisfactionText: {
    fontSize: 12,
    fontWeight: '800',
  },

  /* ── Post Body ── */
  postSubject: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
    lineHeight: 24,
  },
  postContent: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 12,
  },

  /* ── Images & Documents ── */
  imageScrollContainer: {
    marginBottom: 12,
  },
  imageGalleryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  imageWrapper: {
    width: 130,
    height: 100,
    borderRadius: 8,
    overflow: 'hidden',
  },
  postImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  documentContainer: {
    marginBottom: 12,
    gap: 6,
  },
  docPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  docIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  docFileName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  docFileSize: {
    fontSize: 11,
    marginLeft: 8,
  },
  tapToDetailRow: {
    marginTop: 10,
    marginBottom: 4,
  },
  tapToDetailText: {
    fontSize: 12,
    fontWeight: '700',
  },

  /* ── Ratings Bar & Action ── */
  cardFooterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  ratingsSummaryRow: {
    flex: 1,
  },
  ratingsCountText: {
    fontSize: 12,
    fontWeight: '600',
  },
  rateButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  rateButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },

  /* ── Rating Selector (0–10) ── */
  ratingSelectorBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  ratingSelectorPrompt: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },
  ratingButtonsScroll: {
    flexDirection: 'row',
  },
  ratingNumberRow: {
    flexDirection: 'row',
    gap: 8,
  },
  ratingScoreCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingScoreNumber: {
    fontSize: 14,
    fontWeight: '800',
  },

  /* ── Floating (+ New) Button ── */
  floatingNewButton: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    backgroundColor: '#00FFCC',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 28,
    shadowColor: '#00FFCC',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  floatingNewButtonText: {
    color: '#050A0E',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  /* ── Empty State ── */
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
  },

  /* ── Leaderboard Modal ── */
  leaderboardModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 40,
  },
  leaderboardModalCard: {
    width: '100%',
    maxHeight: '85%',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#00FFCC',
  },
  leaderboardHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  leaderboardEmoji: {
    fontSize: 36,
    marginBottom: 4,
  },
  leaderboardTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  leaderboardSubtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  leaderboardScroll: {
    maxHeight: 380,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  rankCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rankNumber: {
    fontSize: 13,
    fontWeight: '900',
  },
  leaderboardUserInfo: {
    flex: 1,
  },
  leaderboardName: {
    fontSize: 14,
    fontWeight: '700',
  },
  leaderboardUsername: {
    fontSize: 12,
    marginTop: 2,
  },
  leaderboardRateBadge: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  leaderboardRateText: {
    color: '#00FFCC',
    fontSize: 16,
    fontWeight: '900',
  },
  leaderboardRateLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  emptyLeaderboard: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  leaderboardCloseBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#00FFCC',
    alignItems: 'center',
  },
  leaderboardCloseText: {
    color: '#050A0E',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});

export default PostsListScreen;
