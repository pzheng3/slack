# Slack Input

A feature-rich Slack clone with AI agents

## Features

### Channels & Direct Messages

- **Public channels** — create, join, and delete channels. Messages are visible to all participants.
- **Direct messages** — 1-on-1 conversations with any user, including a self-DM for notes.
- **Real-time updates** — messages, channels, and user presence update instantly via Supabase Realtime subscriptions.
- **New message dialog** — command-palette-style composer (Cmd+N) to pick recipients (channels, people, or agents) and start typing immediately.
- **Unread tracking** — badge counts on sidebar items update in real time.

### Rich Text Composer

- **TipTap editor** with formatting toolbar: bold, italic, strikethrough, links, ordered & bullet lists, inline code, and code blocks.
- **Inline link dialog** — enter a URL and apply it to selected text without leaving the editor.
- **Emoji picker** — browse and insert emoji via a popover (emoji-mart).
- **Attachments menu** — canvas, list, file upload, text snippet, and workflow placeholders.
- **Send with Enter** — press Enter to send, Shift+Enter for a newline.

### @Mentions & #Channel References

- **Trigger with `@`** — opens a tabbed suggestion popup (Recent, Agent, People, Channel, App) with relevance-scored filtering.
- **Trigger with `#`** — opens a channel-specific suggestion popup for quick channel linking.
- **Clickable mention chips** — clicking a mention navigates to the corresponding channel, DM, or agent session.
- **Entity auto-linking** — AI responses automatically convert entity names (bold or plain text) into clickable mention chips.

### Slash Commands

- **Trigger with `/`** — opens a categorized command menu with tabs (Recent, Commands, Skills, Apps).
- **12 built-in commands** — `/summarize`, `/brainstorm`, `/draft`, `/explain`, `/feedback`, `/followup`, `/pros-cons`, `/recap`, `/standup`, `/tone`, `/translate`, `/action-items`.
- **Keyboard navigation** — arrow keys, Enter, Cmd+1..9 shortcuts, and Escape to dismiss.

### Agent Skills

8 modular AI skills following the [agentskills.io](https://agentskills.io) spec: Code Reviewer, Data Analyst, Decision Framework, Meeting Facilitator, Onboarding Buddy, Project Planner, Web Research, and Writing Coach. Each skill includes a `SKILL.md` definition with references and assets loaded on-demand for context-rich AI prompts.

### AI Agent Conversations

- **Character agents** — chat with AI personas (Elon Musk, Steve Jobs) that maintain distinct personalities and conversation styles.
- **Generic agent sessions** — create custom AI sessions with descriptive names for project-specific assistance.
- **Streaming responses** — AI replies stream in real time via SSE with a typing indicator.
- **Agent tool use** — the AI can execute workspace actions (send messages, create/delete channels, read history, manage sessions) with inline status indicators showing progress and results.
- **Web search** — agents perform live web searches with source citations rendered as inline favicon chips.
- **Auto-reply in channels** — @mention an agent in any channel and it automatically generates a contextual reply.
- **Auto-generated session titles** — new agent sessions are named with a concise AI-generated summary.

### Message Display

- **Compact grouping** — consecutive messages from the same sender within 5 minutes are grouped, hiding repeated avatars and names.
- **Markdown rendering** — AI responses render with full Markdown support (GFM tables, lists, code blocks) via react-markdown.
- **Source citations** — web search results appear as clickable favicon badges linking to their sources.
- **Smart scrolling** — auto-scrolls on new messages; during AI streaming, scrolling follows until the user's prompt scrolls out of view.

### Sidebar & Navigation

- **Resizable sidebar** — drag the edge to resize; mobile-friendly overlay with hamburger toggle.
- **Collapsible sections** — Agents, Channels, Direct Messages, and Apps sections collapse independently.
- **Active route highlighting** — the current conversation is visually highlighted.
- **Inline channel/session management** — create and delete channels and agent sessions directly from the sidebar.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org) (App Router) |
| Database & Realtime | [Supabase](https://supabase.com) (PostgreSQL + Realtime) |
| Rich Text Editor | [TipTap](https://tiptap.dev) (StarterKit, Link, Mention, Placeholder, custom SlashCommand extension) |
| AI | [OpenAI](https://openai.com) Responses API (GPT-4o-mini, web search, function calling) |
| UI Components | [Radix UI](https://www.radix-ui.com) + [shadcn/ui](https://ui.shadcn.com) |
| Styling | [Tailwind CSS 4](https://tailwindcss.com) |
| Command Palette | [cmdk](https://cmdk.paco.me) |
| Emoji | [emoji-mart](https://github.com/missive/emoji-mart) |
| Icons | [Lucide React](https://lucide.dev) + custom SVG icon set |

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)
- An [OpenAI](https://platform.openai.com) API key

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

Run `supabase/schema.sql` in your Supabase SQL Editor to create tables and enable Realtime. Optionally run `supabase/seed.sql` to populate sample data.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be prompted to pick a username, then dropped into `#general`.

## Database Schema

Four core tables with Supabase Realtime enabled:

| Table | Description |
|-------|-------------|
| `users` | Human users and AI agents (`is_agent` flag) |
| `conversations` | Channels (`channel`), DMs (`dm`), and agent chats (`agent`) |
| `conversation_members` | Join table linking users to conversations |
| `messages` | Chat messages with sender reference and timestamps |

## License

This project is for educational and demonstration purposes.
