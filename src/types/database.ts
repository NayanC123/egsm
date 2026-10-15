/**
 * src/types/database.ts
 *
 * Complete TypeScript interfaces for the Gruup Social app's
 * Supabase-backed data layer.
 */

/* ------------------------------------------------------------------ */
/*  Enums                                                              */
/* ------------------------------------------------------------------ */

/** Role a user can hold in the system. */
export type UserRole = 'member' | 'admin';

/** Account lifecycle status. */
export type AccountStatus = 'active' | 'suspended' | 'terminated';

/** Current mute state for group-chat participation. */
export type MuteStatus = 'none' | 'warning' | 'soft_mute' | 'hard_mute';

/** Resolution status of an offense report. */
export type OffenseReportStatus = 'pending' | 'resolved' | 'dismissed';

/** Status of a password-reset request. */
export type PasswordResetStatus = 'pending' | 'completed' | 'rejected';

/** Type of attachment on a chat message. */
export type AttachmentType =
  | 'image'
  | 'video'
  | 'gif'
  | 'voice'
  | 'document';

/* ------------------------------------------------------------------ */
/*  Core Entities                                                      */
/* ------------------------------------------------------------------ */

/** A registered user profile (maps to `profiles` table). */
export interface UserProfile {
  id: string;                    // uuid  – Supabase auth.users FK
  username: string;              // unique, set by admin
  display_name: string;          // editable by the user
  role: UserRole;
  status: AccountStatus;
  mute_status: MuteStatus;
  suspended_until: string | null; // ISO-8601 timestamp or null
  muted_until?: string | null;    // ISO-8601 timestamp or null
  created_at: string;            // ISO-8601 timestamp
  updated_at: string;            // ISO-8601 timestamp
}

/** Document attachment metadata for a post. */
export interface PostAttachmentDoc {
  name: string;
  url: string;
  size?: number;
  mimeType?: string;
}

/** A post in the community feed (maps to `posts` table). */
export interface Post {
  id: string;                    // uuid
  author_id: string;             // FK → profiles.id
  subject: string;
  content: string;
  is_announcement: boolean;      // pinned + #FF6600 when true
  image_urls?: string[] | null;  // Storage-bucket URLs for images
  document_urls?: PostAttachmentDoc[] | null; // Storage-bucket documents
  attachments?: string[];        // Backwards-compatible alias
  satisfaction_rate?: number;    // computed: (AVG(score)/10)*100
  ratings_count?: number;        // total number of ratings received
  created_at: string;            // ISO-8601
}

/** A post with joined author profile and computed rating info. */
export interface PostWithAuthor extends Post {
  author?: {
    username: string;
    display_name: string;
  };
  average_score?: number | null;
  satisfaction_rate?: number;
  ratings_count?: number;
}

/** An entry returned by get_weekly_leaderboard(). */
export interface LeaderboardEntry {
  user_id: string;
  username: string;
  display_name: string;
  avg_satisfaction_rate: number;
  weekly_post_count: number;
}

/** A 0–10 rating on a post (maps to `post_ratings` table). */
export interface PostRating {
  id: string;                    // uuid
  post_id: string;               // FK → posts.id
  rater_id: string;              // FK → profiles.id
  score: number;                 // integer 0–10
  created_at: string;            // ISO-8601
}

/** A post rating joined with rater profile information. */
export interface PostRatingWithRater extends PostRating {
  profiles?: {
    username: string;
    display_name: string;
  } | null;
}

export type MessageType =
  | 'text'
  | 'gif'
  | 'photo'
  | 'video'
  | 'voice'
  | 'document'
  | 'poll';

export interface ChatMediaMeta {
  name?: string;
  size?: number;
  mimeType?: string;
  duration?: number;
  width?: number;
  height?: number;
}

/** A message in the group chat (maps to `messages` table). */
export interface ChatMessage {
  id: string;                    // uuid
  sender_id: string;             // FK → profiles.id
  content: string | null;        // plain text / hyperlinks
  message_type: MessageType;     // 'text' | 'gif' | 'photo' | 'video' | 'voice' | 'document' | 'poll'
  media_url?: string | null;     // Storage-bucket URL or GIF URL
  media_meta?: ChatMediaMeta | null;
  is_pinned: boolean;
  is_deleted: boolean;
  created_at: string;            // ISO-8601
  // Backwards compatibility aliases
  attachment_url?: string | null;
  attachment_type?: AttachmentType | null;
  gif_url?: string | null;
  poll_id?: string | null;
}

/** A single option inside a Poll. */
export interface PollOption {
  id?: string;                    // optional uuid
  label: string;
  text?: string;
  voter_ids?: string[];           // array of profile ids who voted
}

/** A poll vote (maps to `poll_votes` table). */
export interface PollVote {
  id: string;                    // uuid
  poll_id: string;               // FK → polls.id
  voter_id: string;              // FK → profiles.id
  option_index: number;          // 0-based index of option chosen
}

/** A poll attached to a chat message (maps to `polls` table). */
export interface Poll {
  id: string;                    // uuid
  message_id: string;            // FK → messages.id
  question: string;
  options: string[] | PollOption[];
  creator_id?: string;
  is_closed?: boolean;
  created_at?: string;
}

/** Poll aggregated with votes and calculation metadata. */
export interface PollWithVotes extends Poll {
  votes: PollVote[];
  userVoteIndex: number | null;
  totalVotes: number;
  optionCounts: number[];
}

/** A chat message joined with sender profile and associated poll. */
export interface ChatMessageWithSender extends ChatMessage {
  sender?: {
    id: string;
    username: string;
    display_name: string;
    role: UserRole;
  } | null;
  poll?: PollWithVotes | null;
}

/** An offense report submitted by a user about a chat message. */
export interface OffenseReport {
  id: string;                    // uuid
  reporter_id: string;           // FK → profiles.id
  message_id: string;            // FK → messages.id
  reported_user_id: string;      // FK → profiles.id
  reason: string;
  status: OffenseReportStatus;
  resolved_by?: string | null;   // FK → profiles.id (admin who resolved)
  resolved_at?: string | null;   // ISO-8601
  created_at: string;            // ISO-8601
}

/** A password-reset request for admin handling. */
export interface PasswordResetRequest {
  id: string;                    // uuid
  user_id: string;               // FK → profiles.id
  status: PasswordResetStatus;
  handled_by: string | null;     // FK → profiles.id (admin)
  created_at: string;            // ISO-8601
  updated_at: string;            // ISO-8601
}
