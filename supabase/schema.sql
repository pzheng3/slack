-- ============================================================
-- Slack-Input: Database Schema
-- Run this SQL in the Supabase SQL Editor to set up tables.
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------
-- Users table (humans + AI agents)
-- ----------------------------------------------------------
create table if not exists public.users (
  id         uuid primary key default uuid_generate_v4(),
  username   text unique not null,
  avatar_url text,
  is_agent   boolean not null default false,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------
-- Conversations table (channel / dm / agent)
-- ----------------------------------------------------------
create table if not exists public.conversations (
  id         uuid primary key default uuid_generate_v4(),
  type       text not null check (type in ('channel', 'dm', 'agent')),
  name       text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------
-- Conversation members (join table)
-- ----------------------------------------------------------
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  primary key (conversation_id, user_id)
);

-- ----------------------------------------------------------
-- Messages
-- ----------------------------------------------------------
create table if not exists public.messages (
  id              uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.users(id) on delete cascade,
  content         text not null,
  created_at      timestamptz not null default now()
);

-- Index for fast message queries by conversation
create index if not exists idx_messages_conversation
  on public.messages (conversation_id, created_at);

-- ----------------------------------------------------------
-- Scheduled messages
-- ----------------------------------------------------------
create table if not exists public.scheduled_messages (
  id              uuid primary key default uuid_generate_v4(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.users(id) on delete cascade,
  content         text not null,
  send_at         timestamptz not null,
  status          text not null default 'pending' check (status in ('pending', 'sent', 'cancelled')),
  -- For sends where the conversation doesn't exist yet (e.g. new agent):
  recipient_type  text,  -- 'channel' | 'agent' | 'people' | 'new_agent'
  recipient_id    text,  -- the recipient entity id (for resolving later)
  recipient_label text,  -- display label for the sidebar listing
  created_at      timestamptz not null default now()
);

-- Index for fast queries of pending messages due for sending
create index if not exists idx_scheduled_messages_pending
  on public.scheduled_messages (status, send_at)
  where status = 'pending';

-- Index for fast queries by sender
create index if not exists idx_scheduled_messages_sender
  on public.scheduled_messages (sender_id, status);

-- ----------------------------------------------------------
-- Row Level Security (permissive for now — no auth)
-- ----------------------------------------------------------

-- Users
alter table public.users enable row level security;
create policy "Allow all access to users"
  on public.users for all
  using (true)
  with check (true);

-- Conversations
alter table public.conversations enable row level security;
create policy "Allow all access to conversations"
  on public.conversations for all
  using (true)
  with check (true);

-- Conversation members
alter table public.conversation_members enable row level security;
create policy "Allow all access to conversation_members"
  on public.conversation_members for all
  using (true)
  with check (true);

-- Messages
alter table public.messages enable row level security;
create policy "Allow all access to messages"
  on public.messages for all
  using (true)
  with check (true);

-- Scheduled messages
alter table public.scheduled_messages enable row level security;
create policy "Allow all access to scheduled_messages"
  on public.scheduled_messages for all
  using (true)
  with check (true);

-- ----------------------------------------------------------
-- Enable Realtime on tables used by live subscriptions
-- ----------------------------------------------------------
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.users;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.conversation_members;
alter publication supabase_realtime add table public.scheduled_messages;
