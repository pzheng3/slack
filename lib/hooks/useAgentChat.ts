"use client";

import { useSupabase } from "@/components/providers/SupabaseProvider";
import { useUser } from "@/components/providers/UserProvider";
import type { Conversation, MessageWithSender, User } from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cached result for an agent chat, keyed by agentUsername.
 */
interface AgentChatCacheEntry {
  conversation: Conversation;
  agent: User;
  messages: MessageWithSender[];
}

/** Module-level cache: agentUsername → cached init data */
const agentChatCache = new Map<string, AgentChatCacheEntry>();

/**
 * Hook for managing an agent chat conversation.
 * Handles finding/creating the conversation, fetching messages,
 * sending user messages, streaming AI responses, and persisting
 * the full chat history to the database.
 *
 * Messages are saved to the `messages` table and loaded on init so
 * history is preserved across page reloads and sessions.
 *
 * A Supabase Realtime subscription keeps the local message list in sync
 * when messages are inserted from other tabs/clients.
 *
 * Uses an in-memory cache to avoid a loading flash on revisits.
 *
 * @param agentUsername - The agent's username
 */
export function useAgentChat(agentUsername: string) {
  const supabase = useSupabase();
  const { user } = useUser();
  const cached = agentChatCache.get(agentUsername);
  const [conversation, setConversation] = useState<Conversation | null>(
    cached?.conversation ?? null
  );
  const [agent, setAgent] = useState<User | null>(cached?.agent ?? null);
  const [messages, setMessages] = useState<MessageWithSender[]>(
    cached?.messages ?? []
  );
  const [loading, setLoading] = useState(!cached);
  const [streaming, setStreaming] = useState(false);

  /** Ref holding the current streaming placeholder ID so Realtime can skip it */
  const streamingMsgIdRef = useRef<string | null>(null);

  // ---------------------------------------------------------------
  // Find the agent user, resolve the conversation, and load history
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!user) return;

    let aborted = false;

    async function init() {
      // Only show loading spinner when there's no cached data
      if (!agentChatCache.has(agentUsername)) {
        setLoading(true);
      }
      // #region agent log
      fetch('http://127.0.0.1:7247/ingest/10852203-67bc-4ede-9b0a-c6f770a8c961',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useAgentChat.ts:init-start',message:'init started',data:{agentUsername,userId:user?.id},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
      // #endregion

      // 1. Find the agent user in DB
      const { data: agentData, error: agentErr } = await supabase
        .from("users")
        .select("*")
        .eq("username", agentUsername)
        .eq("is_agent", true)
        .single();

      if (aborted) return;

      if (agentErr || !agentData) {
        console.warn(
          `[useAgentChat] Agent "${agentUsername}" not found in DB. ` +
            "Make sure the seed script has been run."
        );
        setLoading(false);
        return;
      }
      setAgent(agentData as User);

      // 2. Look for an existing agent conversation between this user & agent
      const { data: myMemberships } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", user!.id);

      if (aborted) return;

      let convId: string | null = null;
      let convObj: Conversation | null = null;

      if (myMemberships && myMemberships.length > 0) {
        const myConvIds = myMemberships.map((m) => m.conversation_id);

        const { data: agentMemberships } = await supabase
          .from("conversation_members")
          .select("conversation_id")
          .eq("user_id", agentData.id)
          .in("conversation_id", myConvIds);

        if (aborted) return;

        if (agentMemberships && agentMemberships.length > 0) {
          const sharedIds = agentMemberships.map((m) => m.conversation_id);

          // Use oldest conversation to avoid fragmentation from duplicates
          const { data: agentConv } = await supabase
            .from("conversations")
            .select("*")
            .in("id", sharedIds)
            .eq("type", "agent")
            .order("created_at", { ascending: true })
            .limit(1)
            .single();

          if (aborted) return;

          if (agentConv) {
            convId = agentConv.id;
            convObj = agentConv as Conversation;
            setConversation(convObj);
          }
        }
      }

      // 3. Create conversation if none exists yet
      if (!convId) {
        const { data: newConv, error: convErr } = await supabase
          .from("conversations")
          .insert({ type: "agent", name: agentUsername })
          .select()
          .single();

        if (aborted) return;

        if (convErr || !newConv) {
          console.error(
            "[useAgentChat] Failed to create conversation:",
            convErr?.message
          );
          setLoading(false);
          return;
        }

        const { error: memberErr } = await supabase
          .from("conversation_members")
          .insert([
            { conversation_id: newConv.id, user_id: user!.id },
            { conversation_id: newConv.id, user_id: agentData.id },
          ]);

        if (aborted) return;

        if (memberErr) {
          console.error(
            "[useAgentChat] Failed to add conversation members:",
            memberErr.message
          );
        }

        convId = newConv.id;
        convObj = newConv as Conversation;
        setConversation(convObj);
      }

      // 4. Load persisted message history from DB
      if (convId) {
        const { data: msgs, error: msgsErr } = await supabase
          .from("messages")
          .select(
            `*, sender:users!sender_id (id, username, avatar_url, is_agent)`
          )
          .eq("conversation_id", convId)
          .order("created_at", { ascending: true })
          .limit(200);

        if (aborted) return;

        if (msgsErr) {
          console.error(
            "[useAgentChat] Failed to load messages:",
            msgsErr.message
          );
        } else if (msgs) {
          const typedMsgs = msgs as unknown as MessageWithSender[];
          setMessages(typedMsgs);

          // Populate cache for instant rendering on revisits
          if (convObj) {
            agentChatCache.set(agentUsername, {
              conversation: convObj,
              agent: agentData as User,
              messages: typedMsgs,
            });
          }
        }
      }

      // #region agent log
      fetch('http://127.0.0.1:7247/ingest/10852203-67bc-4ede-9b0a-c6f770a8c961',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useAgentChat.ts:init-end',message:'init completed',data:{agentUsername,convId,aborted,hasAgent:!!agentData},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      setLoading(false);
    }

    init();

    return () => {
      aborted = true;
    };
  }, [supabase, user, agentUsername]);

  // ---------------------------------------------------------------
  // Realtime subscription — keeps message list in sync with the DB
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!conversation) return;

    const channel = supabase
      .channel(`agent-messages:${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        async (payload) => {
          const newId = payload.new.id as string;
          // #region agent log
          fetch('http://127.0.0.1:7247/ingest/10852203-67bc-4ede-9b0a-c6f770a8c961',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useAgentChat.ts:realtime-handler',message:'Realtime INSERT received',data:{newId,streamingRef:streamingMsgIdRef.current},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
          // #endregion

          // Skip if this is the streaming placeholder (not persisted yet)
          if (streamingMsgIdRef.current === newId) return;

          // Fetch the full message with sender info
          const { data } = await supabase
            .from("messages")
            .select(
              `*, sender:users!sender_id (id, username, avatar_url, is_agent)`
            )
            .eq("id", newId)
            .single();

          if (data) {
            setMessages((prev) => {
              // Avoid duplicates — message may already be in local state
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
  }, [supabase, conversation]);

  // ---------------------------------------------------------------
  // Send a user message and stream the AI response
  // ---------------------------------------------------------------
  const sendMessage = useCallback(
    async (content: string) => {
      // #region agent log
      fetch('http://127.0.0.1:7247/ingest/10852203-67bc-4ede-9b0a-c6f770a8c961',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useAgentChat.ts:sendMessage-entry',message:'sendMessage called',data:{hasConversation:!!conversation,hasUser:!!user,hasAgent:!!agent,contentLength:content.length,loading,streaming},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      if (!conversation || !user || !agent) return;

      // --- 1. Persist the user message to DB ---
      const { data: userMsg, error: userMsgErr } = await supabase
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

      // #region agent log
      fetch('http://127.0.0.1:7247/ingest/10852203-67bc-4ede-9b0a-c6f770a8c961',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useAgentChat.ts:sendMessage-db-result',message:'user msg DB insert result',data:{success:!!userMsg,error:userMsgErr?.message??null,msgId:userMsg?.id??null},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
      // #endregion

      if (userMsgErr || !userMsg) {
        console.error(
          "[useAgentChat] Failed to save user message:",
          userMsgErr?.message
        );
        return; // Don't call AI if the user message wasn't saved
      }

      setMessages((prev) => [
        ...prev,
        userMsg as unknown as MessageWithSender,
      ]);

      // --- 2. Build OpenAI conversation history from persisted messages ---
      const history = [
        ...messages.map((m) => ({
          role: (m.sender_id === agent.id ? "assistant" : "user") as
            | "user"
            | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content },
      ];

      // --- 3. Start streaming ---
      setStreaming(true);

      // Create a temporary placeholder for the streaming response
      const streamingId = `streaming-${Date.now()}`;
      streamingMsgIdRef.current = streamingId;

      const streamingMsg: MessageWithSender = {
        id: streamingId,
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
          body: JSON.stringify({ agentUsername, messages: history }),
        });

        if (!res.ok || !res.body) {
          throw new Error("Failed to get response from agent API");
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
                  // Update the streaming placeholder content in real-time
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === streamingId
                        ? { ...m, content: fullContent }
                        : m
                    )
                  );
                }
              } catch {
                // Skip malformed SSE chunks
              }
            }
          }
        }

        // --- 4. Persist the complete agent response to DB ---
        if (fullContent) {
          const { data: agentMsg, error: agentMsgErr } = await supabase
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

          if (agentMsgErr || !agentMsg) {
            console.error(
              "[useAgentChat] Failed to persist agent response:",
              agentMsgErr?.message
            );

            // Retry once after a short delay
            await new Promise((r) => setTimeout(r, 1000));
            const { data: retryMsg, error: retryErr } = await supabase
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

            if (retryErr || !retryMsg) {
              console.error(
                "[useAgentChat] Retry also failed. Agent response was NOT saved to database:",
                retryErr?.message
              );
              // Keep the streaming placeholder so the user can at least see the response
            } else {
              // Replace streaming placeholder with the persisted message
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingId
                    ? (retryMsg as unknown as MessageWithSender)
                    : m
                )
              );
            }
          } else {
            // Replace streaming placeholder with the persisted message
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamingId
                  ? (agentMsg as unknown as MessageWithSender)
                  : m
              )
            );
          }
        }
      } catch (err) {
        console.error("[useAgentChat] Agent chat error:", err);
        // Remove the streaming placeholder on error
        setMessages((prev) => prev.filter((m) => m.id !== streamingId));
      } finally {
        streamingMsgIdRef.current = null;
        setStreaming(false);
      }
    },
    [supabase, conversation, user, agent, messages, agentUsername]
  );

  return { messages, loading, streaming, sendMessage, agent };
}
