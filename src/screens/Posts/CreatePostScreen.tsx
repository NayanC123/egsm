/**
 * src/screens/Posts/CreatePostScreen.tsx
 *
 * Screen for authoring and publishing a permanent post.
 * Features:
 *  - Subject and multiline Content inputs
 *  - Camera / Gallery image attachments via `expo-image-picker`
 *  - Document / Audio / PDF attachments via `expo-document-picker`
 *  - Uploads all attachments to Supabase Storage (`post-attachments` bucket)
 *  - Admin toggle for Pinned Announcement (#FF6600)
 *  - Warning Banner: "Note: Posts are permanent and cannot be deleted once published."
 *  - (Post) submission button (#00FFCC background, #050A0E bold text)
 *  - Strictly NO delete button anywhere
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { supabase } from '../../services/supabase';
import { uploadPostAttachment } from '../../services/storage';
import type { PostAttachmentDoc } from '../../types/database';

interface CreatePostScreenProps {
  /** If rendered inside a modal or stack, callback to return to the feed. */
  onClose: () => void;
  /** Callback after a post is successfully inserted into the database. */
  onPostCreated?: () => void;
}

const CreatePostScreen: React.FC<CreatePostScreenProps> = ({
  onClose,
  onPostCreated,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const { user } = useAuth();

  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [isAnnouncement, setIsAnnouncement] = useState(false);

  // Attached files
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [documents, setDocuments] = useState<PostAttachmentDoc[]>([]);

  // Loading & status states
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Image Source Picker Modal (Camera vs Gallery)
  const [imageModalVisible, setImageModalVisible] = useState(false);

  /* ------------------------------------------------------------------ */
  /*  Media Pickers & Upload Handlers                                   */
  /* ------------------------------------------------------------------ */

  /** Capture photo with camera */
  const handleTakePhoto = async () => {
    setImageModalVisible(false);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Camera Permission Required',
          'Please allow camera access in system settings to take photos.',
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await processAndUploadImage(result.assets[0]);
      }
    } catch (err: any) {
      Alert.alert('Camera Error', err?.message || 'Could not launch camera.');
    }
  };

  /** Pick photo(s) from gallery */
  const handlePickFromGallery = async () => {
    setImageModalVisible(false);
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Photo Library Permission Required',
          'Please allow photo library access in system settings to attach photos.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsMultipleSelection: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        for (let i = 0; i < result.assets.length; i++) {
          await processAndUploadImage(result.assets[i], i + 1, result.assets.length);
        }
      }
    } catch (err: any) {
      Alert.alert(
        'Gallery Error',
        err?.message || 'Could not open image library.',
      );
    }
  };

  /** Upload single image asset to Supabase Storage */
  const processAndUploadImage = async (
    asset: ImagePicker.ImagePickerAsset,
    currentIndex = 1,
    totalCount = 1,
  ) => {
    setIsUploading(true);
    setUploadProgressText(
      totalCount > 1
        ? `Uploading photo (${currentIndex}/${totalCount})…`
        : 'Uploading photo…',
    );

    try {
      const fileName =
        asset.fileName ||
        `photo_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;
      const mimeType = asset.mimeType || 'image/jpeg';

      const uploadResult = await uploadPostAttachment(
        asset.uri,
        fileName,
        mimeType,
        asset.fileSize,
      );

      setImageUrls((prev) => [...prev, uploadResult.url]);
    } catch (err: any) {
      Alert.alert(
        'Upload Failed',
        `Could not upload photo: ${err?.message || 'Unknown error'}`,
      );
    } finally {
      setIsUploading(false);
      setUploadProgressText(null);
    }
  };

  /** Attach document / audio / PDF via expo-document-picker */
  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setIsUploading(true);
        setUploadProgressText(`Uploading ${file.name}…`);

        try {
          const uploadResult = await uploadPostAttachment(
            file.uri,
            file.name,
            file.mimeType ?? undefined,
            file.size ?? undefined,
          );

          setDocuments((prev) => [
            ...prev,
            {
              name: file.name,
              url: uploadResult.url,
              size: file.size ?? undefined,
              mimeType: file.mimeType ?? undefined,
            },
          ]);
        } catch (err: any) {
          Alert.alert(
            'Upload Failed',
            `Could not upload document: ${err?.message || 'Unknown error'}`,
          );
        } finally {
          setIsUploading(false);
          setUploadProgressText(null);
        }
      }
    } catch (err: any) {
      Alert.alert('File Picker Error', err?.message || 'Could not pick document.');
    }
  };

  /** Remove attached image before posting */
  const removeImage = (indexToRemove: number) => {
    setImageUrls((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  /** Remove attached document before posting */
  const removeDocument = (indexToRemove: number) => {
    setDocuments((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  /* ------------------------------------------------------------------ */
  /*  Post Submission                                                   */
  /* ------------------------------------------------------------------ */

  const handleCreatePost = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to create a post.');
      return;
    }

    const trimmedSubject = subject.trim();
    const trimmedContent = content.trim();

    if (!trimmedSubject) {
      setErrorMessage('Please enter a post subject.');
      return;
    }

    if (!trimmedContent) {
      setErrorMessage('Please enter your post content.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const { error: insertError } = await supabase.from('posts').insert({
        author_id: user.id,
        subject: trimmedSubject,
        content: trimmedContent,
        image_urls: imageUrls.length > 0 ? imageUrls : null,
        document_urls: documents.length > 0 ? documents : null,
        is_announcement: user.role === 'admin' ? isAnnouncement : false,
      });

      if (insertError) {
        throw new Error(insertError.message);
      }

      // Success
      if (onPostCreated) {
        onPostCreated();
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to publish post. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Dynamic Themed Styles                                             */
  /* ------------------------------------------------------------------ */

  const dynamicStyles = {
    container: { backgroundColor: colors.main },
    card: {
      backgroundColor: colors.surface,
      borderColor: theme.mode === 'dark' ? '#1A2633' : '#E0E6EC',
    },
    input: {
      backgroundColor: colors.surface,
      color: colors.text,
      borderColor: theme.mode === 'dark' ? '#1A2633' : '#D0D8E0',
    },
    placeholder: colors.muted,
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, dynamicStyles.container]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
          style={styles.headerButton}
          onPress={onClose}
          hitSlop={10}
          disabled={isSubmitting || isUploading}
        >
          <Text style={[styles.cancelText, { color: colors.muted }]}>Cancel</Text>
        </Pressable>

        <Text style={[styles.headerTitle, { color: colors.text }]}>New Post</Text>

        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Admin Pinned Announcement Toggle (Admins Only) ── */}
        {user?.role === 'admin' && (
          <Pressable
            style={[
              styles.announcementToggle,
              isAnnouncement && styles.announcementToggleActive,
            ]}
            onPress={() => setIsAnnouncement((prev) => !prev)}
          >
            <View style={styles.toggleRow}>
              <Text style={styles.toggleEmoji}>📢</Text>
              <View style={styles.toggleInfo}>
                <Text
                  style={[
                    styles.toggleTitle,
                    { color: isAnnouncement ? '#FF6600' : colors.text },
                  ]}
                >
                  Mark as Pinned Announcement
                </Text>
                <Text style={[styles.toggleDesc, { color: colors.muted }]}>
                  Pinned at the very top of all feeds with #FF6600 badge
                </Text>
              </View>
              <View
                style={[
                  styles.checkbox,
                  isAnnouncement
                    ? { backgroundColor: '#FF6600', borderColor: '#FF6600' }
                    : { borderColor: colors.muted },
                ]}
              >
                {isAnnouncement && <Text style={styles.checkboxTick}>✓</Text>}
              </View>
            </View>
          </Pressable>
        )}

        {/* ── Subject Input ── */}
        <Text style={[styles.label, { color: colors.text }]}>Subject *</Text>
        <TextInput
          style={[styles.subjectInput, dynamicStyles.input]}
          placeholder="What is this post about?"
          placeholderTextColor={dynamicStyles.placeholder}
          value={subject}
          onChangeText={setSubject}
          maxLength={150}
          editable={!isSubmitting}
        />

        {/* ── Content Input (Multiline) ── */}
        <Text style={[styles.label, { color: colors.text }]}>Content *</Text>
        <TextInput
          style={[styles.contentInput, dynamicStyles.input]}
          placeholder="Write your announcement or community post here…"
          placeholderTextColor={dynamicStyles.placeholder}
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
          editable={!isSubmitting}
        />

        {/* ── Attachment Controls ── */}
        <Text style={[styles.label, { color: colors.text }]}>Attachments</Text>
        <View style={styles.attachmentButtonRow}>
          {/* Camera / Gallery Button */}
          <Pressable
            style={({ pressed }) => [
              styles.attachBtn,
              {
                backgroundColor: colors.surface,
                borderColor: theme.mode === 'dark' ? '#1A2633' : '#D0D8E0',
                opacity: pressed ? 0.75 : 1,
              },
            ]}
            onPress={() => setImageModalVisible(true)}
            disabled={isUploading || isSubmitting}
          >
            <Text style={styles.attachBtnEmoji}>📷</Text>
            <Text style={[styles.attachBtnText, { color: colors.text }]}>
              Photo / Gallery
            </Text>
          </Pressable>

          {/* Paperclip Button */}
          <Pressable
            style={({ pressed }) => [
              styles.attachBtn,
              {
                backgroundColor: colors.surface,
                borderColor: theme.mode === 'dark' ? '#1A2633' : '#D0D8E0',
                opacity: pressed ? 0.75 : 1,
              },
            ]}
            onPress={handlePickDocument}
            disabled={isUploading || isSubmitting}
          >
            <Text style={styles.attachBtnEmoji}>📎</Text>
            <Text style={[styles.attachBtnText, { color: colors.text }]}>
              Attach Document
            </Text>
          </Pressable>
        </View>

        {/* Upload in-progress indicator */}
        {isUploading && (
          <View style={styles.uploadingBar}>
            <ActivityIndicator size="small" color="#00FFCC" />
            <Text style={[styles.uploadingText, { color: '#00FFCC' }]}>
              {uploadProgressText || 'Uploading attachment…'}
            </Text>
          </View>
        )}

        {/* Attached Images Grid */}
        {imageUrls.length > 0 && (
          <View style={styles.attachmentsSection}>
            <Text style={[styles.subLabel, { color: colors.muted }]}>
              Attached Photos ({imageUrls.length}):
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.imageThumbnailRow}>
                {imageUrls.map((url, idx) => (
                  <View key={`img-${idx}`} style={styles.thumbnailWrapper}>
                    <Image source={{ uri: url }} style={styles.thumbnailImage} />
                    <Pressable
                      style={styles.removeBadge}
                      onPress={() => removeImage(idx)}
                      hitSlop={8}
                    >
                      <Text style={styles.removeBadgeText}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Attached Documents List */}
        {documents.length > 0 && (
          <View style={styles.attachmentsSection}>
            <Text style={[styles.subLabel, { color: colors.muted }]}>
              Attached Documents ({documents.length}):
            </Text>
            {documents.map((doc, idx) => (
              <View
                key={`doc-${idx}`}
                style={[
                  styles.docChip,
                  {
                    backgroundColor: colors.surface,
                    borderColor: theme.mode === 'dark' ? '#1A2633' : '#E0E6EC',
                  },
                ]}
              >
                <Text style={styles.docIcon}>📄</Text>
                <View style={styles.docDetails}>
                  <Text
                    style={[styles.docName, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {doc.name}
                  </Text>
                  {doc.size ? (
                    <Text style={[styles.docSize, { color: colors.muted }]}>
                      {(doc.size / 1024).toFixed(1)} KB
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  style={styles.docRemoveBtn}
                  onPress={() => removeDocument(idx)}
                  hitSlop={8}
                >
                  <Text style={styles.removeBadgeText}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* ── Error Banner ── */}
        {errorMessage && (
          <View style={[styles.errorBox, { borderColor: colors.danger }]}>
            <Text style={[styles.errorText, { color: colors.danger }]}>
              {errorMessage}
            </Text>
          </View>
        )}

        {/* ── Permanent Post Warning Banner (MANDATORY) ── */}
        <View style={styles.warningBanner}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <View style={styles.warningTextContainer}>
            <Text style={styles.warningTitle}>PERMANENT PUBLICATION</Text>
            <Text style={styles.warningMessage}>
              Note: Posts are permanent and cannot be deleted once published.
            </Text>
          </View>
        </View>

        {/* ── Submit (Post) Button ── */}
        <Pressable
          style={({ pressed }) => [
            styles.submitButton,
            {
              backgroundColor: '#00FFCC',
              opacity: pressed || isSubmitting || isUploading ? 0.8 : 1,
            },
          ]}
          onPress={handleCreatePost}
          disabled={isSubmitting || isUploading}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#050A0E" />
          ) : (
            <Text style={styles.submitButtonText}>(Post)</Text>
          )}
        </Pressable>
      </ScrollView>

      {/* ── Camera vs Gallery Selection Modal ── */}
      <Modal
        visible={imageModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setImageModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setImageModalVisible(false)}
        >
          <View
            style={[
              styles.pickerModalCard,
              { backgroundColor: colors.surface },
            ]}
          >
            <Text style={[styles.pickerModalTitle, { color: colors.text }]}>
              Attach Photo
            </Text>
            <Text style={[styles.pickerModalSubtitle, { color: colors.muted }]}>
              Select an image source
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.pickerModalOption,
                {
                  borderColor: theme.mode === 'dark' ? '#1A2633' : '#E0E6EC',
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
              onPress={handleTakePhoto}
            >
              <Text style={styles.pickerModalIcon}>📸</Text>
              <Text style={[styles.pickerModalOptionText, { color: colors.text }]}>
                Take Photo (Camera)
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.pickerModalOption,
                {
                  borderColor: theme.mode === 'dark' ? '#1A2633' : '#E0E6EC',
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
              onPress={handlePickFromGallery}
            >
              <Text style={styles.pickerModalIcon}>🖼️</Text>
              <Text style={[styles.pickerModalOptionText, { color: colors.text }]}>
                Choose from Library (Gallery)
              </Text>
            </Pressable>

            <Pressable
              style={styles.pickerCancelBtn}
              onPress={() => setImageModalVisible(false)}
            >
              <Text style={[styles.pickerCancelText, { color: colors.muted }]}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
};

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 54 : 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  headerRightSpacer: {
    width: 60,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingBottom: 48,
  },

  /* ── Announcement Toggle ── */
  announcementToggle: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#3A2010',
    backgroundColor: 'rgba(255, 102, 0, 0.05)',
    marginBottom: 20,
  },
  announcementToggleActive: {
    borderColor: '#FF6600',
    backgroundColor: 'rgba(255, 102, 0, 0.12)',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleEmoji: {
    fontSize: 22,
    marginRight: 12,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  toggleDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  checkboxTick: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },

  /* ── Form Inputs ── */
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 12,
  },
  subLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  subjectInput: {
    height: 50,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '600',
  },
  contentInput: {
    minHeight: 140,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    lineHeight: 22,
  },

  /* ── Attachment Buttons ── */
  attachmentButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  attachBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  attachBtnEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  attachBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  uploadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 255, 204, 0.08)',
  },
  uploadingText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 10,
  },

  /* ── Image & Document Previews ── */
  attachmentsSection: {
    marginTop: 16,
  },
  imageThumbnailRow: {
    flexDirection: 'row',
    gap: 12,
  },
  thumbnailWrapper: {
    position: 'relative',
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  removeBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(5, 10, 14, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBadgeText: {
    color: '#FF3366',
    fontSize: 12,
    fontWeight: '800',
  },
  docChip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  docIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  docDetails: {
    flex: 1,
  },
  docName: {
    fontSize: 14,
    fontWeight: '600',
  },
  docSize: {
    fontSize: 12,
    marginTop: 2,
  },
  docRemoveBtn: {
    padding: 6,
  },

  /* ── Errors ── */
  errorBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 51, 102, 0.1)',
  },
  errorText: {
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },

  /* ── Warning Banner ── */
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 24,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#FF6600',
    backgroundColor: 'rgba(255, 102, 0, 0.12)',
  },
  warningIcon: {
    fontSize: 20,
    marginRight: 12,
    marginTop: 1,
  },
  warningTextContainer: {
    flex: 1,
  },
  warningTitle: {
    color: '#FF6600',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  warningMessage: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },

  /* ── Submit (Post) Button ── */
  submitButton: {
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  submitButtonText: {
    color: '#050A0E',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },

  /* ── Attachment Modal Picker ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  pickerModalCard: {
    width: '100%',
    borderRadius: 16,
    padding: 22,
    alignItems: 'center',
  },
  pickerModalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  pickerModalSubtitle: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 20,
  },
  pickerModalOption: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  pickerModalIcon: {
    fontSize: 22,
    marginRight: 14,
  },
  pickerModalOptionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  pickerCancelBtn: {
    marginTop: 8,
    paddingVertical: 10,
  },
  pickerCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default CreatePostScreen;
