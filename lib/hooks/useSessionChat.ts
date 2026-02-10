"use client";

import { useSupabase } from "@/components/providers/SupabaseProvider";
import { useUser } from "@/components/providers/UserProvider";
import { GENERIC_AGENT } from "@/lib/constants";
import type { Conversation, MessageWithSender, User } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

/**
 * Cached result for a session chat, keyed by sessionId.
 */
interface SessionChatCacheEntry {
  conversation: Conversation;
  agent: User;
  messages: MessageWithSender[];
}

/** Module-level cache: sessionId → cached init data */
const sessionChatCache = new Map<string, SessionChatCacheEntry>();

/**
 * Hook for managing a session-based agent chat conversation.
 * Unlike useAgentChat (which works with predefined agents by username),
 * this hook works with conversation IDs for user-created sessions.
 *
 * Uses an in-memory cache to avoid a loading flash on revisits.
 *
 * @param sessionId - The conversation UUID
 */
export function useSessionChat(sessionId: string) {
  const supabase = useSupabase();
  const { user } = useUser();
  const cached = sessionChatCache.get(sessionId);
  const [conversation, setConversation] = useState<Conversation | null>(
    cached?.conversation ?? null
  );
  const [agent, setAgent] = useState<User | null>(cached?.agent ?? null);
  const [messages, setMessages] = useState<MessageWithSender[]>(
    cached?.messages ?? []
  );
  const [loading, setLoading] = useState(!cached);
  const [streaming, setStreaming] = useState(false);

  // Load the conversation, agent, and messages
  useEffect(() => {
    if (!user) return;

    async function init() {
      // Only show loading spinner when there's no cached data
      if (!sessionChatCache.has(sessionId)) {
        setLoading(true);
      }

      // Fetch the conversation
      const { data: conv } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", sessionId)
        .eq("type", "agent")
        .single();

      if (!conv) {
        console.error(`Session "${sessionId}" not found`);
        setLoading(false);
        return;
      }
      setConversation(conv as Conversation);

      // Find the generic AI Assistant agent
      const { data: agentData } = await supabase
        .from("users")
        .select("*")
        .eq("username", GENERIC_AGENT.username)
        .eq("is_agent", true)
        .single();

      if (agentData) {
        setAgent(agentData as User);
      }

      // Fetch messages
      const { data: msgs } = await supabase
        .from("messages")
        .select(
          `*, sender:users!sender_id (id, username, avatar_url, is_agent)`
        )
        .eq("conversation_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(200);

      const typedMsgs = (msgs as unknown as MessageWithSender[]) ?? [];
      setMessages(typedMsgs);

      // Populate cache for instant rendering on revisits
      if (agentData) {
        sessionChatCache.set(sessionId, {
          conversation: conv as Conversation,
          agent: agentData as User,
          messages: typedMsgs,
        });
      }

      setLoading(false);
    }

    init();
  }, [supabase, user, sessionId]);

  /**
   * Send a message and get the AI response via streaming.
   * Uses the conversation name as context for the system prompt.
   * On the first user message, calls OpenAI to generate a 3–7 word title
   * and renames the session (like ChatGPT auto-naming).
   */
  const sendMessage = useCallback(
    async (content: string) => {
      if (!conversation || !user || !agent) return;

      // --- Auto-rename session on the first user message ---
      // The greeting from the agent doesn't count — check for any user messages.
      const hasUserMessages = messages.some((m) => m.sender_id !== agent.id);
      if (!hasUserMessages) {
        // Fire-and-forget: summarize the prompt into a short title via OpenAI
        fetch("/api/summarize-title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: content }),
        })
          .then((res) => res.json())
          .then(async (data: { title?: string }) => {
            const newName = data.title || content.slice(0, 60);

            await supabase
              .from("conversations")
              .update({ name: newName })
              .eq("id", conversation.id);

            // Update local conversation state so the header reflects the new name
            setConversation((prev) =>
              prev ? { ...prev, name: newName } : prev
            );

            // Notify sidebar to update the session name
            window.dispatchEvent(
              new CustomEvent("agent-session-renamed", {
                detail: { sessionId: conversation.id, name: newName },
              })
            );
          })
          .catch((err) => {
            console.error("Failed to generate session title:", err);
          });
      }

      // Insert user message into DB
      const { data: userMsg } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversation.id,
          sender_id: user.id,
          content,
        })
        .select(
          `*, sender:users!sender_id (id, username, avatar_url, is_agent)`
        )
        .single();

      if (userMsg) {
        setMessages((prev) => [
          ...prev,
          userMsg as unknown as MessageWithSender,
        ]);
      }

      // Build history for OpenAI
      const history = [
        ...messages.map((m) => ({
          role: (m.sender_id === agent.id ? "assistant" : "user") as
            | "user"
            | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content },
      ];

      // Build system prompt — use the workspace-aware agent prompt,
      // with optional session context appended when the user gave a name.
      const sessionContext = conversation.name
        ? `${GENERIC_AGENT.system_prompt}\n\nThe user created this session with the following context: "${conversation.name}". Keep this in mind as you help them.`
        : GENERIC_AGENT.system_prompt;

      // Start streaming
      setStreaming(true);

      // Create a placeholder agent message for streaming
      const streamingMsg: MessageWithSender = {
        id: `streaming-${Date.now()}`,
        conversation_id: conversation.id,
        sender_id: agent.id,
        content: "",
        created_at: new Date().toISOString(),
        sender: {
          id: agent.id,
          username: agent.username,
          avatar_url: agent.avatar_url,
          is_agent: true,
        },
      };
      setMessages((prev) => [...prev, streamingMsg]);

      try {
        const res = await fetch("/api/agent-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ systemPrompt: sessionContext, messages: history }),
        });

        if (!res.ok || !res.body) {
          throw new Error("Failed to get response");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") break;
              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  fullContent += parsed.text;
                  // Update the streaming message content
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === streamingMsg.id
                        ? { ...m, content: fullContent }
                        : m
                    )
                  );
                }
              } catch {
                // Skip malformed chunks
              }
            }
          }
        }

        // Persist the complete agent message to DB
        if (fullContent) {
          const { data: agentMsg } = await supabase
            .from("messages")
            .insert({
              conversation_id: conversation.id,
              sender_id: agent.id,
              content: fullContent,
            })
            .select(
              `*, sender:users!sender_id (id, username, avatar_url, is_agent)`
            )
            .single();

          // Replace streaming placeholder with persisted message
          if (agentMsg) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamingMsg.id
                  ? (agentMsg as unknown as MessageWithSender)
                  : m
              )
            );
          }
        }
      } catch (err) {
        console.error("Session chat error:", err);
        // Remove the streaming placeholder on error
        setMessages((prev) =>
          prev.filter((m) => m.id !== streamingMsg.id)
        );
      } finally {
        setStreaming(false);
      }
    },
    [supabase, conversation, user, agent, messages]
  );

  return { messages, loading, streaming, sendMessage, agent, conversation };
}
