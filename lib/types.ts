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
/*  Slash Commands & Agent Skills                                      */
/* ------------------------------------------------------------------ */

/** Category a slash command item belongs to. */
export type SlashCommandCategory = "command" | "skill" | "app";

/**
 * Describes a bundled resource file inside a skill directory
 * (references/, scripts/, or assets/).
 * Follows the Agent Skills specification (agentskills.io).
 */
export interface SkillResource {
  /** File name (e.g. "language-tips.md") */
  name: string;
  /** Relative path from the skill root (e.g. "references/language-tips.md") */
  path: string;
  /** Resource type: references are docs, scripts are executable, assets are templates/images */
  type: "reference" | "script" | "asset";
}

/**
 * A single item shown in the `/` slash command menu.
 * Covers prepackaged prompts (commands), Agent Skills (agentskills.io), and app actions.
 */
export interface SlashCommandItem {
  /** Unique identifier (e.g. "command-summarize", "skill-web-research") */
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
  /** The prompt body / skill instructions from the SKILL.md or markdown file */
  body: string;
  /**
   * Bundled resources available for this skill (references, scripts, assets).
   * Loaded on-demand via the skill-resources API for progressive disclosure.
   * Only present for "skill" category items; empty array for commands/apps.
   */
  resources: SkillResource[];
  /** ISO timestamp for recency sorting */
  timestamp: string;
}
