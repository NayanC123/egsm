/**
 * src/theme/ThemeContext.tsx
 *
 * Provides a Dark / Light theme engine for the app.
 * Dark mode is the default. The user's choice is persisted
 * on-device via expo-secure-store.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';

/* ------------------------------------------------------------------ */
/*  Palette & token types                                              */
/* ------------------------------------------------------------------ */

export interface ThemeColors {
  /** Full-screen background */
  main: string;
  /** Card / sheet surface */
  surface: string;
  /** Primary text */
  text: string;
  /** Secondary / muted text */
  muted: string;
  /** Brand primary (neon) */
  primary: string;
  /** Accent (pinned announcements, CTAs) */
  accent: string;
  /** Danger / destructive actions */
  danger: string;
}

export type ThemeMode = 'dark' | 'light';

export interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
}

const DARK_COLORS: ThemeColors = {
  main: '#050A0E',
  surface: '#0D161E',
  text: '#FFFFFF',
  muted: '#8A9BA8',
  primary: '#00FFCC',
  accent: '#FF6600',
  danger: '#FF3366',
};

const LIGHT_COLORS: ThemeColors = {
  main: '#F4F7F9',
  surface: '#FFFFFF',
  text: '#050A0E',
  muted: '#5A6B78',
  primary: '#00B894',
  accent: '#FF6600',
  danger: '#FF3366',
};

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'gruup_theme_mode';

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [mode, setModeState] = useState<ThemeMode>('dark');

  // Hydrate from device storage on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') {
          setModeState(stored);
        }
      } catch {
        // First launch or storage unavailable — keep default (dark)
      }
    })();
  }, []);

  // Persist whenever mode changes
  const persistMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, next);
    } catch {
      // Fail silently; preference simply won't persist
    }
  }, []);

  const toggleTheme = useCallback(() => {
    persistMode(mode === 'dark' ? 'light' : 'dark');
  }, [mode, persistMode]);

  const setMode = useCallback(
    (next: ThemeMode) => {
      persistMode(next);
    },
    [persistMode],
  );

  const theme = useMemo<Theme>(
    () => ({
      mode,
      colors: mode === 'dark' ? DARK_COLORS : LIGHT_COLORS,
    }),
    [mode],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, toggleTheme, setMode }),
    [theme, toggleTheme, setMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

/**
 * Convenience hook — throws if used outside `<ThemeProvider>`.
 */
export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }
  return ctx;
};
