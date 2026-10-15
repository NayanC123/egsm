/**
 * src/screens/Posts/PostDetailScreen.tsx
 *
 * Phase 5: Post Detail 0–10 Rating View
 *
 * Features:
 *  - Displays full Post Subject, Poster Display Name (@username), timestamp, full Post Content
 *  - Scrollable image attachments with full-screen preview modal
 *  - Clickable document chips:
 *      • Documents / PDFs open via `expo-linking`
 *      • Audio files render an interactive inline audio player via `expo-av`
 *  - Interactive Ratings Section:
 *      • 11 distinct clickable number buttons (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10) in a responsive wrap row
 *      • Tapping a number upserts the current user's rating (0–10) into `post_ratings`
 *      • Highlights user's selected number in #00FFCC
 *      • Displays live Satisfaction Rate: ((Average Score / 10) * 100)%
 *      • Scrollable list below showing ratings given by other members (`Display Name: X/10`)
 *  - Supabase Realtime subscriptions to `post_ratings` for instant updates
 *  - Back button returning to Posts feed
 *  - Strictly NO delete button anywhere
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
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import { Audio } from 'expo-av';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { supabase } from '../../services/supabase';
import type {
  PostAttachmentDoc,
  PostRatingWithRater,
  PostWithAuthor,
} from '../../types/database';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface PostDetailScreenProps {
  postId: string;
  initialPost?: PostWithAuthor;
  onBack: () => void;
  onRatingChanged?: (newSatisfactionRate?: number, newCount?: number) => void;
}

/* ------------------------------------------------------------------ */
/*  Inline Audio Player Sub-component (expo-av)                        */
/* ------------------------------------------------------------------ */

interface InlineAudioPlayerProps {
  url: string;
  name: string;
  size?: number;
}

const InlineAudioPlayer: React.FC<InlineAudioPlayerProps> = ({
  url,
  name,
  size,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(0);

  // Unload sound when unmounting
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  const formatTime = (millis: number) => {
    if (!millis || isNaN(millis)) return '0:00';
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const handleTogglePlay = async () => {
    try {
      if (!soundRef.current) {
        setIsLoading(true);
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
        });

        const { sound } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: true },
          (status) => {
            if (status.isLoaded) {
              setPositionMillis(status.positionMillis);
              setDurationMillis(status.durationMillis || 0);
              setIsPlaying(status.isPlaying);
              if (status.didJustFinish) {
                setIsPlaying(false);
                soundRef.current?.setPositionAsync(0);
              }
            } else if (status.error) {
              console.warn('Playback error:', status.error);
            }
          },
        );

        soundRef.current = sound;
        setIsLoading(false);
        setIsPlaying(true);
      } else {
        if (isPlaying) {
          await soundRef.current.pauseAsync();
          setIsPlaying(false);
        } else {
          await soundRef.current.playAsync();
          setIsPlaying(true);
        }
      }
    } catch (err: any) {
      setIsLoading(false);
      Alert.alert('Audio Error', err?.message || 'Could not play audio track.');
    }
  };

  const handleOpenExternally = async () => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Error', 'Could not open audio file link.');
    }
  };

  const progressPercent =
    durationMillis > 0
      ? Math.min(100, Math.max(0, (positionMillis / durationMillis) * 100))
      : 0;

  return (
    <View
      style={[
        audioStyles.container,
        {
          backgroundColor: theme.mode === 'dark' ? '#0D1A24' : '#F0F6FA',
          borderColor: theme.mode === 'dark' ? '#1E3345' : '#D2DFE9',
        },
      ]}
    >
      <View style={audioStyles.topRow}>
        <Pressable
          style={({ pressed }) => [
            audioStyles.playBtn,
            {
              backgroundColor: '#00FFCC',
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          onPress={handleTogglePlay}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#050A0E" />
          ) : (
            <Text style={audioStyles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
          )}
        </Pressable>

        <View style={audioStyles.infoContainer}>
          <Text
            style={[audioStyles.audioTitle, { color: colors.text }]}
            numberOfLines={1}
          >
            🎵 {name}
          </Text>
          <View style={audioStyles.metaRow}>
            <Text style={[audioStyles.timeText, { color: colors.muted }]}>
              {formatTime(positionMillis)} / {formatTime(durationMillis)}
            </Text>
            {size ? (
              <Text style={[audioStyles.timeText, { color: colors.muted }]}>
                • {(size / (1024 * 1024)).toFixed(1)} MB
              </Text>
            ) : null}
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            audioStyles.openLinkBtn,
            { opacity: pressed ? 0.7 : 1 },
          ]}
          onPress={handleOpenExternally}
        >
          <Text style={audioStyles.openLinkText}>↗</Text>
        </Pressable>
      </View>

      {/* Progress Bar */}
      <View
        style={[
          audioStyles.progressBarTrack,
          {
            backgroundColor: theme.mode === 'dark' ? '#162836' : '#E0E9F0',
          },
        ]}
      >
        <View
          style={[
            audioStyles.progressBarFill,
            {
              width: `${progressPercent}%`,
              backgroundColor: '#00FFCC',
            },
          ]}
        />
      </View>
    </View>
  );
};

