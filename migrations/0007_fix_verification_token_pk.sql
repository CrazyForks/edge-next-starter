-- Migration: Fix verification_tokens table to have proper autoincrement primary key
-- Required for better-auth with useNumberId: true
-- SQLite cannot ALTER columns, so we recreate the table

CREATE TABLE IF NOT EXISTS verification_tokens_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires INT NOT NULL,
  created_at INT DEFAULT (strftime('%s', 'now')),
  updated_at INT DEFAULT (strftime('%s', 'now')),
  UNIQUE(identifier, token)
);

INSERT INTO verification_tokens_new (identifier, token, expires, created_at, updated_at)
SELECT identifier, token, expires, created_at, updated_at FROM verification_tokens;

DROP TABLE verification_tokens;

ALTER TABLE verification_tokens_new RENAME TO verification_tokens;

CREATE INDEX idx_verification_tokens_expires ON verification_tokens(expires);
