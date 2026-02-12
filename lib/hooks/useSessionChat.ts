"use client";

import { useSupabase } from "@/components/providers/SupabaseProvider";
import { useUser } from "@/components/providers/UserProvider";
import { GENERIC_AGENT } from "@/lib/constants";
import type { Conversation, MessageWithSender, User } from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildAIContent,
  extractEntityReferences,
  extractSkillNames,
  fetchEntityContext,
} from "@/lib/slash-command-utils";
import type { EntityContext } from "@/lib/slash-command-utils";
import { useEntityItems } from "@/components/providers/EntityLinkProvider";
import type { EntitySummary } from "@/lib/entity-linkify";
import { dispatchSidebarEvent } from "@/lib/agent-tools/dispatch-sidebar-events";
import { cleanStreamingContent } from "@/lib/streaming-utils";

/**
 * Cached result for a session chat, keyed by sessionId.
 */
interface SessionChatCacheEntry {
  conversation: Conversation;
  agent: User;
  messages: MessageWithSender[];
}

/** Module-level cache: sessionId → cached init data */
export const sessionChatCache = new Map<string, SessionChatCacheEntry>();

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
  const allEntities = useEntityItems();
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

  // ---------------------------------------------------------------
  // Auto-cleanup: delete empty sessions when the user navigates away
  // ---------------------------------------------------------------
  // Refs track the latest state for the cleanup effect, which only
  // runs on unmount and therefore can't capture state via closures.
  const loadedRef = useRef(false);
  const hasUserMessagesRef = useRef(false);
  const conversationRef = useRef<Conversation | null>(null);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Keep refs in sync with the latest state. */
  useEffect(() => {
    if (!loading && conversation && agent) {
      loadedRef.current = true;
      conversationRef.current = conversation;
      hasUserMessagesRef.current = messages.some(
        (m) => m.sender_id !== agent.id
      );
    }
  }, [loading, conversation, agent, messages]);

  /**
   * On unmount, check whether the user ever sent a message. If not,
   * the session was abandoned — delete it from the database and notify
   * the sidebar so it updates instantly.
   *
   * Uses a short delay to handle React Strict Mode (which unmounts
   * and re-mounts in dev). The timer is cancelled on re-mount.
   */
  useEffect(() => {
    // Cancel any pending cleanup from a prior Strict-Mode unmount cycle
    if (cleanupTimerRef.current) {
      clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }

    return () => {
      // Capture ref values in local consts for the closure
      const loaded = loadedRef.current;
      const hasUserMsgs = hasUserMessagesRef.current;
      const conv = conversationRef.current;

      // Only auto-delete sessions that were created manually from the
      // sidebar ("New agent") and never interacted with. Sessions created
      // by an agent tool call have a custom name and should be kept.
      const isDefaultName = conv?.name === "New agent";

      if (loaded && conv && !hasUserMsgs && isDefaultName) {
        const idToDelete = conv.id;

        cleanupTimerRef.current = setTimeout(() => {
          // Remove from the in-memory cache
          sessionChatCache.delete(idToDelete);

          // Delete from database (fire-and-forget)
          supabase
            .from("conversations")
            .delete()
            .eq("id", idToDelete)
            .then(() => {
              // Notify the sidebar to remove the session from its list
              window.dispatchEvent(
                new CustomEvent("agent-session-deleted", {
                  detail: { sessionId: idToDelete },
                })
              );
            });
        }, 150);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

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
      const isIncognito = conversation.name?.includes("(incognito)") ?? false;
      if (!hasUserMessages) {
        // Fire-and-forget: summarize the prompt into a short title via OpenAI
        fetch("/api/summarize-title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: content }),
        })
          .then((res) => res.json())
          .then(async (data: { title?: string }) => {
            let newName = data.title || content.slice(0, 60);

            // Preserve the (incognito) suffix for incognito sessions
            if (isIncognito && !newName.includes("(incognito)")) {
              newName = `${newName} (incognito)`;
            }

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

      // Build history for OpenAI.
      // The prompt is assembled from independent layers:
      //   @mentions → pull conversation history as context
      //   /commands → add instruction bodies from .md files
      //   /skills  → activate skills (loaded server-side from SKILL.md)
      //   user text → appended at the end
      // All layers are independent and combine into one holistic prompt.

      // Extract ALL @mentioned entities and fetch their conversation
      // history in parallel to inject as context.
      const entityRefs = extractEntityReferences(content);
      const entityContexts: EntityContext[] = [];
      if (entityRefs.length > 0 && user) {
        const results = await Promise.allSettled(
          entityRefs.map((ref) =>
            fetchEntityContext(supabase, ref, user!.id)
          )
        );
        for (const result of results) {
          if (result.status === "fulfilled" && result.value) {
            entityContexts.push(result.value);
          }
        }
      }

      // Extract activated skill names from the original HTML before
      // buildAIContent converts it to plain text.
      const activatedSkills = extractSkillNames(content);

      const aiContent = buildAIContent(
        content,
        entityContexts.length > 0 ? entityContexts : null
      );

      const history = [
        ...messages.map((m) => ({
          role: (m.sender_id === agent.id ? "assistant" : "user") as
            | "user"
            | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: aiContent },
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

      // Build lightweight entity summaries for the AI to annotate references
      const availableEntities: EntitySummary[] = allEntities.map((e) => ({
        id: e.id,
        label: e.label,
        category: e.category,
      }));

      try {
        const res = await fetch("/api/agent-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemPrompt: sessionContext,
            messages: history,
            userId: user.id,
            ...(activatedSkills.length > 0 && { activatedSkills }),
            ...(availableEntities.length > 0 && { availableEntities }),
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error("Failed to get response");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";
        let sources: { url: string; title: string }[] = [];
        /** Accumulated tool call statuses for inline display */
        const toolCalls: { id: string; name: string; arguments: Record<string, unknown>; success?: boolean; result?: string }[] = [];

        /** Build the display content including tool call metadata.
         *  Cleans streaming artifacts (incomplete links, citation markers)
         *  so they don't flash as raw text before being parsed. */
        const buildDisplayContent = () => {
          let display = cleanStreamingContent(fullContent);
          if (toolCalls.length > 0) {
            display = `<!--TOOL_CALLS:${JSON.stringify(toolCalls)}-->\n\n${display}`;
          }
          if (sources.length > 0) {
            display += `\n\n<!--SOURCES:${JSON.stringify(sources)}-->`;
          }
          return display;
        };

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
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === streamingMsg.id
                        ? { ...m, content: buildDisplayContent() }
                        : m
                    )
                  );
                }
                // Capture web-search source citations
                if (parsed.sources) {
                  sources = parsed.sources;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === streamingMsg.id
                        ? { ...m, content: buildDisplayContent() }
                        : m
                    )
                  );
                }
                // Handle tool call events
                if (parsed.tool_call) {
                  toolCalls.push({
                    id: parsed.tool_call.id,
                    name: parsed.tool_call.name,
                    arguments: parsed.tool_call.arguments,
                  });
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === streamingMsg.id
                        ? { ...m, content: buildDisplayContent() }
                        : m
                    )
                  );
                }
                // Handle tool result events
                if (parsed.tool_result) {
                  const existing = toolCalls.find(
                    (tc) => tc.id === parsed.tool_result.id
                  );
                  if (existing) {
                    existing.success = parsed.tool_result.success;
                    existing.result = parsed.tool_result.result;
                  }
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === streamingMsg.id
                        ? { ...m, content: buildDisplayContent() }
                        : m
                    )
                  );

                  // Dispatch sidebar events so channels/sessions update
                  dispatchSidebarEvent(
                    parsed.tool_result.name,
                    parsed.tool_result.success,
                    parsed.tool_result.result
                  );
                }
              } catch {
                // Skip malformed chunks
              }
            }
          }
        }

        // Build the final persisted content with all metadata
        let persistContent = fullContent;
        if (toolCalls.length > 0) {
          persistContent = `<!--TOOL_CALLS:${JSON.stringify(toolCalls)}-->\n\n${persistContent}`;
        }
        if (sources.length > 0) {
          persistContent += `\n\n<!--SOURCES:${JSON.stringify(sources)}-->`;
        }

        // Persist the complete agent message to DB
        if (persistContent) {
          const { data: agentMsg } = await supabase
            .from("messages")
            .insert({
              conversation_id: conversation.id,
              sender_id: agent.id,
              content: persistContent,
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
    [supabase, conversation, user, agent, messages, allEntities]
  );

  return { messages, loading, streaming, sendMessage, agent, conversation };
}
