"use client";

import { useSupabase } from "@/components/providers/SupabaseProvider";
import { useUser } from "@/components/providers/UserProvider";
import { AGENTS, GENERIC_AGENT } from "@/lib/constants";
import { useCallback, useEffect, useState } from "react";

/**
 * Category a mention item belongs to.
 * Used for tab filtering in the mention dropdown.
 */
export type MentionCategory = "agent" | "people" | "channel" | "app";

/**
 * A single item that can be mentioned via @.
 * Covers users, agent sessions, channels, and apps.
 */
export interface MentionItem {
  /** Unique identifier (user id, conversation id, or app slug) */
  id: string;
  /** Display label (username, session name, channel name, app name) */
  label: string;
  /** Avatar URL or null */
  avatar_url: string | null;
  /** Which tab category this item belongs to */
  category: MentionCategory;
  /** ISO timestamp for recency sorting (created_at or last message) */
  timestamp: string;
  /**
   * Extra text that should be searchable but not displayed.
   * For agent sessions this contains concatenated message content
   * so that @search matches on message bodies too.
   */
  searchableContent?: string;
}

/** Static app entries that can be mentioned. */
const APP_ITEMS: MentionItem[] = [
  {
    id: "app-cursor",
    label: "Cursor",
    avatar_url: "/images/Cursor logo.png",
    category: "app",
    timestamp: new Date().toISOString(),
  },
  {
    id: "app-notion",
    label: "Notion",
    avatar_url: "/images/Notion logo.png",
    category: "app",
    timestamp: new Date().toISOString(),
  },
  {
    id: "app-figma",
    label: "Figma",
    avatar_url: "/images/Figma logo.png",
    category: "app",
    timestamp: new Date().toISOString(),
  },
];

/**
 * Hook that fetches all mentionable entities from the database and
 * subscribes to Supabase Realtime so the list stays in sync with the
 * sidebar. Any INSERT / UPDATE / DELETE on `users`, `conversations`,
 * or `conversation_members` triggers a re-fetch, as does the custom
 * `agent-session-renamed` DOM event dispatched by the sidebar.
 *
 * @returns The full list of mentionable items across all categories
 */
