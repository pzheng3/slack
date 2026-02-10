"use client";

import { useSupabase } from "@/components/providers/SupabaseProvider";
import { useUser } from "@/components/providers/UserProvider";
import { useCallback } from "react";

/**
 * Hook that provides a function to find or create a DM conversation
 * between the current user and another user.
 *
 * @returns findOrCreateDM function that returns the conversation ID
 */
export function useDM() {
  const supabase = useSupabase();
  const { user } = useUser();

  /**
   * Finds an existing DM conversation between the current user and the target,
   * or creates one if it doesn't exist. Supports self-DMs where the current
   * user is also the target.
   *
   * @param targetUserId - The other user's ID (or own ID for self-DM)
   * @returns The conversation ID
   */
  const findOrCreateDM = useCallback(
    async (targetUserId: string): Promise<string | null> => {
      if (!user) return null;

      const isSelfDM = targetUserId === user.id;

      // Find conversations where the current user is a member
      const { data: myConvs } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", user.id);

      if (myConvs && myConvs.length > 0) {
        const myConvIds = myConvs.map((c) => c.conversation_id);

        if (isSelfDM) {
          // For self-DM, find a DM conversation where the user is the only member
          const { data: dmConvs } = await supabase
            .from("conversations")
            .select("id")
            .in("id", myConvIds)
            .eq("type", "dm");

          if (dmConvs) {
            for (const conv of dmConvs) {
              const { count } = await supabase
                .from("conversation_members")
                .select("*", { count: "exact", head: true })
                .eq("conversation_id", conv.id);

              if (count === 1) return conv.id;
            }
          }
        } else {
          // Regular DM — find shared conversations
          const { data: theirConvs } = await supabase
            .from("conversation_members")
            .select("conversation_id")
            .eq("user_id", targetUserId)
            .in("conversation_id", myConvIds);

          if (theirConvs && theirConvs.length > 0) {
            // Check which of these are DM conversations
            const sharedIds = theirConvs.map((c) => c.conversation_id);
            const { data: dmConv } = await supabase
              .from("conversations")
              .select("id")
              .in("id", sharedIds)
              .eq("type", "dm")
              .limit(1)
              .single();

            if (dmConv) return dmConv.id;
          }
        }
      }

      // No existing DM — create one
      const { data: newConv, error: convError } = await supabase
        .from("conversations")
        .insert({ type: "dm", name: null })
        .select()
        .single();

      if (convError || !newConv) {
        console.error("Failed to create DM conversation:", convError?.message);
        return null;
      }

      // Add members (single row for self-DM to respect unique PK)
      const members = isSelfDM
        ? [{ conversation_id: newConv.id, user_id: user.id }]
        : [
            { conversation_id: newConv.id, user_id: user.id },
            { conversation_id: newConv.id, user_id: targetUserId },
          ];

      const { error: memberError } = await supabase
        .from("conversation_members")
        .insert(members);

      if (memberError) {
        console.error("Failed to add DM members:", memberError.message);
        return null;
      }

      return newConv.id;
    },
    [supabase, user]
  );

  return { findOrCreateDM };
}
