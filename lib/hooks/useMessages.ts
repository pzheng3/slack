"use client";

import { useSupabase } from "@/components/providers/SupabaseProvider";
import { useUser } from "@/components/providers/UserProvider";
import type { MessageWithSender } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

/**
 * Hook that fetches messages for a given conversation and subscribes to
 * Supabase Realtime for new messages.
 *
 * @param conversationId - The conversation to fetch messages for (null = skip)
 * @returns messages, loading state, and a sendMessage function
 */
export function useMessages(conversationId: string | null) {
  const supabase = useSupabase();
  const { user } = useUser();
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch initial messages
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);

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

      if (error) {
        console.error("Failed to fetch messages:", error.message);
        setMessages([]);
      } else {
        setMessages(data as unknown as MessageWithSender[]);
      }
      setLoading(false);
    }

    fetchMessages();
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
              return [...prev, data as unknown as MessageWithSender];
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
