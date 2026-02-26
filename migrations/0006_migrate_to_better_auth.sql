-- Migration: 0006_migrate_to_better_auth
-- Description: Migrate from NextAuth to better-auth schema
-- Created: 2026-02-26
--
-- better-auth requires additional columns on accounts, sessions,
-- and a restructured verification table. We keep backward compatibility
-- by adding columns rather than dropping/recreating tables.
--
-- NOTE: SQLite ALTER TABLE ADD COLUMN does not allow non-constant defaults,
-- so we use DEFAULT 0 and then UPDATE to set actual timestamps.

-- ============================================================
-- 1. accounts table: Add better-auth required columns
-- ============================================================

-- Password column for credential-based accounts (better-auth stores password here, not in users)
ALTER TABLE accounts ADD COLUMN password TEXT;

-- Timestamps (constant default required by SQLite)
ALTER TABLE accounts ADD COLUMN created_at INTEGER DEFAULT 0;
ALTER TABLE accounts ADD COLUMN updated_at INTEGER DEFAULT 0;

-- ============================================================
-- 2. sessions table: Add better-auth required columns
-- ============================================================

-- better-auth uses 'token' as unique session identifier (maps to our 'session_token')
-- We keep session_token and add new columns that better-auth needs

ALTER TABLE sessions ADD COLUMN ip_address TEXT;
ALTER TABLE sessions ADD COLUMN user_agent TEXT;
ALTER TABLE sessions ADD COLUMN created_at INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN updated_at INTEGER DEFAULT 0;

-- ============================================================
-- 3. verification_tokens table: Add better-auth required columns
-- ============================================================

-- better-auth expects an id column, and renames some fields
-- We add the columns better-auth needs while keeping existing ones

ALTER TABLE verification_tokens ADD COLUMN id TEXT;
ALTER TABLE verification_tokens ADD COLUMN created_at INTEGER DEFAULT 0;
ALTER TABLE verification_tokens ADD COLUMN updated_at INTEGER DEFAULT 0;

-- ============================================================
-- 4. Backfill timestamps with current epoch for existing rows
-- ============================================================

UPDATE accounts SET created_at = strftime('%s', 'now'), updated_at = strftime('%s', 'now') WHERE created_at = 0;
UPDATE sessions SET created_at = strftime('%s', 'now'), updated_at = strftime('%s', 'now') WHERE created_at = 0;
UPDATE verification_tokens SET created_at = strftime('%s', 'now'), updated_at = strftime('%s', 'now') WHERE created_at = 0;

-- ============================================================
-- 5. Migrate password data: users.password → accounts.password
-- Create credential account entries for users with passwords
-- ============================================================

-- For each user with a password, create a 'credential' account entry
-- This migrates password storage from users table to accounts table
-- as better-auth expects passwords in the accounts table
INSERT INTO accounts (user_id, type, provider, provider_account_id, password, created_at, updated_at)
SELECT id, 'credential', 'credential', email, password, created_at, updated_at
FROM users
WHERE password IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM accounts a
    WHERE a.user_id = users.id AND a.provider = 'credential'
  );

-- ============================================================
-- 6. Add performance indexes for new columns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_accounts_provider ON accounts(provider);
