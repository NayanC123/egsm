/**
 * src/constants/rateLimits.ts
 *
 * Sliding-window rate limit and spam protection configuration for Gruup Social Chat.
 * Defines burst & sustained limits, tiered mute durations, duplicate message windows,
 * and media/GIF caps.
 */

export const RATE_LIMIT_CONFIG = {
  rate_limits: {
    burst_window_seconds: 5,
    sustained_window_seconds: 60,
    warning: {
      burst_limit: 5,
      sustained_limit: 12,
      lockout_seconds: 3,
    },
    soft_mute: {
      burst_limit: 8,
      sustained_limit: 18,
      mute_duration_seconds: 30,
    },
    hard_mute: {
      burst_limit: 12,
      sustained_limit: 25,
      mute_duration_seconds: 300,
    },
    duplicate_detection: {
      window_seconds: 10,
      max_identical_allowed: 2,
    },
    media_limits: {
      sustained_window_seconds: 60,
      max_gifs_allowed: 4,
      cooldown_seconds: 45,
    },
  },
} as const;

export const RATE_LIMITS = RATE_LIMIT_CONFIG.rate_limits;

export type RateLimitConfig = typeof RATE_LIMIT_CONFIG;
export type RateLimits = typeof RATE_LIMITS;