const audioStyles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  playIcon: {
    fontSize: 16,
    color: '#050A0E',
    fontWeight: '900',
    marginLeft: 2,
  },
  infoContainer: {
    flex: 1,
  },
  audioTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  openLinkBtn: {
    padding: 8,
    marginLeft: 6,
  },
  openLinkText: {
    color: '#00FFCC',
    fontSize: 16,
    fontWeight: '800',
  },
  progressBarTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
});

/* ------------------------------------------------------------------ */
/*  Main PostDetailScreen                                              */
/* ------------------------------------------------------------------ */

export const PostDetailScreen: React.FC<PostDetailScreenProps> = ({
  postId,
  initialPost,
  onBack,
  onRatingChanged,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const { user } = useAuth();

  const [post, setPost] = useState<PostWithAuthor | null>(initialPost || null);
  const [ratings, setRatings] = useState<PostRatingWithRater[]>([]);
  const [myRating, setMyRating] = useState<number | null>(null);
  const [satisfactionRate, setSatisfactionRate] = useState<number | undefined>(
    initialPost?.satisfaction_rate,
  );
  const [averageScore, setAverageScore] = useState<number | null>(
    initialPost?.average_score ?? null,
  );
  const [isLoading, setIsLoading] = useState(!initialPost);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);

  // Full-screen image preview
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  /* ------------------------------------------------------------------ */
  /*  Fetch Post Details and All Ratings                                */
  /* ------------------------------------------------------------------ */

  const fetchPostAndRatings = useCallback(async () => {
    try {
      // 1. Fetch Post with author
      const { data: postData, error: postErr } = await supabase
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
          )
        `)
        .eq('id', postId)
        .single();

      if (postErr || !postData) {
        console.warn('Error fetching post detail:', postErr?.message);
        return;
      }

      const authorProfile = Array.isArray(postData.profiles)
        ? postData.profiles[0]
        : postData.profiles;

      // 2. Fetch all ratings with rater profile
      const { data: ratingsData, error: ratingsErr } = await supabase
        .from('post_ratings')
        .select(`
          id,
          post_id,
          rater_id,
          score,
          created_at,
          profiles:rater_id (
            username,
            display_name
          )
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: false });

      if (ratingsErr) {
        console.warn('Error fetching ratings:', ratingsErr.message);
      }

      const fetchedRatings: PostRatingWithRater[] = (ratingsData as any[]) || [];
      setRatings(fetchedRatings);

      // Compute statistics
      const count = fetchedRatings.length;
      const total = fetchedRatings.reduce((sum, r) => sum + (r.score ?? 0), 0);
      const avg = count > 0 ? total / count : null;
      const sat = avg !== null ? Math.round((avg / 10) * 1000) / 10 : undefined;

      setAverageScore(avg);
      setSatisfactionRate(sat);

      if (user) {
        const myScore = fetchedRatings.find((r) => r.rater_id === user.id);
        setMyRating(myScore !== undefined ? myScore.score : null);
      }

      setPost({
        id: postData.id,
        author_id: postData.author_id,
        subject: postData.subject,
        content: postData.content,
        image_urls: postData.image_urls,
        document_urls: postData.document_urls,
        is_announcement: Boolean(postData.is_announcement),
        created_at: postData.created_at,
        author: {
          username: authorProfile?.username ?? 'anonymous',
          display_name: authorProfile?.display_name ?? 'Anonymous User',
        },
        ratings_count: count,
        average_score: avg,
        satisfaction_rate: sat,
      });

      if (onRatingChanged) {
        onRatingChanged(sat, count);
      }
    } catch (err: any) {
      console.warn('Failed to load post detail:', err?.message);
    } finally {
      setIsLoading(false);
    }
  }, [postId, user, onRatingChanged]);

  /* ------------------------------------------------------------------ */
  /*  Realtime Subscriptions on post_ratings                            */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    fetchPostAndRatings();

    const channel = supabase
      .channel(`public:post-ratings-${postId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_ratings',
          filter: `post_id=eq.${postId}`,
        },
        () => {
          fetchPostAndRatings();
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [postId, fetchPostAndRatings]);

  /* ------------------------------------------------------------------ */
  /*  Rating Submission Handler                                         */
  /* ------------------------------------------------------------------ */

  const handleRateScore = async (score: number) => {
    if (!user) {
      Alert.alert('Authentication Required', 'Please log in to rate posts.');
      return;
    }

    setIsSubmittingRating(true);
    // Optimistic UI highlight
    setMyRating(score);

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
        // Revert on error
        await fetchPostAndRatings();
      } else {
        await fetchPostAndRatings();
      }
    } catch (err: any) {
      Alert.alert('Rating Error', err?.message || 'Could not save rating.');
      await fetchPostAndRatings();
    } finally {
      setIsSubmittingRating(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Open Document Handler                                             */
  /* ------------------------------------------------------------------ */

  const handleOpenDoc = async (doc: PostAttachmentDoc) => {
    if (!doc.url) return;
    try {
      const canOpen = await Linking.canOpenURL(doc.url);
      if (canOpen) {
        await Linking.openURL(doc.url);
      } else {
        await Linking.openURL(doc.url);
      }
    } catch (err: any) {
      Alert.alert(
        'Cannot Open File',
        `Could not open ${doc.name}: ${err?.message || 'Unsupported format'}`,
      );
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Date Helpers                                                      */
  /* ------------------------------------------------------------------ */

  const formatFullDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const formatRelativeTime = (dateString: string) => {
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

  const isAudioFile = (doc: PostAttachmentDoc) => {
    if (doc.mimeType && doc.mimeType.toLowerCase().startsWith('audio/')) {
      return true;
    }
    const lowerName = (doc.name || '').toLowerCase();
    return (
      lowerName.endsWith('.mp3') ||
      lowerName.endsWith('.m4a') ||
      lowerName.endsWith('.wav') ||
      lowerName.endsWith('.aac') ||
      lowerName.endsWith('.ogg') ||
      lowerName.endsWith('.flac')
    );
  };

  /* ------------------------------------------------------------------ */
  /*  Render Content                                                    */
  /* ------------------------------------------------------------------ */

  if (isLoading && !post) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.main }]}
      >
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#00FFCC" />
          <Text style={[styles.loadingText, { color: colors.muted }]}>
            Loading post…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.main }]}
      >
        <View style={styles.centerLoading}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={[styles.errorTitle, { color: colors.text }]}>
            Post Not Found
          </Text>
          <Pressable style={styles.backButtonInline} onPress={onBack}>
            <Text style={styles.backButtonInlineText}>← Back to Feed</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isAnnouncement = post.is_announcement;
  const authorName = post.author?.display_name || 'Anonymous';
  const authorUsername = post.author?.username || 'user';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.main }]}>
      {/* ── Top Header Bar ── */}
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
          <Text style={styles.backNavText}>Back</Text>
        </Pressable>

        <View style={styles.headerTitleContainer}>
          <Text
            style={[styles.headerScreenTitle, { color: colors.text }]}
            numberOfLines={1}
          >
            {isAnnouncement ? '📢 Announcement' : 'Post Detail'}
          </Text>
        </View>

        {/* Live Satisfaction Rate Pill on Header */}
        <View
          style={[
            styles.headerRatePill,
            {
              backgroundColor:
                satisfactionRate !== undefined
                  ? 'rgba(0, 255, 204, 0.12)'
                  : theme.mode === 'dark'
                  ? '#131F2A'
                  : '#EBF0F5',
              borderColor:
                satisfactionRate !== undefined ? '#00FFCC' : 'transparent',
            },
          ]}
        >
          <Text
            style={[
              styles.headerRateText,
              {
                color:
                  satisfactionRate !== undefined ? '#00FFCC' : colors.muted,
              },
            ]}
          >
            {satisfactionRate !== undefined
              ? `${satisfactionRate}% ★`
              : 'No ratings'}
          </Text>
        </View>
      </View>

      {/* ── Main Scrollable Body ── */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Post Header & Metadata Card ── */}
        <View
          style={[
            styles.postCard,
            {
              backgroundColor: colors.surface,
              borderColor: isAnnouncement
                ? '#FF6600'
                : theme.mode === 'dark'
                ? '#1A2633'
                : '#E0E6EC',
              borderWidth: isAnnouncement ? 2 : 1,
            },
          ]}
        >
          {/* Announcement Banner */}
          {isAnnouncement && (
            <View style={styles.announcementBanner}>
              <Text style={styles.announcementIcon}>📢</Text>
              <Text style={styles.announcementText}>
                OFFICIAL PINNED ANNOUNCEMENT
              </Text>
            </View>
          )}

          {/* Author Row */}
          <View style={styles.authorRow}>
            <View
              style={[
                styles.avatarCircle,
                {
                  backgroundColor: isAnnouncement ? '#FF6600' : colors.primary,
                },
              ]}
            >
              <Text style={styles.avatarLetter}>
                {authorName.charAt(0).toUpperCase()}
              </Text>
            </View>

            <View style={styles.authorMeta}>
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

            <View style={styles.dateMeta}>
              <Text style={[styles.timestampFull, { color: colors.muted }]}>
                {formatFullDate(post.created_at)}
              </Text>
              <Text style={[styles.timestampRelative, { color: colors.muted }]}>
                ({formatRelativeTime(post.created_at)})
              </Text>
            </View>
          </View>

          {/* Post Subject */}
          <Text style={[styles.postSubject, { color: colors.text }]}>
            {post.subject}
          </Text>

          {/* Post Content */}
          <Text
            style={[
              styles.postContent,
              {
                color: theme.mode === 'dark' ? '#E1E8EE' : '#2D3748',
              },
            ]}
            selectable
          >
            {post.content}
          </Text>

          {/* ── Scrollable Image Attachments ── */}
          {post.image_urls && post.image_urls.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
                Attached Photos ({post.image_urls.length})
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.imageScrollContainer}
              >
                <View style={styles.imageGalleryRow}>
                  {post.image_urls.map((imgUrl, imgIdx) => (
                    <Pressable
                      key={`img-detail-${imgIdx}`}
                      style={styles.imageWrapper}
                      onPress={() => setPreviewImage(imgUrl)}
                    >
                      <Image
                        source={{ uri: imgUrl }}
                        style={styles.postImage}
                        resizeMode="cover"
                      />
                      <View style={styles.imageExpandBadge}>
                        <Text style={styles.imageExpandIcon}>🔍</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {/* ── Document / Audio Attachments ── */}
          {post.document_urls && post.document_urls.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
                Attached Files & Media ({post.document_urls.length})
              </Text>
              {post.document_urls.map(
                (doc: PostAttachmentDoc, docIdx: number) => {
                  const isAudio = isAudioFile(doc);

                  if (isAudio) {
                    return (
                      <InlineAudioPlayer
                        key={`audio-${docIdx}`}
                        url={doc.url}
                        name={doc.name}
                        size={doc.size}
                      />
                    );
                  }

                  return (
                    <Pressable
                      key={`doc-chip-${docIdx}`}
                      style={({ pressed }) => [
                        styles.docChip,
                        {
                          backgroundColor:
                            theme.mode === 'dark' ? '#111D27' : '#F0F4F8',
                          borderColor:
                            theme.mode === 'dark' ? '#1D2E3F' : '#D8E2EC',
                          opacity: pressed ? 0.75 : 1,
                        },
                      ]}
                      onPress={() => handleOpenDoc(doc)}
                    >
                      <View style={styles.docChipLeft}>
                        <Text style={styles.docChipIcon}>📄</Text>
                        <View style={styles.docChipTextCol}>
                          <Text
                            style={[
                              styles.docChipName,
                              { color: colors.text },
                            ]}
                            numberOfLines={1}
                          >
                            {doc.name}
                          </Text>
                          {doc.size ? (
                            <Text
                              style={[
                                styles.docChipSize,
                                { color: colors.muted },
                              ]}
                            >
                              {(doc.size / 1024).toFixed(0)} KB • Click to open
                              in browser / viewer
                            </Text>
                          ) : (
                            <Text
                              style={[
                                styles.docChipSize,
                                { color: colors.muted },
                              ]}
                            >
                              Click to open document
                            </Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.docChipArrow}>
                        <Text style={styles.docChipArrowText}>Open ↗</Text>
                      </View>
                    </Pressable>
                  );
                },
              )}
            </View>
          )}
        </View>

        {/* ── Interactive Ratings Section ── */}
        <View
          style={[
            styles.ratingsSectionCard,
            {
              backgroundColor: colors.surface,
              borderColor: theme.mode === 'dark' ? '#1A2633' : '#E0E6EC',
            },
          ]}
        >
          {/* Section Header */}
          <View style={styles.ratingsSectionHeader}>
            <Text style={styles.ratingsSectionTitleIcon}>⭐</Text>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.ratingsSectionTitle, { color: colors.text }]}
              >
                Satisfaction Rate & Ratings
              </Text>
              <Text
                style={[styles.ratingsSectionSub, { color: colors.muted }]}
              >
                Vote on this post and see all member ratings
              </Text>
            </View>
          </View>

          {/* Live Satisfaction Gauge Banner */}
          <View
            style={[
              styles.satisfactionHeroBanner,
              {
                backgroundColor:
                  theme.mode === 'dark' ? '#07121A' : '#F5FAFA',
                borderColor: '#00FFCC',
              },
            ]}
          >
            <View style={styles.satisfactionHeroLeft}>
              <Text style={styles.satisfactionHeroLabel}>
                LIVE SATISFACTION RATE
              </Text>
              <Text style={styles.satisfactionHeroPercent}>
                {satisfactionRate !== undefined
                  ? `${satisfactionRate}%`
                  : 'N/A'}
              </Text>
              <Text
                style={[styles.satisfactionHeroCount, { color: colors.muted }]}
              >
                {ratings.length}{' '}
                {ratings.length === 1 ? 'total rating' : 'total ratings'}
                {averageScore !== null
                  ? ` • Avg: ${averageScore.toFixed(1)} / 10`
                  : ''}
              </Text>
            </View>

            {/* Satisfaction Meter Progress Bar */}
            <View style={styles.satisfactionHeroRight}>
              <View
                style={[
                  styles.satisfactionHeroMeterTrack,
                  {
                    backgroundColor:
                      theme.mode === 'dark' ? '#122330' : '#E2EBF2',
                  },
                ]}
              >
                <View
                  style={[
                    styles.satisfactionHeroMeterFill,
                    {
                      width: `${Math.min(
                        100,
                        Math.max(0, satisfactionRate ?? 0),
                      )}%`,
                    },
                  ]}
                />
              </View>
              <Text
                style={[styles.satisfactionFormulaText, { color: colors.muted }]}
              >
                (Avg Score / 10) * 100%
              </Text>
            </View>
          </View>

          {/* ── Interactive 0–10 Rating Button Wrap Row ── */}
          <View style={styles.ratingSelectorWrapper}>
            <View style={styles.ratingSelectorTitleRow}>
              <Text
                style={[styles.ratingSelectorPrompt, { color: colors.text }]}
              >
                Tap a number to rate this post (0–10):
              </Text>
              {myRating !== null && (
                <View style={styles.myRatingPill}>
                  <Text style={styles.myRatingPillText}>
                    Your rating: {myRating}/10 ✓
                  </Text>
                </View>
              )}
            </View>

            {isSubmittingRating && (
              <View style={styles.ratingSubmittingRow}>
                <ActivityIndicator size="small" color="#00FFCC" />
                <Text style={[styles.submittingText, { color: '#00FFCC' }]}>
                  Saving rating…
                </Text>
              </View>
            )}

            {/* 11 distinct buttons in responsive wrap row */}
            <View style={styles.ratingButtonsWrapRow}>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => {
                const isSelected = myRating === score;
                return (
                  <Pressable
                    key={`rating-num-${score}`}
                    style={({ pressed }) => [
                      styles.ratingButtonBox,
                      {
                        backgroundColor: isSelected
                          ? '#00FFCC'
                          : theme.mode === 'dark'
                          ? '#101B24'
                          : '#EEF3F8',
                        borderColor: isSelected
                          ? '#00FFCC'
                          : theme.mode === 'dark'
                          ? '#223545'
                          : '#CFD9E3',
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}
                    onPress={() => handleRateScore(score)}
                    disabled={isSubmittingRating}
                  >
                    <Text
                      style={[
                        styles.ratingButtonText,
                        {
                          color: isSelected ? '#050A0E' : colors.text,
                          fontWeight: isSelected ? '900' : '700',
                        },
                      ]}
                    >
                      {score}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ── Member Ratings List (`Display Name: X/10`) ── */}
          <View style={styles.otherRatingsBlock}>
            <View style={styles.otherRatingsHeaderRow}>
              <Text
                style={[styles.otherRatingsTitle, { color: colors.text }]}
              >
                Community Ratings ({ratings.length})
              </Text>
              <Text
                style={[styles.otherRatingsSub, { color: colors.muted }]}
              >
                Live updates via Supabase
              </Text>
            </View>

            {ratings.length === 0 ? (
              <View
                style={[
                  styles.emptyRatingsBox,
                  {
                    backgroundColor:
                      theme.mode === 'dark' ? '#091219' : '#F6F9FC',
                  },
                ]}
              >
                <Text style={styles.emptyRatingsEmoji}>⭐</Text>
                <Text
                  style={[styles.emptyRatingsTitle, { color: colors.text }]}
                >
                  No ratings yet
                </Text>
                <Text
                  style={[styles.emptyRatingsText, { color: colors.muted }]}
                >
                  Be the first to rate this post using the numbers above!
                </Text>
              </View>
            ) : (
              <View style={styles.ratingsListContainer}>
                {ratings.map((ratingItem, index) => {
                  const raterProfile = ratingItem.profiles;
                  const raterName =
                    raterProfile?.display_name || 'Community Member';
                  const raterUsername = raterProfile?.username || 'member';
                  const isCurrentUser = user && ratingItem.rater_id === user.id;

                  // High-score color scaling
                  const scoreColor =
                    ratingItem.score >= 8
                      ? '#00FFCC'
                      : ratingItem.score >= 5
                      ? '#FFCC00'
                      : '#FF6666';

                  return (
                    <View
                      key={`rater-item-${ratingItem.id || index}`}
                      style={[
                        styles.raterCard,
                        {
                          backgroundColor:
                            theme.mode === 'dark' ? '#0A141D' : '#F8FAFC',
                          borderColor: isCurrentUser
                            ? '#00FFCC'
                            : theme.mode === 'dark'
                            ? '#172533'
                            : '#E3EAF0',
                        },
                      ]}
                    >
                      <View style={styles.raterLeft}>
                        <View
                          style={[
                            styles.raterAvatar,
                            {
                              backgroundColor: isCurrentUser
                                ? '#00FFCC'
                                : theme.mode === 'dark'
                                ? '#1A2938'
                                : '#D0DEE9',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.raterAvatarLetter,
                              {
                                color: isCurrentUser
                                  ? '#050A0E'
                                  : colors.text,
                              },
                            ]}
                          >
                            {raterName.charAt(0).toUpperCase()}
                          </Text>
                        </View>

                        <View style={styles.raterInfoCol}>
                          <View style={styles.raterNameRow}>
                            <Text
                              style={[
                                styles.raterDisplayName,
                                { color: colors.text },
                              ]}
                              numberOfLines={1}
                            >
                              {raterName}
                            </Text>
                            {isCurrentUser && (
                              <View style={styles.youBadge}>
                                <Text style={styles.youBadgeText}>YOU</Text>
                              </View>
                            )}
                          </View>
                          <Text
                            style={[
                              styles.raterUsername,
                              { color: colors.muted },
                            ]}
                            numberOfLines={1}
                          >
                            @{raterUsername} •{' '}
                            {formatRelativeTime(ratingItem.created_at)}
                          </Text>
                        </View>
                      </View>

                      {/* Score Badge: Display Name: X/10 */}
                      <View
                        style={[
                          styles.raterScoreBadge,
                          {
                            backgroundColor:
                              theme.mode === 'dark' ? '#11202C' : '#EEF5FB',
                            borderColor: scoreColor,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.raterScoreValue,
                            { color: scoreColor },
                          ]}
                        >
                          {ratingItem.score}/10
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>

        {/* Bottom space */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Fullscreen Image Preview Modal ── */}
      <Modal
        visible={Boolean(previewImage)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImage(null)}
      >
        <SafeAreaView style={styles.imagePreviewModalOverlay}>
          <Pressable
            style={styles.imagePreviewCloseBtn}
            onPress={() => setPreviewImage(null)}
          >
            <Text style={styles.imagePreviewCloseText}>✕ Close</Text>
          </Pressable>
          {previewImage && (
            <Image
              source={{ uri: previewImage }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}
        </SafeAreaView>
      </Modal>
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
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 16,
  },
  backButtonInline: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#00FFCC',
    borderRadius: 8,
  },
  backButtonInlineText: {
    color: '#050A0E',
    fontWeight: '800',
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
    paddingRight: 10,
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
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerScreenTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  headerRatePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  headerRateText: {
    fontSize: 12,
    fontWeight: '800',
  },

  /* ── Scroll Content ── */
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },

  /* ── Post Card ── */
  postCard: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  announcementBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6600',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 14,
  },
  announcementIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  announcementText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  /* ── Author Row ── */
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarLetter: {
    color: '#050A0E',
    fontSize: 18,
    fontWeight: '900',
  },
  authorMeta: {
    flex: 1,
  },
  authorDisplayName: {
    fontSize: 16,
    fontWeight: '800',
  },
  authorUsername: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 1,
  },
  dateMeta: {
    alignItems: 'flex-end',
  },
  timestampFull: {
    fontSize: 11,
    fontWeight: '600',
  },
  timestampRelative: {
    fontSize: 10,
    marginTop: 2,
  },

  /* ── Post Body ── */
  postSubject: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.3,
    lineHeight: 26,
    marginBottom: 12,
  },
  postContent: {
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 18,
  },

  /* ── Attachments ── */
  sectionBlock: {
    marginTop: 8,
    marginBottom: 10,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  imageScrollContainer: {
    marginBottom: 6,
  },
  imageGalleryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  imageWrapper: {
    width: 200,
    height: 140,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  postImage: {
    width: '100%',
    height: '100%',
  },
  imageExpandBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  imageExpandIcon: {
    fontSize: 11,
  },
  docChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  docChipLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  docChipIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  docChipTextCol: {
    flex: 1,
  },
  docChipName: {
    fontSize: 14,
    fontWeight: '700',
  },
  docChipSize: {
    fontSize: 11,
    marginTop: 2,
  },
  docChipArrow: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(0, 255, 204, 0.12)',
    borderRadius: 6,
    marginLeft: 10,
  },
  docChipArrowText: {
    color: '#00FFCC',
    fontSize: 12,
    fontWeight: '800',
  },

  /* ── Ratings Section ── */
  ratingsSectionCard: {
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  ratingsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  ratingsSectionTitleIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  ratingsSectionTitle: {
    fontSize: 17,
    fontWeight: '900',
  },
  ratingsSectionSub: {
    fontSize: 12,
    marginTop: 2,
  },

  /* ── Live Satisfaction Hero ── */
  satisfactionHeroBanner: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  satisfactionHeroLeft: {
    flex: 1,
  },
  satisfactionHeroLabel: {
    color: '#00FFCC',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 4,
  },
  satisfactionHeroPercent: {
    color: '#00FFCC',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  satisfactionHeroCount: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  satisfactionHeroRight: {
    width: '45%',
    alignItems: 'center',
  },
  satisfactionHeroMeterTrack: {
    width: '100%',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 6,
  },
  satisfactionHeroMeterFill: {
    height: '100%',
    backgroundColor: '#00FFCC',
    borderRadius: 5,
  },
  satisfactionFormulaText: {
    fontSize: 10,
    fontWeight: '500',
  },

  /* ── 0–10 Rating Button Wrap Row ── */
  ratingSelectorWrapper: {
    marginBottom: 24,
  },
  ratingSelectorTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 6,
  },
  ratingSelectorPrompt: {
    fontSize: 14,
    fontWeight: '800',
  },
  myRatingPill: {
    backgroundColor: 'rgba(0, 255, 204, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#00FFCC',
  },
  myRatingPillText: {
    color: '#00FFCC',
    fontSize: 12,
    fontWeight: '800',
  },
  ratingSubmittingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  submittingText: {
    fontSize: 12,
    fontWeight: '700',
  },
  ratingButtonsWrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  ratingButtonBox: {
    width: '15.5%',
    aspectRatio: 1,
    minWidth: 42,
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingButtonText: {
    fontSize: 16,
  },

  /* ── Other Ratings List ── */
  otherRatingsBlock: {
    marginTop: 6,
  },
  otherRatingsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  otherRatingsTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  otherRatingsSub: {
    fontSize: 11,
    fontWeight: '500',
  },
  emptyRatingsBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderRadius: 12,
  },
  emptyRatingsEmoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  emptyRatingsTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyRatingsText: {
    fontSize: 12,
    textAlign: 'center',
  },
  ratingsListContainer: {
    gap: 8,
  },
  raterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  raterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  raterAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  raterAvatarLetter: {
    fontSize: 14,
    fontWeight: '800',
  },
  raterInfoCol: {
    flex: 1,
  },
  raterNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  raterDisplayName: {
    fontSize: 14,
    fontWeight: '700',
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
  raterUsername: {
    fontSize: 11,
    marginTop: 2,
  },
  raterScoreBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    marginLeft: 10,
  },
  raterScoreValue: {
    fontSize: 14,
    fontWeight: '900',
  },

  /* ── Image Fullscreen Modal ── */
  imagePreviewModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 10, 14, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePreviewCloseBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 20,
    right: 20,
    zIndex: 10,
    backgroundColor: '#00FFCC',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  imagePreviewCloseText: {
    color: '#050A0E',
    fontSize: 14,
    fontWeight: '900',
  },
  fullscreenImage: {
    width: '92%',
    height: '75%',
  },
});

export default PostDetailScreen;
