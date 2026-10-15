/**
 * src/screens/Chat/GroupChatScreen.tsx
 *
 * Realtime Group Chat Screen for Gruup Social.
 *
 * Features:
 *  - Supabase Realtime WebSocket subscription on messages, polls, and poll_votes.
 *  - Collapsible sticky Pinned Messages header at the top (is_pinned = true).
 *  - Message Bubbles:
 *     * Hyperlink support: auto-parses URLs (http, https, www), styled in underlined #00FFCC, opens via Linking.openURL().
 *     * Photos & Videos: Inline thumbnails with fullscreen zoom modal; inline Video player with expo-av native controls.
 *     * Animated GIFs: Rendered cleanly with Giphy integration.
 *     * Voice Notes: Audio.Recording (.m4a), uploads to chat-media, inline scrubber playback via VoiceMessagePlayer.
 *     * Documents: Document picker (.pdf, audio, docs), uploads to chat-media, clean card with tap to open.
 *     * Polls: Interactive poll card with vote percentages and one-tap voting on poll_votes.
 *  - Message Context Menu (on long-press):
 *     * Pin / Unpin Message
 *     * Delete Message (sender or admin; sets is_deleted = true)
 *     * Report Offense to Admins (opens modal, inserts into offense_reports)
 *  - Sliding-window rate limit burst detection & account mute checks.
 *
 * Strictly uses React Native primitives:
 *   FlatList, KeyboardAvoidingView, Pressable, Modal, View, Text, TextInput, Image, ActivityIndicator, StyleSheet, SafeAreaView.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Modal,
  Image,
  KeyboardAvoidingView,
  SafeAreaView,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import * as Linking from 'expo-linking';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Audio, Video, ResizeMode } from 'expo-av';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { supabase } from '../../services/supabase';
import { uploadChatMedia } from '../../services/storage';
import type {
  ChatMessageWithSender,
  PollWithVotes,
  MessageType,
  PollVote,
} from '../../types/database';

import { VoiceMessagePlayer } from '../../components/Chat/VoiceMessagePlayer';
import { PollCard } from '../../components/Chat/PollCard';
import { CreatePollModal } from '../../components/Chat/CreatePollModal';
import { GiphyModal } from '../../components/Chat/GiphyModal';
import { ReportOffenseModal } from '../../components/Chat/ReportOffenseModal';
import { MessageContextMenu } from '../../components/Chat/MessageContextMenu';
import { PinnedMessagesBar } from '../../components/Chat/PinnedMessagesBar';

export const GroupChatScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const { user } = useAuth();

  // Chat messages state (ordered newest first for inverted FlatList)
  const [messages, setMessages] = useState<ChatMessageWithSender[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [inputText, setInputText] = useState('');

  // Attachments menu & modals
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [isGiphyModalVisible, setIsGiphyModalVisible] = useState(false);
  const [isPollModalVisible, setIsPollModalVisible] = useState(false);
  const [isReportModalVisible, setIsReportModalVisible] = useState(false);
  const [fullscreenImageUrl, setFullscreenImageUrl] = useState<string | null>(null);

  // Context menu on long-press
  const [contextMenuMessage, setContextMenuMessage] =
    useState<ChatMessageWithSender | null>(null);

  // Audio recording state
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDurationSec, setRecordingDurationSec] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Spam rate-limiting state
  const recentMessageTimestamps = useRef<number[]>([]);
  const lastSentContent = useRef<string>('');

  // Supabase Realtime channel ref
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const flatListRef = useRef<FlatList<ChatMessageWithSender>>(null);

  const borderColor = theme.mode === 'dark' ? '#1A2633' : '#E0E6EC';

  /* ------------------------------------------------------------------ */
  /*  Fetch Messages & Polls                                             */
  /* ------------------------------------------------------------------ */

  const fetchPollsData = useCallback(async (): Promise<
    Record<string, PollWithVotes>
  > => {
    try {
      const { data: rawPolls, error: pollsErr } = await supabase
        .from('polls')
        .select(`
          id,
          message_id,
          question,
          options,
          poll_votes (
            id,
            poll_id,
            voter_id,
            option_index
          )
        `);

      if (pollsErr || !rawPolls) return {};

      const map: Record<string, PollWithVotes> = {};
      for (const p of rawPolls) {
        const votes: PollVote[] = (p.poll_votes as any) || [];
        const rawOpts = p.options || [];
        const optLen = Array.isArray(rawOpts) ? rawOpts.length : 2;
        const counts = new Array(optLen).fill(0);

        let userVote: number | null = null;
        for (const v of votes) {
          if (v.option_index >= 0 && v.option_index < optLen) {
            counts[v.option_index] += 1;
          }
          if (user && v.voter_id === user.id) {
            userVote = v.option_index;
          }
        }

        map[p.message_id] = {
          id: p.id,
          message_id: p.message_id,
          question: p.question,
          options: p.options,
          votes,
          userVoteIndex: userVote,
          totalVotes: votes.length,
          optionCounts: counts,
        };
      }
      return map;
    } catch {
      return {};
    }
  }, [user]);

  const loadMessages = useCallback(async () => {
    try {
      const pollsMap = await fetchPollsData();

      const { data, error } = await supabase
        .from('messages')
        .select(`
          id,
          sender_id,
          content,
          message_type,
          media_url,
          media_meta,
          is_pinned,
          is_deleted,
          created_at,
          profiles:sender_id (
            id,
            username,
            display_name,
            role
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error || !data) {
        console.warn('Error loading chat messages:', error?.message);
        return;
      }

      const mapped: ChatMessageWithSender[] = data.map((item: any) => {
        const authorProfile = Array.isArray(item.profiles)
          ? item.profiles[0]
          : item.profiles;

        return {
          id: item.id,
          sender_id: item.sender_id,
          content: item.content,
          message_type: item.message_type,
          media_url: item.media_url,
          media_meta: item.media_meta,
          is_pinned: Boolean(item.is_pinned),
          is_deleted: Boolean(item.is_deleted),
          created_at: item.created_at,
          sender: authorProfile
            ? {
                id: authorProfile.id,
                username: authorProfile.username,
                display_name: authorProfile.display_name,
                role: authorProfile.role,
              }
            : null,
          poll: pollsMap[item.id] ?? null,
        };
      });

      setMessages(mapped);
    } catch (err: any) {
      console.warn('Fetch error:', err?.message);
    } finally {
      setIsLoading(false);
    }
  }, [fetchPollsData]);

  /* ------------------------------------------------------------------ */
  /*  Supabase Realtime Subscription                                     */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    loadMessages();

    // Subscribe to messages, polls, and poll_votes
    const channel = supabase
      .channel('group-chat-room')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => {
          loadMessages();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'polls' },
        () => {
          loadMessages();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'poll_votes' },
        () => {
          loadMessages();
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, [loadMessages]);

  /* ------------------------------------------------------------------ */
  /*  Spam / Rate-Limit Check                                            */
  /* ------------------------------------------------------------------ */

  const checkRateLimits = (text?: string): boolean => {
    if (user?.mute_status && user.mute_status !== 'none') {
      Alert.alert(
        'Muted from Chat',
        'You have been muted from sending messages in the group chat.',
      );
      return false;
    }

    if (user?.status === 'suspended') {
      Alert.alert('Suspended', 'Your account is currently suspended.');
      return false;
    }

    const now = Date.now();
    // Sliding 5-second burst window
    recentMessageTimestamps.current = recentMessageTimestamps.current.filter(
      (t) => now - t < 5000,
    );

    if (recentMessageTimestamps.current.length >= 5) {
      Alert.alert(
        'Slow Down!',
        'You are sending messages too fast (burst limit: 5 messages in 5s). Please pause for a few seconds.',
      );
      return false;
    }

    // Duplicate detection
    if (
      text &&
      text.trim().length > 3 &&
      text.trim().toLowerCase() === lastSentContent.current.trim().toLowerCase()
    ) {
      Alert.alert(
        'Duplicate Message',
        'Please avoid spamming identical messages in chat.',
      );
      return false;
    }

    recentMessageTimestamps.current.push(now);
    if (text) {
      lastSentContent.current = text;
    }
    return true;
  };

  /* ------------------------------------------------------------------ */
  /*  Send Message Handler                                               */
  /* ------------------------------------------------------------------ */

  const handleSendMessage = async (payload: {
    content?: string | null;
    message_type: MessageType;
    media_url?: string | null;
    media_meta?: any;
  }) => {
    if (!user) {
      Alert.alert('Authentication Error', 'Please log in again.');
      return;
    }

    if (!checkRateLimits(payload.content || undefined)) {
      return;
    }

    try {
      setIsSending(true);

      const { data, error } = await supabase
        .from('messages')
        .insert({
          sender_id: user.id,
          content: payload.content || null,
          message_type: payload.message_type,
          media_url: payload.media_url || null,
          media_meta: payload.media_meta || null,
          is_pinned: false,
          is_deleted: false,
        })
        .select()
        .single();

      if (error || !data) {
        throw new Error(error?.message || 'Failed to send message.');
      }

      setInputText('');
      setIsAttachMenuOpen(false);
      // Realtime channel will trigger loadMessages(), but we can also reload
      loadMessages();
    } catch (err: any) {
      Alert.alert('Send Error', err?.message || 'Could not send message.');
    } finally {
      setIsSending(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Text Send                                                          */
  /* ------------------------------------------------------------------ */

  const handleSendText = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    handleSendMessage({
      content: trimmed,
      message_type: 'text',
    });
  };

  /* ------------------------------------------------------------------ */
  /*  Media Pickers (Photos / Videos / Docs)                            */
  /* ------------------------------------------------------------------ */

  const handlePickMedia = async (mode: 'camera' | 'library') => {
    setIsAttachMenuOpen(false);
    try {
      if (mode === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Camera Permission Required',
            'Please allow camera access in system settings to take photos.',
          );
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          quality: 0.8,
          allowsEditing: false,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
          await uploadAndSendAsset(result.assets[0]);
        }
      } else {
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Gallery Permission Required',
            'Please allow photo library access in system settings.',
          );
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          quality: 0.8,
          allowsMultipleSelection: false,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
          await uploadAndSendAsset(result.assets[0]);
        }
      }
    } catch (err: any) {
      Alert.alert('Media Error', err?.message || 'Could not pick media.');
    }
  };

  const uploadAndSendAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    try {
      setIsSending(true);
      const isVideo =
        asset.type === 'video' ||
        (asset.mimeType && asset.mimeType.startsWith('video/'));

      const ext = isVideo ? 'mp4' : 'jpg';
      const fileName =
        asset.fileName || `media_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
      const mimeType =
        asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg');

      const uploaded = await uploadChatMedia(
        asset.uri,
        fileName,
        mimeType,
        asset.fileSize,
      );

      await handleSendMessage({
        content: isVideo ? 'Video' : 'Photo',
        message_type: isVideo ? 'video' : 'photo',
        media_url: uploaded.url,
        media_meta: {
          name: fileName,
          size: asset.fileSize,
          mimeType,
          width: asset.width,
          height: asset.height,
          duration: asset.duration,
        },
      });
    } catch (err: any) {
      Alert.alert('Upload Failed', err?.message || 'Could not upload media.');
    } finally {
      setIsSending(false);
    }
  };

  const handlePickDocument = async () => {
    setIsAttachMenuOpen(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setIsSending(true);

        const uploaded = await uploadChatMedia(
          file.uri,
          file.name,
          file.mimeType,
          file.size,
        );

        await handleSendMessage({
          content: `Document: ${file.name}`,
          message_type: 'document',
          media_url: uploaded.url,
          media_meta: {
            name: file.name,
            size: file.size,
            mimeType: file.mimeType,
          },
        });
      }
    } catch (err: any) {
      Alert.alert('Document Error', err?.message || 'Could not pick document.');
    } finally {
      setIsSending(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Voice Recording via expo-av                                        */
  /* ------------------------------------------------------------------ */

  const handleToggleVoiceRecord = async () => {
    if (isRecording) {
      // Finish and send
      await handleStopAndSendVoice();
    } else {
      // Start recording
      await handleStartVoiceRecord();
    }
  };

  const handleStartVoiceRecord = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert(
          'Microphone Permission Required',
          'Please allow microphone access to record voice messages.',
        );
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const newRec = new Audio.Recording();
      await newRec.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      await newRec.startAsync();

      setRecording(newRec);
      setIsRecording(true);
      setRecordingDurationSec(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDurationSec((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      Alert.alert('Recording Failed', err?.message || 'Could not start recording.');
    }
  };

  const handleStopAndSendVoice = async () => {
    if (!recording) return;

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    const duration = recordingDurationSec;
    setIsRecording(false);

    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = recording.getURI();
      setRecording(null);

      if (!uri) return;

      if (duration < 1) {
        Alert.alert(
          'Voice Note Too Short',
          'Voice messages must be at least 1 second.',
        );
        return;
      }

      setIsSending(true);
      const fileName = `voice_${Date.now()}.m4a`;
      const uploaded = await uploadChatMedia(uri, fileName, 'audio/m4a');

      await handleSendMessage({
        content: 'Voice note',
        message_type: 'voice',
        media_url: uploaded.url,
        media_meta: {
          name: fileName,
          duration,
          mimeType: 'audio/m4a',
        },
      });
    } catch (err: any) {
      Alert.alert('Voice Upload Error', err?.message || 'Could not send audio.');
    } finally {
      setIsSending(false);
    }
  };

  const handleCancelVoiceRecord = async () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    setRecordingDurationSec(0);

    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      } catch {}
      setRecording(null);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Poll Creation & Voting                                            */
  /* ------------------------------------------------------------------ */

  const handleCreatePoll = async (question: string, options: string[]) => {
    if (!user) return;

    // 1. Insert message with message_type = 'poll'
    const { data: msgData, error: msgErr } = await supabase
      .from('messages')
      .insert({
        sender_id: user.id,
        content: question,
        message_type: 'poll',
        is_pinned: false,
        is_deleted: false,
      })
      .select()
      .single();

    if (msgErr || !msgData) {
      throw new Error(msgErr?.message || 'Failed to create poll message.');
    }

    // 2. Insert into polls table
    const { error: pollErr } = await supabase.from('polls').insert({
      message_id: msgData.id,
      question,
      options,
    });

    if (pollErr) {
      throw new Error(pollErr.message);
    }

    loadMessages();
  };

  const handleVotePoll = async (pollId: string, optionIndex: number) => {
    if (!user) return;

    try {
      const { error } = await supabase.from('poll_votes').upsert(
        {
          poll_id: pollId,
          voter_id: user.id,
          option_index: optionIndex,
        },
        { onConflict: 'poll_id,voter_id' },
      );

      if (error) {
        Alert.alert('Voting Error', error.message);
      } else {
        loadMessages();
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not submit vote.');
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Giphy Picker Callback                                              */
  /* ------------------------------------------------------------------ */

  const handleSelectGif = (gifUrl: string, title?: string) => {
    handleSendMessage({
      content: title || 'GIF',
      message_type: 'gif',
      media_url: gifUrl,
    });
  };

  /* ------------------------------------------------------------------ */
  /*  Context Menu Actions (Pin / Delete / Report)                      */
  /* ------------------------------------------------------------------ */

  const handleTogglePinMessage = async (msg: ChatMessageWithSender) => {
    try {
      const nextPin = !msg.is_pinned;
      const { error } = await supabase
        .from('messages')
        .update({ is_pinned: nextPin })
        .eq('id', msg.id);

      if (error) {
        Alert.alert('Pin Error', error.message);
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id ? { ...m, is_pinned: nextPin } : m,
          ),
        );
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not update pin state.');
    }
  };

  const handleDeleteMessage = async (msg: ChatMessageWithSender) => {
    try {
      const { error } = await supabase
        .from('messages')
        .update({
          is_deleted: true,
          content: 'Message deleted',
        })
        .eq('id', msg.id);

      if (error) {
        Alert.alert('Delete Error', error.message);
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id
              ? { ...m, is_deleted: true, content: 'Message deleted' }
              : m,
          ),
        );
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not delete message.');
    }
  };

  const handleSubmitOffenseReport = async (
    messageId: string,
    reportedUserId: string,
    reason: string,
  ) => {
    if (!user) return;
    const { error } = await supabase.from('offense_reports').insert({
      message_id: messageId,
      reporter_id: user.id,
      reported_user_id: reportedUserId,
      reason,
      status: 'pending',
    });

    if (error) {
      throw new Error(error.message);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Hyperlink Tap                                                     */
  /* ------------------------------------------------------------------ */

  const handleUrlPress = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Cannot Open Link', `The link ${url} could not be opened.`);
      }
    } catch {
      Alert.alert('Error', 'Failed to open link.');
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Helper Text Parsers & Formatters                                   */
  /* ------------------------------------------------------------------ */

  const renderParsedMessageContent = (
    text: string,
    isSender: boolean,
  ) => {
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
    const parts: Array<{ text: string; isUrl: boolean; url?: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = urlRegex.exec(text)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIndex) {
        parts.push({
          text: text.substring(lastIndex, matchIndex),
          isUrl: false,
        });
      }
      const rawUrl = match[0];
      const fullUrl =
        rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
          ? rawUrl
          : `https://${rawUrl}`;

      parts.push({
        text: rawUrl,
        isUrl: true,
        url: fullUrl,
      });
      lastIndex = urlRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push({
        text: text.substring(lastIndex),
        isUrl: false,
      });
    }

    return (
      <Text style={[styles.messageText, { color: '#FFFFFF' }]}>
        {parts.map((part, idx) =>
          part.isUrl ? (
            <Text
              key={`part-${idx}`}
              onPress={() => handleUrlPress(part.url!)}
              style={styles.hyperlink}
            >
              {part.text}
            </Text>
          ) : (
            <Text key={`part-${idx}`}>{part.text}</Text>
          ),
        )}
      </Text>
    );
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const pinnedMessages = messages.filter((m) => m.is_pinned && !m.is_deleted);

  /* ------------------------------------------------------------------ */
  /*  Render Individual Message Bubble                                   */
  /* ------------------------------------------------------------------ */

  const renderMessageItem = ({ item }: { item: ChatMessageWithSender }) => {
    const isSender = user?.id === item.sender_id;
    const isDeleted = item.is_deleted;
    const senderName = item.sender?.display_name || item.sender?.username || 'User';
    const isAdmin = item.sender?.role === 'admin';

    return (
      <Pressable
        onLongPress={() => setContextMenuMessage(item)}
        delayLongPress={350}
        style={[
          styles.messageRow,
          {
            justifyContent: isSender ? 'flex-end' : 'flex-start',
          },
        ]}
      >
        <View
          style={[
            styles.messageBubble,
            {
              backgroundColor: isSender ? '#072421' : colors.surface,
              borderColor: isSender ? '#00FFCC55' : borderColor,
              borderWidth: 1,
            },
          ]}
        >
          {/* Header row: Sender name & Admin badge & Pin indicator */}
          <View style={styles.bubbleHeaderRow}>
            <View style={styles.senderInfoRow}>
              <Text
                style={[
                  styles.senderNameText,
                  { color: isSender ? colors.primary : colors.muted },
                ]}
              >
                {isSender ? 'You' : senderName}
              </Text>
              {isAdmin && (
                <View style={styles.adminBadge}>
                  <Text style={styles.adminBadgeText}>🛡️ ADMIN</Text>
                </View>
              )}
            </View>

            {item.is_pinned && (
              <View style={styles.pinIndicatorBadge}>
                <Text style={styles.pinIndicatorText}>📌 PINNED</Text>
              </View>
            )}
          </View>

          {/* Deleted state */}
          {isDeleted ? (
            <Text style={[styles.deletedMessageText, { color: colors.muted }]}>
              🗑️ Message deleted
            </Text>
          ) : (
            <>
              {/* Photo Attachment */}
              {item.message_type === 'photo' && item.media_url && (
                <Pressable
                  onPress={() => setFullscreenImageUrl(item.media_url!)}
                  style={styles.photoContainer}
                >
                  <Image
                    source={{ uri: item.media_url }}
                    style={styles.inlinePhoto}
                    resizeMode="cover"
                  />
                </Pressable>
              )}

              {/* Video Attachment */}
              {item.message_type === 'video' && item.media_url && (
                <View style={styles.videoContainer}>
                  <Video
                    source={{ uri: item.media_url }}
                    style={styles.inlineVideo}
                    useNativeControls
                    resizeMode={ResizeMode.CONTAIN}
                    isLooping={false}
                  />
                </View>
              )}

              {/* GIF Attachment */}
              {item.message_type === 'gif' && item.media_url && (
                <Pressable
                  onPress={() => setFullscreenImageUrl(item.media_url!)}
                  style={styles.gifContainer}
                >
                  <Image
                    source={{ uri: item.media_url }}
                    style={styles.inlineGif}
                    resizeMode="cover"
                  />
                </Pressable>
              )}

              {/* Voice Message */}
              {item.message_type === 'voice' && item.media_url && (
                <VoiceMessagePlayer
                  url={item.media_url}
                  initialDurationSeconds={item.media_meta?.duration}
                  isSender={isSender}
                />
              )}

              {/* Document Attachment */}
              {item.message_type === 'document' && item.media_url && (
                <Pressable
                  onPress={() => handleUrlPress(item.media_url!)}
                  style={[
                    styles.documentCard,
                    {
                      backgroundColor:
                        theme.mode === 'dark' ? '#0A121A' : '#F1F5F9',
                      borderColor: borderColor,
                    },
                  ]}
                >
                  <Text style={styles.documentIcon}>
                    {item.media_meta?.mimeType?.includes('pdf')
                      ? '📕'
                      : item.media_meta?.mimeType?.includes('audio')
                      ? '🎵'
                      : '📄'}
                  </Text>
                  <View style={styles.documentInfoWrap}>
                    <Text
                      numberOfLines={1}
                      style={[styles.documentName, { color: colors.text }]}
                    >
                      {item.media_meta?.name || 'Document File'}
                    </Text>
                    <Text
                      style={[styles.documentSize, { color: colors.muted }]}
                    >
                      {formatFileSize(item.media_meta?.size)} • Tap to open
                    </Text>
                  </View>
                  <Text style={[styles.docOpenAction, { color: colors.primary }]}>
                    OPEN ↗
                  </Text>
                </Pressable>
              )}

              {/* Poll Card */}
              {item.message_type === 'poll' && item.poll && (
                <PollCard
                  poll={item.poll}
                  onVote={handleVotePoll}
                  isSender={isSender}
                />
              )}

              {/* Text Content (if not just media or if accompanied by text) */}
              {item.content &&
                item.message_type !== 'poll' &&
                item.message_type !== 'voice' && (
                  <View style={styles.textContentWrap}>
                    {renderParsedMessageContent(item.content, isSender)}
                  </View>
                )}
            </>
          )}

          {/* Footer timestamp */}
          <View style={styles.bubbleFooterRow}>
            <Text style={[styles.timestampText, { color: colors.muted }]}>
              {formatTime(item.created_at)}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  /* ------------------------------------------------------------------ */
  /*  Main UI Layout                                                    */
  /* ------------------------------------------------------------------ */

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.main }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        style={styles.keyboardContainer}
      >
        {/* Top Header */}
        <View style={[styles.topHeader, { borderBottomColor: borderColor }]}>
          <View style={styles.titleRow}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              Group Chat 💬
            </Text>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
          <Text style={[styles.headerSubtitle, { color: colors.muted }]}>
            Realtime community room
          </Text>
        </View>

        {/* Collapsible Sticky Pinned Messages Bar */}
        <PinnedMessagesBar
          pinnedMessages={pinnedMessages}
          onSelectMessage={(msg) => {
            // Find index and scroll
            const idx = messages.findIndex((m) => m.id === msg.id);
            if (idx !== -1) {
              flatListRef.current?.scrollToIndex({ index: idx, animated: true });
            }
          }}
          onUnpinMessage={handleTogglePinMessage}
        />

        {/* Main Chat Feed */}
        {isLoading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.muted }]}>
              Connecting to live chat…
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            inverted
            keyExtractor={(item) => item.id}
            renderItem={renderMessageItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>💬</Text>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  Welcome to the Group Chat!
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                  Say hello, share photos, start a poll, or send a voice message.
                </Text>
              </View>
            }
          />
        )}

        {/* Account Muted / Suspended Warning Banner */}
        {user?.mute_status && user.mute_status !== 'none' && (
          <View style={styles.mutedBanner}>
            <Text style={styles.mutedBannerText}>
              🔇 You are muted from participating in the group chat.
            </Text>
          </View>
        )}

        {/* Audio Recording Live Status Banner */}
        {isRecording && (
          <View
            style={[
              styles.recordingBanner,
              { backgroundColor: colors.surface, borderColor: colors.danger },
            ]}
          >
            <View style={styles.recordingLeft}>
              <View style={styles.recordingDot} />
              <Text style={[styles.recordingTime, { color: colors.danger }]}>
                Recording {Math.floor(recordingDurationSec / 60)}:
                {recordingDurationSec % 60 < 10 ? '0' : ''}
                {recordingDurationSec % 60}
              </Text>
            </View>

            <View style={styles.recordingActions}>
              <Pressable
                onPress={handleCancelVoiceRecord}
                style={styles.cancelRecordBtn}
              >
                <Text style={[styles.cancelRecordText, { color: colors.muted }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleStopAndSendVoice}
                style={[
                  styles.sendRecordBtn,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Text style={styles.sendRecordText}>Send Voice ➔</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Attachments Drawer */}
        {isAttachMenuOpen && (
          <View
            style={[
              styles.attachMenu,
              {
                backgroundColor: colors.surface,
                borderTopColor: borderColor,
              },
            ]}
          >
            <Pressable
              onPress={() => handlePickMedia('camera')}
              style={styles.attachMenuItem}
            >
              <View style={[styles.attachIconCircle, { backgroundColor: '#FF6600' }]}>
                <Text style={styles.attachMenuIcon}>📷</Text>
              </View>
              <Text style={[styles.attachMenuLabel, { color: colors.text }]}>
                Camera
              </Text>
            </Pressable>

            <Pressable
              onPress={() => handlePickMedia('library')}
              style={styles.attachMenuItem}
            >
              <View style={[styles.attachIconCircle, { backgroundColor: '#00FFCC' }]}>
                <Text style={styles.attachMenuIcon}>🖼️</Text>
              </View>
              <Text style={[styles.attachMenuLabel, { color: colors.text }]}>
                Photo / Video
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setIsAttachMenuOpen(false);
                setIsGiphyModalVisible(true);
              }}
              style={styles.attachMenuItem}
            >
              <View style={[styles.attachIconCircle, { backgroundColor: '#9933FF' }]}>
                <Text style={styles.attachMenuIcon}>🎬</Text>
              </View>
              <Text style={[styles.attachMenuLabel, { color: colors.text }]}>
                Giphy GIF
              </Text>
            </Pressable>

            <Pressable
              onPress={handlePickDocument}
              style={styles.attachMenuItem}
            >
              <View style={[styles.attachIconCircle, { backgroundColor: '#3399FF' }]}>
                <Text style={styles.attachMenuIcon}>📄</Text>
              </View>
              <Text style={[styles.attachMenuLabel, { color: colors.text }]}>
                Document
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setIsAttachMenuOpen(false);
                setIsPollModalVisible(true);
              }}
              style={styles.attachMenuItem}
            >
              <View style={[styles.attachIconCircle, { backgroundColor: '#00CC88' }]}>
                <Text style={styles.attachMenuIcon}>📊</Text>
              </View>
              <Text style={[styles.attachMenuLabel, { color: colors.text }]}>
                Poll
              </Text>
            </Pressable>
          </View>
        )}

        {/* Input Bar */}
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: colors.surface,
              borderTopColor: borderColor,
            },
          ]}
        >
          {/* Plus / Attach Button */}
          <Pressable
            onPress={() => setIsAttachMenuOpen(!isAttachMenuOpen)}
            style={({ pressed }) => [
              styles.attachToggleBtn,
              {
                backgroundColor: isAttachMenuOpen
                  ? colors.primary
                  : theme.mode === 'dark'
                  ? '#1A2633'
                  : '#E2E8F0',
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.attachToggleIcon,
                { color: isAttachMenuOpen ? '#050A0E' : colors.text },
              ]}
            >
              {isAttachMenuOpen ? '✕' : '+'}
            </Text>
          </Pressable>

          {/* Text Input */}
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: colors.main,
                color: colors.text,
                borderColor: borderColor,
              },
            ]}
            placeholder="Type a message or paste URL..."
            placeholderTextColor={colors.muted}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
            editable={!isRecording && user?.mute_status === 'none'}
          />

          {/* Voice Mic Button */}
          <Pressable
            onPress={handleToggleVoiceRecord}
            disabled={isSending || user?.mute_status !== 'none'}
            style={({ pressed }) => [
              styles.micButton,
              {
                backgroundColor: isRecording
                  ? colors.danger
                  : theme.mode === 'dark'
                  ? '#1A2633'
                  : '#E2E8F0',
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={styles.micIcon}>{isRecording ? '⏹' : '🎤'}</Text>
          </Pressable>

          {/* Send Button */}
          {inputText.trim().length > 0 && (
            <Pressable
              onPress={handleSendText}
              disabled={isSending || user?.mute_status !== 'none'}
              style={({ pressed }) => [
                styles.sendBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed || isSending ? 0.7 : 1,
                },
              ]}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#050A0E" />
              ) : (
                <Text style={styles.sendIcon}>➔</Text>
              )}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Fullscreen Image Preview Modal */}
      <Modal
        visible={fullscreenImageUrl !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenImageUrl(null)}
      >
        <SafeAreaView style={styles.fullscreenModal}>
          <Pressable
            onPress={() => setFullscreenImageUrl(null)}
            style={styles.fullscreenCloseBtn}
          >
            <Text style={styles.fullscreenCloseText}>✕ Close</Text>
          </Pressable>
          {fullscreenImageUrl && (
            <Image
              source={{ uri: fullscreenImageUrl }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Context Menu Modal on Long-Press */}
      <MessageContextMenu
        visible={contextMenuMessage !== null}
        onClose={() => setContextMenuMessage(null)}
        message={contextMenuMessage}
        currentUserId={user?.id}
        isAdmin={user?.role === 'admin'}
        onTogglePin={handleTogglePinMessage}
        onDeleteMessage={handleDeleteMessage}
        onRequestReport={(msg) => {
          setContextMenuMessage(null);
          setIsReportModalVisible(true);
        }}
      />

      {/* Report Offense Modal */}
      <ReportOffenseModal
        visible={isReportModalVisible}
        onClose={() => setIsReportModalVisible(false)}
        message={contextMenuMessage}
        onSubmitReport={handleSubmitOffenseReport}
      />

      {/* Create Poll Modal */}
      <CreatePollModal
        visible={isPollModalVisible}
        onClose={() => setIsPollModalVisible(false)}
        onSubmit={handleCreatePoll}
      />

      {/* Giphy Picker Modal */}
      <GiphyModal
        visible={isGiphyModalVisible}
        onClose={() => setIsGiphyModalVisible(false)}
        onSelectGif={handleSelectGif}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  topHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 255, 204, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00FFCC',
  },
  liveText: {
    color: '#00FFCC',
    fontSize: 11,
    fontWeight: '800',
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  emptyContainer: {
    transform: [{ scaleY: -1 }], // Inverted compensation
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  messageBubble: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '82%',
  },
  bubbleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  senderInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  senderNameText: {
    fontSize: 11,
    fontWeight: '700',
  },
  adminBadge: {
    backgroundColor: 'rgba(255, 102, 0, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  adminBadgeText: {
    color: '#FF6600',
    fontSize: 9,
    fontWeight: '800',
  },
  pinIndicatorBadge: {
    backgroundColor: 'rgba(255, 102, 0, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pinIndicatorText: {
    color: '#FF6600',
    fontSize: 9,
    fontWeight: '800',
  },
  textContentWrap: {
    marginTop: 2,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  hyperlink: {
    color: '#00FFCC',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  deletedMessageText: {
    fontSize: 14,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  photoContainer: {
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 4,
  },
  inlinePhoto: {
    width: 220,
    height: 180,
    borderRadius: 10,
  },
  videoContainer: {
    width: 230,
    height: 180,
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 4,
    backgroundColor: '#000000',
  },
  inlineVideo: {
    width: '100%',
    height: '100%',
  },
  gifContainer: {
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 4,
  },
  inlineGif: {
    width: 220,
    height: 160,
    borderRadius: 10,
  },
  documentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
    marginBottom: 4,
    minWidth: 200,
  },
  documentIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  documentInfoWrap: {
    flex: 1,
    marginRight: 8,
  },
  documentName: {
    fontSize: 13,
    fontWeight: '700',
  },
  documentSize: {
    fontSize: 11,
    marginTop: 2,
  },
  docOpenAction: {
    fontSize: 11,
    fontWeight: '800',
  },
  bubbleFooterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  timestampText: {
    fontSize: 10,
  },
  mutedBanner: {
    backgroundColor: 'rgba(255, 51, 102, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  mutedBannerText: {
    color: '#FF3366',
    fontSize: 13,
    fontWeight: '700',
  },
  recordingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  recordingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3366',
  },
  recordingTime: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  recordingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cancelRecordBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  cancelRecordText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sendRecordBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  sendRecordText: {
    color: '#050A0E',
    fontSize: 13,
    fontWeight: '800',
  },
  attachMenu: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderTopWidth: 1,
  },
  attachMenuItem: {
    alignItems: 'center',
    gap: 6,
  },
  attachIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachMenuIcon: {
    fontSize: 20,
  },
  attachMenuLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  attachToggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachToggleIcon: {
    fontSize: 20,
    fontWeight: '700',
  },
  textInput: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    maxHeight: 100,
  },
  micButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micIcon: {
    fontSize: 18,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: {
    color: '#050A0E',
    fontSize: 16,
    fontWeight: '900',
  },
  fullscreenModal: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  fullscreenCloseText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  fullscreenImage: {
    width: '100%',
    height: '80%',
  },
});

export default GroupChatScreen;
