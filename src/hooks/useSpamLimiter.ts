/**
 * src/hooks/useSpamLimiter.ts
 *
 * Spam limitation engine and sliding-window rate limiter for Gruup Social Group Chat.
 *
 * Implements:
 *  - Server / Admin Mute Check with live countdown banner: "You are muted for Xm Ys"
 *  - Duplicate Detection: rolling 10s window, max 2 identical messages allowed
 *  - Media / GIF Cap: rolling 60s window, max 4 items, 45s cooldown with live badge
 *  - Tier 3 Hard Mute: 12 in 5s OR 25 in 60s -> 300s input lock + Supabase profiles.muted_until update
 *  - Tier 2 Soft Mute: 8 in 5s OR 18 in 60s -> 30s composer lock with live second-by-second timer
 *  - Tier 1 Warning: 5 in 5s OR 12 in 60s -> 3s send button lockout + #FF6600 toast
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import { RATE_LIMITS } from '../constants/rateLimits';
import { supabase } from '../services/supabase';
import type { UserProfile, MessageType } from '../types/database';

export interface UseSpamLimiterOptions {
  userProfile?: UserProfile | null;
  onHardMuteTriggered?: (mutedUntilIso: string) => void;
}

export interface SpamValidateResult {
  allowed: boolean;
  reason?:
    | 'server_mute'
    | 'hard_mute'
    | 'soft_mute'
    | 'warning'
    | 'duplicate'
    | 'media_cooldown';
  message?: string;
}

export interface UseSpamLimiterReturn {
  // Status flags
  isMuted: boolean;
  isServerMuted: boolean;
  isHardMuted: boolean;
  isSoftMuted: boolean;
  isWarningLocked: boolean;
  isMediaCooldownActive: boolean;
  isComposerLocked: boolean;
  isSendButtonLocked: boolean;

  // Remaining seconds
  serverMuteRemainingSeconds: number;
  softMuteRemainingSeconds: number;
  warningRemainingSeconds: number;
  mediaCooldownRemainingSeconds: number;

  // Formatted display strings
  serverMuteCountdownText: string;
  formatDuration: (seconds: number) => string;

  // Warning toast state
  isWarningToastVisible: boolean;
  warningToastMessage: string;
  dismissWarningToast: () => void;

  // Core Actions
  validateBeforeSend: (
    content?: string,
    messageType?: MessageType,
  ) => SpamValidateResult;
  recordMessageSent: (payload: {
    content?: string | null;
    message_type: MessageType;
  }) => Promise<void>;
  resetCooldowns: () => void;
}

/** Formats total seconds into "Xm Ys" (e.g. "4m 58s" or "0m 25s"). */
export function formatMuteDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safeSeconds / 60);
  const s = safeSeconds % 60;
  return `${m}m ${s}s`;
}

