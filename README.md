# Slack Input

A feature-rich Slack clone built with **Next.js**, **Supabase**, **TipTap**, and **OpenAI**. This project replicates the core Slack experience — channels, direct messages, rich-text composition, @mentions, slash commands — and extends it with AI-powered agent conversations and skill-based workflows.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![Supabase](https://img.shields.io/badge/Supabase-Realtime-3ECF8E?logo=supabase)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o--mini-412991?logo=openai)
![TipTap](https://img.shields.io/badge/TipTap-Rich_Text-6C47FF)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)

---

## Key Features

### Channels & Direct Messages

- **Public channels** — create, join, and delete channels. Messages are visible to all participants.
- **Direct messages** — 1-on-1 conversations with any user, including a self-DM for notes.
- **Real-time updates** — messages, channels, and user presence update instantly via Supabase Realtime subscriptions.
- **New message dialog** — a command-palette-style composer (Cmd+N) to pick recipients (channels, people, or agents) and start typing immediately.

### Rich Text Message Composer

- **TipTap-powered editor** with full formatting toolbar: **bold**, *italic*, ~~strikethrough~~, links, ordered & bullet lists, `inline code`, and code blocks.
- **Inline link dialog** — enter a URL and apply it to selected text without leaving the editor.
- **Emoji picker** — browse and insert emoji via a popover, powered by `emoji-mart`.
- **Attachments menu** — canvas, list, file upload, text snippet, and workflow placeholders.
- **Send with Enter** — press Enter to send, Shift+Enter for a newline.

### @Mentions

- **Trigger with `@`** — opens a suggestion popup with tabbed categories: Recent, Agent, People, Channel, App.
- **Relevance scoring** — prefix matches rank higher than substring matches for fast filtering.
- **Clickable mention chips** — clicking a mention navigates to the corresponding channel, DM, or agent session.
- **Real-time participant data** — mention suggestions update live as users join or leave.

### Slash Commands & Agent Skills

- **Trigger with `/`** — opens a categorized command menu with tabs: Recent, Commands, Skills, Apps.
- **12 built-in commands** — `/summarize`, `/brainstorm`, `/draft`, `/explain`, `/feedback`, `/followup`, `/pros-cons`, `/recap`, `/standup`, `/tone`, `/translate`, `/action-items`.
- **Agent Skills** (following the [agentskills.io](https://agentskills.io) spec) — modular AI capabilities including Code Reviewer, Data Analyst, Decision Framework, Meeting Facilitator, Onboarding Buddy, Project Planner, Web Research, and Writing Coach.
- **Progressive disclosure** — skill resources (references, scripts, assets) are loaded on-demand for context-rich AI prompts.
- **Keyboard navigation** — arrow keys, Enter, Cmd+1..9 shortcuts, and Escape to dismiss.

### AI Agent Conversations

- **Character agents** — chat with AI personas (e.g., Elon Musk, Steve Jobs) that maintain distinct personalities and conversation styles.
- **Generic agent sessions** — create custom AI sessions with descriptive names for project-specific assistance.
- **Streaming responses** — AI replies are streamed in real time via SSE for a natural typing experience.
- **Web search** — agents can perform live web searches using OpenAI's `web_search_preview` tool, with source citations rendered inline as favicon chips.
- **Auto-reply in channels** — @mention an agent in any channel and it will automatically generate a contextual reply.
- **Cross-entity context** — reference other channels, DMs, or agents inside your message (e.g., `@general /summarize`) to pull in their conversation history as context for the AI.
- **Auto-generated session titles** — new agent sessions are automatically named with a concise AI-generated summary.

### Message Display

- **Compact grouping** — consecutive messages from the same sender within 5 minutes are grouped, hiding repeated avatars and names.
- **Markdown rendering** — non-HTML messages render with full Markdown support (GFM tables, lists, code blocks) via `react-markdown`.
- **Typing indicator** — animated three-dot indicator while an AI response is streaming.
- **Source citations** — web search results appear as clickable favicon badges linking to their sources.
- **Smart scrolling** — auto-scrolls on new messages; during AI streaming, scrolling follows until the user's prompt scrolls out of view.

### Sidebar & Navigation

- **Resizable sidebar** — drag the edge to resize between 260–360px; mobile-friendly overlay with hamburger toggle.
- **Collapsible sections** — Agents, Channels, Direct Messages, and Apps sections each collapse independently.
- **Active route highlighting** — the current conversation is visually highlighted.
- **AI character agents in DM list** — AI personas appear in the Direct Messages section for quick access.
- **Apps placeholder** — Cursor, Notion, and Figma listed as future integrations.

### Authentication & User Setup

- **Username modal** — first-time visitors are prompted to pick a username and avatar before entering the workspace.
- **User provider context** — current user state is available throughout the app via React context.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [Next.js 16](https://nextjs.org) (App Router) |
| **Database & Realtime** | [Supabase](https://supabase.com) (PostgreSQL + Realtime subscriptions) |
| **Rich Text Editor** | [TipTap](https://tiptap.dev) (StarterKit, Link, Mention, Placeholder, custom SlashCommand extension) |
| **AI** | [OpenAI](https://openai.com) Responses API (GPT-4o-mini, web search) |
| **UI Components** | [Radix UI](https://www.radix-ui.com) primitives, [shadcn/ui](https://ui.shadcn.com) |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com) |
| **Command Palette** | [cmdk](https://cmdk.paco.me) |
| **Emoji** | [emoji-mart](https://github.com/missive/emoji-mart) |
| **Icons** | [Lucide React](https://lucide.dev) + custom SVG icon set |
| **Fonts** | Lato (UI) + Geist Mono (code) |

---

## Project Structure

```
slack-input/
├── app/
│   ├── api/                    # API routes
│   │   ├── agent-chat/         # Streaming AI chat endpoint
│   │   ├── agent-reply/        # Auto-reply for @mentioned agents
│   │   ├── skill-resources/    # On-demand skill resource loader
│   │   ├── slash-commands/     # Slash command & skill registry
│   │   └── summarize-title/    # AI session title generator
│   ├── chat/
│   │   ├── agent/              # Agent chat pages (character + session)
│   │   ├── channel/            # Channel pages
│   │   ├── dm/                 # Direct message pages
│   │   └── layout.tsx          # Chat layout (sidebar + topbar)
│   ├── globals.css             # Global styles
│   └── layout.tsx              # Root layout with providers
├── components/
│   ├── chat/                   # Message composer, list, mentions, commands
│   ├── sidebar/                # Sidebar with channels, DMs, agents
│   ├── providers/              # Supabase & User context providers
│   ├── ui/                     # Reusable UI primitives (shadcn/ui)
│   ├── TopBar.tsx              # Top navigation bar
│   └── UsernameModal.tsx       # First-time user setup
├── content/
│   ├── commands/               # Built-in slash command definitions (.md)
│   └── skills/                 # Agent Skills with SKILL.md + resources
├── lib/
│   ├── hooks/                  # React hooks (messages, channels, agents, etc.)
│   ├── supabase/               # Supabase client, server, and seed utilities
│   ├── slash-command-*.ts      # Slash command TipTap extension & utilities
│   ├── mention-suggestion.ts   # Mention suggestion configuration
│   └── types.ts                # TypeScript type definitions
├── public/                     # Static assets (icons, images)
├── supabase/
│   ├── schema.sql              # Database schema
│   └── seed.sql                # Seed data
└── package.json
```

---

## Getting Started

### Prerequisites

- **Node.js** 18+ and **npm**
- A [Supabase](https://supabase.com) project (free tier works)
- An [OpenAI](https://platform.openai.com) API key

### 1. Clone the repository

```bash
git clone <repo-url>
cd slack-input
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
```

### 4. Set up the database

Run the SQL files in your Supabase SQL Editor:

1. Execute `supabase/schema.sql` to create tables and enable Realtime.
2. Optionally run `supabase/seed.sql` to populate sample data.

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. You'll be prompted to create a username, then redirected to the `#general` channel.

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server |
| `npm run build` | Build for production |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |

---

## Database Schema

The app uses four core tables with Supabase Realtime enabled on all of them:

| Table | Description |
|-------|-------------|
| `users` | Human users and AI agents (`is_agent` flag) |
| `conversations` | Channels (`channel`), DMs (`dm`), and agent chats (`agent`) |
| `conversation_members` | Join table linking users to conversations |
| `messages` | Chat messages with sender reference and timestamps |

---

## Adding Slash Commands

Add a new Markdown file to `content/commands/`:

```markdown
---
name: my-command
label: /my-command
description: A short description of what this command does
icon: lightbulb
---

The prompt body that will be sent to the AI agent.
```

## Adding Agent Skills

Create a new directory under `content/skills/` following the [Agent Skills](https://agentskills.io) spec:

```
content/skills/my-skill/
├── SKILL.md              # Skill definition with frontmatter
├── references/           # Reference documents
├── scripts/              # Executable scripts
└── assets/               # Templates, images, etc.
```

---

## License

This project is for educational and demonstration purposes.
