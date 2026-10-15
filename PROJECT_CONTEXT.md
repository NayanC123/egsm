# PROJECT_CONTEXT.md — Antigravity Single Source of Truth Log

## 1. Environment & Native Compilation Rules (MANDATORY)
- **Framework**: React Native (Expo SDK + TypeScript) targeting Native Android (`.apk`/`.aab`) and iOS (`.ipa`).
- **Backend**: Supabase (PostgreSQL, Realtime WebSockets, Storage Buckets).
- **STRICT NATIVE RULE**: NEVER use HTML/DOM elements (`div`, `span`, `p`, `button`, `input`, `img`, `a`), CSS files, or `window.localStorage`. Strictly use React Native primitives (`View`, `Text`, `TextInput`, `Pressable`, `FlatList`, `ScrollView`, `Image`, `Modal`, `StyleSheet`, `SafeAreaView`).
- **Package Rule**: Always install dependencies in the terminal using `npx expo install <pkg>` so versions match the target Android/iOS Expo SDK.
- **Self-Verification Rule**: After completing any code changes, ALWAYS run `npx tsc --noEmit` in the terminal and fix all TypeScript/JSX errors before finishing the task.

## 2. Theme & Brand Palette
- **Dark Mode (Default)**: Main `#050A0E` | Card Surface `#0D161E` | Text `#FFFFFF` | Muted `#8A9BA8`
- **Light Mode**: Main `#F4F7F9` | Card Surface `#FFFFFF` | Text `#050A0E` | Muted `#5A6B78`
- **Primary Neon**: `#00FFCC`
- **Accent / Pinned Announcements**: `#FF6600`
- **Danger / Error**: `#FF3366`

## 3. Core App Specification
1. **Pre-Login**:
   - Username + Password login ONLY.
   - NO public account creation / sign-up anywhere.
   - "Forgot Password" submits a reset request for Admins to handle.
   - Terminated (`status = 'terminated'`) and Suspended (`status = 'suspended'` with `suspended_until > now()`) accounts are blocked at login and kicked out live if status changes.
2. **Post-Login Navigation**:
   - Bottom Tab Selector: `Chat` | `Posts` | `Account Settings` | `Admin` (shown ONLY when `user.role === 'admin'`).
3. **Posts & Live Leaderboard**:
   - Posts ONCE MADE CANNOT BE DELETED (enforced in UI and PostgreSQL trigger).
   - Viewers see Poster + Subject list, with Announcements (`is_announcement = true`) pinned at the top in `#FF6600`.
   - Post Detail shows Subject, Poster, Content, attachments, clickable `0–10` rating buttons, ratings given by others, and Satisfaction Rate (`(AVG(score) / 10) * 100%`).
   - Posters click `(+ New)` at the bottom -> type Subject/Text, attach photos (Camera button) or docs (Paperclip button), and click `(Post)`.
   - Leaderboard (`Leaderboard` button at top of Posts list) shows `Rank` and `Average Satisfaction Rate (%)`. Users MUST have `>= 1` post in the rolling last 7 days or they are automatically excluded from the leaderboard. Includes `( <- Back to Main Menu)` button at the bottom.
4. **Group Chat & Spam Limitation**:
   - Features: Text with clickable hyperlinks, message deletion, Giphy GIFs, photos/videos, polls, voice messages, message pinning, offense reporting to admins, and documents (PDF/Audio).
   - Enforces the exact sliding-window JSON rate limits (5s burst / 60s sustained, Warning, Soft Mute, Hard Mute, Duplicate Detection, Media/GIF Cap).
5. **Account Settings**:
   - Read-only Username (set by Admins), Change Display Name, Change Password, Dark/Light Mode toggle, Log Out.
6. **Administration Portal**:
   - Main Admin account seeded directly in DB at setup.
   - Admins can: Create accounts, Terminate accounts (permanently), Suspend accounts (temporarily), Mute members from chat, Mark posts as Announcements (`#FF6600` + pinned at top), Reset user passwords, and Resolve reported chat offenses.

## 4. Active File Tree & Exports

