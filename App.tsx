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
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import LoginScreen from './src/screens/Auth/LoginScreen';

/* ------------------------------------------------------------------ */
/*  Inner shell (needs ThemeContext & AuthContext)                    */
/* ------------------------------------------------------------------ */

const AppShell: React.FC = () => {
  const { theme } = useTheme();
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: theme.colors.main },
        ]}
      >
        <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <>
        <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
        <LoginScreen />
      </>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <AppNavigator userRole={user.role} />
    </NavigationContainer>
  );
};

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App Root Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: '#050A0E',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          }}
        >
          <Text
            style={{
              color: '#FF3366',
              fontSize: 20,
              fontWeight: 'bold',
              marginBottom: 12,
            }}
          >
            App Error Encountered
          </Text>
          <Text style={{ color: '#FFFFFF', fontSize: 14, textAlign: 'center' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

/* ------------------------------------------------------------------ */
/*  Root export                                                        */
/* ------------------------------------------------------------------ */

export default function App() {
  return (
    <SafeAreaProvider>
      <RootErrorBoundary>
        <ThemeProvider>
          <AuthProvider>
            <AppShell />
          </AuthProvider>
        </ThemeProvider>
      </RootErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

