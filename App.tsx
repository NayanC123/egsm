/**
 * App.tsx
 *
 * Root component — wraps the app in ThemeProvider and NavigationContainer,
 * then renders the bottom-tab navigator.
 *
 * During Phase 1 (scaffold) the user role is hard-coded to 'admin'
 * so all tabs are visible for development.  Phase 2 will replace this
 * with real Supabase auth state.
 */

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';

/* ------------------------------------------------------------------ */
/*  Inner shell (needs ThemeContext)                                    */
/* ------------------------------------------------------------------ */

const AppShell: React.FC = () => {
  const { theme } = useTheme();

  // TODO Phase 2: replace with actual authenticated user role
  const userRole = 'admin' as const;

  return (
    <NavigationContainer>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <AppNavigator userRole={userRole} />
    </NavigationContainer>
  );
};

/* ------------------------------------------------------------------ */
/*  Root export                                                        */
/* ------------------------------------------------------------------ */

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