```
egsm/
├── .env.example                          # Required env vars template
├── app.json                              # Expo native config (Android pkg, iOS bundle ID, permissions, plugins)
├── App.tsx                               # Root component → ThemeProvider → AuthProvider → LoginScreen / AppNavigator
├── index.ts                              # Expo entry point (registerRootComponent)
├── package.json                          # Dependencies & scripts
├── tsconfig.json                         # Extends expo/tsconfig.base, strict: true
├── PROJECT_CONTEXT.md                    # This file
├── assets/                               # Expo default icons & splash
│   ├── icon.png
│   ├── favicon.png
│   ├── android-icon-foreground.png
│   ├── android-icon-background.png
│   └── android-icon-monochrome.png
├── supabase/
│   └── schema.sql                        # Complete PostgreSQL schema, triggers, functions, storage, seed data
└── src/
    ├── components/
    │   └── Chat/
    │       ├── GiphyModal.tsx                # Giphy REST API GIF search/trending picker modal with fallbacks
    │       ├── VoiceMessagePlayer.tsx        # Inline expo-av sound player with scrubber & duration timer
    │       ├── PollCard.tsx                  # Interactive poll card with percentage bars & one-tap voting
    │       ├── CreatePollModal.tsx           # Multi-option poll composer modal
    │       ├── ReportOffenseModal.tsx        # Report offense modal inserting into offense_reports
    │       ├── MessageContextMenu.tsx        # Long-press sheet: Pin/Unpin, Delete message, Report offense
    │       └── PinnedMessagesBar.tsx         # Sticky collapsible header bar showing pinned chat messages
    ├── constants/
    │   └── rateLimits.ts                 # Sliding-window rate limit, tiers, duplicate window & media cap config
    ├── context/
    │   └── AuthContext.tsx               # AuthProvider, useAuth (custom profiles auth, realtime status, secure session)
    ├── hooks/
    │   └── useSpamLimiter.ts             # Spam limitation engine: sliding-window limits, countdown banners, tiers 1-3, media cooldowns
    ├── services/
    │   ├── supabase.ts                   # Supabase client init (expo-secure-store adapter, URL polyfill)
    │   └── storage.ts                    # Supabase Storage helpers (uploadPostAttachment, uploadChatMedia)
    ├── theme/
    │   └── ThemeContext.tsx               # ThemeProvider, useTheme, ThemeColors, ThemeMode, Theme
    ├── types/
    │   └── database.ts                   # UserProfile, Post, PostRating, PostWithAuthor, PostAttachmentDoc,
    │                                     #   LeaderboardEntry, ChatMessage, MessageType, ChatMediaMeta,
    │                                     #   Poll, PollOption, PollVote, PollWithVotes, ChatMessageWithSender,
    │                                     #   OffenseReport, PasswordResetRequest
    │                                     #   Type aliases: UserRole, AccountStatus, MuteStatus,
    │                                     #   OffenseReportStatus, PasswordResetStatus, AttachmentType
    ├── navigation/
    │   └── AppNavigator.tsx              # MainTabParamList, AppNavigator (bottom tabs)
    └── screens/
        ├── Auth/
        │   └── LoginScreen.tsx           # Pre-login auth screen (no signup, forgot-password modal)
        ├── Posts/
        │   ├── PostsListScreen.tsx       # Posts feed with pinned announcements, ratings, modal launchers
        │   ├── CreatePostScreen.tsx      # Permanent post creation, camera/gallery/doc pickers, warning banner
        │   ├── PostDetailScreen.tsx      # Full post view, images, docs (expo-linking), audio (expo-av), 0-10 rating, member ratings list
        │   └── LeaderboardScreen.tsx     # Live weekly leaderboard, 7-day rule, realtime rankings, #00FFCC progress bars, Back to Menu
        ├── Chat/
        │   └── GroupChatScreen.tsx       # Realtime group chat: hyperlinks, media, voice notes, documents, polls, pinning, deletion, reporting
        ├── Settings/
        │   └── AccountSettingsScreen.tsx # Account Settings (read-only username, display name, password, theme toggle, logout)
        ├── AccountSettingsScreen.tsx      # Backwards-compatible re-export from Settings/AccountSettingsScreen
        ├── ChatScreen.tsx                # Chat tab entry point — renders Chat/GroupChatScreen
        ├── PostsScreen.tsx               # Posts tab shell rendering Posts/PostsListScreen
        └── AdminScreen.tsx               # Placeholder — Admin tab (conditional)
```

### Key Exports by File

