"use client";

import { useCallback, useEffect, useState } from "react";
import type { SlashCommandCategory, SlashCommandItem } from "@/lib/types";

/**
 * localStorage key for tracking recently-used slash commands.
 * Stores an array of item ids ordered by most-recent-first.
 */
const RECENTS_KEY = "slash_command_recents";
const MAX_RECENTS = 20;

/** Static app action entries shown in the Apps tab. */
const APP_ITEMS: SlashCommandItem[] = [
  {
    id: "app-figma",
    label: "/figma [link]",
    description: "Unfurl a Figma file to preview designs in channel",
    icon: null,
    avatar_url: "/images/Figma logo.png",
    category: "app",
    body: "",
    resources: [],
    timestamp: new Date().toISOString(),
  },
  {
    id: "app-notion-create",
    label: "/notion create [title]",
    description: "Create a new Notion page and share it in this channel",
    icon: null,
    avatar_url: "/images/Notion logo.png",
    category: "app",
    body: "",
    resources: [],
    timestamp: new Date().toISOString(),
  },
  {
    id: "app-notion-search",
    label: "/notion search [query]",
    description: "Search your Notion workspace and share results",
    icon: null,
    avatar_url: "/images/Notion logo.png",
    category: "app",
    body: "",
    resources: [],
    timestamp: new Date().toISOString(),
  },
  {
    id: "app-cursor-review",
    label: "/cursor review [PR link]",
    description: "Run an AI code review on a pull request",
    icon: null,
    avatar_url: "/images/Cursor logo.png",
    category: "app",
    body: "",
    resources: [],
    timestamp: new Date().toISOString(),
  },
  {
    id: "app-cursor-generate",
    label: "/cursor generate [prompt]",
    description: "Generate a code snippet from a natural language description",
    icon: null,
    avatar_url: "/images/Cursor logo.png",
    category: "app",
    body: "",
    resources: [],
    timestamp: new Date().toISOString(),
  },
  {
    id: "app-remind",
    label: "/remind [@user or #channel] [what] [when]",
    description: "Set a reminder for yourself, a teammate, or a channel",
    icon: null,
    avatar_url: "/images/Slack.png",
    category: "app",
    body: "",
    resources: [],
    timestamp: new Date().toISOString(),
  },
  {
    id: "app-poll",
    label: "/poll [question]",
    description: "Create a quick poll for the channel to vote on",
    icon: null,
    avatar_url: "/images/Slack.png",
    category: "app",
    body: "",
    resources: [],
    timestamp: new Date().toISOString(),
  },
  {
    id: "app-status",
    label: "/status [emoji] [status text]",
    description: "Set or clear your Slack status",
    icon: null,
    avatar_url: "/images/Slack.png",
    category: "app",
    body: "",
    resources: [],
    timestamp: new Date().toISOString(),
  },
  {
    id: "app-invite",
    label: "/invite @user",
    description: "Invite a teammate to this channel",
    icon: null,
    avatar_url: "/images/Slack.png",
    category: "app",
    body: "",
    resources: [],
    timestamp: new Date().toISOString(),
  },
  {
    id: "app-topic",
    label: "/topic [new topic]",
    description: "Set or view the channel topic",
    icon: null,
    avatar_url: "/images/Slack.png",
    category: "app",
    body: "",
    resources: [],
    timestamp: new Date().toISOString(),
  },
  {
    id: "app-shrug",
    label: "/shrug [message]",
    description: "Append ¯\\_(ツ)_/¯ to your message",
    icon: null,
    avatar_url: "/images/Slack.png",
    category: "app",
    body: "",
    resources: [],
    timestamp: new Date().toISOString(),
  },
];

/**
 * Reads the recently-used command ids from localStorage.
 * @returns Array of item ids, most recent first
 */
function getRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

/**
 * Saves a command id to the top of the recents list in localStorage.
 * @param id - The slash command item id to record
 */
function saveRecent(id: string): void {
  try {
    const recents = getRecents().filter((r) => r !== id);
    recents.unshift(id);
    localStorage.setItem(
      RECENTS_KEY,
      JSON.stringify(recents.slice(0, MAX_RECENTS))
    );
  } catch {
    // Ignore storage errors
  }
}

/**
 * Re-export the category type for consumers.
 */
export type { SlashCommandCategory, SlashCommandItem };

/**
 * Hook that provides all slash command items for the `/` menu.
 *
 * - Fetches commands and skills from the `/api/slash-commands` endpoint on mount.
 * - Merges in static app action items.
 * - Tracks recently-used items via localStorage.
 * - Returns the full list, a record-recent callback, and recents order.
 *
 * @returns Object with items array, recordRecent function, and recent ids
 */
export function useSlashCommands() {
  const [items, setItems] = useState<SlashCommandItem[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    setRecentIds(getRecents());

    async function fetchCommands() {
      try {
        const res = await fetch("/api/slash-commands");
        if (!res.ok) return;
        const data = (await res.json()) as SlashCommandItem[];
        setItems([...data, ...APP_ITEMS]);
      } catch {
        // If the API fails, still show app items
        setItems([...APP_ITEMS]);
      }
    }
    fetchCommands();
  }, []);

  /**
   * Record that a command was used (updates localStorage + state).
   * @param id - The slash command item id
   */
  const recordRecent = useCallback((id: string) => {
    saveRecent(id);
    setRecentIds(getRecents());
  }, []);

  return { items, recentIds, recordRecent };
}
