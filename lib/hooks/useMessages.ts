"use client";

import { useSupabase } from "@/components/providers/SupabaseProvider";
import { useUser } from "@/components/providers/UserProvider";
import type { MessageWithSender } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

/** Module-level cache: conversationId → messages */
export const messagesCache = new Map<string, MessageWithSender[]>();

/**
 * Hook that fetches messages for a given conversation and subscribes to
 * Supabase Realtime for new messages.
 * Uses an in-memory cache to avoid a loading flash on revisits.
 *
 * @param conversationId - The conversation to fetch messages for (null = skip)
 * @returns messages, loading state, and a sendMessage function
 */
export function useMessages(conversationId: string | null) {
  const supabase = useSupabase();
  const { user } = useUser();
  const cached = conversationId ? messagesCache.get(conversationId) : null;
  const [messages, setMessages] = useState<MessageWithSender[]>(cached ?? []);
  const [loading, setLoading] = useState(
    conversationId ? !messagesCache.has(conversationId) : false
  );

  // Fetch initial messages
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    // Only show loading spinner when there's no cached data
    if (!messagesCache.has(conversationId)) {
      setLoading(true);
    }

    let cancelled = false;

    async function fetchMessages() {
      const { data, error } = await supabase
        .from("messages")
        .select(
          `
          *,
          sender:users!sender_id (id, username, avatar_url, is_agent)
        `
        )
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: true })
        .limit(200);

      if (cancelled) return;

      if (error) {
        console.error("Failed to fetch messages:", error.message);
        setMessages([]);
      } else {
        const msgs = data as unknown as MessageWithSender[];
        setMessages(msgs);
        messagesCache.set(conversationId!, msgs);
      }
      setLoading(false);
    }

    fetchMessages();

    return () => {
      cancelled = true;
    };
  }, [supabase, conversationId]);

  // Subscribe to realtime inserts
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          // Fetch the full message with sender info
          const { data } = await supabase
            .from("messages")
            .select(
              `
              *,
              sender:users!sender_id (id, username, avatar_url, is_agent)
            `
            )
            .eq("id", payload.new.id)
            .single();

          if (data) {
            setMessages((prev) => {
              // Avoid duplicates
              if (prev.some((m) => m.id === data.id)) return prev;
              const updated = [
                ...prev,
                data as unknown as MessageWithSender,
              ];
              if (conversationId) {
                messagesCache.set(conversationId, updated);
              }
              return updated;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, conversationId]);

  /**
   * Send a message to the current conversation.
   */
  const sendMessage = useCallback(
    async (content: string) => {
      if (!conversationId || !user) return;

      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
      });

      if (error) {
        console.error("Failed to send message:", error.message);
      }
    },
    [supabase, conversationId, user]
  );

  return { messages, loading, sendMessage };
}