| File | Exports |
|------|---------|
| `src/constants/rateLimits.ts` | `RATE_LIMIT_CONFIG`, `RATE_LIMITS` (constants), `RateLimitConfig`, `RateLimits` (types) |
| `src/hooks/useSpamLimiter.ts` | `useSpamLimiter` (default & named hook), `formatMuteDuration` (function), `UseSpamLimiterReturn`, `SpamValidateResult`, `UseSpamLimiterOptions` (interfaces) |
| `src/context/AuthContext.tsx` | `AuthProvider` (component), `useAuth` (hook) |
| `src/services/supabase.ts` | `supabase` (SupabaseClient instance) |
| `src/services/storage.ts` | `uploadPostAttachment`, `uploadChatMedia` (async helper functions), `UploadedAttachment` (interface) |
| `src/theme/ThemeContext.tsx` | `ThemeColors` (interface), `ThemeMode` (type), `Theme` (interface), `ThemeProvider` (component), `useTheme` (hook) |
| `src/types/database.ts` | `UserRole`, `AccountStatus`, `MuteStatus`, `OffenseReportStatus`, `PasswordResetStatus`, `AttachmentType`, `MessageType` (type aliases); `UserProfile`, `Post`, `PostWithAuthor`, `PostAttachmentDoc`, `LeaderboardEntry`, `PostRating`, `ChatMessage`, `ChatMediaMeta`, `Poll`, `PollOption`, `PollVote`, `PollWithVotes`, `ChatMessageWithSender`, `OffenseReport`, `PasswordResetRequest` (interfaces) |
| `src/navigation/AppNavigator.tsx` | `MainTabParamList` (type), `AppNavigator` (component, props: `{ userRole: UserRole }`) |
| `src/components/Chat/GiphyModal.tsx` | `GiphyModal` (component, default & named export) |
| `src/components/Chat/VoiceMessagePlayer.tsx` | `VoiceMessagePlayer` (component, default & named export) |
| `src/components/Chat/PollCard.tsx` | `PollCard` (component, default & named export) |
| `src/components/Chat/CreatePollModal.tsx` | `CreatePollModal` (component, default & named export) |
| `src/components/Chat/ReportOffenseModal.tsx` | `ReportOffenseModal` (component, default & named export) |
| `src/components/Chat/MessageContextMenu.tsx` | `MessageContextMenu` (component, default & named export) |
| `src/components/Chat/PinnedMessagesBar.tsx` | `PinnedMessagesBar` (component, default & named export) |
| `src/screens/Auth/LoginScreen.tsx` | `LoginScreen` (default export) |
| `src/screens/Posts/PostsListScreen.tsx` | `PostsListScreen` (default export) |
| `src/screens/Posts/CreatePostScreen.tsx` | `CreatePostScreen` (default export) |
| `src/screens/Posts/PostDetailScreen.tsx` | `PostDetailScreen` (named and default export) |
| `src/screens/Posts/LeaderboardScreen.tsx` | `LeaderboardScreen` (named and default export) |
| `src/screens/Chat/GroupChatScreen.tsx` | `GroupChatScreen` (named and default export) |
| `src/screens/Settings/AccountSettingsScreen.tsx` | `AccountSettingsScreen` (default export) |
| `src/screens/*.tsx` | `ChatScreen`, `PostsScreen`, `AccountSettingsScreen`, `AdminScreen` (default exports) |

## 5. Supabase Schema & Buckets Reference

### Tables

