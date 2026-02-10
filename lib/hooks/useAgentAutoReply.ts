"use client";

import { useSupabase } from "@/components/providers/SupabaseProvider";
import { useUser } from "@/components/providers/UserProvider";
import { AGENTS } from "@/lib/constants";
import type { MessageWithSender } from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Extract agent usernames that are @mentioned in a Tiptap HTML message.
 * Mentions are stored as `<span data-type="mention" data-id="people:userId">`.
 * We match the `data-id` attribute and collect user IDs from "people:" prefixed entries.
 *
 * @param html - The Tiptap HTML content of the message
 * @returns An array of user IDs mentioned in the message
 */
function extractMentionedUserIds(html: string): string[] {
  const ids: string[] = [];
  const regex = /data-id="people:([^"]+)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

/**
 * Strip HTML tags from a string to get plain text.
 * Used to extract readable message content for the AI context.
 *
 * @param html - HTML string
 * @returns Plain text string
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

/**
 * Hook that automatically triggers AI agent replies in channels.
 *
 * It detects two scenarios:
 * 1. **Mention-based**: A user @mentions an AI agent (Elon Musk, Steve Jobs) in any channel
 * 2. **Related channel**: A user posts in a channel that an agent is associated with
 *
 * When triggered, it calls `/api/agent-reply` with recent conversation context,
 * then saves the agent's response to the database. The Supabase Realtime
 * subscription will pick up the new message automatically.
 *
 * @param conversationId - The current conversation ID
 * @param channelName - The channel name (for related-channel detection), or null for DMs
 * @param messages - The current list of messages in the conversation
 */
export function useAgentAutoReply(
  conversationId: string | null,
  channelName: string | null,
  messages: MessageWithSender[]
) {
  const supabase = useSupabase();
  const { user } = useUser();

  /** Map of agent username → agent DB user record, populated on mount */
  const [agentUserMap, setAgentUserMap] = useState<
    Record<string, { id: string; username: string }>
  >({});

  /** Track which messages we've already processed to avoid duplicate replies */
  const processedRef = useRef<Set<string>>(new Set());

  /** Flag to prevent multiple simultaneous API calls for the same agent */
  const pendingRef = useRef<Set<string>>(new Set());

  // ---------------------------------------------------------------
  // Load agent user records from DB on mount
  // ---------------------------------------------------------------
  useEffect(() => {
    if (AGENTS.length === 0) return;

    async function loadAgentUsers() {
      const usernames = AGENTS.map((a) => a.username);
      const { data } = await supabase
        .from("users")
        .select("id, username")
        .in("username", usernames)
        .eq("is_agent", true);

      if (data) {
        const map: Record<string, { id: string; username: string }> = {};
        for (const u of data) {
          map[u.username] = { id: u.id, username: u.username };
        }
        setAgentUserMap(map);
      }
    }

    loadAgentUsers();
  }, [supabase]);

  /**
   * Trigger auto-reply for agents that should respond to the given message.
   * Call this after a user sends a message in a channel.
   *
   * @param messageContent - The HTML content of the just-sent message
   */
  const triggerAutoReply = useCallback(
    async (messageContent: string) => {
      if (!conversationId || !user) return;

      const agentUsernames = Object.keys(agentUserMap);
      if (agentUsernames.length === 0) return;

      // Determine which agents should respond
      const agentsToReply = new Set<string>();

      // 1. Check mentions
      const mentionedIds = extractMentionedUserIds(messageContent);
      for (const agentName of agentUsernames) {
        const agentUser = agentUserMap[agentName];
        if (mentionedIds.includes(agentUser.id)) {
          agentsToReply.add(agentName);
        }
      }

      // 2. Check related channels
      if (channelName) {
        for (const agentDef of AGENTS) {
          if (agentDef.related_channels?.includes(channelName as typeof agentDef.related_channels[number])) {
            agentsToReply.add(agentDef.username);
          }
        }
      }

      if (agentsToReply.size === 0) return;

      // Build recent messages context (last 10 messages for brevity)
      const recentMessages = messages.slice(-10).map((m) => ({
        username: m.sender.username,
        content: stripHtml(m.content),
      }));

      // Also include the just-sent message if not yet in the messages array
      const lastMsg = messages[messages.length - 1];
      const justSentText = stripHtml(messageContent);
      if (!lastMsg || stripHtml(lastMsg.content) !== justSentText) {
        recentMessages.push({
          username: user.username,
          content: justSentText,
        });
      }

      // Fire off replies for each agent (in parallel)
      const replyPromises = Array.from(agentsToReply).map(async (agentName) => {
        const agentUser = agentUserMap[agentName];
        if (!agentUser) return;

        // Skip if already processing a reply for this agent
        const pendingKey = `${conversationId}:${agentName}`;
        if (pendingRef.current.has(pendingKey)) return;
        pendingRef.current.add(pendingKey);

        try {
          const res = await fetch("/api/agent-reply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentUsername: agentName,
              recentMessages,
              channelName: channelName ?? undefined,
            }),
          });

          if (!res.ok) {
            console.error(
              `[useAgentAutoReply] Failed to get reply from ${agentName}`
            );
            return;
          }

          const { reply } = (await res.json()) as { reply: string };
          if (!reply) return; // Agent chose not to respond

          // Save the agent's reply to the database
          const { error } = await supabase.from("messages").insert({
            conversation_id: conversationId,
            sender_id: agentUser.id,
            content: reply,
          });

          if (error) {
            console.error(
              `[useAgentAutoReply] Failed to save ${agentName}'s reply:`,
              error.message
            );
          }
        } catch (err) {
          console.error(`[useAgentAutoReply] Error for ${agentName}:`, err);
        } finally {
          pendingRef.current.delete(pendingKey);
        }
      });

      await Promise.all(replyPromises);
    },
    [supabase, user, conversationId, channelName, messages, agentUserMap]
  );

  return { triggerAutoReply };
}
