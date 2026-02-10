/**
 * Core data types mirroring the Supabase database schema.
 */

/** User record — includes both human users and AI agents */
export interface User {
  id: string;
  username: string;
  avatar_url: string | null;
  is_agent: boolean;
  created_at: string;
}

/** Conversation record — represents a channel, DM, or agent chat */
export interface Conversation {
  id: string;
  type: "channel" | "dm" | "agent";
  name: string | null;
  created_at: string;
}

/** Membership link between a user and a conversation */
export interface ConversationMember {
  conversation_id: string;
  user_id: string;
}

/** A single chat message */
export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

/** Message with sender info joined */
export interface MessageWithSender extends Message {
  sender: Pick<User, "id" | "username" | "avatar_url" | "is_agent">;
}

/* ------------------------------------------------------------------ */
/*  Slash Commands                                                     */
/* ------------------------------------------------------------------ */

/** Category a slash command item belongs to. */
export type SlashCommandCategory = "command" | "skill" | "app";

/**
 * A single item shown in the `/` slash command menu.
 * Covers prepackaged prompts (commands), Anthropic skills, and app actions.
 */
export interface SlashCommandItem {
  /** Unique identifier (e.g. "command-summarize", "skill-web-search") */
  id: string;
  /** Display label shown in the menu (e.g. "/summarize") */
  label: string;
  /** One-line description shown as subtitle and on hover */
  description: string;
  /** Icon name referencing /icons/{icon}.svg, or null */
  icon: string | null;
  /** Avatar URL for app items, or null */
  avatar_url: string | null;
  /** Which tab category this item belongs to */
  category: SlashCommandCategory;
  /** The prompt body / skill instructions from the markdown file */
  body: string;
  /** ISO timestamp for recency sorting */
  timestamp: string;
}