| Table | Columns | Notes |
|-------|---------|-------|
| `profiles` | `id` (UUID PK), `username` (TEXT UNIQUE NOT NULL), `password_hash` (TEXT NOT NULL), `display_name` (TEXT NOT NULL), `role` (user_role: `admin` \| `member`), `status` (account_status: `active` \| `suspended` \| `terminated`), `suspended_until` (TIMESTAMPTZ), `muted_until` (TIMESTAMPTZ), `created_at` (TIMESTAMPTZ DEFAULT now()) | Seeded with admin account (`admin`/`admin123`/`Head Admin`) |
| `posts` | `id` (UUID PK), `author_id` (UUID FK → profiles.id), `subject` (TEXT NOT NULL), `content` (TEXT NOT NULL), `image_urls` (TEXT[]), `document_urls` (JSONB), `is_announcement` (BOOLEAN DEFAULT false), `created_at` (TIMESTAMPTZ DEFAULT now()) | `trg_prevent_post_deletion` blocks all DELETEs |
| `post_ratings` | `id` (UUID PK), `post_id` (UUID FK → posts.id), `rater_id` (UUID FK → profiles.id), `score` (INT CHECK 0–10), `created_at` (TIMESTAMPTZ DEFAULT now()), UNIQUE(post_id, rater_id) | One rating per user per post |
| `messages` | `id` (UUID PK), `sender_id` (UUID FK → profiles.id), `content` (TEXT), `message_type` (message_type: `text` \| `gif` \| `photo` \| `video` \| `voice` \| `document` \| `poll`), `media_url` (TEXT), `media_meta` (JSONB), `is_pinned` (BOOLEAN DEFAULT false), `is_deleted` (BOOLEAN DEFAULT false), `created_at` (TIMESTAMPTZ DEFAULT now()) | Group chat messages |
| `polls` | `id` (UUID PK), `message_id` (UUID FK → messages.id ON DELETE CASCADE), `question` (TEXT NOT NULL), `options` (JSONB DEFAULT '[]') | Linked to a chat message |
| `poll_votes` | `id` (UUID PK), `poll_id` (UUID FK → polls.id ON DELETE CASCADE), `voter_id` (UUID FK → profiles.id), `option_index` (INT CHECK >= 0), UNIQUE(poll_id, voter_id) | One vote per user per poll |
| `offense_reports` | `id` (UUID PK), `message_id` (UUID FK → messages.id), `reporter_id` (UUID FK → profiles.id), `reported_user_id` (UUID FK → profiles.id), `reason` (TEXT NOT NULL), `status` (report_status: `pending` \| `resolved`), `created_at` (TIMESTAMPTZ DEFAULT now()) | Admin reviews in Admin tab |
| `password_reset_requests` | `id` (UUID PK), `username` (TEXT NOT NULL), `status` (reset_status: `pending` \| `resolved`), `created_at` (TIMESTAMPTZ DEFAULT now()) | Created from "Forgot Password" flow |

### Triggers

| Trigger | Table | Type | Effect |
|---------|-------|------|--------|
| `trg_prevent_post_deletion` | `posts` | BEFORE DELETE FOR EACH ROW | RAISES EXCEPTION `'Posts are permanent and cannot be deleted'` |

### Database Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `get_weekly_leaderboard()` | TABLE(`user_id`, `username`, `display_name`, `avg_satisfaction_rate`, `weekly_post_count`) | Computes `ROUND((AVG(score) / 10.0) * 100, 1)` and post count for users with ≥ 1 post in the last 7 days, ordered by satisfaction DESC |

### Storage Buckets

| Bucket | Public Read | Authenticated Upload |
|--------|-------------|---------------------|
| `post-attachments` | ✅ | ✅ |
| `chat-media` | ✅ | ✅ |

### Realtime Subscriptions

Tables added to `supabase_realtime` publication: `messages`, `posts`, `post_ratings`, `polls`, `poll_votes`, `profiles`.

### Environment Variables (`.env.example`)

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `EXPO_PUBLIC_GIPHY_API_KEY` | Giphy SDK API key for GIF search |

## 6. Phase Completion & Handoff Log
- **[Init]**: `PROJECT_CONTEXT.md` created. Ready for Phase 1.
- **[Phase 1 — Complete]**: Native mobile scaffold, theme engine & navigation shell.
  - Expo TypeScript project initialised (SDK 57, React 19, RN 0.86).
  - `app.json` configured: `android.package` = `com.gruup.social`, `ios.bundleIdentifier` = `com.gruup.social`, Android permissions (`CAMERA`, `RECORD_AUDIO`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `INTERNET`), iOS `infoPlist` usage descriptions, plugins for `expo-secure-store`, `expo-image-picker`, `expo-document-picker`, `expo-av`.
  - `ThemeContext.tsx`: Dark (default) & Light palettes with `expo-secure-store` persistence.
  - `database.ts`: 8 interfaces + 6 type aliases covering all app entities.
  - `AppNavigator.tsx`: Bottom tab bar with 4 tabs (Admin conditionally visible via `userRole` prop).
  - **`npx tsc --noEmit` → 0 errors ✅**
