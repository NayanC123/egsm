/**
 * src/screens/Auth/LoginScreen.tsx
 *
 * Pre-login screen — Username + Password authentication.
 * No sign-up option. Includes "Forgot Password?" modal that inserts
 * a row into `password_reset_requests`.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { supabase } from '../../services/supabase';

const LoginScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const { login, isLoading } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  /* Forgot-Password modal state */
  const [fpVisible, setFpVisible] = useState(false);
  const [fpUsername, setFpUsername] = useState('');
  const [fpLoading, setFpLoading] = useState(false);
  const [fpMessage, setFpMessage] = useState<string | null>(null);
  const [fpError, setFpError] = useState<string | null>(null);

  /* -------- Login handler -------- */
  const handleLogin = async () => {
    setError(null);
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.');
      return;
    }
    const result = await login(username.trim(), password);
    if (result) setError(result);
  };

  /* -------- Forgot Password handler -------- */
  const handleForgotSubmit = async () => {
    setFpError(null);
    setFpMessage(null);
    const trimmed = fpUsername.trim().toLowerCase();
    if (!trimmed) {
      setFpError('Please enter your username.');
      return;
    }

    setFpLoading(true);
    try {
      const { error: insertError } = await supabase
        .from('password_reset_requests')
        .insert({ username: trimmed });

      if (insertError) {
        setFpError('Failed to submit request. Please try again.');
      } else {
        setFpMessage(
          'Your password reset request has been submitted. An Administrator has been notified and will reset your password shortly.',
        );
        setFpUsername('');
      }
    } catch {
      setFpError('An unexpected error occurred.');
    } finally {
      setFpLoading(false);
    }
  };

  const closeFpModal = () => {
    setFpVisible(false);
    setFpUsername('');
    setFpError(null);
    setFpMessage(null);
  };

  /* -------- Styles that depend on theme -------- */
  const dynamicStyles = {
    container: { backgroundColor: colors.main },
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Brand ── */}
        <View style={styles.brandContainer}>
          <Text style={[styles.brandTitle, { color: '#00FFCC' }]}>GRUUP</Text>
          <Text style={[styles.brandSubtitle, { color: colors.muted }]}>
            Social
          </Text>
        </View>

        {/* ── Form ── */}
        <View style={styles.formContainer}>
          <Text style={[styles.label, { color: colors.text }]}>Username</Text>
          <TextInput
            style={[styles.input, dynamicStyles.input]}
            placeholder="Enter your username"
            placeholderTextColor={dynamicStyles.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
            editable={!isLoading}
          />

          <Text style={[styles.label, { color: colors.text }]}>Password</Text>
          <TextInput
            style={[styles.input, dynamicStyles.input]}
            placeholder="Enter your password"
            placeholderTextColor={dynamicStyles.placeholder}
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
            editable={!isLoading}
          />

          {error ? (
            <Text style={[styles.errorText, { color: colors.danger }]}>
              {error}
            </Text>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.loginButton,
              { backgroundColor: '#00FFCC', opacity: pressed ? 0.8 : 1 },
            ]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#050A0E" />
            ) : (
              <Text style={styles.loginButtonText}>Login</Text>
            )}
          </Pressable>

          {/* Forgot Password */}
          <Pressable
            style={styles.forgotButton}
            onPress={() => setFpVisible(true)}
          >
            <Text style={[styles.forgotButtonText, { color: '#FF6600' }]}>
              Forgot Password?
            </Text>
          </Pressable>
        </View>

        {/* ── Footer notice ── */}
        <Text style={[styles.footerNotice, { color: colors.muted }]}>
          Accounts are provisioned exclusively by Administrators.
        </Text>
      </ScrollView>

      {/* ── Forgot Password Modal ── */}
      <Modal
        visible={fpVisible}
        animationType="slide"
        transparent
        onRequestClose={closeFpModal}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContainer,
              { backgroundColor: colors.surface },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Reset Password
            </Text>
            <Text style={[styles.modalDescription, { color: colors.muted }]}>
              Enter your username below. An Administrator will be notified to
              reset your password.
            </Text>

            <TextInput
              style={[styles.input, dynamicStyles.input, { marginTop: 16 }]}
              placeholder="Your username"
              placeholderTextColor={dynamicStyles.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              value={fpUsername}
              onChangeText={setFpUsername}
              editable={!fpLoading}
            />

            {fpError ? (
              <Text style={[styles.errorText, { color: colors.danger }]}>
                {fpError}
              </Text>
            ) : null}

            {fpMessage ? (
              <Text
                style={[styles.successText, { color: '#00FFCC' }]}
              >
                {fpMessage}
              </Text>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.loginButton,
                {
                  backgroundColor: '#FF6600',
                  opacity: pressed ? 0.8 : 1,
                  marginTop: 16,
                },
              ]}
              onPress={handleForgotSubmit}
              disabled={fpLoading}
            >
              {fpLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={[styles.loginButtonText, { color: '#FFFFFF' }]}>
                  Submit Request
                </Text>
              )}
            </Pressable>

            <Pressable style={styles.cancelButton} onPress={closeFpModal}>
              <Text style={[styles.cancelButtonText, { color: colors.muted }]}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 48,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  brandTitle: {
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: 6,
  },
  brandSubtitle: {
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 4,
    marginTop: 4,
  },
  formContainer: {
    width: '100%',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 16,
    textTransform: 'uppercase',
  },
  input: {
    height: 50,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  errorText: {
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
  successText: {
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 20,
  },
  loginButton: {
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  loginButtonText: {
    color: '#050A0E',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1,
  },
  forgotButton: {
    alignSelf: 'center',
    marginTop: 20,
    paddingVertical: 8,
  },
  forgotButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  footerNotice: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 36,
    fontStyle: 'italic',
    lineHeight: 18,
  },

  /* ── Modal ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalContainer: {
    width: '100%',
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  cancelButton: {
    alignSelf: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default LoginScreen;
