"use client";

import { useSupabase } from "@/components/providers/SupabaseProvider";
import type { Conversation } from "@/lib/types";
import { useEffect, useState } from "react";

/** Module-level cache: channelName → Conversation */
const channelCache = new Map<string, Conversation>();

/** Module-level cache: conversationId → Conversation */
const conversationByIdCache = new Map<string, Conversation>();

/**
 * Hook to look up a channel conversation by its name.
 * Uses an in-memory cache to avoid a loading flash on revisits.
 *
 * @param channelName - The channel name (e.g. "general")
 * @returns the conversation record and loading state
 */
export function useChannelConversation(channelName: string) {
  const supabase = useSupabase();
  const cached = channelCache.get(channelName) ?? null;
  const [conversation, setConversation] = useState<Conversation | null>(
    cached
  );
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (!channelCache.has(channelName)) {
      setLoading(true);
    }

    let cancelled = false;

    async function fetchConversation() {
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .eq("type", "channel")
        .eq("name", channelName)
        .single();

      if (cancelled) return;

      const conv = data as Conversation | null;
      setConversation(conv);
      if (conv) channelCache.set(channelName, conv);
      setLoading(false);
    }
    fetchConversation();

    return () => {
      cancelled = true;
    };
  }, [supabase, channelName]);

  return { conversation, loading };
}

/**
 * Hook to look up a conversation by its ID.
 * Uses an in-memory cache to avoid a loading flash on revisits.
 *
 * @param conversationId - The conversation UUID
 * @returns the conversation record and loading state
 */
export function useConversationById(conversationId: string) {
  const supabase = useSupabase();
  const cached = conversationByIdCache.get(conversationId) ?? null;
  const [conversation, setConversation] = useState<Conversation | null>(
    cached
  );
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (!conversationByIdCache.has(conversationId)) {
      setLoading(true);
    }

    let cancelled = false;

    async function fetchConversation() {
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", conversationId)
        .single();

      if (cancelled) return;

      const conv = data as Conversation | null;
      setConversation(conv);
      if (conv) conversationByIdCache.set(conversationId, conv);
      setLoading(false);
    }
    fetchConversation();

    return () => {
      cancelled = true;
    };
  }, [supabase, conversationId]);

  return { conversation, loading };
}
