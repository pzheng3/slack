"use client";

import { createContext, useContext } from "react";
import {
  useMentionSuggestions,
  type MentionItem,
} from "@/lib/hooks/useMentionSuggestions";

/**
 * Context providing the list of known entities (people, channels, agents, apps)
 * for auto-linkifying entity references in AI responses.
 *
 * Uses `useMentionSuggestions` once at the provider level so that all
 * descendant `MessageBody` components share the same data without redundant
 * Supabase queries.
 */
const EntityLinkContext = createContext<MentionItem[]>([]);

/**
 * Hook to consume the entity list from the nearest `EntityLinkProvider`.
 *
 * @returns Array of mentionable entities across all categories
 */
export const useEntityItems = () => useContext(EntityLinkContext);

/**
 * Provider that fetches all mentionable entities via Supabase and makes
 * them available to descendant components through `useEntityItems()`.
 *
 * Place this inside the Supabase + User provider tree (e.g. the chat layout)
 * so that all message rendering components can access entity data for
 * auto-linkification without individual Supabase subscriptions.
 */
export function EntityLinkProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const items = useMentionSuggestions();
  return (
    <EntityLinkContext.Provider value={items}>
      {children}
    </EntityLinkContext.Provider>
  );
}
