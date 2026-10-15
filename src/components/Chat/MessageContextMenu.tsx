/**
 * src/components/Chat/MessageContextMenu.tsx
 *
 * Bottom sheet modal triggered on long-pressing a chat message bubble.
 * Provides actions:
 *   - Pin / Unpin Message
 *   - Delete Message (if sender or admin)
 *   - Report Offense to Admins
 * Strictly uses React Native primitives: Modal, View, Text, Pressable, StyleSheet.
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import type { ChatMessageWithSender } from '../../types/database';

interface MessageContextMenuProps {
  visible: boolean;
  onClose: () => void;
  message: ChatMessageWithSender | null;
  currentUserId?: string;
  isAdmin?: boolean;
  onTogglePin: (message: ChatMessageWithSender) => void;
  onDeleteMessage: (message: ChatMessageWithSender) => void;
  onRequestReport: (message: ChatMessageWithSender) => void;
}

export const MessageContextMenu: React.FC<MessageContextMenuProps> = ({
  visible,
  onClose,
  message,
  currentUserId,
  isAdmin = false,
  onTogglePin,
  onDeleteMessage,
  onRequestReport,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;

  if (!message) return null;

  const isSender = currentUserId === message.sender_id;
  const canDelete = !message.is_deleted && (isSender || isAdmin);
  const borderColor = theme.mode === 'dark' ? '#1A2633' : '#E0E6EC';

  const handleTogglePin = () => {
    onClose();
    onTogglePin(message);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message? It will be replaced with "Message deleted".',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            onClose();
            onDeleteMessage(message);
          },
        },
      ],
    );
  };

  const handleReport = () => {
    onClose();
    onRequestReport(message);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheetContainer,
            {
              backgroundColor: colors.surface,
              borderColor: borderColor,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header Indicator */}
          <View style={styles.dragIndicator} />

          {/* Message snippet preview */}
          <View
            style={[
              styles.previewBox,
              {
                backgroundColor: colors.main,
                borderColor: borderColor,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.previewSender, { color: colors.primary }]}
            >
              {message.sender?.display_name || 'Member'}
            </Text>
            <Text
              numberOfLines={2}
              style={[styles.previewContent, { color: colors.text }]}
            >
              {message.is_deleted
                ? 'Message deleted'
                : message.content || `[${message.message_type.toUpperCase()} Attachment]`}
            </Text>
          </View>

          {/* Action List */}
          <View style={styles.actionsList}>
            {/* Pin / Unpin */}
            <Pressable
              onPress={handleTogglePin}
              style={({ pressed }) => [
                styles.actionItem,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={styles.actionIcon}>
                {message.is_pinned ? '📌' : '📌'}
              </Text>
              <View style={styles.actionTextWrap}>
                <Text style={[styles.actionLabel, { color: colors.text }]}>
                  {message.is_pinned ? 'Unpin Message' : 'Pin Message to Top'}
                </Text>
                <Text style={[styles.actionSub, { color: colors.muted }]}>
                  {message.is_pinned
                    ? 'Remove from sticky pinned bar'
                    : 'Display in sticky bar for everyone'}
                </Text>
              </View>
            </Pressable>

            {/* Delete (Sender or Admin) */}
            {canDelete && (
              <Pressable
                onPress={handleDelete}
                style={({ pressed }) => [
                  styles.actionItem,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={styles.actionIcon}>🗑️</Text>
                <View style={styles.actionTextWrap}>
                  <Text style={[styles.actionLabel, { color: colors.danger }]}>
                    Delete Message
                  </Text>
                  <Text style={[styles.actionSub, { color: colors.muted }]}>
                    Replace content with "Message deleted"
                  </Text>
                </View>
              </Pressable>
            )}

            {/* Report Offense */}
            <Pressable
              onPress={handleReport}
              style={({ pressed }) => [
                styles.actionItem,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={styles.actionIcon}>⚠️</Text>
              <View style={styles.actionTextWrap}>
                <Text style={[styles.actionLabel, { color: colors.text }]}>
                  Report Offense to Admins
                </Text>
                <Text style={[styles.actionSub, { color: colors.muted }]}>
                  Flag violations of community standards
                </Text>
              </View>
            </Pressable>
          </View>

          {/* Close Button */}
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.cancelBtn,
              {
                backgroundColor: colors.main,
                borderColor: borderColor,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={[styles.cancelText, { color: colors.muted }]}>
              Cancel
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#8A9BA8',
    alignSelf: 'center',
    marginBottom: 16,
    opacity: 0.5,
  },
  previewBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  previewSender: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  previewContent: {
    fontSize: 13,
  },
  actionsList: {
    gap: 8,
    marginBottom: 16,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  actionIcon: {
    fontSize: 22,
    width: 36,
  },
  actionTextWrap: {
    flex: 1,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  actionSub: {
    fontSize: 12,
  },
  cancelBtn: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
  },
});

export default MessageContextMenu;