- **[Phase 2 — Complete]**: Supabase schema, client initialisation & environment config.
  - `supabase/schema.sql`: 8 tables (`profiles`, `posts`, `post_ratings`, `messages`, `polls`, `poll_votes`, `offense_reports`, `password_reset_requests`), custom enums, indexes, `trg_prevent_post_deletion` trigger, `get_weekly_leaderboard()` function, 2 storage buckets with RLS policies, realtime publication, admin seed data.
  - `src/services/supabase.ts`: Singleton client with `expo-secure-store` adapter and `react-native-url-polyfill`.
  - `.env.example`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_GIPHY_API_KEY`.
  - Dependencies added: `@supabase/supabase-js`, `react-native-url-polyfill`.
  - **`npx tsc --noEmit` → 0 errors ✅**
- **[Phase 3 — Complete]**: Pre-Login Auth, Suspension/Termination Enforcement & Account Settings.
  - `src/context/AuthContext.tsx`: Authenticates directly against `profiles` table using username and password_hash. Checks account status on login and establishes live Supabase Realtime subscription on the user's `profiles` row (`id=eq.${userId}`). Immediately forces logout and displays alert on `terminated` status, and blocks login / forces logout displaying exact expiration date/time on active `suspended` status. Persists user session via `expo-secure-store`.
  - `src/screens/Auth/LoginScreen.tsx`: Clean, high-contrast mobile UI with palette `#050A0E`, `#00FFCC`, `#FF6600`. Username + Password login with loading states. Strict rule enforced: zero "Sign Up" or "Create Account" options, with subtitle "Accounts are provisioned exclusively by Administrators." "Forgot Password?" button opens native Modal to submit requests into `password_reset_requests` table notifying admins.
  - `src/screens/Settings/AccountSettingsScreen.tsx`: Displays read-only `Username` with lock indicator (🔒 "Set by Administrators"). Allows updating `Display Name` (`profiles.display_name`) with instant context refresh. Allows updating `Password` requiring current password verification before updating `profiles.password_hash`. Includes Dark Mode / Light Mode toggle switch wired to `ThemeContext`, and high-contrast styled `Log Out` button (`#FF6600`).
  - `App.tsx`: Wired `AuthProvider` at root, rendering loading indicator while hydrating session, `LoginScreen` for unauthenticated state, and `AppNavigator` with user role once authenticated.
  - `AppNavigator.tsx`: Connected Account Settings tab directly to `src/screens/Settings/AccountSettingsScreen.tsx`.
  - **`npx tsc --noEmit` → 0 errors ✅**
- **[Phase 4 — Complete]**: Posts Feed, Pinned Announcements & Permanent Post Creation.
  - `src/services/storage.ts`: `uploadPostAttachment` uploads binary files (photos, audio, documents, PDFs) from local file URIs to the Supabase Storage `post-attachments` bucket and generates public URLs.
  - `src/screens/Posts/PostsListScreen.tsx`: Complete community feed screen.
    - Header bar with `Leaderboard` button (`#00FFCC`) opening the Weekly Leaderboard modal.
    - Fetches posts joined with author `display_name` and `username`, plus average rating score and satisfaction rate (`%`).
    - Sort order: All posts with `is_announcement = true` are pinned at the top of the `FlatList`, styled with `#FF6600` (Accent Orange) card border, `📢 PINNED ANNOUNCEMENT` badge, and orange background tint. Regular posts follow in reverse chronological order.
    - Each post card displays author display name (`@username`), subject, announcement badge, satisfaction rate (%), post content, media thumbnails (images and document chips), and interactive 0–10 rating selector with live Supabase upsert.
    - Floating / bottom-docked `(+ New)` button (`#00FFCC` background, `#050A0E` bold text) that opens `CreatePostScreen`.
    - Integrated Weekly Leaderboard modal calling `get_weekly_leaderboard()` RPC, displaying ranks, post counts, and satisfaction %, with `( <- Back to Main Menu )` close button.
    - Realtime subscriptions to `posts` and `post_ratings` tables.
    - Strictly zero delete buttons anywhere for posts (enforcing permanent posts).
  - `src/screens/Posts/CreatePostScreen.tsx`: Permanent post creation screen.
    - Text inputs for `Post Subject` and multiline `Post Content`.
    - Camera / Gallery button using `expo-image-picker` to take photos or choose from photo library and upload to `post-attachments`.
    - Paperclip button using `expo-document-picker` to attach PDFs, audio files, or documents and upload to `post-attachments`.
    - Preview thumbnails with remove buttons for pre-publish draft management.
    - Admin-only toggle: "Mark as Pinned Announcement" (`#FF6600`).
    - Mandatory high-contrast warning banner: "Note: Posts are permanent and cannot be deleted once published."
    - `(Post)` button (`#00FFCC` background, `#050A0E` bold text) inserting post into `posts` table and returning to the feed.
    - Strictly zero delete buttons.
  - `src/screens/PostsScreen.tsx`: Connected to render `Posts/PostsListScreen`.
  - **`npx tsc --noEmit` → 0 errors ✅**
