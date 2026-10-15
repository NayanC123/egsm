-- =============================================================================
-- Gruup Social — Supabase PostgreSQL Schema
-- Run this in the Supabase SQL Editor to bootstrap the entire data layer.
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. CUSTOM ENUM TYPES
-- =============================================================================

CREATE TYPE user_role       AS ENUM ('admin', 'member');
CREATE TYPE account_status  AS ENUM ('active', 'suspended', 'terminated');
CREATE TYPE message_type    AS ENUM ('text', 'gif', 'photo', 'video', 'voice', 'document', 'poll');
CREATE TYPE report_status   AS ENUM ('pending', 'resolved');
CREATE TYPE reset_status    AS ENUM ('pending', 'resolved');

-- =============================================================================
-- 2. TABLES
-- =============================================================================

-- ----------------------------- profiles -------------------------------------
CREATE TABLE profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username        TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  role            user_role      NOT NULL DEFAULT 'member',
  status          account_status NOT NULL DEFAULT 'active',
  suspended_until TIMESTAMPTZ,
  muted_until     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- ----------------------------- posts ----------------------------------------
CREATE TABLE posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  subject         TEXT        NOT NULL,
  content         TEXT        NOT NULL,
  image_urls      TEXT[],
  document_urls   JSONB,
  is_announcement BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_posts_author    ON posts (author_id);
CREATE INDEX idx_posts_created   ON posts (created_at DESC);

-- ----------------------------- post_ratings ---------------------------------
CREATE TABLE post_ratings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID    NOT NULL REFERENCES posts(id)    ON DELETE RESTRICT,
  rater_id   UUID    NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  score      INTEGER NOT NULL CHECK (score >= 0 AND score <= 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, rater_id)
);

CREATE INDEX idx_ratings_post  ON post_ratings (post_id);
CREATE INDEX idx_ratings_rater ON post_ratings (rater_id);

-- ----------------------------- messages -------------------------------------
CREATE TABLE messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    UUID         NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  content      TEXT,
  message_type message_type NOT NULL DEFAULT 'text',
  media_url    TEXT,
  media_meta   JSONB,
  is_pinned    BOOLEAN      NOT NULL DEFAULT false,
  is_deleted   BOOLEAN      NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_sender  ON messages (sender_id);
CREATE INDEX idx_messages_created ON messages (created_at DESC);

-- ----------------------------- polls ----------------------------------------
CREATE TABLE polls (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID   NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  question   TEXT   NOT NULL,
  options    JSONB  NOT NULL DEFAULT '[]'::jsonb
);

-- ----------------------------- poll_votes -----------------------------------
CREATE TABLE poll_votes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id      UUID    NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  voter_id     UUID    NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  option_index INTEGER NOT NULL CHECK (option_index >= 0),
  UNIQUE (poll_id, voter_id)
);

-- ----------------------------- offense_reports ------------------------------
CREATE TABLE offense_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id       UUID          NOT NULL REFERENCES messages(id) ON DELETE RESTRICT,
  reporter_id      UUID          NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  reported_user_id UUID          NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  reason           TEXT          NOT NULL,
  status           report_status NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ----------------------------- password_reset_requests ----------------------
CREATE TABLE password_reset_requests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username   TEXT         NOT NULL,
  status     reset_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- =============================================================================
-- 3. TRIGGER — Prevent post deletion (posts are permanent)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_prevent_post_deletion()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Posts are permanent and cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_post_deletion
  BEFORE DELETE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION fn_prevent_post_deletion();

-- =============================================================================
-- 4. FUNCTION — Weekly leaderboard
-- =============================================================================

CREATE OR REPLACE FUNCTION get_weekly_leaderboard()
RETURNS TABLE (
  user_id                UUID,
  username               TEXT,
  display_name           TEXT,
  avg_satisfaction_rate   NUMERIC,
  weekly_post_count       BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.author_id                                          AS user_id,
    pr.username                                          AS username,
    pr.display_name                                      AS display_name,
    ROUND((AVG(r.score) / 10.0) * 100, 1)               AS avg_satisfaction_rate,
    COUNT(DISTINCT p.id)                                 AS weekly_post_count
  FROM posts p
  INNER JOIN profiles pr ON pr.id = p.author_id
  LEFT  JOIN post_ratings r ON r.post_id = p.id
  WHERE p.created_at >= now() - INTERVAL '7 days'
  GROUP BY p.author_id, pr.username, pr.display_name
  HAVING COUNT(DISTINCT p.id) >= 1
  ORDER BY avg_satisfaction_rate DESC;
$$;

-- =============================================================================
-- 5. STORAGE BUCKETS
-- =============================================================================

-- Create buckets (Supabase storage API)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('post-attachments', 'post-attachments', true),
  ('chat-media',       'chat-media',       true)
ON CONFLICT (id) DO NOTHING;

-- Policy: public read for post-attachments
CREATE POLICY "Public read post-attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'post-attachments');

-- Policy: authenticated upload for post-attachments
CREATE POLICY "Authenticated upload post-attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'post-attachments'
    AND auth.role() = 'authenticated'
  );

-- Policy: public read for chat-media
CREATE POLICY "Public read chat-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-media');

-- Policy: authenticated upload for chat-media
CREATE POLICY "Authenticated upload chat-media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-media'
    AND auth.role() = 'authenticated'
  );

-- =============================================================================
-- 6. REALTIME — enable live subscriptions
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE posts;
ALTER PUBLICATION supabase_realtime ADD TABLE post_ratings;
ALTER PUBLICATION supabase_realtime ADD TABLE polls;
ALTER PUBLICATION supabase_realtime ADD TABLE poll_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;

-- =============================================================================
-- 7. SEED DATA — Main Admin account
-- =============================================================================

INSERT INTO profiles (username, password_hash, display_name, role, status)
VALUES ('admin', 'admin123', 'Head Admin', 'admin', 'active')
ON CONFLICT (username) DO NOTHING;
