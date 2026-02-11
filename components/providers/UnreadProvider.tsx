"use client";

import { useUnreadCounts } from "@/lib/hooks/useUnreadCounts";
import { createContext, useContext } from "react";

/**
 * Shape of the unread-counts context value.
 */
interface UnreadContextValue {
  /** Map of conversationId → number of unread messages */
  unreadCounts: Record<string, number>;
  /**
   * Mark a conversation as read. Resets the badge count to 0 and
   * persists the last-read timestamp to localStorage.
   */
  markAsRead: (conversationId: string) => void;
}

const UnreadContext = createContext<UnreadContextValue>({
  unreadCounts: {},
  markAsRead: () => {},
});

/**
 * Provider that tracks unread message counts across all conversations
 * and exposes them to the component tree via context.
 *
 * Should be placed inside `SupabaseProvider` and `UserProvider` so that
 * the underlying hook can access the Supabase client and current user.
 */
export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const value = useUnreadCounts();

  return (
    <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>
  );
}

/**
 * Hook to access unread counts and the markAsRead function.
 * Must be used inside an `UnreadProvider`.
 */
export function useUnread(): UnreadContextValue {
  return useContext(UnreadContext);
}