- **[Phase 5 — Complete]**: Post Detail 0–10 Rating View & Live Weekly Leaderboard.
  - `src/screens/Posts/PostDetailScreen.tsx`:
    - Opens when any post in `PostsListScreen` is tapped.
    - Displays full `Post Subject`, `Poster Display Name (@username)`, formatted timestamp (full & relative), and full `Post Content`.
    - Scrollable image attachments with tap-to-expand fullscreen image preview modal.
    - Clickable document chips opening PDFs/docs via `expo-linking` (`Linking.openURL`).
    - Inline audio player component powered by `expo-av` (`Audio.Sound`) with Play/Pause button, position/duration tracker (`mm:ss`), dynamic progress bar, and external open link.
    - Interactive 0–10 Rating Section:
      - 11 distinct clickable number buttons (`0`, `1`, `2`, `3`, `4`, `5`, `6`, `7`, `8`, `9`, `10`) in a responsive wrap row.
      - Tapping a score upserts into `post_ratings` (`onConflict: 'post_id,rater_id'`) and immediately highlights user's rating in `#00FFCC` with bold `#050A0E` text.
      - Live **Satisfaction Rate** display card (`(Average Score / 10) * 100%`) with meter bar.
      - Scrollable community ratings list showing all member ratings: `Display Name: X/10` with avatar, `@username`, and timestamp.
      - Supabase Realtime subscription on `post_ratings` (`post_id=eq.${postId}`).
      - Strictly zero delete buttons anywhere.
  - `src/screens/Posts/LeaderboardScreen.tsx`:
    - Opens when the top `Leaderboard` button is tapped on `PostsListScreen`.
    - Mandatory top banner notice: "Minimum 1 post in the last 7 days required to stay on the Leaderboard."
    - Calls `get_leaderboard()` RPC (with fallback to `get_weekly_leaderboard()` and client query).
    - Subscribes to live Supabase Realtime changes on both `posts` and `post_ratings` tables for instant ranking refreshes.
    - Strictly excludes any user who has not published at least 1 post in the rolling last 7 days.
    - Displays each qualifying user's `Rank (#1, #2, ...)`, `Display Name (@username)`, `Posts This Week`, and `Average Satisfaction Rate (%)` with `#00FFCC` progress bars.
    - Fixed `( <- Back to Main Menu )` button at bottom returning to the Posts feed.
  - `src/screens/Posts/PostsListScreen.tsx`:
    - Connected post card tap and `⭐ Rate Post (0–10)` button to launch `PostDetailScreen`.
    - Connected top `Leaderboard` button to launch `LeaderboardScreen`.
  - **`npx tsc --noEmit` → 0 errors ✅**
