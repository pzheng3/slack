-- ============================================================
-- Slack-Input: Seed Data
-- Run this SQL after schema.sql to populate initial data.
-- ============================================================

-- ----------------------------------------------------------
-- Insert AI Agent users (must match lib/constants.ts)
-- ----------------------------------------------------------
insert into public.users (username, avatar_url, is_agent) values
  ('Slack Agent',                  '/images/Slackbot.png', true),
  ('AI Assistant',                 '/images/Slackbot.png', true)
on conflict (username) do nothing;

-- ----------------------------------------------------------
-- Insert the 3 fixed channels
-- ----------------------------------------------------------
insert into public.conversations (type, name) values
  ('channel', 'general'),
  ('channel', 'marketing'),
  ('channel', 'design')
on conflict do nothing;
