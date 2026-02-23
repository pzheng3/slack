"use client";

import { useSupabase } from "@/components/providers/SupabaseProvider";
import { useUser } from "@/components/providers/UserProvider";
import type { ScheduledMessage } from "@/lib/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ScheduledMessagesContextValue {
  messages: ScheduledMessage[];
  loading: boolean;
  scheduleMessage: (
    content: string,
    sendAt: Date,
    conversationId: string | null,
    recipientType?: string,
    recipientId?: string,
    recipientLabel?: string
  ) => Promise<string | null>;
  cancelSchedule: (id: string) => Promise<void>;
  sendNow: (id: string) => Promise<void>;
  reschedule: (id: string, newSendAt: Date) => Promise<void>;
  refreshMessages: () => Promise<void>;
}

const ScheduledMessagesContext =
  createContext<ScheduledMessagesContextValue | null>(null);

/**
 * Provides shared scheduled-messages state to all descendants.
 * A single Supabase Realtime subscription keeps every consumer in sync,
 * and optimistic updates propagate instantly across the sidebar, the
 * scheduled-messages page, and any chat composer that schedules a message.
 */
export function ScheduledMessagesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = useSupabase();
  const { user } = useUser();
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);

  /** Ref keeps current messages available to callbacks without stale closures. */
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

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

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  /**
   * Single Supabase Realtime subscription for the current user's
   * scheduled_messages rows. Refetches on any INSERT / UPDATE / DELETE
   * so the list stays consistent (e.g. when the poller marks a row 'sent').
   */
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`scheduled_msgs_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "scheduled_messages",
          filter: `sender_id=eq.${user.id}`,
        },
        () => {
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
      const msg = messagesRef.current.find((m) => m.id === id);
      if (!msg) return;

      if (!msg.conversation_id) {
        console.error(
          "Cannot send now: no conversation_id on scheduled message",
          id
        );
        return;
      }

      const { error: insertError } = await supabase.from("messages").insert({
        conversation_id: msg.conversation_id,
        sender_id: msg.sender_id,
        content: msg.content,
      });

      if (insertError) {
        console.error(
          "Failed to send scheduled message now:",
          insertError.message
        );
        return;
      }

      const { error: updateError } = await supabase
        .from("scheduled_messages")
        .update({ status: "sent" })
        .eq("id", id);

      if (updateError) {
        console.error(
          "Failed to mark scheduled message as sent:",
          updateError.message
        );
        return;
      }

      setMessages((prev) => prev.filter((m) => m.id !== id));
    },
    [supabase]
  );

  /**
   * Reschedule a pending message to a new send time.
   *
   * @param id        - The scheduled message ID
   * @param newSendAt - The new Date to send the message
   */
  const reschedule = useCallback(
    async (id: string, newSendAt: Date) => {
      const { data, error } = await supabase
        .from("scheduled_messages")
        .update({ send_at: newSendAt.toISOString() })
        .eq("id", id)
        .eq("status", "pending")
        .select()
        .single();

      if (error || !data) {
        console.error("Failed to reschedule message:", error?.message);
        fetchMessages();
        return;
      }

      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.id === id ? { ...m, send_at: newSendAt.toISOString() } : m
        );
        updated.sort(
          (a, b) =>
            new Date(a.send_at).getTime() - new Date(b.send_at).getTime()
        );
        return updated;
      });
    },
    [supabase, fetchMessages]
  );

  return (
    <ScheduledMessagesContext.Provider
      value={{
        messages,
        loading,
        scheduleMessage,
        cancelSchedule,
        sendNow,
        reschedule,
        refreshMessages: fetchMessages,
      }}
    >
      {children}
    </ScheduledMessagesContext.Provider>
  );
}

/**
 * Consume the shared scheduled-messages state.
 * Must be used inside a `<ScheduledMessagesProvider>`.
 */
export function useScheduledMessagesContext(): ScheduledMessagesContextValue {
  const ctx = useContext(ScheduledMessagesContext);
  if (!ctx) {
    throw new Error(
      "useScheduledMessagesContext must be used within ScheduledMessagesProvider"
    );
  }
  return ctx;
}