- **[Phase 6 — Complete]**: Realtime Group Chat & Rich Media Capabilities.
  - `src/services/storage.ts`: Added `uploadChatMedia` helper to upload photos, videos, voice recordings (`.m4a`), and documents (`.pdf`, audio, files) directly to the public `chat-media` bucket.
  - `src/types/database.ts`: Enriched `ChatMessage`, `MessageType` (`'text' | 'gif' | 'photo' | 'video' | 'voice' | 'document' | 'poll'`), `ChatMediaMeta`, `Poll`, `PollOption`, `PollVote`, `PollWithVotes`, `ChatMessageWithSender`, and `OffenseReport`.
  - `src/components/Chat/GiphyModal.tsx`: Native modal fetching trending and searched GIFs from the Giphy REST API (`https://api.giphy.com/v1/gifs/search` with `EXPO_PUBLIC_GIPHY_API_KEY`) via standard `fetch()`, including search debounce, query clear, and curated fallback GIFs for test reliability.
  - `src/components/Chat/VoiceMessagePlayer.tsx`: Audio player for voice messages in chat bubbles using `expo-av` `Audio.Sound` with play/pause button, dynamic scrubber progress track, time display (`mm:ss`), and clean resource unloading.
  - `src/components/Chat/PollCard.tsx`: Interactive poll card showing question, percentage bars, vote counts, active voter checkmark, and one-tap voting with Supabase upsert on `poll_votes`.
  - `src/components/Chat/CreatePollModal.tsx`: Poll composition modal with question input and dynamic options list (2 to 6 options), validation, and creation of `poll` message and `polls` record.
  - `src/components/Chat/ReportOffenseModal.tsx`: Offense reporting modal with reported message snippet, category chips (Harassment, Spam, Hate Speech, etc.), details input, inserting into `offense_reports`.
  - `src/components/Chat/MessageContextMenu.tsx`: Bottom sheet context menu on long-press with Pin/Unpin, Delete Message (sender or admin; sets `is_deleted = true`), and Report Offense actions.
  - `src/components/Chat/PinnedMessagesBar.tsx`: Sticky collapsible header bar showing pinned chat messages with pin icon (`#FF6600`), badge count, collapsed snippet, expand/collapse chevron, and quick unpin button.
  - `src/screens/Chat/GroupChatScreen.tsx`: Complete group chat room.
    - Supabase Realtime WebSocket subscription on `messages`, `polls`, and `poll_votes`.
    - Collapsible sticky `PinnedMessagesBar` at the top.
    - Inverted `FlatList` with `KeyboardAvoidingView` for natural bottom-up chat scrolling.
    - Automatic URL parsing inside text messages, styled in underlined `#00FFCC`, opening with `Linking.openURL()`.
    - Inline photos with tap-to-expand fullscreen image preview modal.
    - Inline videos with `expo-av` `Video` component and native player controls.
    - Animated GIFs via Giphy integration.
    - Voice notes recorded via `Audio.Recording` with live timer, cancel/send controls, and uploaded to `chat-media`.
    - Document attachment picker via `expo-document-picker` rendering file cards with name, size, and open link.
    - Sliding-window rate limit burst detection (5 msgs in 5s) and duplicate spam protection.
    - Account mute & suspension check disabling inputs and showing alert banner.
    - Long-press context menu on all message bubbles.
  - `src/screens/ChatScreen.tsx`: Wired to render `GroupChatScreen`.
  - **`npx tsc --noEmit` → 0 errors ✅**
- **[Phase 7 — Complete]**: Chat Spam Limitation Engine.
  - `src/constants/rateLimits.ts`: Sliding-window rate limit configuration (burst 5s, sustained 60s, Warning lockout 3s, Soft Mute 30s, Hard Mute 300s, Duplicate Detection 10s max 2, Media Limits 60s max 4 with 45s cooldown).
  - `src/hooks/useSpamLimiter.ts`: Complete sliding-window rate limit and spam protection hook.
    - Server/Admin Mute Check: Live countdown banner "You are muted for Xm Ys" with second-by-second countdown, blocking all sends and media.
    - Duplicate Detection: Sliding 10-second history of trimmed lowercase strings, blocking 3rd identical message and raising alert.
    - Media / GIF Cap: Tracks media/GIFs within rolling 60s; upon exceeding 4 items, locks media/GIF attachment buttons for 45s with live cooldown badge.
    - Tier 3 — Hard Mute: 12 in 5s OR 25 in 60s -> locks chat input for 300s AND updates `profiles.muted_until = now() + 300s` in Supabase to prevent bypass across app restarts.
    - Tier 2 — Soft Mute: 8 in 5s OR 18 in 60s -> locks chat composer for 30s with live second-by-second countdown timer.
    - Tier 1 — Warning: 5 in 5s OR 12 in 60s -> locks Send button for 3s and displays `#FF6600` warning toast ("Slow down! Sending messages too fast.").
  - `src/screens/Chat/GroupChatScreen.tsx`: Fully wired against `useSpamLimiter` before sending text, photos/videos, documents, voice notes, GIFs, and polls. Displays live banners, toasts, and cooldown badges.
  - **`npx tsc --noEmit` → 0 errors ✅**