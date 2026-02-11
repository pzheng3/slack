# Slack Input

A Slack clone with AI agents, built with Next.js, Supabase, TipTap, and OpenAI.

## Features

- **Channels & DMs** — real-time messaging with Supabase Realtime
- **Rich text editor** — TipTap with formatting toolbar, emoji picker, and inline links
- **@Mentions** — suggestions for people, channels, and agents with click-to-navigate chips
- **Slash commands** — 12 built-in commands (`/summarize`, `/brainstorm`, `/draft`, etc.)
- **Agent skills** — 8 modular AI skills (Code Reviewer, Data Analyst, Writing Coach, etc.) following the [agentskills.io](https://agentskills.io) spec
- **AI conversations** — streaming chat with character agents (e.g., Elon Musk, Steve Jobs), web search with inline citations, and auto-reply when @mentioned in channels
- **Unread tracking** — badge counts on sidebar items
- **New message dialog** — Cmd+N to pick recipients and start composing

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Database & Realtime | Supabase (PostgreSQL + Realtime) |
| Rich Text | TipTap |
| AI | OpenAI Responses API (GPT-4o-mini, web search) |
| UI | Radix UI + shadcn/ui + Tailwind CSS 4 |

## Getting Started

### Prerequisites

- Node.js 18+
- [Supabase](https://supabase.com) project
- [OpenAI](https://platform.openai.com) API key

### Setup

```bash
git clone <repo-url>
cd slack-input
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
```

Run `supabase/schema.sql` in your Supabase SQL Editor, then optionally `supabase/seed.sql` for sample data.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be prompted to pick a username, then dropped into `#general`.

## License

This project is for educational and demonstration purposes.