export function useMentionSuggestions(): MentionItem[] {
  const supabase = useSupabase();
  const { user } = useUser();
  const [items, setItems] = useState<MentionItem[]>([]);

  /**
   * Fetch all mentionable entities from Supabase.
   * Extracted as a callback so realtime listeners can re-invoke it.
   *
   * Timestamps are set to the **latest message** in the relevant
   * conversation so that the Recent tab sorts by actual interaction
   * recency (e.g. sending a message in a channel makes it the most
   * recent item). Falls back to `created_at` when there are no messages.
   */
  const fetchAll = useCallback(async () => {
    if (!user) return;

    /* ── 1. User's conversation memberships ── */
    const { data: memberships } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", user.id);

    const userConvIds =
      memberships && memberships.length > 0
        ? memberships.map((m) => m.conversation_id)
        : [];

    /* ── 2. Parallel: all users, user's conversations, AND all channels ── */
    const [usersRes, convsRes, channelsRes] = await Promise.all([
      supabase
        .from("users")
        .select("id, username, avatar_url, is_agent, created_at"),
      userConvIds.length > 0
        ? supabase
            .from("conversations")
            .select("id, type, name, created_at")
            .in("id", userConvIds)
        : Promise.resolve({ data: [] as { id: string; type: string; name: string | null; created_at: string }[] }),
      // Channels may not have conversation_members rows, so fetch them separately
      supabase
        .from("conversations")
        .select("id, type, name, created_at")
        .eq("type", "channel"),
    ]);

    const allUsers = usersRes.data ?? [];

    // Merge membership-based conversations with all channels (deduplicate by id)
    const convById = new Map<string, { id: string; type: string; name: string | null; created_at: string }>();
    for (const c of convsRes.data ?? []) {
      convById.set(c.id, c);
    }
    for (const c of channelsRes.data ?? []) {
      if (!convById.has(c.id)) convById.set(c.id, c);
    }
    const conversations = Array.from(convById.values());

    // Collect all conversation IDs (including channels not in memberships)
    const allConvIds = conversations.map((c) => c.id);

    /* ── 3. Fetch messages for timestamp + searchable content ── */
    const latestMsgMap: Record<string, string> = {};
    const contentMap: Record<string, string[]> = {};

    if (allConvIds.length > 0) {
      const { data: messages } = await supabase
        .from("messages")
        .select("conversation_id, content, created_at")
        .in("conversation_id", allConvIds)
        .order("created_at", { ascending: false });

      if (messages) {
        for (const msg of messages) {
          // First message per conversation is the latest (ordered desc)
          if (!latestMsgMap[msg.conversation_id]) {
            latestMsgMap[msg.conversation_id] = msg.created_at;
          }
          if (!contentMap[msg.conversation_id]) {
            contentMap[msg.conversation_id] = [];
          }
          contentMap[msg.conversation_id].push(msg.content);
        }
      }
    }

    /* ── 4. Identify generic agent + its shared conversations ── */
    const genericAgent = allUsers.find(
      (u) => u.username === GENERIC_AGENT.username && u.is_agent
    );

    let agentConvIdSet = new Set<string>();
    if (genericAgent && userConvIds.length > 0) {
      const { data: agentMemberships } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", genericAgent.id)
        .in("conversation_id", userConvIds);
      if (agentMemberships) {
        agentConvIdSet = new Set(
          agentMemberships.map((m) => m.conversation_id)
        );
      }
    }

    /* ── 5. Map DM conversations to the "other" member ── */
    const dmConvIds = conversations
      .filter((c) => c.type === "dm")
      .map((c) => c.id);

    const dmOtherMemberMap: Record<string, string> = {};
    if (dmConvIds.length > 0) {
      const { data: dmMembers } = await supabase
        .from("conversation_members")
        .select("conversation_id, user_id")
        .in("conversation_id", dmConvIds)
        .neq("user_id", user.id);
      if (dmMembers) {
        for (const m of dmMembers) {
          dmOtherMemberMap[m.conversation_id] = m.user_id;
        }
      }
    }

    /* ── 6. Build mention items ── */
    const result: MentionItem[] = [];

    /** Per-person timestamp derived from the latest DM message. */
    const peopleDmTimestamp: Record<string, string> = {};

    for (const conv of conversations) {
      const ts = latestMsgMap[conv.id] ?? conv.created_at;

      if (conv.type === "channel") {
        result.push({
          id: conv.id,
          label: conv.name || "channel",
          avatar_url: null,
          category: "channel",
          timestamp: ts,
        });
      } else if (conv.type === "agent" && agentConvIdSet.has(conv.id)) {
        result.push({
          id: conv.id,
          label: conv.name || "Agent Session",
          avatar_url: "/images/Slackbot.png",
          category: "agent",
          timestamp: ts,
          searchableContent: contentMap[conv.id]?.join(" ") ?? "",
        });
      } else if (conv.type === "dm") {
        const otherId = dmOtherMemberMap[conv.id];
        if (otherId) {
          if (!peopleDmTimestamp[otherId] || ts > peopleDmTimestamp[otherId]) {
            peopleDmTimestamp[otherId] = ts;
          }
        }
      }
    }

    // Set of predefined AI agent usernames (Elon Musk, Steve Jobs, etc.)
    const characterAgentUsernames = new Set(AGENTS.map((a) => a.username));

    // People — all non-agent users + predefined AI character agents
    // (Character agents appear in the DM list and are mentionable as people)
    for (const u of allUsers) {
      if (!u.is_agent || characterAgentUsernames.has(u.username)) {
        result.push({
          id: u.id,
          label: u.username,
          avatar_url: u.avatar_url,
          category: "people",
          timestamp: peopleDmTimestamp[u.id] ?? u.created_at,
        });
      }
    }

    // Apps (static)
    result.push(...APP_ITEMS);

    // Sort everything by interaction recency so every tab/view is ordered
    result.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    setItems(result);
  }, [supabase, user]);

  /** Initial fetch. */
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /**
   * Subscribe to Supabase Realtime on the tables that drive the mention
   * list. Any change triggers a full re-fetch so the list matches the
   * sidebar exactly.
   */
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("mention-suggestions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "users" },
        () => fetchAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => fetchAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_members" },
        () => fetchAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => fetchAll()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, user, fetchAll]);

  /**
   * Listen for the custom "agent-session-renamed" DOM event that the
   * sidebar dispatches when a session name changes — keeps labels in
   * sync even before the Realtime UPDATE arrives.
   */
  useEffect(() => {
    const handler = () => fetchAll();
    window.addEventListener("agent-session-renamed", handler);
    return () => window.removeEventListener("agent-session-renamed", handler);
  }, [fetchAll]);

  return items;
}