export function useSpamLimiter({
  userProfile,
  onHardMuteTriggered,
}: UseSpamLimiterOptions = {}): UseSpamLimiterReturn {
  // Clock state to trigger re-renders every 1s during active locks
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // Local lockout expiry timestamps (epoch ms)
  const [hardMuteExpiry, setHardMuteExpiry] = useState<number | null>(null);
  const [softMuteExpiry, setSoftMuteExpiry] = useState<number | null>(null);
  const [warningExpiry, setWarningExpiry] = useState<number | null>(null);
  const [mediaCooldownExpiry, setMediaCooldownExpiry] = useState<number | null>(
    null,
  );

  // Warning toast state
  const [isWarningToastVisible, setIsWarningToastVisible] =
    useState<boolean>(false);
  const warningToastMessage = 'Slow down! Sending messages too fast.';

  // Sliding window memory refs
  const messageTimestamps = useRef<number[]>([]);
  const sentTexts = useRef<{ text: string; timestamp: number }[]>([]);
  const mediaTimestamps = useRef<number[]>([]);

  /* ------------------------------------------------------------------ */
  /*  Live 1-Second Countdown Ticker                                     */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    const serverMuteActive = userProfile?.muted_until
      ? new Date(userProfile.muted_until).getTime() > Date.now()
      : false;
    const hardMuteActive =
      hardMuteExpiry !== null && hardMuteExpiry > Date.now();
    const softMuteActive =
      softMuteExpiry !== null && softMuteExpiry > Date.now();
    const warningActive = warningExpiry !== null && warningExpiry > Date.now();
    const mediaActive =
      mediaCooldownExpiry !== null && mediaCooldownExpiry > Date.now();

    if (
      !serverMuteActive &&
      !hardMuteActive &&
      !softMuteActive &&
      !warningActive &&
      !mediaActive
    ) {
      return;
    }

    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [
    userProfile?.muted_until,
    hardMuteExpiry,
    softMuteExpiry,
    warningExpiry,
    mediaCooldownExpiry,
  ]);

  /* ------------------------------------------------------------------ */
  /*  Computed Lock & Mute States                                        */
  /* ------------------------------------------------------------------ */

  const serverMuteDate = userProfile?.muted_until
    ? new Date(userProfile.muted_until).getTime()
    : 0;
  const isServerMuted = serverMuteDate > currentTime;

  const localHardMuteActive =
    hardMuteExpiry !== null && hardMuteExpiry > currentTime;
  const isHardMuted = localHardMuteActive || isServerMuted;

  const effectiveMuteExpiry = Math.max(serverMuteDate, hardMuteExpiry ?? 0);
  const serverMuteRemainingSeconds = Math.max(
    0,
    Math.ceil((effectiveMuteExpiry - currentTime) / 1000),
  );

  const serverMuteCountdownText = `You are muted for ${formatMuteDuration(
    serverMuteRemainingSeconds,
  )}`;

  const isSoftMuted = softMuteExpiry !== null && softMuteExpiry > currentTime;
  const softMuteRemainingSeconds = isSoftMuted
    ? Math.max(0, Math.ceil(((softMuteExpiry ?? 0) - currentTime) / 1000))
    : 0;

  const isWarningLocked =
    warningExpiry !== null && warningExpiry > currentTime;
  const warningRemainingSeconds = isWarningLocked
    ? Math.max(0, Math.ceil(((warningExpiry ?? 0) - currentTime) / 1000))
    : 0;

  const isMediaCooldownActive =
    mediaCooldownExpiry !== null && mediaCooldownExpiry > currentTime;
  const mediaCooldownRemainingSeconds = isMediaCooldownActive
    ? Math.max(
        0,
        Math.ceil(((mediaCooldownExpiry ?? 0) - currentTime) / 1000),
      )
    : 0;

  const isMuted = isHardMuted || isServerMuted;
  const isComposerLocked = isMuted || isSoftMuted;
  const isSendButtonLocked = isComposerLocked || isWarningLocked;

  // Sync warning toast visibility with warningExpiry
  useEffect(() => {
    if (warningExpiry && warningExpiry > currentTime) {
      setIsWarningToastVisible(true);
    } else if (isWarningToastVisible) {
      setIsWarningToastVisible(false);
    }
  }, [currentTime, warningExpiry, isWarningToastVisible]);

  const dismissWarningToast = useCallback(() => {
    setIsWarningToastVisible(false);
  }, []);

  const resetCooldowns = useCallback(() => {
    setHardMuteExpiry(null);
    setSoftMuteExpiry(null);
    setWarningExpiry(null);
    setMediaCooldownExpiry(null);
    setIsWarningToastVisible(false);
    messageTimestamps.current = [];
    sentTexts.current = [];
    mediaTimestamps.current = [];
  }, []);

  /* ------------------------------------------------------------------ */
  /*  Validate Before Send                                               */
  /* ------------------------------------------------------------------ */

  const validateBeforeSend = useCallback(
    (
      content?: string,
      messageType: MessageType = 'text',
    ): SpamValidateResult => {
      const now = Date.now();

      // 1. Server / Hard Mute Check
      const serverTime = userProfile?.muted_until
        ? new Date(userProfile.muted_until).getTime()
        : 0;
      const hardTime = hardMuteExpiry ?? 0;
      const targetMute = Math.max(serverTime, hardTime);

      if (targetMute > now) {
        const remainingSec = Math.max(0, Math.ceil((targetMute - now) / 1000));
        const formatted = formatMuteDuration(remainingSec);
        Alert.alert(
          'Muted from Chat',
          `You are muted for ${formatted}. You cannot send messages or media.`,
        );
        return {
          allowed: false,
          reason: 'hard_mute',
          message: `You are muted for ${formatted}`,
        };
      }

      // 2. Soft Mute Check
      if (softMuteExpiry !== null && softMuteExpiry > now) {
        const remainingSec = Math.max(
          0,
          Math.ceil((softMuteExpiry - now) / 1000),
        );
        Alert.alert(
          'Chat Temporarily Locked',
          `Soft mute is active. Please wait ${remainingSec}s before sending again.`,
        );
        return {
          allowed: false,
          reason: 'soft_mute',
          message: `Chat locked for ${remainingSec}s`,
        };
      }

      // 3. Warning Lockout Check (Tier 1: 3 seconds)
      if (warningExpiry !== null && warningExpiry > now) {
        setIsWarningToastVisible(true);
        return {
          allowed: false,
          reason: 'warning',
          message: warningToastMessage,
        };
      }

      // 4. Media / GIF Cap Check (45s cooldown)
      const isMedia = messageType !== 'text' && messageType !== 'poll';
      if (isMedia && mediaCooldownExpiry !== null && mediaCooldownExpiry > now) {
        const remainingSec = Math.max(
          0,
          Math.ceil((mediaCooldownExpiry - now) / 1000),
        );
        Alert.alert(
          'Media Cooldown Active',
          `You have reached the media limit (max 4 per minute). Please wait ${remainingSec}s before sending more media or GIFs.`,
        );
        return {
          allowed: false,
          reason: 'media_cooldown',
          message: `Media cooldown: ${remainingSec}s remaining`,
        };
      }

      // 5. Duplicate Detection Check
      const clean = (content || '').trim().toLowerCase();
      if (clean.length > 0) {
        const duplicateWindowMs =
          RATE_LIMITS.duplicate_detection.window_seconds * 1000;
        const cutoff = now - duplicateWindowMs;

        const duplicatesInWindow = sentTexts.current.filter(
          (item) => item.timestamp >= cutoff && item.text === clean,
        );

        if (
          duplicatesInWindow.length >=
          RATE_LIMITS.duplicate_detection.max_identical_allowed
        ) {
          Alert.alert(
            'Duplicate Message Warning',
            `You cannot send more than ${RATE_LIMITS.duplicate_detection.max_identical_allowed} identical messages within ${RATE_LIMITS.duplicate_detection.window_seconds} seconds.`,
          );
          return {
            allowed: false,
            reason: 'duplicate',
            message: 'Duplicate message limit reached.',
          };
        }
      }

      return { allowed: true };
    },
    [
      userProfile?.muted_until,
      hardMuteExpiry,
      softMuteExpiry,
      warningExpiry,
      mediaCooldownExpiry,
    ],
  );

  /* ------------------------------------------------------------------ */
  /*  Record Message Sent & Trigger Rate Limit Tiers                     */
  /* ------------------------------------------------------------------ */

  const recordMessageSent = useCallback(
    async (payload: {
      content?: string | null;
      message_type: MessageType;
    }) => {
      const now = Date.now();

      // 1. Record message timestamp
      messageTimestamps.current.push(now);

      // 2. Record duplicate detection string (trimmed, lowercase)
      const clean = (payload.content || '').trim().toLowerCase();
      if (clean.length > 0) {
        sentTexts.current.push({ text: clean, timestamp: now });
        const duplicateWindowMs =
          RATE_LIMITS.duplicate_detection.window_seconds * 1000;
        const cutoff = now - duplicateWindowMs;
        sentTexts.current = sentTexts.current.filter(
          (item) => item.timestamp >= cutoff,
        );
      }

      // 3. Media / GIF tracking (max 4 per 60s -> 45s cooldown)
      const isMedia =
        payload.message_type !== 'text' && payload.message_type !== 'poll';
      if (isMedia) {
        mediaTimestamps.current.push(now);
        const mediaWindowMs =
          RATE_LIMITS.media_limits.sustained_window_seconds * 1000;
        mediaTimestamps.current = mediaTimestamps.current.filter(
          (t) => now - t <= mediaWindowMs,
        );

        if (
          mediaTimestamps.current.length >=
          RATE_LIMITS.media_limits.max_gifs_allowed
        ) {
          const cdExpiry =
            now + RATE_LIMITS.media_limits.cooldown_seconds * 1000;
          setMediaCooldownExpiry(cdExpiry);
        }
      }

      // 4. Rate Limits Sliding Window Pruning
      const sustainedWindowMs = RATE_LIMITS.sustained_window_seconds * 1000;
      messageTimestamps.current = messageTimestamps.current.filter(
        (t) => now - t <= sustainedWindowMs,
      );

      const burstWindowMs = RATE_LIMITS.burst_window_seconds * 1000;
      const burstCount = messageTimestamps.current.filter(
        (t) => now - t <= burstWindowMs,
      ).length;
      const sustainedCount = messageTimestamps.current.length;

      // Tier 3 — Hard Mute: 12 in 5s OR 25 in 60s
      if (
        burstCount >= RATE_LIMITS.hard_mute.burst_limit ||
        sustainedCount >= RATE_LIMITS.hard_mute.sustained_limit
      ) {
        const muteDurationMs =
          RATE_LIMITS.hard_mute.mute_duration_seconds * 1000;
        const expiry = now + muteDurationMs;
        setHardMuteExpiry(expiry);

        const mutedUntilIso = new Date(expiry).toISOString();
        if (userProfile?.id) {
          try {
            await supabase
              .from('profiles')
              .update({ muted_until: mutedUntilIso })
              .eq('id', userProfile.id);
          } catch (err: any) {
            console.warn(
              'SpamLimiter: Failed to persist muted_until to Supabase:',
              err?.message,
            );
          }
        }

        if (onHardMuteTriggered) {
          onHardMuteTriggered(mutedUntilIso);
        }

        Alert.alert(
          'Muted from Chat (Hard Mute)',
          `Excessive message rate detected (${burstCount} in 5s or ${sustainedCount} in 60s). You are muted for 5 minutes.`,
        );
        return;
      }

      // Tier 2 — Soft Mute: 8 in 5s OR 18 in 60s
      if (
        burstCount >= RATE_LIMITS.soft_mute.burst_limit ||
        sustainedCount >= RATE_LIMITS.soft_mute.sustained_limit
      ) {
        const muteDurationMs =
          RATE_LIMITS.soft_mute.mute_duration_seconds * 1000;
        setSoftMuteExpiry(now + muteDurationMs);
        return;
      }

      // Tier 1 — Warning: 5 in 5s OR 12 in 60s
      if (
        burstCount >= RATE_LIMITS.warning.burst_limit ||
        sustainedCount >= RATE_LIMITS.warning.sustained_limit
      ) {
        const lockoutMs = RATE_LIMITS.warning.lockout_seconds * 1000;
        setWarningExpiry(now + lockoutMs);
        setIsWarningToastVisible(true);
        return;
      }
    },
    [userProfile?.id, onHardMuteTriggered],
  );

  return {
    isMuted,
    isServerMuted,
    isHardMuted,
    isSoftMuted,
    isWarningLocked,
    isMediaCooldownActive,
    isComposerLocked,
    isSendButtonLocked,
    serverMuteRemainingSeconds,
    softMuteRemainingSeconds,
    warningRemainingSeconds,
    mediaCooldownRemainingSeconds,
    serverMuteCountdownText,
    formatDuration: formatMuteDuration,
    isWarningToastVisible,
    warningToastMessage,
    dismissWarningToast,
    validateBeforeSend,
    recordMessageSent,
    resetCooldowns,
  };
}

export default useSpamLimiter;
