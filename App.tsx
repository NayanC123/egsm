/**
 * App.tsx
 *
 * Root component — wrapped in RootErrorBoundary, SafeAreaProvider,
 * ThemeProvider, and AuthProvider, rendering AppShell.
 */

import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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

/* ------------------------------------------------------------------ */
/*  Global Error Boundary                                              */
/* ------------------------------------------------------------------ */

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
    console.error('App Root Fatal Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <StatusBar style="light" />
          <Text selectable style={errorStyles.title}>
            App Error Encountered
          </Text>
          <Text selectable style={errorStyles.message}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </Text>
          {this.state.error?.stack && (
            <ScrollView
              style={errorStyles.scroll}
              contentContainerStyle={errorStyles.scrollContent}
            >
              <Text selectable style={errorStyles.stack}>
                {this.state.error.stack}
              </Text>
            </ScrollView>
          )}
        </View>
      );
    }
    return this.props.children;
  }
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050A0E',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    paddingTop: 60,
  },
  title: {
    color: '#FF3366',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    color: '#FFFFFF',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  scroll: {
    width: '100%',
    maxHeight: 350,
    backgroundColor: '#0D161E',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1A2633',
    padding: 12,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  stack: {
    color: '#00FFCC',
    fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
});

/* ------------------------------------------------------------------ */
/*  Root export                                                        */
/* ------------------------------------------------------------------ */

export default function App() {
  return (
    <RootErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <AppShell />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </RootErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
