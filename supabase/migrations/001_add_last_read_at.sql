-- Migration: Add last_read_at to conversation_members
-- This column stores the timestamp of the last message the user has read
-- in each conversation, enabling cross-device read/unread sync.

alter table public.conversation_members
  add column if not exists last_read_at timestamptz;
