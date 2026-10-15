/**
 * src/screens/AccountSettingsScreen.tsx
 *
 * Placeholder for the Account Settings tab.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

const AccountSettingsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View style={[styles.container, { backgroundColor: colors.main }]}>
      <Text style={[styles.title, { color: colors.primary }]}>
        Account Settings
      </Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>
        Profile &amp; preferences coming soon…
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
  },
});

export default AccountSettingsScreen;
