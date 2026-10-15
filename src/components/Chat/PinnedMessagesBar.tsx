/**
 * src/components/Chat/PinnedMessagesBar.tsx
 *
 * Sticky collapsible bar displayed at the top of the Group Chat screen.
 * Shows all pinned messages (is_pinned = true).
 * Strictly uses React Native primitives: View, Text, Pressable, ScrollView, StyleSheet.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import type { ChatMessageWithSender } from '../../types/database';

interface PinnedMessagesBarProps {
  pinnedMessages: ChatMessageWithSender[];
  onSelectMessage?: (message: ChatMessageWithSender) => void;
  onUnpinMessage?: (message: ChatMessageWithSender) => void;
}

export const PinnedMessagesBar: React.FC<PinnedMessagesBarProps> = ({
  pinnedMessages,
  onSelectMessage,
  onUnpinMessage,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const [isExpanded, setIsExpanded] = useState(false);

  if (pinnedMessages.length === 0) {
    return null;
  }

  const borderColor = theme.mode === 'dark' ? '#1A2633' : '#E0E6EC';
  const latestPinned = pinnedMessages[0];

  const getPreviewText = (msg: ChatMessageWithSender) => {
    if (msg.is_deleted) return 'Message deleted';
    if (msg.content) return msg.content;
    switch (msg.message_type) {
      case 'photo':
        return '📷 Photo';
      case 'video':
        return '🎥 Video';
      case 'gif':
        return '🎬 GIF';
      case 'voice':
        return '🎤 Voice note';
      case 'document':
        return `📄 ${msg.media_meta?.name || 'Document'}`;
      case 'poll':
        return '📊 Poll';
      default:
        return 'Pinned message';
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderBottomColor: borderColor,
        },
      ]}
    >
      {/* Header bar / collapsed view */}
      <Pressable
        onPress={() => setIsExpanded(!isExpanded)}
        style={({ pressed }) => [
          styles.headerRow,
          { opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.pinIcon}>📌</Text>
          <View style={styles.headerTitleWrap}>
            <View style={styles.badgeRow}>
              <Text style={styles.badgeText}>
                PINNED ({pinnedMessages.length})
              </Text>
            </View>
            {!isExpanded && (
              <Text
                numberOfLines={1}
                style={[styles.collapsedSnippet, { color: colors.text }]}
              >
                <Text style={{ fontWeight: '700', color: colors.primary }}>
                  {latestPinned.sender?.display_name || 'Member'}:{' '}
                </Text>
                {getPreviewText(latestPinned)}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.toggleBtn}>
          <Text style={[styles.chevron, { color: colors.muted }]}>
            {isExpanded ? '▲' : '▼'}
          </Text>
        </View>
      </Pressable>

      {/* Expanded list of all pinned messages */}
      {isExpanded && (
        <ScrollView
          style={styles.expandedList}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          {pinnedMessages.map((msg, idx) => (
            <View
              key={msg.id}
              style={[
                styles.pinnedItemRow,
                {
                  borderTopColor: borderColor,
                  borderTopWidth: idx > 0 ? 1 : 0,
                },
              ]}
            >
              <Pressable
                onPress={() => onSelectMessage?.(msg)}
                style={({ pressed }) => [
                  styles.pinnedContentPressable,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.pinnedSender, { color: colors.primary }]}
                >
                  {msg.sender?.display_name || 'Member'}
                </Text>
                <Text
                  numberOfLines={2}
                  style={[styles.pinnedSnippet, { color: colors.text }]}
                >
                  {getPreviewText(msg)}
                </Text>
              </Pressable>

              {onUnpinMessage && (
                <Pressable
                  onPress={() => onUnpinMessage(msg)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.unpinBtn}
                >
                  <Text style={styles.unpinText}>Unpin</Text>
                </Pressable>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: '#FF6600',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  pinIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  headerTitleWrap: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeText: {
    color: '#FF6600',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  collapsedSnippet: {
    fontSize: 12,
    marginTop: 2,
  },
  toggleBtn: {
    padding: 4,
  },
  chevron: {
    fontSize: 13,
    fontWeight: '700',
  },
  expandedList: {
    maxHeight: 180,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  pinnedItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  pinnedContentPressable: {
    flex: 1,
    paddingRight: 12,
  },
  pinnedSender: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  pinnedSnippet: {
    fontSize: 12,
  },
  unpinBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 102, 0, 0.15)',
  },
  unpinText: {
    color: '#FF6600',
    fontSize: 11,
    fontWeight: '700',
  },
});

export default PinnedMessagesBar;
