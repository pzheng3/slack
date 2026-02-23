"use client";

import { useScheduledMessagesContext } from "@/components/providers/ScheduledMessagesProvider";

/**
 * Hook for consuming the shared scheduled-messages state.
 *
 * Delegates to the `ScheduledMessagesProvider` context so every component
 * in the tree shares the same messages array, optimistic updates, and a
 * single Supabase Realtime subscription.
 */
export function useScheduledMessages() {
  return useScheduledMessagesContext();
}
