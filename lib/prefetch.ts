/**
 * Prefetch utilities for warming in-memory caches on hover / intent.
 *
 * When the user hovers over a sidebar item, these functions fire the same
 * Supabase queries the page hooks would run — but earlier. The results are
 * stored in the module-level caches that `useChannelConversation`,
 * `useMessages`, `useConversationById`, `useAgentChat`, and `useSessionChat`
 * read from during their initial `useState` call. Because the cache is warm
 * by the time the hook mounts, `loading` starts as `false` and the page
 * renders instantly — no spinner.
 *
 * A de-duplication guard (`inflight`) prevents concurrent fetches for the
 * same resource.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  channelCache,
  conversationByIdCache,
} from "@/lib/hooks/useConversation";
import { messagesCache } from "@/lib/hooks/useMessages";
import { sessionChatCache } from "@/lib/hooks/useSessionChat";
import { agentChatCache } from "@/lib/hooks/useAgentChat";
import type { Conversation, MessageWithSender, User } from "@/lib/types";
import { GENERIC_AGENT } from "@/lib/constants";

/** Keys currently being fetched — prevents duplicate concurrent requests. */
const inflight = new Set<string>();

/* ------------------------------------------------------------------ */
/*  Shared helper: fetch messages for a conversation                   */
/* ------------------------------------------------------------------ */

/**
 * Fetch messages for a conversation and store them in `messagesCache`.
 *
 * @param supabase - The Supabase client
 * @param conversationId - The conversation to fetch messages for
 */
async function prefetchMessages(
  supabase: SupabaseClient,
  conversationId: string
) {
  if (messagesCache.has(conversationId)) return;

  const { data } = await supabase
    .from("messages")
    .select(
      `*, sender:users!sender_id (id, username, avatar_url, is_agent)`
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (data) {
    messagesCache.set(conversationId, data as unknown as MessageWithSender[]);
  }
}

/* ------------------------------------------------------------------ */
/*  Channel prefetch                                                   */
/* ------------------------------------------------------------------ */

/**
 * Prefetch a channel's conversation metadata and messages.
 *
 * If `useChannels` has already populated the `channelCache` (which it does
 * eagerly), this skips the conversation lookup and jumps straight to
 * messages — making the prefetch a single network request.
 *
 * @param supabase - The Supabase client
 * @param channelName - The channel name (e.g. "general")
 */
export async function prefetchChannel(
  supabase: SupabaseClient,
  channelName: string
) {
  const key = `channel:${channelName}`;
  if (inflight.has(key)) return;
  inflight.add(key);

  try {
    // Resolve conversation (may already be cached by useChannels)
    let conv = channelCache.get(channelName);

    if (!conv) {
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .eq("type", "channel")
        .eq("name", channelName)
        .single();

      if (data) {
        conv = data as Conversation;
        channelCache.set(channelName, conv);
      }
    }

    if (conv) {
      await prefetchMessages(supabase, conv.id);
    }
  } finally {
    inflight.delete(key);
  }
}

/* ------------------------------------------------------------------ */
/*  DM prefetch                                                        */
/* ------------------------------------------------------------------ */

/**
 * Prefetch a direct message conversation's metadata and messages.
 *
 * @param supabase - The Supabase client
 * @param conversationId - The DM conversation UUID
 */
export async function prefetchDM(
  supabase: SupabaseClient,
  conversationId: string
) {
  const key = `dm:${conversationId}`;
  if (inflight.has(key)) return;
  inflight.add(key);

  try {
    // Conversation metadata
    if (!conversationByIdCache.has(conversationId)) {
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", conversationId)
        .single();

      if (data) {
        conversationByIdCache.set(conversationId, data as Conversation);
      }
    }

    // Messages
    await prefetchMessages(supabase, conversationId);
  } finally {
    inflight.delete(key);
  }
}

/* ------------------------------------------------------------------ */
/*  Agent chat prefetch                                                */
/* ------------------------------------------------------------------ */

/**
 * Prefetch an agent chat (character agent like Elon Musk, Steve Jobs).
 *
 * Replicates the init sequence from `useAgentChat`:
 * 1. Find agent user
 * 2. Find shared conversation via memberships
 * 3. Load messages
 *
 * @param supabase - The Supabase client
 * @param agentUsername - The agent's username
 * @param userId - The current user's ID
 */
export async function prefetchAgentChat(
  supabase: SupabaseClient,
  agentUsername: string,
  userId: string
) {
  const key = `agent:${agentUsername}`;
  if (inflight.has(key) || agentChatCache.has(agentUsername)) return;
  inflight.add(key);

  try {
    // 1. Find agent
    const { data: agentData } = await supabase
      .from("users")
      .select("*")
      .eq("username", agentUsername)
      .eq("is_agent", true)
      .single();

    if (!agentData) return;

    // 2. Find shared conversation
    const { data: myMemberships } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", userId);

    if (!myMemberships || myMemberships.length === 0) return;

    const myConvIds = myMemberships.map((m) => m.conversation_id);

    const { data: agentMemberships } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", agentData.id)
      .in("conversation_id", myConvIds);

    if (!agentMemberships || agentMemberships.length === 0) return;

    const sharedIds = agentMemberships.map((m) => m.conversation_id);

    const { data: agentConv } = await supabase
      .from("conversations")
      .select("*")
      .in("id", sharedIds)
      .eq("type", "agent")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (!agentConv) return;

    // 3. Fetch messages
    const { data: msgs } = await supabase
      .from("messages")
      .select(
        `*, sender:users!sender_id (id, username, avatar_url, is_agent)`
      )
      .eq("conversation_id", agentConv.id)
      .order("created_at", { ascending: true })
      .limit(200);

    const typedMsgs = (msgs as unknown as MessageWithSender[]) ?? [];

    // Populate the agentChatCache
    agentChatCache.set(agentUsername, {
      conversation: agentConv as Conversation,
      agent: agentData as User,
      messages: typedMsgs,
    });
  } finally {
    inflight.delete(key);
  }
}

/* ------------------------------------------------------------------ */
/*  Session chat prefetch                                              */
/* ------------------------------------------------------------------ */

/**
 * Prefetch a session-based agent chat (user-created AI sessions).
 *
 * @param supabase - The Supabase client
 * @param sessionId - The session / conversation UUID
 */
export async function prefetchSessionChat(
  supabase: SupabaseClient,
  sessionId: string
) {
  const key = `session:${sessionId}`;
  if (inflight.has(key) || sessionChatCache.has(sessionId)) return;
  inflight.add(key);

  try {
    // Fetch conversation
    const { data: conv } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", sessionId)
      .eq("type", "agent")
      .single();

    if (!conv) return;

    // Find the generic AI assistant agent
    const { data: agentData } = await supabase
      .from("users")
      .select("*")
      .eq("username", GENERIC_AGENT.username)
      .eq("is_agent", true)
      .single();

    if (!agentData) return;

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

    sessionChatCache.set(sessionId, {
      conversation: conv as Conversation,
      agent: agentData as User,
      messages: typedMsgs,
    });
  } finally {
    inflight.delete(key);
  }
}
