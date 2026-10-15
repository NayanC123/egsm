/**
 * src/screens/PostsScreen.tsx
 *
 * Placeholder for the Posts / Leaderboard tab.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

const PostsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View style={[styles.container, { backgroundColor: colors.main }]}>
      <Text style={[styles.title, { color: colors.primary }]}>Posts</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>
        Community feed coming soon…
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

export default PostsScreen;
