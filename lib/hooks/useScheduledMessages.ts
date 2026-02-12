"use client";

import { useSupabase } from "@/components/providers/SupabaseProvider";
import { useUser } from "@/components/providers/UserProvider";
import type { ScheduledMessage } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

/**
 * Hook for managing scheduled messages.
 * Fetches all pending scheduled messages for the current user and provides
 * methods to create new scheduled messages and cancel existing ones.
 *
 * Listens for Supabase Realtime changes on the `scheduled_messages` table
 * so the sidebar list stays in sync across tabs.
 */
export function useScheduledMessages() {
  const supabase = useSupabase();
  const { user } = useUser();
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * Fetch all pending scheduled messages for the current user,
   * ordered by send_at ascending (soonest first).
   */
  const fetchMessages = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("scheduled_messages")
      .select("*")
      .eq("sender_id", user.id)
      .eq("status", "pending")
      .order("send_at", { ascending: true });

    if (error) {
      console.error("Failed to fetch scheduled messages:", error.message);
    } else {
      setMessages(data ?? []);
    }
    setLoading(false);
  }, [supabase, user]);

  // Initial fetch
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Subscribe to realtime changes on scheduled_messages
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("scheduled_messages_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "scheduled_messages",
          filter: `sender_id=eq.${user.id}`,
        },
        () => {
          // Refetch on any change to keep in sync
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, user, fetchMessages]);

  /**
   * Schedule a new message to be sent at a future time.
   *
   * @param content         - The HTML message content
   * @param sendAt          - When to send the message
   * @param conversationId  - Target conversation (null if new agent session)
   * @param recipientType   - 'channel' | 'agent' | 'people' | 'new_agent'
   * @param recipientId     - Entity ID for resolving at send time
   * @param recipientLabel  - Display label for the sidebar listing
   * @returns The new scheduled message ID, or null on failure
   */
  const scheduleMessage = useCallback(
    async (
      content: string,
      sendAt: Date,
      conversationId: string | null,
      recipientType?: string,
      recipientId?: string,
      recipientLabel?: string
    ): Promise<string | null> => {
      if (!user) return null;

      const { data, error } = await supabase
        .from("scheduled_messages")
        .insert({
          sender_id: user.id,
          content,
          send_at: sendAt.toISOString(),
          conversation_id: conversationId,
          recipient_type: recipientType ?? null,
          recipient_id: recipientId ?? null,
          recipient_label: recipientLabel ?? null,
        })
        .select()
        .single();

      if (error) {
        console.error("Failed to schedule message:", error.message);
        return null;
      }

      // Optimistically add to local state
      setMessages((prev) => {
        const updated = [...prev, data];
        updated.sort(
          (a, b) =>
            new Date(a.send_at).getTime() - new Date(b.send_at).getTime()
        );
        return updated;
      });

      return data.id;
    },
    [supabase, user]
  );

  /**
   * Cancel a scheduled message by setting its status to 'cancelled'.
   *
   * @param id - The scheduled message ID to cancel
   */
  const cancelSchedule = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("scheduled_messages")
        .update({ status: "cancelled" })
        .eq("id", id);

      if (error) {
        console.error("Failed to cancel scheduled message:", error.message);
        return;
      }

      // Remove from local state
      setMessages((prev) => prev.filter((m) => m.id !== id));
    },
    [supabase]
  );

  /**
   * Send a scheduled message immediately.
   * Inserts it into the `messages` table, marks the scheduled_message as 'sent',
   * and removes it from local state.
   *
   * @param id - The scheduled message ID to send now
   */
  const sendNow = useCallback(
    async (id: string) => {
      const msg = messages.find((m) => m.id === id);
      if (!msg) return;

      // Need a conversation_id to insert the message
      if (!msg.conversation_id) {
        console.error("Cannot send now: no conversation_id on scheduled message", id);
        return;
      }

      // Insert into messages table
      const { error: insertError } = await supabase.from("messages").insert({
        conversation_id: msg.conversation_id,
        sender_id: msg.sender_id,
        content: msg.content,
      });

      if (insertError) {
        console.error("Failed to send scheduled message now:", insertError.message);
        return;
      }

      // Mark as sent
      const { error: updateError } = await supabase
        .from("scheduled_messages")
        .update({ status: "sent" })
        .eq("id", id);

      if (updateError) {
        console.error("Failed to mark scheduled message as sent:", updateError.message);
        return;
      }

      // Remove from local state
      setMessages((prev) => prev.filter((m) => m.id !== id));
    },
    [supabase, messages]
  );

  return {
    messages,
    loading,
    scheduleMessage,
    cancelSchedule,
    sendNow,
    refreshMessages: fetchMessages,
  };
}
