/**
 * src/screens/Settings/AccountSettingsScreen.tsx
 *
 * Account Settings tab:
 * - Read-only Username with lock indicator ("Set by Administrators")
 * - Update Display Name (updates profiles.display_name)
 * - Update Password with current password verification (updates profiles.password_hash)
 * - Dark Mode / Light Mode toggle switch wired to ThemeContext
 * - Log Out button styled with #FF6600 / #FF3366
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { supabase } from '../../services/supabase';

const AccountSettingsScreen: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { colors } = theme;
  const { user, logout, refreshProfile } = useAuth();

  /* Display Name state */
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [nameLoading, setNameLoading] = useState(false);
  const [nameMessage, setNameMessage] = useState<{ text: string; isError: boolean } | null>(null);

  /* Password state */
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passLoading, setPassLoading] = useState(false);
  const [passMessage, setPassMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Sync display name if user changes in context
  useEffect(() => {
    if (user?.display_name) {
      setDisplayName(user.display_name);
    }
  }, [user?.display_name]);

  /* -------- Handle Display Name Save -------- */
  const handleSaveDisplayName = async () => {
    setNameMessage(null);
    const trimmed = displayName.trim();

    if (!trimmed) {
      setNameMessage({ text: 'Display name cannot be empty.', isError: true });
      return;
    }

    if (!user) return;

    setNameLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: trimmed })
        .eq('id', user.id);

      if (error) {
        setNameMessage({ text: 'Failed to update display name.', isError: true });
      } else {
        await refreshProfile();
        setNameMessage({ text: 'Display name updated successfully.', isError: false });
      }
    } catch {
      setNameMessage({ text: 'An unexpected error occurred.', isError: true });
    } finally {
      setNameLoading(false);
    }
  };

  /* -------- Handle Password Change -------- */
  const handleSavePassword = async () => {
    setPassMessage(null);

    if (!currentPassword) {
      setPassMessage({ text: 'Please enter your current password.', isError: true });
      return;
    }

    if (!newPassword) {
      setPassMessage({ text: 'Please enter a new password.', isError: true });
      return;
    }

    if (newPassword.length < 6) {
      setPassMessage({ text: 'New password must be at least 6 characters.', isError: true });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPassMessage({ text: 'New passwords do not match.', isError: true });
      return;
    }

    if (!user) return;

    setPassLoading(true);
    try {
      // 1. Verify current password matches DB
      const { data, error: checkError } = await supabase
        .from('profiles')
        .select('password_hash')
        .eq('id', user.id)
        .eq('password_hash', currentPassword)
        .single();

      if (checkError || !data) {
        setPassMessage({ text: 'Current password is incorrect.', isError: true });
        setPassLoading(false);
        return;
      }

      // 2. Update password_hash
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ password_hash: newPassword })
        .eq('id', user.id);

      if (updateError) {
        setPassMessage({ text: 'Failed to update password.', isError: true });
      } else {
        setPassMessage({ text: 'Password changed successfully.', isError: false });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch {
      setPassMessage({ text: 'An unexpected error occurred.', isError: true });
    } finally {
      setPassLoading(false);
    }
  };

  /* -------- Handle Logout Confirmation -------- */
  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ],
      { cancelable: true },
    );
  };

  const isDark = theme.mode === 'dark';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.main }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              Account Settings
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.muted }]}>
              Manage your profile and app preferences
            </Text>
          </View>

          {/* Section: Username (Read-Only) */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: isDark ? '#1A2633' : '#E0E6EC' }]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Username</Text>
              <View style={[styles.lockBadge, { backgroundColor: isDark ? '#14202B' : '#EAEFF4' }]}>
                <Text style={styles.lockIcon}>🔒</Text>
                <Text style={[styles.lockText, { color: colors.muted }]}>
                  Set by Administrators
                </Text>
              </View>
            </View>

            <TextInput
              style={[
                styles.input,
                styles.readOnlyInput,
                {
                  backgroundColor: isDark ? '#0A121A' : '#F0F4F8',
                  color: colors.muted,
                  borderColor: isDark ? '#15222E' : '#DCE2E8',
                },
              ]}
              value={user?.username ?? ''}
              editable={false}
            />
          </View>

          {/* Section: Display Name */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: isDark ? '#1A2633' : '#E0E6EC' }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Display Name</Text>
            <Text style={[styles.fieldHint, { color: colors.muted }]}>
              This is the name visible to other members across chat and posts.
            </Text>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? '#080E14' : '#F9FBFC',
                  color: colors.text,
                  borderColor: isDark ? '#1A2633' : '#D0D8E0',
                },
              ]}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Enter your display name"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              editable={!nameLoading}
            />

            {nameMessage && (
              <Text
                style={[
                  styles.feedbackText,
                  { color: nameMessage.isError ? colors.danger : colors.primary },
                ]}
              >
                {nameMessage.text}
              </Text>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.saveButton,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed || nameLoading ? 0.8 : 1,
                },
              ]}
              onPress={handleSaveDisplayName}
              disabled={nameLoading}
            >
              {nameLoading ? (
                <ActivityIndicator color="#050A0E" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Save Display Name</Text>
              )}
            </Pressable>
          </View>

          {/* Section: Change Password */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: isDark ? '#1A2633' : '#E0E6EC' }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Change Password</Text>
            <Text style={[styles.fieldHint, { color: colors.muted }]}>
              Current password confirmation is required.
            </Text>

            <Text style={[styles.inputLabel, { color: colors.muted }]}>Current Password</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? '#080E14' : '#F9FBFC',
                  color: colors.text,
                  borderColor: isDark ? '#1A2633' : '#D0D8E0',
                },
              ]}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Enter current password"
              placeholderTextColor={colors.muted}
              secureTextEntry
              autoCapitalize="none"
              editable={!passLoading}
            />

            <Text style={[styles.inputLabel, { color: colors.muted }]}>New Password</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? '#080E14' : '#F9FBFC',
                  color: colors.text,
                  borderColor: isDark ? '#1A2633' : '#D0D8E0',
                },
              ]}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Enter new password (min. 6 chars)"
              placeholderTextColor={colors.muted}
              secureTextEntry
              autoCapitalize="none"
              editable={!passLoading}
            />

            <Text style={[styles.inputLabel, { color: colors.muted }]}>Confirm New Password</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? '#080E14' : '#F9FBFC',
                  color: colors.text,
                  borderColor: isDark ? '#1A2633' : '#D0D8E0',
                },
              ]}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              placeholderTextColor={colors.muted}
              secureTextEntry
              autoCapitalize="none"
              editable={!passLoading}
            />

            {passMessage && (
              <Text
                style={[
                  styles.feedbackText,
                  { color: passMessage.isError ? colors.danger : colors.primary },
                ]}
              >
                {passMessage.text}
              </Text>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.saveButton,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed || passLoading ? 0.8 : 1,
                },
              ]}
              onPress={handleSavePassword}
              disabled={passLoading}
            >
              {passLoading ? (
                <ActivityIndicator color="#050A0E" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Update Password</Text>
              )}
            </Pressable>
          </View>

          {/* Section: Theme Preference */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: isDark ? '#1A2633' : '#E0E6EC' }]}>
            <View style={styles.preferenceRow}>
              <View style={styles.preferenceTextCol}>
                <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 2 }]}>
                  Dark Mode
                </Text>
                <Text style={[styles.fieldHint, { color: colors.muted, marginBottom: 0 }]}>
                  {isDark ? 'Dark theme active (#050A0E)' : 'Light theme active (#F4F7F9)'}
                </Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: '#767577', true: '#00FFCC' }}
                thumbColor={isDark ? '#050A0E' : '#F4F3F4'}
              />
            </View>
          </View>

          {/* Section: Log Out Button */}
          <View style={styles.logoutContainer}>
            <Pressable
              style={({ pressed }) => [
                styles.logoutButton,
                {
                  backgroundColor: '#FF6600',
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              onPress={handleLogout}
            >
              <Text style={styles.logoutButtonText}>Log Out</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  fieldHint: {
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  lockIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  lockText: {
    fontSize: 11,
    fontWeight: '600',
  },
  input: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  readOnlyInput: {
    fontStyle: 'normal',
    opacity: 0.9,
  },
  feedbackText: {
    fontSize: 13,
    marginTop: 8,
    fontWeight: '500',
  },
  saveButton: {
    height: 46,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  saveButtonText: {
    color: '#050A0E',
    fontSize: 15,
    fontWeight: '700',
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  preferenceTextCol: {
    flex: 1,
    paddingRight: 16,
  },
  logoutContainer: {
    marginTop: 8,
    marginBottom: 20,
  },
  logoutButton: {
    height: 50,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});

export default AccountSettingsScreen;
