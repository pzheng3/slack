"use client";

import { useSupabase } from "@/components/providers/SupabaseProvider";
import { useUser } from "@/components/providers/UserProvider";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/** localStorage key for persisting last-read timestamps */
const STORAGE_KEY = "slack_input_unread_timestamps";

/**
 * Loads the last-read timestamps from localStorage.
 * @returns A record mapping conversationId to ISO timestamp
 */
function loadTimestamps(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Persists the last-read timestamps to localStorage.
 * @param timestamps - The record mapping conversationId to ISO timestamp
 */
function saveTimestamps(timestamps: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(timestamps));
  } catch {
    // Ignore quota errors
  }
}

/**
 * Resolves the conversation ID being viewed from the current pathname.
 * Returns null if the path doesn't correspond to a known conversation route.
 *
 * Note: channel pages use a name in the URL, not a conversation ID.
 * Those are resolved externally and passed via `markAsRead`.
 *
 * @param pathname - The current Next.js pathname
 */
function getConversationIdFromPath(pathname: string): string | null {
  // /chat/dm/{conversationId}
  const dmMatch = pathname.match(/^\/chat\/dm\/(.+)$/);
  if (dmMatch) return dmMatch[1];

  // /chat/agent/session/{sessionId} (sessionId === conversationId)
  const sessionMatch = pathname.match(/^\/chat\/agent\/session\/(.+)$/);
  if (sessionMatch) return sessionMatch[1];

  // Channel and agent pages resolve their IDs asynchronously,
  // so markAsRead is called explicitly from those pages.
  return null;
}

/**
 * Hook that tracks unread message counts across all conversations.
 *
 * - On mount: loads last-read timestamps from localStorage and queries
 *   Supabase for unread message counts per conversation.
 * - Subscribes to a global Supabase Realtime channel for INSERT events
 *   on the `messages` table. When a new message arrives for a conversation
 *   the user is NOT currently viewing, increments that conversation's count.
 * - Exposes `markAsRead(conversationId)` to reset the count and persist
 *   the timestamp.
 *
 * @returns unreadCounts map and markAsRead function
 */
export function useUnreadCounts() {
  const supabase = useSupabase();
  const { user } = useUser();
  const pathname = usePathname();

  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const timestampsRef = useRef<Record<string, string>>(loadTimestamps());

  /** Ref that always holds the latest pathname for the Realtime callback */
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  /** Ref that always holds the latest unread counts for the Realtime callback */
  const unreadCountsRef = useRef(unreadCounts);
  unreadCountsRef.current = unreadCounts;

  /** Set of conversation IDs the user is a member of, for filtering Realtime */
  const memberConvIdsRef = useRef<Set<string>>(new Set());

  /**
   * The conversation ID currently being viewed (resolved from the active page).
   * Updated via markAsRead calls from individual page components.
   */
  const activeConvIdRef = useRef<string | null>(null);

  // Keep activeConvIdRef in sync with simple path-based resolution
  useEffect(() => {
    const id = getConversationIdFromPath(pathname);
    if (id) {
      activeConvIdRef.current = id;
    }
  }, [pathname]);

  // -------------------------------------------------------------------
  // Fetch initial unread counts on mount
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function fetchInitialCounts() {
      // 1. Get all conversations the user belongs to
      const { data: memberships } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", user!.id);

      if (cancelled || !memberships || memberships.length === 0) return;

      const convIds = memberships.map((m) => m.conversation_id);
      memberConvIdsRef.current = new Set(convIds);

      const timestamps = timestampsRef.current;
      const counts: Record<string, number> = {};

      // 2. For each conversation, count messages newer than last-read
      // Batch into parallel queries (Supabase doesn't support conditional
      // count in a single query easily, so we query per conversation)
      const promises = convIds.map(async (convId) => {
        const lastRead = timestamps[convId];

        let query = supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", convId);

        // Only count messages NOT sent by the current user
        query = query.neq("sender_id", user!.id);

        if (lastRead) {
          query = query.gt("created_at", lastRead);
        }

        const { count } = await query;
        if (count && count > 0) {
          counts[convId] = count;
        }
      });

      await Promise.all(promises);

      if (!cancelled) {
        setUnreadCounts(counts);
      }
    }

    fetchInitialCounts();

    return () => {
      cancelled = true;
    };
  }, [supabase, user]);

  // -------------------------------------------------------------------
  // Global Realtime subscription for new messages
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("global-unread-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const newMsg = payload.new as {
            id: string;
            conversation_id: string;
            sender_id: string;
            created_at: string;
          };

          // Ignore messages sent by the current user
          if (newMsg.sender_id === user!.id) return;

          // Ignore conversations the user isn't a member of
          if (!memberConvIdsRef.current.has(newMsg.conversation_id)) return;

          // If the user is currently viewing this conversation, auto-read it
          if (activeConvIdRef.current === newMsg.conversation_id) {
            // Update the last-read timestamp so it stays current
            timestampsRef.current[newMsg.conversation_id] = newMsg.created_at;
            saveTimestamps(timestampsRef.current);
            return;
          }

          // Increment unread count for this conversation
          setUnreadCounts((prev) => ({
            ...prev,
            [newMsg.conversation_id]:
              (prev[newMsg.conversation_id] ?? 0) + 1,
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, user]);

  // -------------------------------------------------------------------
  // markAsRead — called by chat pages when they mount / become active
  // -------------------------------------------------------------------
  /**
   * Mark a conversation as read. Resets the unread count to 0 and
   * persists the current timestamp to localStorage.
   *
   * @param conversationId - The conversation to mark as read
   */
  const markAsRead = useCallback(
    (conversationId: string) => {
      if (!conversationId) return;

      // Update the active conversation ref
      activeConvIdRef.current = conversationId;

      // Persist the timestamp
      timestampsRef.current[conversationId] = new Date().toISOString();
      saveTimestamps(timestampsRef.current);

      // Reset count only if there was one
      setUnreadCounts((prev) => {
        if (!prev[conversationId]) return prev;
        const next = { ...prev };
        delete next[conversationId];
        return next;
      });
    },
    []
  );

  return { unreadCounts, markAsRead };
}
