/**
 * src/screens/AdminScreen.tsx
 *
 * Placeholder for the Admin tab (visible only to admins).
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

const AdminScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View style={[styles.container, { backgroundColor: colors.main }]}>
      <Text style={[styles.title, { color: colors.accent }]}>
        Administration
      </Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>
        Admin portal coming soon…
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

export default AdminScreen;
