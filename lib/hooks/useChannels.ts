"use client";

import { useSupabase } from "@/components/providers/SupabaseProvider";
import type { Conversation } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { channelCache } from "./useConversation";

/** Represents a channel in the sidebar */
export interface Channel {
  id: string;
  name: string;
  created_at: string;
}

/**
 * Hook for managing channels dynamically from Supabase.
 * Fetches all channel-type conversations and provides methods
 * to create and delete channels.
 */
export function useChannels() {
  const supabase = useSupabase();
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * Fetch all channel conversations from Supabase, ordered by creation date.
   */
  const fetchChannels = useCallback(async () => {
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("type", "channel")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to fetch channels:", error.message);
      setLoading(false);
      return;
    }

    if (data) {
      setChannels(
        data.map((c: Conversation) => ({
          id: c.id,
          name: c.name || "unnamed",
          created_at: c.created_at,
        }))
      );

      // Eagerly populate the channel conversation cache so that
      // navigating to any channel skips the conversation lookup.
      for (const c of data as Conversation[]) {
        if (c.name) {
          channelCache.set(c.name, c);
        }
      }
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  /**
   * Create a new channel conversation in Supabase.
   * Navigates to the new channel after creation.
   *
   * @param channelName - The name for the new channel
   * @returns The channel name on success, or an error string on failure
   */
  const createChannel = useCallback(
    async (channelName: string): Promise<string | null> => {
      const trimmed = channelName.trim().toLowerCase().replace(/\s+/g, "-");

      if (!trimmed) return "Channel name cannot be empty";

      // Check if channel already exists locally
      if (channels.some((c) => c.name === trimmed)) {
        return `Channel "#${trimmed}" already exists`;
      }

      const { data: conversation, error } = await supabase
        .from("conversations")
        .insert({ type: "channel", name: trimmed })
        .select()
        .single();

      if (error) {
        console.error("Failed to create channel:", error.message);
        return `Failed to create channel: ${error.message}`;
      }

      if (conversation) {
        setChannels((prev) => [
          ...prev,
          {
            id: conversation.id,
            name: conversation.name || trimmed,
            created_at: conversation.created_at,
          },
        ]);

        router.push(`/chat/channel/${trimmed}`);
      }

      return null;
    },
    [supabase, channels, router]
  );

  /**
   * Delete a channel by removing the conversation row.
   * Related messages are cascade-deleted by the DB.
   * If the user is viewing the deleted channel, navigates to the first
   * remaining channel or falls back to a default route.
   *
   * @param channelId - The ID of the channel conversation to delete
   */
  const deleteChannel = useCallback(
    async (channelId: string) => {
      const channel = channels.find((c) => c.id === channelId);
      if (!channel) return;

      // Determine redirect if currently viewing this channel
      const isViewing = window.location.pathname === `/chat/channel/${channel.name}`;
      let redirectTo: string | null = null;

      if (isViewing) {
        const idx = channels.findIndex((c) => c.id === channelId);
        const next = channels[idx + 1] ?? channels[idx - 1];
        redirectTo = next
          ? `/chat/channel/${next.name}`
          : "/chat";
      }

      const { error } = await supabase
        .from("conversations")
        .delete()
        .eq("id", channelId);

      if (error) {
        console.error("Failed to delete channel:", error.message);
        return;
      }

      setChannels((prev) => prev.filter((c) => c.id !== channelId));

      if (redirectTo) {
        router.push(redirectTo);
      }
    },
    [supabase, router, channels]
  );

  return { channels, loading, createChannel, deleteChannel, refreshChannels: fetchChannels };
}
