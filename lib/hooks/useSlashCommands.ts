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
    id: "app-good-app",
    label: "/praise @user",
    description: "Praise colleague to give recognition and to get a free donation",
    icon: null,
    avatar_url: "/images/Good App.png",
    category: "app",
    body: "",
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
