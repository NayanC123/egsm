/**
 * src/components/Chat/CreatePollModal.tsx
 *
 * Modal allowing group chat members to compose and publish an interactive poll.
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

interface CreatePollModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (question: string, options: string[]) => Promise<void>;
}

export const CreatePollModal: React.FC<CreatePollModalProps> = ({
  visible,
  onClose,
  onSubmit,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const borderColor = theme.mode === 'dark' ? '#1A2633' : '#E0E6EC';

  const handleAddOption = () => {
    if (options.length >= 6) {
      Alert.alert('Limit Reached', 'A poll can have at most 6 options.');
      return;
    }
    setOptions([...options, '']);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) {
      Alert.alert('Required', 'A poll must have at least 2 options.');
      return;
    }
    const updated = options.filter((_, i) => i !== index);
    setOptions(updated);
  };

  const handleOptionChange = (text: string, index: number) => {
    const updated = [...options];
    updated[index] = text;
    setOptions(updated);
  };

  const handleSubmit = async () => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      Alert.alert('Missing Question', 'Please enter a poll question.');
      return;
    }

    const validOptions = options.map((o) => o.trim()).filter(Boolean);
    if (validOptions.length < 2) {
      Alert.alert(
        'Insufficient Options',
        'Please provide at least 2 non-empty options for the poll.',
      );
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit(trimmedQuestion, validOptions);
      // Reset form
      setQuestion('');
      setOptions(['', '']);
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to create poll.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              Create a Poll 📊
            </Text>
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
            {/* Question section */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                POLL QUESTION *
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
                placeholder="Ask something to the group..."
                placeholderTextColor={colors.muted}
                value={question}
                onChangeText={setQuestion}
                maxLength={200}
                multiline
              />
            </View>

            {/* Options list */}
            <View style={styles.formGroup}>
              <View style={styles.optionsHeaderRow}>
                <Text style={[styles.label, { color: colors.text }]}>
                  OPTIONS (MIN 2, MAX 6) *
                </Text>
                {options.length < 6 && (
                  <Pressable onPress={handleAddOption}>
                    <Text
                      style={[styles.addOptionText, { color: colors.primary }]}
                    >
                      + Add Option
                    </Text>
                  </Pressable>
                )}
              </View>

              {options.map((option, idx) => (
                <View key={`opt-${idx}`} style={styles.optionInputRow}>
                  <Text style={[styles.optionIndexBadge, { color: colors.muted }]}>
                    #{idx + 1}
                  </Text>
                  <TextInput
                    style={[
                      styles.optionInput,
                      {
                        backgroundColor: colors.surface,
                        borderColor: borderColor,
                        color: colors.text,
                      },
                    ]}
                    placeholder={`Option ${idx + 1}`}
                    placeholderTextColor={colors.muted}
                    value={option}
                    onChangeText={(txt) => handleOptionChange(txt, idx)}
                    maxLength={100}
                  />
                  {options.length > 2 && (
                    <Pressable
                      onPress={() => handleRemoveOption(idx)}
                      style={styles.removeOptionBtn}
                    >
                      <Text
                        style={[
                          styles.removeOptionText,
                          { color: colors.danger },
                        ]}
                      >
                        ✕
                      </Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>

            {/* Submit Button */}
            <Pressable
              onPress={handleSubmit}
              disabled={isSubmitting}
              style={({ pressed }) => [
                styles.submitButton,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed || isSubmitting ? 0.8 : 1,
                },
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#050A0E" />
              ) : (
                <Text style={styles.submitButtonText}>Launch Poll 📊</Text>
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
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
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  optionsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addOptionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  optionInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  optionIndexBadge: {
    fontSize: 12,
    fontWeight: '700',
    width: 24,
  },
  optionInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
  },
  removeOptionBtn: {
    padding: 8,
  },
  removeOptionText: {
    fontSize: 16,
    fontWeight: '700',
  },
  submitButton: {
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  submitButtonText: {
    color: '#050A0E',
    fontSize: 16,
    fontWeight: '800',
  },
});

export default CreatePollModal;
