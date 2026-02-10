"use client";

import { useSupabase } from "@/components/providers/SupabaseProvider";
import type { Conversation } from "@/lib/types";
import { useEffect, useState } from "react";

/**
 * Hook to look up a channel conversation by its name.
 *
 * @param channelName - The channel name (e.g. "general")
 * @returns the conversation record and loading state
 */
export function useChannelConversation(channelName: string) {
  const supabase = useSupabase();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .eq("type", "channel")
        .eq("name", channelName)
        .single();

      setConversation(data as Conversation | null);
      setLoading(false);
    }
    fetch();
  }, [supabase, channelName]);

  return { conversation, loading };
}

/**
 * Hook to look up a conversation by its ID.
 *
 * @param conversationId - The conversation UUID
 * @returns the conversation record and loading state
 */
export function useConversationById(conversationId: string) {
  const supabase = useSupabase();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", conversationId)
        .single();

      setConversation(data as Conversation | null);
      setLoading(false);
    }
    fetch();
  }, [supabase, conversationId]);

  return { conversation, loading };
}
