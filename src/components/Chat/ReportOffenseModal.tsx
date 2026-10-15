/**
 * src/components/Chat/ReportOffenseModal.tsx
 *
 * Modal allowing group chat members to report a message to administrators.
 * Inserts a record into the `offense_reports` table.
 * Strictly uses React Native primitives: Modal, View, Text, TextInput, Pressable, ScrollView.
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import type { ChatMessageWithSender } from '../../types/database';

interface ReportOffenseModalProps {
  visible: boolean;
  onClose: () => void;
  message: ChatMessageWithSender | null;
  onSubmitReport: (
    messageId: string,
    reportedUserId: string,
    reason: string,
  ) => Promise<void>;
}

const COMMON_REASONS = [
  'Harassment or Bullying',
  'Spam or Flood',
  'Hate Speech',
  'Inappropriate / Explicit Media',
  'Impersonation',
  'Other Policy Violation',
];

export const ReportOffenseModal: React.FC<ReportOffenseModalProps> = ({
  visible,
  onClose,
  message,
  onSubmitReport,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const [selectedTag, setSelectedTag] = useState<string>('');
  const [details, setDetails] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const borderColor = theme.mode === 'dark' ? '#1A2633' : '#E0E6EC';

  const handleSubmit = async () => {
    if (!message) return;

    const fullReason = [selectedTag, details.trim()].filter(Boolean).join(' — ');

    if (!fullReason.trim()) {
      Alert.alert(
        'Reason Required',
        'Please select a violation category or enter details describing the offense.',
      );
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmitReport(message.id, message.sender_id, fullReason);
      setSelectedTag('');
      setDetails('');
      onClose();
      Alert.alert(
        'Report Submitted',
        'Thank you. Administrators will review this message promptly.',
      );
    } catch (err: any) {
      Alert.alert('Report Failed', err?.message || 'Could not submit report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!message) return null;

  const senderName =
    message.sender?.display_name || message.sender?.username || 'User';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.main }]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: borderColor }]}>
            <View style={styles.headerTitleRow}>
              <Text style={[styles.headerTitle, { color: colors.danger }]}>
                ⚠️ Report Offense
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              disabled={isSubmitting}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={({ pressed }) => [
                styles.closeButton,
                {
                  backgroundColor: colors.surface,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[styles.closeButtonText, { color: colors.muted }]}>
                ✕
              </Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={styles.scrollInner}
            keyboardShouldPersistTaps="handled"
          >
            {/* Target Message Preview */}
            <View
              style={[
                styles.previewCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: borderColor,
                },
              ]}
            >
              <Text style={[styles.previewLabel, { color: colors.muted }]}>
                REPORTED MESSAGE FROM:
              </Text>
              <Text style={[styles.senderName, { color: colors.text }]}>
                {senderName} (@{message.sender?.username || 'user'})
              </Text>
              <Text
                numberOfLines={3}
                style={[styles.messageSnippet, { color: colors.muted }]}
              >
                {message.content || `[${message.message_type.toUpperCase()} Attachment]`}
              </Text>
            </View>

            {/* Violation Category Chips */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                CATEGORY OF OFFENSE *
              </Text>
              <View style={styles.chipsWrap}>
                {COMMON_REASONS.map((cat) => {
                  const isSelected = selectedTag === cat;
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => setSelectedTag(isSelected ? '' : cat)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: isSelected
                            ? colors.danger
                            : colors.surface,
                          borderColor: isSelected
                            ? colors.danger
                            : borderColor,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          {
                            color: isSelected ? '#FFFFFF' : colors.text,
                            fontWeight: isSelected ? '700' : '500',
                          },
                        ]}
                      >
                        {cat}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Additional Details */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                ADDITIONAL DETAILS (OPTIONAL)
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.surface,
                    borderColor: borderColor,
                    color: colors.text,
                  },
                ]}
                placeholder="Explain why this message violates community standards..."
                placeholderTextColor={colors.muted}
                value={details}
                onChangeText={setDetails}
                maxLength={300}
                multiline
              />
            </View>

            {/* Submit Action */}
            <Pressable
              onPress={handleSubmit}
              disabled={isSubmitting}
              style={({ pressed }) => [
                styles.submitButton,
                {
                  backgroundColor: colors.danger,
                  opacity: pressed || isSubmitting ? 0.8 : 1,
                },
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>
                  Send Report to Admins 🛡️
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    padding: 16,
    paddingBottom: 40,
  },
  previewCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 20,
  },
  previewLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  senderName: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  messageSnippet: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 13,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitButton: {
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});

export default ReportOffenseModal;
