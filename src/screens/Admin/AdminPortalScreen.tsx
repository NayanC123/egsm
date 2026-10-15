/**
 * src/screens/Admin/AdminPortalScreen.tsx
 *
 * Administration Portal — Strictly guarded for users with `user.role === 'admin'`.
 *
 * Tabs:
 *   1. Create & Manage Accounts:
 *      - Create User Account form (Username, Initial Password, Display Name, Role)
 *      - User Directory (Searchable, Status badges, Mute, Suspend, Terminate, Change Password)
 *   2. Announcements Manager:
 *      - List of all posts with toggle switch to mark/unmark as Announcement (#FF6600 pinned)
 *   3. Offense Reports & Password Requests:
 *      - Pending offense reports with message snippet and one-tap actions
 *        (Delete Message, Mute, Suspend, Terminate, Mark Resolved)
 *      - Pending password reset requests with one-tap password reset
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { supabase } from '../../services/supabase';
import type {
  AccountStatus,
  OffenseReportWithDetails,
  PasswordResetRequest,
  PostWithAuthor,
  UserProfile,
  UserRole,
} from '../../types/database';

type AdminTab = 'accounts' | 'announcements' | 'reports';
type AccountsSubTab = 'directory' | 'create';
type ReportsSubTab = 'offenses' | 'resets';

export const AdminPortalScreen: React.FC = () => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { colors } = theme;

  const isDark = theme.mode === 'dark';
  const borderColor = isDark ? '#1A2633' : '#E0E6EC';

  // Active top-level tab
  const [activeTab, setActiveTab] = useState<AdminTab>('accounts');

  // Sub-tabs
  const [accountsSubTab, setAccountsSubTab] = useState<AccountsSubTab>('directory');
  const [reportsSubTab, setReportsSubTab] = useState<ReportsSubTab>('offenses');

  // Loading states
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Tab 1: Accounts state
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');

  // Create User form state
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('member');
  const [createLoading, setCreateLoading] = useState(false);
  const [createMessage, setCreateMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // User Action Modals
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [muteModalVisible, setMuteModalVisible] = useState(false);
  const [suspendModalVisible, setSuspendModalVisible] = useState(false);
  const [terminateModalVisible, setTerminateModalVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [changePasswordValue, setChangePasswordValue] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Tab 2: Announcements Manager state
  const [posts, setPosts] = useState<PostWithAuthor[]>([]);
  const [postsSearchQuery, setPostsSearchQuery] = useState('');
  const [toggleLoadingId, setToggleLoadingId] = useState<string | null>(null);

  // Tab 3: Reports & Password Resets state
  const [reports, setReports] = useState<OffenseReportWithDetails[]>([]);
  const [resetRequests, setResetRequests] = useState<PasswordResetRequest[]>([]);
  const [showOnlyPendingReports, setShowOnlyPendingReports] = useState(true);
  const [showOnlyPendingResets, setShowOnlyPendingResets] = useState(true);

  // Password reset action modal
  const [selectedResetRequest, setSelectedResetRequest] = useState<PasswordResetRequest | null>(null);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);

  // Helper: Generate random secure password
  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let pass = 'Gruup!';
    for (let i = 0; i < 4; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  };

  /* ------------------------------------------------------------------ */
  /*  Data Fetchers                                                      */
  /* ------------------------------------------------------------------ */

  // Fetch all users for directory
  const fetchUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setUsers(
          data.map((u) => ({
            id: u.id,
            username: u.username,
            display_name: u.display_name,
            role: u.role,
            status: u.status,
            mute_status: u.muted_until && new Date(u.muted_until).getTime() > Date.now()
              ? 'hard_mute'
              : 'none',
            suspended_until: u.suspended_until,
            muted_until: u.muted_until,
            created_at: u.created_at,
            updated_at: u.created_at,
          })),
        );
      }
    } catch {
      // silently handle
    }
  }, []);

  // Fetch all posts for announcements manager
  const fetchPosts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          id,
          author_id,
          subject,
          content,
          is_announcement,
          image_urls,
          document_urls,
          created_at,
          author:profiles(username, display_name)
        `)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setPosts(data as unknown as PostWithAuthor[]);
      }
    } catch {
      // silently handle
    }
  }, []);

  // Fetch offense reports
  const fetchReports = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('offense_reports')
        .select(`
          id,
          reporter_id,
          message_id,
          reported_user_id,
          reason,
          status,
          created_at,
          reporter:profiles!reporter_id(username, display_name),
          reported_user:profiles!reported_user_id(id, username, display_name, status, muted_until, suspended_until),
          message:messages(id, content, message_type, media_url, is_deleted)
        `)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setReports(data as unknown as OffenseReportWithDetails[]);
      }
    } catch {
      // silently handle
    }
  }, []);

  // Fetch password reset requests
  const fetchResetRequests = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('password_reset_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setResetRequests(data as PasswordResetRequest[]);
      }
    } catch {
      // silently handle
    }
  }, []);

  // Unified load
  const loadAllData = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchUsers(),
      fetchPosts(),
      fetchReports(),
      fetchResetRequests(),
    ]);
    setLoading(false);
  }, [fetchUsers, fetchPosts, fetchReports, fetchResetRequests]);

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      fetchUsers(),
      fetchPosts(),
      fetchReports(),
      fetchResetRequests(),
    ]);
    setRefreshing(false);
  }, [fetchUsers, fetchPosts, fetchReports, fetchResetRequests]);

  // Initial load & Supabase Realtime subscriptions
  useEffect(() => {
    if (user?.role === 'admin') {
      loadAllData();

      // Subscribe to real-time events across tables
      const channel = supabase
        .channel('admin-portal-sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'profiles' },
          () => {
            fetchUsers();
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'posts' },
          () => {
            fetchPosts();
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'offense_reports' },
          () => {
            fetchReports();
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'password_reset_requests' },
          () => {
            fetchResetRequests();
          },
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user?.role, loadAllData, fetchUsers, fetchPosts, fetchReports, fetchResetRequests]);

  /* ------------------------------------------------------------------ */
  /*  Strict Guard Check                                                */
  /* ------------------------------------------------------------------ */
  if (!user || user.role !== 'admin') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.main }]}>
        <View style={styles.accessDeniedContainer}>
          <Text style={styles.accessDeniedIcon}>🛡️</Text>
          <Text style={[styles.accessDeniedTitle, { color: colors.danger }]}>
            Administrator Access Required
          </Text>
          <Text style={[styles.accessDeniedText, { color: colors.muted }]}>
            This portal is restricted exclusively to system administrators.
            Your current account role does not have authorization.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Tab 1: Create Account Handler                                     */
  /* ------------------------------------------------------------------ */
  const handleCreateUser = async () => {
    setCreateMessage(null);
    const trimmedUsername = newUsername.trim().toLowerCase();
    const trimmedPassword = newPassword.trim();
    const trimmedDisplayName = newDisplayName.trim();

    if (!trimmedUsername || !trimmedPassword || !trimmedDisplayName) {
      setCreateMessage({
        text: 'Please fill in all required fields (Username, Password, Display Name).',
        isError: true,
      });
      return;
    }

    if (trimmedUsername.length < 3) {
      setCreateMessage({
        text: 'Username must be at least 3 characters.',
        isError: true,
      });
      return;
    }

    if (trimmedPassword.length < 4) {
      setCreateMessage({
        text: 'Password must be at least 4 characters.',
        isError: true,
      });
      return;
    }

    setCreateLoading(true);
    try {
      // 1. Check if username already exists
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', trimmedUsername)
        .maybeSingle();

      if (existingUser) {
        setCreateMessage({
          text: `Username "${trimmedUsername}" is already taken. Please choose another.`,
          isError: true,
        });
        setCreateLoading(false);
        return;
      }

      // 2. Insert new user into profiles
      const { error: insertError } = await supabase.from('profiles').insert({
        username: trimmedUsername,
        password_hash: trimmedPassword,
        display_name: trimmedDisplayName,
        role: newRole,
        status: 'active',
      });

      if (insertError) {
        setCreateMessage({
          text: insertError.message || 'Failed to create user account.',
          isError: true,
        });
      } else {
        Alert.alert(
          'Account Created',
          `Successfully created account for @${trimmedUsername} (${trimmedDisplayName}) with role "${newRole}".\nInitial Password: ${trimmedPassword}`,
          [{ text: 'OK' }],
        );
        setCreateMessage({
          text: `User @${trimmedUsername} created successfully!`,
          isError: false,
        });
        setNewUsername('');
        setNewPassword('');
        setNewDisplayName('');
        setNewRole('member');
        await fetchUsers();
        setAccountsSubTab('directory');
      }
    } catch (err: any) {
      setCreateMessage({
        text: err?.message || 'An unexpected error occurred while creating user.',
        isError: true,
      });
    } finally {
      setCreateLoading(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Tab 1: User Directory Actions                                     */
  /* ------------------------------------------------------------------ */

  // Mute / Unmute handler
  const handleApplyMute = async (durationMinutes: number | null) => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      const mutedUntil =
        durationMinutes === null
          ? null
          : new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

      const { error } = await supabase
        .from('profiles')
        .update({ muted_until: mutedUntil })
        .eq('id', selectedUser.id);

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        const msg =
          durationMinutes === null
            ? `Cleared chat mute for @${selectedUser.username}.`
            : `Muted @${selectedUser.username} for ${
                durationMinutes >= 60
                  ? `${durationMinutes / 60} hour(s)`
                  : `${durationMinutes} minute(s)`
              }.`;
        Alert.alert('Mute Updated', msg);
        setMuteModalVisible(false);
        await fetchUsers();
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update mute.');
    } finally {
      setActionLoading(false);
    }
  };

  // Suspend / Lift handler
  const handleApplySuspension = async (durationHours: number | null) => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      const isLift = durationHours === null;
      const suspendedUntil = isLift
        ? null
        : new Date(Date.now() + durationHours * 3600 * 1000).toISOString();

      const { error } = await supabase
        .from('profiles')
        .update({
          status: isLift ? 'active' : 'suspended',
          suspended_until: suspendedUntil,
        })
        .eq('id', selectedUser.id);

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        const msg = isLift
          ? `Suspension lifted for @${selectedUser.username}. Account is now active.`
          : `Suspended @${selectedUser.username} for ${
              durationHours >= 24
                ? `${durationHours / 24} day(s)`
                : `${durationHours} hour(s)`
            }.`;
        Alert.alert('Suspension Updated', msg);
        setSuspendModalVisible(false);
        await fetchUsers();
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update suspension.');
    } finally {
      setActionLoading(false);
    }
  };

  // Terminate handler
  const handleApplyTermination = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          status: 'terminated',
          suspended_until: null,
        })
        .eq('id', selectedUser.id);

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        Alert.alert(
          'Account Terminated',
          `@${selectedUser.username} has been permanently terminated and kicked from active sessions.`,
        );
        setTerminateModalVisible(false);
        await fetchUsers();
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to terminate account.');
    } finally {
      setActionLoading(false);
    }
  };

  // Change Password handler
  const handleApplyPasswordChange = async () => {
    if (!selectedUser) return;
    const trimmed = changePasswordValue.trim();
    if (!trimmed || trimmed.length < 4) {
      Alert.alert('Invalid Password', 'New password must be at least 4 characters.');
      return;
    }
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ password_hash: trimmed })
        .eq('id', selectedUser.id);

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        Alert.alert(
          'Password Changed',
          `Password for @${selectedUser.username} has been updated to:\n${trimmed}`,
        );
        setPasswordModalVisible(false);
        setChangePasswordValue('');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to change password.');
    } finally {
      setActionLoading(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Tab 2: Announcement Toggle Handler                                */
  /* ------------------------------------------------------------------ */
  const handleToggleAnnouncement = async (post: PostWithAuthor) => {
    setToggleLoadingId(post.id);
    const newState = !post.is_announcement;

    try {
      const { error } = await supabase
        .from('posts')
        .update({ is_announcement: newState })
        .eq('id', post.id);

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        setPosts((prev) =>
          prev.map((p) => (p.id === post.id ? { ...p, is_announcement: newState } : p)),
        );
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to toggle announcement.');
    } finally {
      setToggleLoadingId(null);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Tab 3: Offense Reports & Password Resets Handlers                 */
  /* ------------------------------------------------------------------ */

  // Delete reported message
  const handleDeleteReportedMessage = async (messageId: string) => {
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this reported message for everyone?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('messages')
                .update({
                  is_deleted: true,
                  content: 'Message deleted by administrator',
                  media_url: null,
                  media_meta: null,
                })
                .eq('id', messageId);

              if (error) {
                Alert.alert('Error', error.message);
              } else {
                Alert.alert('Message Deleted', 'The reported message was removed.');
                await fetchReports();
              }
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete message.');
            }
          },
        },
      ],
    );
  };

  // Mark offense report resolved
  const handleResolveReport = async (reportId: string) => {
    try {
      const { error } = await supabase
        .from('offense_reports')
        .update({ status: 'resolved' })
        .eq('id', reportId);

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        Alert.alert('Resolved', 'Report marked as resolved.');
        await fetchReports();
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to resolve report.');
    }
  };

  // Quick action on reported user (Mute / Suspend / Terminate)
  const handleQuickActionReportedUser = (
    reportedUser: {
      id: string;
      username: string;
      display_name: string;
      status: AccountStatus;
      muted_until?: string | null;
      suspended_until?: string | null;
    },
    action: 'mute' | 'suspend' | 'terminate',
  ) => {
    const userProfile: UserProfile = {
      id: reportedUser.id,
      username: reportedUser.username,
      display_name: reportedUser.display_name,
      role: 'member',
      status: reportedUser.status,
      mute_status: reportedUser.muted_until ? 'hard_mute' : 'none',
      suspended_until: reportedUser.suspended_until ?? null,
      muted_until: reportedUser.muted_until ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setSelectedUser(userProfile);
    if (action === 'mute') setMuteModalVisible(true);
    if (action === 'suspend') setSuspendModalVisible(true);
    if (action === 'terminate') setTerminateModalVisible(true);
  };

  // Execute password reset request
  const handleExecutePasswordReset = async () => {
    if (!selectedResetRequest) return;
    const trimmed = newResetPassword.trim();
    if (!trimmed || trimmed.length < 4) {
      Alert.alert('Invalid Password', 'New password must be at least 4 characters.');
      return;
    }

    setResetSubmitting(true);
    try {
      // 1. Update password in profiles
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ password_hash: trimmed })
        .eq('username', selectedResetRequest.username.trim().toLowerCase());

      if (profileError) {
        Alert.alert('Error', profileError.message || 'Could not update password for user.');
        setResetSubmitting(false);
        return;
      }

      // 2. Mark request resolved in password_reset_requests
      const { error: reqError } = await supabase
        .from('password_reset_requests')
        .update({ status: 'resolved' })
        .eq('id', selectedResetRequest.id);

      if (reqError) {
        Alert.alert('Warning', 'Password updated, but failed to update request status.');
      } else {
        Alert.alert(
          'Password Reset Successful',
          `New password for @${selectedResetRequest.username}:\n\n${trimmed}\n\nPlease share this temporary password with the user.`,
        );
        setResetModalVisible(false);
        setSelectedResetRequest(null);
        setNewResetPassword('');
        await fetchResetRequests();
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to complete reset.');
    } finally {
      setResetSubmitting(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Filtered Lists                                                    */
  /* ------------------------------------------------------------------ */

  // Filtered users
  const filteredUsers = useMemo(() => {
    const q = userSearchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.display_name.toLowerCase().includes(q),
    );
  }, [users, userSearchQuery]);

  // Filtered posts
  const filteredPosts = useMemo(() => {
    const q = postsSearchQuery.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter(
      (p) =>
        p.subject.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        p.author?.username.toLowerCase().includes(q) ||
        p.author?.display_name.toLowerCase().includes(q),
    );
  }, [posts, postsSearchQuery]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    if (showOnlyPendingReports) {
      return reports.filter((r) => r.status === 'pending');
    }
    return reports;
  }, [reports, showOnlyPendingReports]);

  // Filtered resets
  const filteredResets = useMemo(() => {
    if (showOnlyPendingResets) {
      return resetRequests.filter((r) => r.status === 'pending');
    }
    return resetRequests;
  }, [resetRequests, showOnlyPendingResets]);

  // Badges count
  const pendingReportsCount = reports.filter((r) => r.status === 'pending').length;
  const pendingResetsCount = resetRequests.filter((r) => r.status === 'pending').length;

  /* ------------------------------------------------------------------ */
  /*  Render Helpers                                                    */
  /* ------------------------------------------------------------------ */

  // Status Badge for User Cards
  const renderStatusBadge = (u: UserProfile) => {
    const isMuted = u.muted_until && new Date(u.muted_until).getTime() > Date.now();
    const isSuspended =
      u.status === 'suspended' &&
      (!u.suspended_until || new Date(u.suspended_until).getTime() > Date.now());

    if (u.status === 'terminated') {
      return (
        <View style={[styles.badge, { backgroundColor: 'rgba(255, 51, 102, 0.15)', borderColor: '#FF3366' }]}>
          <Text style={[styles.badgeText, { color: '#FF3366' }]}>TERMINATED</Text>
        </View>
      );
    }
    if (isSuspended) {
      return (
        <View style={[styles.badge, { backgroundColor: 'rgba(255, 102, 0, 0.15)', borderColor: '#FF6600' }]}>
          <Text style={[styles.badgeText, { color: '#FF6600' }]}>SUSPENDED</Text>
        </View>
      );
    }
    if (isMuted) {
      return (
        <View style={[styles.badge, { backgroundColor: 'rgba(153, 102, 255, 0.15)', borderColor: '#9966FF' }]}>
          <Text style={[styles.badgeText, { color: '#9966FF' }]}>MUTED</Text>
        </View>
      );
    }
    return (
      <View style={[styles.badge, { backgroundColor: 'rgba(0, 255, 204, 0.12)', borderColor: '#00FFCC' }]}>
        <Text style={[styles.badgeText, { color: '#00FFCC' }]}>ACTIVE</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.main }]}>
      {/* ── Top Header ── */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerShield}>🛡️</Text>
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              Admin Portal
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.muted }]}>
              Superuser Control & Moderation
            </Text>
          </View>
        </View>
      </View>

      {/* ── Navigation Tabs ── */}
      <View style={[styles.tabBar, { borderBottomColor: borderColor }]}>
        <Pressable
          style={[
            styles.tabButton,
            activeTab === 'accounts' && styles.tabButtonActive,
            activeTab === 'accounts' && { borderBottomColor: '#00FFCC' },
          ]}
          onPress={() => setActiveTab('accounts')}
        >
          <Text
            style={[
              styles.tabButtonText,
              { color: activeTab === 'accounts' ? '#00FFCC' : colors.muted },
            ]}
          >
            👥 Accounts
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.tabButton,
            activeTab === 'announcements' && styles.tabButtonActive,
            activeTab === 'announcements' && { borderBottomColor: '#FF6600' },
          ]}
          onPress={() => setActiveTab('announcements')}
        >
          <Text
            style={[
              styles.tabButtonText,
              { color: activeTab === 'announcements' ? '#FF6600' : colors.muted },
            ]}
          >
            📢 Announcements
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.tabButton,
            activeTab === 'reports' && styles.tabButtonActive,
            activeTab === 'reports' && { borderBottomColor: '#FF3366' },
          ]}
          onPress={() => setActiveTab('reports')}
        >
          <View style={styles.tabBadgeRow}>
            <Text
              style={[
                styles.tabButtonText,
                { color: activeTab === 'reports' ? '#FF3366' : colors.muted },
              ]}
            >
              🚨 Reports
            </Text>
            {pendingReportsCount + pendingResetsCount > 0 && (
              <View style={styles.countPill}>
                <Text style={styles.countPillText}>
                  {pendingReportsCount + pendingResetsCount}
                </Text>
              </View>
            )}
          </View>
        </Pressable>
      </View>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  TAB 1: CREATE & MANAGE ACCOUNTS                                */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'accounts' && (
        <View style={styles.contentContainer}>
          {/* Sub-tab pills */}
          <View style={styles.subTabBar}>
            <Pressable
              style={[
                styles.subTabPill,
                accountsSubTab === 'directory' && {
                  backgroundColor: isDark ? '#1A2633' : '#E0E6EC',
                },
              ]}
              onPress={() => setAccountsSubTab('directory')}
            >
              <Text
                style={[
                  styles.subTabPillText,
                  {
                    color:
                      accountsSubTab === 'directory' ? colors.text : colors.muted,
                  },
                ]}
              >
                Directory ({users.length})
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.subTabPill,
                accountsSubTab === 'create' && {
                  backgroundColor: isDark ? '#1A2633' : '#E0E6EC',
                },
              ]}
              onPress={() => setAccountsSubTab('create')}
            >
              <Text
                style={[
                  styles.subTabPillText,
                  {
                    color:
                      accountsSubTab === 'create' ? '#00FFCC' : colors.muted,
                  },
                ]}
              >
                + Create User Account
              </Text>
            </Pressable>
          </View>

          {/* Directory View */}
          {accountsSubTab === 'directory' && (
            <View style={styles.innerFlex}>
              {/* Search Bar */}
              <View
                style={[
                  styles.searchContainer,
                  {
                    backgroundColor: colors.surface,
                    borderColor: borderColor,
                  },
                ]}
              >
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  style={[styles.searchInput, { color: colors.text }]}
                  placeholder="Search by username or display name..."
                  placeholderTextColor={colors.muted}
                  value={userSearchQuery}
                  onChangeText={setUserSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {userSearchQuery ? (
                  <Pressable onPress={() => setUserSearchQuery('')}>
                    <Text style={[styles.clearIcon, { color: colors.muted }]}>
                      ✕
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {/* Users FlatList */}
              <FlatList
                data={filteredUsers}
                keyExtractor={(item) => item.id}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor="#00FFCC"
                  />
                }
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => {
                  const isCurrentUser = item.id === user.id;
                  const isMuted =
                    item.muted_until &&
                    new Date(item.muted_until).getTime() > Date.now();
                  const isSuspended =
                    item.status === 'suspended' &&
                    (!item.suspended_until ||
                      new Date(item.suspended_until).getTime() > Date.now());

                  return (
                    <View
                      style={[
                        styles.card,
                        {
                          backgroundColor: colors.surface,
                          borderColor: borderColor,
                        },
                      ]}
                    >
                      {/* Top Row: User details & Status */}
                      <View style={styles.userCardHeader}>
                        <View style={styles.avatarCircle}>
                          <Text style={styles.avatarInitial}>
                            {(item.display_name || item.username)[0].toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.userInfoCol}>
                          <View style={styles.nameRow}>
                            <Text
                              style={[styles.displayNameText, { color: colors.text }]}
                              numberOfLines={1}
                            >
                              {item.display_name}
                            </Text>
                            {item.role === 'admin' && (
                              <View style={styles.adminRolePill}>
                                <Text style={styles.adminRolePillText}>ADMIN</Text>
                              </View>
                            )}
                          </View>
                          <Text
                            style={[styles.usernameText, { color: colors.muted }]}
                          >
                            @{item.username}
                          </Text>
                        </View>
                        {renderStatusBadge(item)}
                      </View>

                      {/* Expiration notices */}
                      {isSuspended && item.suspended_until && (
                        <Text style={[styles.statusNoticeText, { color: '#FF6600' }]}>
                          ⏳ Suspended until {new Date(item.suspended_until).toLocaleString()}
                        </Text>
                      )}
                      {isMuted && item.muted_until && (
                        <Text style={[styles.statusNoticeText, { color: '#9966FF' }]}>
                          🔇 Muted until {new Date(item.muted_until).toLocaleString()}
                        </Text>
                      )}

                      {/* Action Buttons Row */}
                      {!isCurrentUser && (
                        <View style={styles.actionButtonsRow}>
                          <Pressable
                            style={[styles.actionBtn, { borderColor: '#9966FF' }]}
                            onPress={() => {
                              setSelectedUser(item);
                              setMuteModalVisible(true);
                            }}
                          >
                            <Text style={[styles.actionBtnText, { color: '#9966FF' }]}>
                              {isMuted ? 'Unmute' : 'Mute'}
                            </Text>
                          </Pressable>

                          <Pressable
                            style={[styles.actionBtn, { borderColor: '#FF6600' }]}
                            onPress={() => {
                              setSelectedUser(item);
                              setSuspendModalVisible(true);
                            }}
                          >
                            <Text style={[styles.actionBtnText, { color: '#FF6600' }]}>
                              {isSuspended ? 'Lift' : 'Suspend'}
                            </Text>
                          </Pressable>

                          <Pressable
                            style={[styles.actionBtn, { borderColor: '#00FFCC' }]}
                            onPress={() => {
                              setSelectedUser(item);
                              setChangePasswordValue('');
                              setPasswordModalVisible(true);
                            }}
                          >
                            <Text style={[styles.actionBtnText, { color: '#00FFCC' }]}>
                              Password
                            </Text>
                          </Pressable>

                          {item.status !== 'terminated' && (
                            <Pressable
                              style={[styles.actionBtn, { borderColor: '#FF3366' }]}
                              onPress={() => {
                                setSelectedUser(item);
                                setTerminateModalVisible(true);
                              }}
                            >
                              <Text style={[styles.actionBtnText, { color: '#FF3366' }]}>
                                Terminate
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      )}
                    </View>
                  );
                }}
              />
            </View>
          )}

          {/* Create User View */}
          {accountsSubTab === 'create' && (
            <ScrollView
              contentContainerStyle={styles.formScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View
                style={[
                  styles.formCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: borderColor,
                  },
                ]}
              >
                <Text style={[styles.formTitle, { color: colors.text }]}>
                  Create New User Account
                </Text>
                <Text style={[styles.formSubtitle, { color: colors.muted }]}>
                  Directly provision an account into the system. All fields required.
                </Text>

                {/* Username */}
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Username (unique)
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: isDark ? '#050A0E' : '#F4F7F9',
                      color: colors.text,
                      borderColor: borderColor,
                    },
                  ]}
                  placeholder="e.g. johndoe"
                  placeholderTextColor={colors.muted}
                  value={newUsername}
                  onChangeText={setNewUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                {/* Display Name */}
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Display Name
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: isDark ? '#050A0E' : '#F4F7F9',
                      color: colors.text,
                      borderColor: borderColor,
                    },
                  ]}
                  placeholder="e.g. John Doe"
                  placeholderTextColor={colors.muted}
                  value={newDisplayName}
                  onChangeText={setNewDisplayName}
                />

                {/* Initial Password with Random Helper */}
                <View style={styles.labelWithHelperRow}>
                  <Text style={[styles.inputLabel, { color: colors.text }]}>
                    Initial Password
                  </Text>
                  <Pressable
                    onPress={() => setNewPassword(generateRandomPassword())}
                  >
                    <Text style={[styles.helperLink, { color: '#00FFCC' }]}>
                      🎲 Generate Random
                    </Text>
                  </Pressable>
                </View>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: isDark ? '#050A0E' : '#F4F7F9',
                      color: colors.text,
                      borderColor: borderColor,
                    },
                  ]}
                  placeholder="Set initial temporary password"
                  placeholderTextColor={colors.muted}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  autoCapitalize="none"
                />

                {/* Role Selector */}
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  System Role
                </Text>
                <View style={styles.roleSelectorRow}>
                  <Pressable
                    style={[
                      styles.roleButton,
                      newRole === 'member' && styles.roleButtonActive,
                      { borderColor: newRole === 'member' ? '#00FFCC' : borderColor },
                    ]}
                    onPress={() => setNewRole('member')}
                  >
                    <Text
                      style={[
                        styles.roleButtonText,
                        {
                          color: newRole === 'member' ? '#00FFCC' : colors.muted,
                        },
                      ]}
                    >
                      Member
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.roleButton,
                      newRole === 'admin' && styles.roleButtonActive,
                      { borderColor: newRole === 'admin' ? '#FF6600' : borderColor },
                    ]}
                    onPress={() => setNewRole('admin')}
                  >
                    <Text
                      style={[
                        styles.roleButtonText,
                        {
                          color: newRole === 'admin' ? '#FF6600' : colors.muted,
                        },
                      ]}
                    >
                      🛡️ Administrator
                    </Text>
                  </Pressable>
                </View>

                {/* Feedback Message */}
                {createMessage && (
                  <Text
                    style={[
                      styles.feedbackText,
                      {
                        color: createMessage.isError
                          ? colors.danger
                          : '#00FFCC',
                      },
                    ]}
                  >
                    {createMessage.text}
                  </Text>
                )}

                {/* Submit Button */}
                <Pressable
                  style={({ pressed }) => [
                    styles.submitButton,
                    {
                      backgroundColor: '#00FFCC',
                      opacity: pressed || createLoading ? 0.8 : 1,
                    },
                  ]}
                  onPress={handleCreateUser}
                  disabled={createLoading}
                >
                  {createLoading ? (
                    <ActivityIndicator color="#050A0E" />
                  ) : (
                    <Text style={styles.submitButtonText}>
                      Create User Account
                    </Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          )}
        </View>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  TAB 2: ANNOUNCEMENTS MANAGER                                  */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'announcements' && (
        <View style={styles.contentContainer}>
          {/* Header Banner */}
          <View
            style={[
              styles.announcementBanner,
              { backgroundColor: 'rgba(255, 102, 0, 0.1)', borderColor: '#FF6600' },
            ]}
          >
            <Text style={styles.announcementBannerIcon}>📢</Text>
            <Text style={[styles.announcementBannerText, { color: '#FF6600' }]}>
              Marking a post as an Announcement immediately pins it to the top of the Posts feed with a prominent #FF6600 border and badge.
            </Text>
          </View>

          {/* Search Bar */}
          <View
            style={[
              styles.searchContainer,
              {
                backgroundColor: colors.surface,
                borderColor: borderColor,
              },
            ]}
          >
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search posts by subject, content, or author..."
              placeholderTextColor={colors.muted}
              value={postsSearchQuery}
              onChangeText={setPostsSearchQuery}
            />
            {postsSearchQuery ? (
              <Pressable onPress={() => setPostsSearchQuery('')}>
                <Text style={[styles.clearIcon, { color: colors.muted }]}>
                  ✕
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* Posts List */}
          <FlatList
            data={filteredPosts}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#FF6600"
              />
            }
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const isAnnouncement = Boolean(item.is_announcement);
              const isToggling = toggleLoadingId === item.id;

              return (
                <View
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.surface,
                      borderColor: isAnnouncement ? '#FF6600' : borderColor,
                      borderWidth: isAnnouncement ? 2 : 1,
                    },
                  ]}
                >
                  <View style={styles.postCardHeader}>
                    <View style={styles.postMetaCol}>
                      {isAnnouncement && (
                        <View style={styles.pinnedBadge}>
                          <Text style={styles.pinnedBadgeText}>
                            📢 PINNED ANNOUNCEMENT
                          </Text>
                        </View>
                      )}
                      <Text
                        style={[styles.postSubject, { color: colors.text }]}
                        numberOfLines={2}
                      >
                        {item.subject}
                      </Text>
                      <Text
                        style={[styles.postAuthor, { color: colors.muted }]}
                      >
                        By {item.author?.display_name || 'Member'} (@
                        {item.author?.username || 'user'}) •{' '}
                        {new Date(item.created_at).toLocaleDateString()}
                      </Text>
                    </View>

                    {/* Announcement Toggle Switch */}
                    <View style={styles.toggleContainer}>
                      <Text
                        style={[
                          styles.toggleLabel,
                          {
                            color: isAnnouncement ? '#FF6600' : colors.muted,
                          },
                        ]}
                      >
                        {isAnnouncement ? 'Pinned' : 'Normal'}
                      </Text>
                      {isToggling ? (
                        <ActivityIndicator size="small" color="#FF6600" />
                      ) : (
                        <Switch
                          value={isAnnouncement}
                          onValueChange={() => handleToggleAnnouncement(item)}
                          trackColor={{ false: '#1A2633', true: '#FF6600' }}
                          thumbColor={isAnnouncement ? '#FFFFFF' : '#8A9BA8'}
                        />
                      )}
                    </View>
                  </View>

                  {/* Snippet */}
                  <Text
                    style={[styles.postSnippet, { color: colors.muted }]}
                    numberOfLines={3}
                  >
                    {item.content}
                  </Text>
                </View>
              );
            }}
          />
        </View>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  TAB 3: OFFENSE REPORTS & PASSWORD REQUESTS                    */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'reports' && (
        <View style={styles.contentContainer}>
          {/* Sub-tab pills */}
          <View style={styles.subTabBar}>
            <Pressable
              style={[
                styles.subTabPill,
                reportsSubTab === 'offenses' && {
                  backgroundColor: isDark ? '#1A2633' : '#E0E6EC',
                },
              ]}
              onPress={() => setReportsSubTab('offenses')}
            >
              <Text
                style={[
                  styles.subTabPillText,
                  {
                    color:
                      reportsSubTab === 'offenses' ? '#FF3366' : colors.muted,
                  },
                ]}
              >
                Offense Reports ({pendingReportsCount} pending)
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.subTabPill,
                reportsSubTab === 'resets' && {
                  backgroundColor: isDark ? '#1A2633' : '#E0E6EC',
                },
              ]}
              onPress={() => setReportsSubTab('resets')}
            >
              <Text
                style={[
                  styles.subTabPillText,
                  {
                    color:
                      reportsSubTab === 'resets' ? '#00FFCC' : colors.muted,
                  },
                ]}
              >
                Password Requests ({pendingResetsCount} pending)
              </Text>
            </Pressable>
          </View>

          {/* Subview: Offense Reports */}
          {reportsSubTab === 'offenses' && (
            <View style={styles.innerFlex}>
              {/* Filter Row */}
              <View style={styles.filterRow}>
                <Pressable
                  style={[
                    styles.filterChip,
                    showOnlyPendingReports && styles.filterChipActive,
                    { borderColor: showOnlyPendingReports ? '#FF3366' : borderColor },
                  ]}
                  onPress={() => setShowOnlyPendingReports(!showOnlyPendingReports)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: showOnlyPendingReports ? '#FF3366' : colors.muted },
                    ]}
                  >
                    {showOnlyPendingReports ? 'Showing Pending Only' : 'Showing All'}
                  </Text>
                </Pressable>
              </View>

              {filteredReports.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyIcon}>✨</Text>
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>
                    No Offense Reports
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                    All reported messages have been reviewed and resolved.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={filteredReports}
                  keyExtractor={(item) => item.id}
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={onRefresh}
                      tintColor="#FF3366"
                    />
                  }
                  contentContainerStyle={styles.listContent}
                  renderItem={({ item }) => {
                    const isPending = item.status === 'pending';
                    const msgDeleted = item.message?.is_deleted;

                    return (
                      <View
                        style={[
                          styles.card,
                          {
                            backgroundColor: colors.surface,
                            borderColor: isPending ? '#FF3366' : borderColor,
                          },
                        ]}
                      >
                        {/* Report Header */}
                        <View style={styles.reportHeader}>
                          <View style={styles.reportStatusPill}>
                            <Text
                              style={[
                                styles.reportStatusText,
                                { color: isPending ? '#FF3366' : '#00FFCC' },
                              ]}
                            >
                              {item.status.toUpperCase()}
                            </Text>
                          </View>
                          <Text
                            style={[styles.reportDate, { color: colors.muted }]}
                          >
                            {new Date(item.created_at).toLocaleString()}
                          </Text>
                        </View>

                        {/* Parties */}
                        <Text style={[styles.reportUserRow, { color: colors.text }]}>
                          <Text style={{ fontWeight: '700' }}>Reporter: </Text>
                          @{item.reporter?.username || 'unknown'} (
                          {item.reporter?.display_name || 'Member'})
                        </Text>
                        <Text style={[styles.reportUserRow, { color: '#FF3366' }]}>
                          <Text style={{ fontWeight: '700' }}>Reported: </Text>
                          @{item.reported_user?.username || 'unknown'} (
                          {item.reported_user?.display_name || 'Member'})
                        </Text>

                        {/* Reason */}
                        <View style={styles.reasonBox}>
                          <Text style={[styles.reasonLabel, { color: colors.muted }]}>
                            REASON / CATEGORY:
                          </Text>
                          <Text style={[styles.reasonText, { color: colors.text }]}>
                            {item.reason}
                          </Text>
                        </View>

                        {/* Message Preview Box */}
                        <View
                          style={[
                            styles.messageSnippetBox,
                            {
                              backgroundColor: isDark ? '#050A0E' : '#F4F7F9',
                              borderColor: borderColor,
                            },
                          ]}
                        >
                          <View style={styles.messageTypeRow}>
                            <Text style={styles.messageTypeBadge}>
                              {(item.message?.message_type || 'MESSAGE').toUpperCase()}
                            </Text>
                            {msgDeleted && (
                              <Text style={[styles.deletedBadge, { color: '#FF3366' }]}>
                                [DELETED]
                              </Text>
                            )}
                          </View>
                          <Text
                            style={[
                              styles.messageSnippetText,
                              {
                                color: msgDeleted ? colors.muted : colors.text,
                                fontStyle: msgDeleted ? 'italic' : 'normal',
                              },
                            ]}
                          >
                            {item.message?.content ||
                              (item.message?.media_url
                                ? `[Attached ${item.message.message_type}]`
                                : 'No text content')}
                          </Text>
                        </View>

                        {/* One-tap Action Buttons */}
                        {isPending && (
                          <View style={styles.reportActionsContainer}>
                            <View style={styles.actionBtnGrid}>
                              {!msgDeleted && (
                                <Pressable
                                  style={[styles.smallActionBtn, { borderColor: '#FF3366' }]}
                                  onPress={() => handleDeleteReportedMessage(item.message_id)}
                                >
                                  <Text style={[styles.smallActionBtnText, { color: '#FF3366' }]}>
                                    🗑️ Delete Msg
                                  </Text>
                                </Pressable>
                              )}

                              {item.reported_user && (
                                <>
                                  <Pressable
                                    style={[styles.smallActionBtn, { borderColor: '#9966FF' }]}
                                    onPress={() =>
                                      handleQuickActionReportedUser(item.reported_user!, 'mute')
                                    }
                                  >
                                    <Text style={[styles.smallActionBtnText, { color: '#9966FF' }]}>
                                      🔇 Mute User
                                    </Text>
                                  </Pressable>

                                  <Pressable
                                    style={[styles.smallActionBtn, { borderColor: '#FF6600' }]}
                                    onPress={() =>
                                      handleQuickActionReportedUser(item.reported_user!, 'suspend')
                                    }
                                  >
                                    <Text style={[styles.smallActionBtnText, { color: '#FF6600' }]}>
                                      ⏸️ Suspend
                                    </Text>
                                  </Pressable>

                                  <Pressable
                                    style={[styles.smallActionBtn, { borderColor: '#FF3366' }]}
                                    onPress={() =>
                                      handleQuickActionReportedUser(item.reported_user!, 'terminate')
                                    }
                                  >
                                    <Text style={[styles.smallActionBtnText, { color: '#FF3366' }]}>
                                      🛑 Terminate
                                    </Text>
                                  </Pressable>
                                </>
                              )}

                              <Pressable
                                style={[styles.smallActionBtn, { borderColor: '#00FFCC' }]}
                                onPress={() => handleResolveReport(item.id)}
                              >
                                <Text style={[styles.smallActionBtnText, { color: '#00FFCC' }]}>
                                  ✅ Mark Resolved
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  }}
                />
              )}
            </View>
          )}

          {/* Subview: Password Requests */}
          {reportsSubTab === 'resets' && (
            <View style={styles.innerFlex}>
              {/* Filter Row */}
              <View style={styles.filterRow}>
                <Pressable
                  style={[
                    styles.filterChip,
                    showOnlyPendingResets && styles.filterChipActive,
                    { borderColor: showOnlyPendingResets ? '#00FFCC' : borderColor },
                  ]}
                  onPress={() => setShowOnlyPendingResets(!showOnlyPendingResets)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: showOnlyPendingResets ? '#00FFCC' : colors.muted },
                    ]}
                  >
                    {showOnlyPendingResets ? 'Showing Pending Only' : 'Showing All'}
                  </Text>
                </Pressable>
              </View>

              {filteredResets.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyIcon}>🔑</Text>
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>
                    No Password Requests
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                    No pending password reset requests from users.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={filteredResets}
                  keyExtractor={(item) => item.id}
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={onRefresh}
                      tintColor="#00FFCC"
                    />
                  }
                  contentContainerStyle={styles.listContent}
                  renderItem={({ item }) => {
                    const isPending = item.status === 'pending';

                    return (
                      <View
                        style={[
                          styles.card,
                          {
                            backgroundColor: colors.surface,
                            borderColor: isPending ? '#00FFCC' : borderColor,
                          },
                        ]}
                      >
                        <View style={styles.resetCardHeader}>
                          <View>
                            <Text
                              style={[styles.resetUsername, { color: colors.text }]}
                            >
                              @{item.username}
                            </Text>
                            <Text
                              style={[styles.resetDate, { color: colors.muted }]}
                            >
                              Requested {new Date(item.created_at).toLocaleString()}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.badge,
                              {
                                backgroundColor: isPending
                                  ? 'rgba(0, 255, 204, 0.15)'
                                  : 'rgba(138, 155, 168, 0.15)',
                                borderColor: isPending ? '#00FFCC' : colors.muted,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.badgeText,
                                { color: isPending ? '#00FFCC' : colors.muted },
                              ]}
                            >
                              {item.status.toUpperCase()}
                            </Text>
                          </View>
                        </View>

                        {isPending && (
                          <Pressable
                            style={({ pressed }) => [
                              styles.resetButton,
                              {
                                backgroundColor: '#00FFCC',
                                opacity: pressed ? 0.8 : 1,
                              },
                            ]}
                            onPress={() => {
                              setSelectedResetRequest(item);
                              setNewResetPassword(generateRandomPassword());
                              setResetModalVisible(true);
                            }}
                          >
                            <Text style={styles.resetButtonText}>
                              🔑 Reset Password in 1 Tap
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  }}
                />
              )}
            </View>
          )}
        </View>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  MODALS                                                        */}
      {/* ══════════════════════════════════════════════════════════════ */}

      {/* Mute Modal */}
      <Modal
        visible={muteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMuteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, borderColor: '#9966FF' },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Mute from Chat
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.muted }]}>
              Select mute duration for @{selectedUser?.username}. While muted, they cannot send text, media, or polls.
            </Text>

            <View style={styles.modalOptionsContainer}>
              <Pressable
                style={[styles.modalOptionBtn, { borderColor: '#9966FF' }]}
                onPress={() => handleApplyMute(10)}
                disabled={actionLoading}
              >
                <Text style={[styles.modalOptionText, { color: '#9966FF' }]}>
                  🔇 10 Minutes
                </Text>
              </Pressable>

              <Pressable
                style={[styles.modalOptionBtn, { borderColor: '#9966FF' }]}
                onPress={() => handleApplyMute(60)}
                disabled={actionLoading}
              >
                <Text style={[styles.modalOptionText, { color: '#9966FF' }]}>
                  🔇 1 Hour
                </Text>
              </Pressable>

              <Pressable
                style={[styles.modalOptionBtn, { borderColor: '#9966FF' }]}
                onPress={() => handleApplyMute(1440)}
                disabled={actionLoading}
              >
                <Text style={[styles.modalOptionText, { color: '#9966FF' }]}>
                  🔇 24 Hours
                </Text>
              </Pressable>

              <Pressable
                style={[styles.modalOptionBtn, { borderColor: '#00FFCC' }]}
                onPress={() => handleApplyMute(null)}
                disabled={actionLoading}
              >
                <Text style={[styles.modalOptionText, { color: '#00FFCC' }]}>
                  🔊 Clear Mute (Unmute)
                </Text>
              </Pressable>
            </View>

            <Pressable
              style={styles.modalCancelBtn}
              onPress={() => setMuteModalVisible(false)}
            >
              <Text style={[styles.modalCancelText, { color: colors.muted }]}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Suspend Modal */}
      <Modal
        visible={suspendModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSuspendModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, borderColor: '#FF6600' },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Suspend Account
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.muted }]}>
              Select suspension duration for @{selectedUser?.username}. Suspended accounts are immediately logged out and blocked from logging in.
            </Text>

            <View style={styles.modalOptionsContainer}>
              <Pressable
                style={[styles.modalOptionBtn, { borderColor: '#FF6600' }]}
                onPress={() => handleApplySuspension(1)}
                disabled={actionLoading}
              >
                <Text style={[styles.modalOptionText, { color: '#FF6600' }]}>
                  ⏸️ 1 Hour
                </Text>
              </Pressable>

              <Pressable
                style={[styles.modalOptionBtn, { borderColor: '#FF6600' }]}
                onPress={() => handleApplySuspension(24)}
                disabled={actionLoading}
              >
                <Text style={[styles.modalOptionText, { color: '#FF6600' }]}>
                  ⏸️ 24 Hours (1 Day)
                </Text>
              </Pressable>

              <Pressable
                style={[styles.modalOptionBtn, { borderColor: '#FF6600' }]}
                onPress={() => handleApplySuspension(168)}
                disabled={actionLoading}
              >
                <Text style={[styles.modalOptionText, { color: '#FF6600' }]}>
                  ⏸️ 7 Days
                </Text>
              </Pressable>

              <Pressable
                style={[styles.modalOptionBtn, { borderColor: '#00FFCC' }]}
                onPress={() => handleApplySuspension(null)}
                disabled={actionLoading}
              >
                <Text style={[styles.modalOptionText, { color: '#00FFCC' }]}>
                  ▶️ Lift Suspension (Activate)
                </Text>
              </Pressable>
            </View>

            <Pressable
              style={styles.modalCancelBtn}
              onPress={() => setSuspendModalVisible(false)}
            >
              <Text style={[styles.modalCancelText, { color: colors.muted }]}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Terminate Modal */}
      <Modal
        visible={terminateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTerminateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, borderColor: '#FF3366' },
            ]}
          >
            <Text style={[styles.modalTitle, { color: '#FF3366' }]}>
              🛑 Terminate Account Permanently
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.text, marginTop: 8 }]}>
              Are you sure you want to permanently terminate @{selectedUser?.username}?
            </Text>
            <Text
              style={[
                styles.modalWarningText,
                { color: colors.muted, marginTop: 8 },
              ]}
            >
              This user will be immediately kicked from their active session via Realtime and permanently barred from accessing Gruup Social.
            </Text>

            <View style={styles.modalActionsRow}>
              <Pressable
                style={[styles.confirmBtn, { backgroundColor: '#FF3366' }]}
                onPress={handleApplyTermination}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmBtnText}>
                    Permanently Terminate
                  </Text>
                )}
              </Pressable>

              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setTerminateModalVisible(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.muted }]}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        visible={passwordModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPasswordModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, borderColor: '#00FFCC' },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Change User Password
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.muted }]}>
              Directly set a new password for @{selectedUser?.username}.
            </Text>

            <View style={styles.labelWithHelperRow}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                New Password
              </Text>
              <Pressable
                onPress={() => setChangePasswordValue(generateRandomPassword())}
              >
                <Text style={[styles.helperLink, { color: '#00FFCC' }]}>
                  🎲 Generate Random
                </Text>
              </Pressable>
            </View>

            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: isDark ? '#050A0E' : '#F4F7F9',
                  color: colors.text,
                  borderColor: borderColor,
                },
              ]}
              placeholder="Enter new password"
              placeholderTextColor={colors.muted}
              value={changePasswordValue}
              onChangeText={setChangePasswordValue}
              autoCapitalize="none"
            />

            <View style={styles.modalActionsRow}>
              <Pressable
                style={[styles.confirmBtn, { backgroundColor: '#00FFCC' }]}
                onPress={handleApplyPasswordChange}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#050A0E" />
                ) : (
                  <Text style={[styles.confirmBtnText, { color: '#050A0E' }]}>
                    Save New Password
                  </Text>
                )}
              </Pressable>

              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setPasswordModalVisible(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.muted }]}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 1-Tap Password Reset Modal for Tab 3 */}
      <Modal
        visible={resetModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setResetModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, borderColor: '#00FFCC' },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Reset User Password
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.muted }]}>
              Enter or accept the temporary password for @{selectedResetRequest?.username}. This will resolve the request and update the user's password.
            </Text>

            <View style={styles.labelWithHelperRow}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Temporary Password
              </Text>
              <Pressable
                onPress={() => setNewResetPassword(generateRandomPassword())}
              >
                <Text style={[styles.helperLink, { color: '#00FFCC' }]}>
                  🎲 New Random
                </Text>
              </Pressable>
            </View>

            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: isDark ? '#050A0E' : '#F4F7F9',
                  color: colors.text,
                  borderColor: borderColor,
                },
              ]}
              placeholder="Temporary password"
              placeholderTextColor={colors.muted}
              value={newResetPassword}
              onChangeText={setNewResetPassword}
              autoCapitalize="none"
            />

            <View style={styles.modalActionsRow}>
              <Pressable
                style={[styles.confirmBtn, { backgroundColor: '#00FFCC' }]}
                onPress={handleExecutePasswordReset}
                disabled={resetSubmitting}
              >
                {resetSubmitting ? (
                  <ActivityIndicator color="#050A0E" />
                ) : (
                  <Text style={[styles.confirmBtnText, { color: '#050A0E' }]}>
                    Confirm & Resolve Request
                  </Text>
                )}
              </Pressable>

              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setResetModalVisible(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.muted }]}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  innerFlex: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
  },

  /* Header */
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerShield: {
    fontSize: 28,
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },

  /* Access Denied */
  accessDeniedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  accessDeniedIcon: {
    fontSize: 54,
    marginBottom: 16,
  },
  accessDeniedTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  accessDeniedText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },

  /* Tab Bar */
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomWidth: 3,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  tabBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countPill: {
    backgroundColor: '#FF3366',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 4,
  },
  countPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },

  /* Sub Tab Bar */
  subTabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  subTabPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  subTabPillText: {
    fontSize: 12,
    fontWeight: '700',
  },

  /* Search */
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    height: 44,
  },
  searchIcon: {
    fontSize: 15,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  clearIcon: {
    fontSize: 14,
    padding: 4,
  },

  /* Cards & Lists */
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
  },

  /* User Card */
  userCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00FFCC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarInitial: {
    color: '#050A0E',
    fontSize: 18,
    fontWeight: '800',
  },
  userInfoCol: {
    flex: 1,
    marginRight: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  displayNameText: {
    fontSize: 15,
    fontWeight: '700',
  },
  adminRolePill: {
    backgroundColor: 'rgba(255, 102, 0, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  adminRolePillText: {
    color: '#FF6600',
    fontSize: 9,
    fontWeight: '800',
  },
  usernameText: {
    fontSize: 13,
    marginTop: 2,
  },

  /* Badges */
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusNoticeText: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 8,
  },

  /* Action Buttons Row */
  actionButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },

  /* Form Scroll & Card */
  formScrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  formCard: {
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  formSubtitle: {
    fontSize: 12,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 6,
    marginTop: 12,
    textTransform: 'uppercase',
  },
  labelWithHelperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 6,
  },
  helperLink: {
    fontSize: 12,
    fontWeight: '700',
  },
  textInput: {
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  roleSelectorRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  roleButton: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  roleButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 14,
    textAlign: 'center',
  },
  submitButton: {
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  submitButtonText: {
    color: '#050A0E',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  /* Announcements Tab */
  announcementBanner: {
    flexDirection: 'row',
    margin: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    gap: 10,
  },
  announcementBannerIcon: {
    fontSize: 22,
  },
  announcementBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  postCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  postMetaCol: {
    flex: 1,
    marginRight: 10,
  },
  pinnedBadge: {
    backgroundColor: 'rgba(255, 102, 0, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  pinnedBadgeText: {
    color: '#FF6600',
    fontSize: 10,
    fontWeight: '800',
  },
  postSubject: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
  },
  postAuthor: {
    fontSize: 12,
    marginTop: 4,
  },
  toggleContainer: {
    alignItems: 'center',
    minWidth: 60,
  },
  toggleLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  postSnippet: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },

  /* Reports Tab */
  filterRow: {
    paddingHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterChipActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reportStatusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  reportStatusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  reportDate: {
    fontSize: 11,
  },
  reportUserRow: {
    fontSize: 13,
    marginBottom: 4,
  },
  reasonBox: {
    marginTop: 8,
    marginBottom: 10,
  },
  reasonLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  reasonText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  messageSnippetBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginBottom: 10,
  },
  messageTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  messageTypeBadge: {
    color: '#00FFCC',
    fontSize: 10,
    fontWeight: '800',
  },
  deletedBadge: {
    fontSize: 10,
    fontWeight: '800',
  },
  messageSnippetText: {
    fontSize: 13,
    lineHeight: 18,
  },
  reportActionsContainer: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  actionBtnGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  smallActionBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  smallActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },

  /* Password Resets */
  resetCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resetUsername: {
    fontSize: 16,
    fontWeight: '800',
  },
  resetDate: {
    fontSize: 12,
    marginTop: 2,
  },
  resetButton: {
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  resetButtonText: {
    color: '#050A0E',
    fontSize: 14,
    fontWeight: '800',
  },

  /* Modals */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1.5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 19,
  },
  modalWarningText: {
    fontSize: 12,
    lineHeight: 18,
  },
  modalOptionsContainer: {
    marginTop: 16,
    gap: 10,
  },
  modalOptionBtn: {
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  modalOptionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalCancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalActionsRow: {
    marginTop: 18,
  },
  confirmBtn: {
    height: 46,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});

export default AdminPortalScreen;
