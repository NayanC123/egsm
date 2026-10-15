/**
 * src/navigation/AppNavigator.tsx
 *
 * Root navigator with a custom bottom tab bar.
 *
 * Tabs:
 *   1. Chat
 *   2. Posts
 *   3. Account Settings
 *   4. Admin  (conditionally visible when user.role === 'admin')
 */

import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTheme } from '../theme/ThemeContext';
import type { UserRole } from '../types/database';

import ChatScreen from '../screens/ChatScreen';
import PostsScreen from '../screens/PostsScreen';
import AccountSettingsScreen from '../screens/Settings/AccountSettingsScreen';
import AdminScreen from '../screens/AdminScreen';

/* ------------------------------------------------------------------ */
/*  Navigator param-list type                                          */
/* ------------------------------------------------------------------ */

export type MainTabParamList = {
  Chat: undefined;
  Posts: undefined;
  AccountSettings: undefined;
  Admin: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

/* ------------------------------------------------------------------ */
/*  Tiny inline icons (no external icon library needed for scaffold)   */
/* ------------------------------------------------------------------ */

interface TabIconProps {
  label: string;
  color: string;
  focused: boolean;
}

const TabIcon: React.FC<TabIconProps> = ({ label, color, focused }) => {
  // Minimal emoji-based icons for the scaffold phase
  const iconMap: Record<string, string> = {
    Chat: '💬',
    Posts: '📝',
    AccountSettings: '⚙️',
    Admin: '🛡️',
  };

  return (
    <View style={styles.iconContainer}>
      <Text style={[styles.iconEmoji, { opacity: focused ? 1 : 0.6 }]}>
        {iconMap[label] ?? '•'}
      </Text>
    </View>
  );
};

/* ------------------------------------------------------------------ */
/*  AppNavigator                                                       */
/* ------------------------------------------------------------------ */

interface AppNavigatorProps {
  /** Current user's role — drives conditional tab visibility. */
  userRole: UserRole;
}

const AppNavigator: React.FC<AppNavigatorProps> = ({ userRole }) => {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: theme.mode === 'dark' ? '#1A2633' : '#E0E6EC',
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 8,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.3,
        },
      }}
    >
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          tabBarLabel: 'Chat',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon label="Chat" color={color} focused={focused} />
          ),
        }}
      />

      <Tab.Screen
        name="Posts"
        component={PostsScreen}
        options={{
          tabBarLabel: 'Posts',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon label="Posts" color={color} focused={focused} />
          ),
        }}
      />

      <Tab.Screen
        name="AccountSettings"
        component={AccountSettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon label="AccountSettings" color={color} focused={focused} />
          ),
        }}
      />

      {userRole === 'admin' && (
        <Tab.Screen
          name="Admin"
          component={AdminScreen}
          options={{
            tabBarLabel: 'Admin',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon label="Admin" color={color} focused={focused} />
            ),
          }}
        />
      )}
    </Tab.Navigator>
  );
};

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
  },
  iconEmoji: {
    fontSize: 20,
  },
});

export default AppNavigator;
