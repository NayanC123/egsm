/**
 * src/screens/ChatScreen.tsx
 *
 * Placeholder for the Group Chat tab.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

const ChatScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View style={[styles.container, { backgroundColor: colors.main }]}>
      <Text style={[styles.title, { color: colors.primary }]}>Chat</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>
        Group chat coming soon…
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

export default ChatScreen;
