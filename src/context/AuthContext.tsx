/**
 * src/context/AuthContext.tsx
 *
 * Custom authentication context that authenticates against the `profiles`
 * table using username + password_hash. Session is persisted via
 * expo-secure-store. A Supabase Realtime subscription monitors the
 * current user's profile row for live status changes (terminated /
 * suspended).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../services/supabase';
import type { UserProfile } from '../types/database';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AuthContextValue {
  /** Currently authenticated user, or null when logged out / loading. */
  user: UserProfile | null;
  /** True while we're checking stored session or performing login. */
  isLoading: boolean;
  /** Login with username + password. Returns error string on failure. */
  login: (username: string, password: string) => Promise<string | null>;
  /** Clear session and log out. */
  logout: () => Promise<void>;
  /** Refresh profile data from DB (e.g. after display-name change). */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SESSION_KEY = 'gruup_session_user_id';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Check suspension: returns a human-readable message or null if OK. */
function getSuspensionMessage(profile: {
  status: string;
  suspended_until: string | null;
}): string | null {
  if (profile.status !== 'suspended') return null;

  if (!profile.suspended_until) {
    return 'Your account has been suspended. Contact an Administrator.';
  }

  const until = new Date(profile.suspended_until);
  if (until.getTime() <= Date.now()) {
    // Suspension expired — treat as active
    return null;
  }

  return `Your account is suspended until ${until.toLocaleString()}.`;
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  /* -------- Fetch full profile by ID -------- */
  const fetchProfile = useCallback(
    async (userId: string): Promise<UserProfile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !data) return null;

      return {
        id: data.id,
        username: data.username,
        display_name: data.display_name,
        role: data.role,
        status: data.status,
        mute_status: data.muted_until
          ? new Date(data.muted_until).getTime() > Date.now()
            ? 'hard_mute'
            : 'none'
          : 'none',
        suspended_until: data.suspended_until ?? null,
        created_at: data.created_at,
        updated_at: data.created_at, // table has no updated_at; use created_at
      } as UserProfile;
    },
    [],
  );

  /* -------- Clear session -------- */
  const clearSession = useCallback(async () => {
    setUser(null);
    try {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    } catch {
      // ignore
    }
    // Unsubscribe from realtime channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  /* -------- Realtime subscription for live status changes -------- */
  const subscribeToProfile = useCallback(
    (userId: string) => {
      // Remove any existing channel
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }

      const channel = supabase
        .channel(`profile-status-${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${userId}`,
          },
          (payload) => {
            const updated = payload.new as Record<string, unknown>;

            // Terminated → force logout immediately
            if (updated.status === 'terminated') {
              clearSession().then(() => {
                Alert.alert(
                  'Account Terminated',
                  'Your account has been permanently terminated by an Administrator. You can no longer access this application.',
                  [{ text: 'OK' }],
                );
              });
              return;
            }

            // Suspended → force logout with date info
            if (updated.status === 'suspended') {
              const suspMsg = getSuspensionMessage({
                status: 'suspended',
                suspended_until: (updated.suspended_until as string) ?? null,
              });
              if (suspMsg) {
                clearSession().then(() => {
                  Alert.alert('Account Suspended', suspMsg, [{ text: 'OK' }]);
                });
                return;
              }
            }

            // Otherwise refresh profile in state
            fetchProfile(userId).then((profile) => {
              if (profile) setUser(profile);
            });
          },
        )
        .subscribe();

      channelRef.current = channel;
    },
    [clearSession, fetchProfile],
  );

  /* -------- Hydrate session on mount -------- */
  useEffect(() => {
    (async () => {
      try {
        const storedId = await SecureStore.getItemAsync(SESSION_KEY);
        if (storedId) {
          const profile = await fetchProfile(storedId);
          if (profile) {
            // Check status before restoring
            if (profile.status === 'terminated') {
              await clearSession();
              Alert.alert(
                'Account Terminated',
                'Your account has been permanently terminated by an Administrator.',
                [{ text: 'OK' }],
              );
            } else {
              const suspMsg = getSuspensionMessage(profile);
              if (suspMsg) {
                await clearSession();
                Alert.alert('Account Suspended', suspMsg, [{ text: 'OK' }]);
              } else {
                setUser(profile);
                subscribeToProfile(profile.id);
              }
            }
          } else {
            await clearSession();
          }
        }
      } catch {
        // First launch or corrupted session
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------- Login -------- */
  const login = useCallback(
    async (username: string, password: string): Promise<string | null> => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('username', username.trim().toLowerCase())
          .eq('password_hash', password)
          .single();

        if (error || !data) {
          return 'Invalid username or password.';
        }

        // Terminated check
        if (data.status === 'terminated') {
          return 'Your account has been permanently terminated. You cannot log in.';
        }

        // Suspended check
        const suspMsg = getSuspensionMessage({
          status: data.status,
          suspended_until: data.suspended_until ?? null,
        });
        if (suspMsg) {
          return suspMsg;
        }

        const profile: UserProfile = {
          id: data.id,
          username: data.username,
          display_name: data.display_name,
          role: data.role,
          status: data.status,
          mute_status: data.muted_until
            ? new Date(data.muted_until).getTime() > Date.now()
              ? 'hard_mute'
              : 'none'
            : 'none',
          suspended_until: data.suspended_until ?? null,
          created_at: data.created_at,
          updated_at: data.created_at,
        };

        // Persist session
        await SecureStore.setItemAsync(SESSION_KEY, profile.id);
        setUser(profile);
        subscribeToProfile(profile.id);
        return null; // success
      } catch {
        return 'An unexpected error occurred. Please try again.';
      } finally {
        setIsLoading(false);
      }
    },
    [fetchProfile, subscribeToProfile],
  );

  /* -------- Logout -------- */
  const logout = useCallback(async () => {
    await clearSession();
  }, [clearSession]);

  /* -------- Refresh profile (e.g. after settings change) -------- */
  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const profile = await fetchProfile(user.id);
    if (profile) setUser(profile);
  }, [user, fetchProfile]);

  /* -------- Context value -------- */
  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, login, logout, refreshProfile }),
    [user, isLoading, login, logout, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

/**
 * Convenience hook — throws if used outside `<AuthProvider>`.
 */
export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
};
