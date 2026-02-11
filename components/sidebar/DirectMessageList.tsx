"use client";

import { useSupabase } from "@/components/providers/SupabaseProvider";
import { useUser } from "@/components/providers/UserProvider";
import { AGENTS } from "@/lib/constants";
import { useDM } from "@/lib/hooks/useDM";
import { prefetchDM, prefetchAgentChat } from "@/lib/prefetch";
import type { User } from "@/lib/types";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/** Set of predefined AI character agent usernames */
const CHARACTER_AGENT_NAMES = new Set(AGENTS.map((a) => a.username));

interface DirectMessageListProps {
  onNavigate: () => void;
}

/**
 * Maps a user ID to the DM conversation ID for that user.
 * Used to track which conversations have already been created / looked up.
 */
type DmConversationMap = Record<string, string>;

/**
 * Renders every registered (non-agent) user in the Direct Messages section,
 * plus predefined AI character agents (Elon Musk, Steve Jobs, etc.).
 * The current user appears first with a "you" label (self-DM).
 * AI character agents appear after the current user, before other humans.
 * Clicking any user finds or creates a DM conversation and navigates to it.
 * Clicking an AI character navigates to their agent chat page.
 * New users are picked up in real time via a Supabase subscription.
 */
export function DirectMessageList({ onNavigate }: DirectMessageListProps) {
  const supabase = useSupabase();
  const { user } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const { findOrCreateDM } = useDM();

  /** All non-agent users from the database (excluding the current user) */
  const [otherUsers, setOtherUsers] = useState<
    Pick<User, "id" | "username" | "avatar_url">[]
  >([]);

  /** AI character agents from the database */
  const [characterAgents, setCharacterAgents] = useState<
    Pick<User, "id" | "username" | "avatar_url">[]
  >([]);

  /** Reactive map of userId → conversationId for active-state highlighting */
  const [dmMap, setDmMap] = useState<DmConversationMap>({});

  /** The conversation ID the user is currently viewing (derived from the URL) */
  const [activeDmConvId, setActiveDmConvId] = useState<string | null>(null);

  /** The agent username currently active (derived from the URL) */
  const [activeAgentUsername, setActiveAgentUsername] = useState<string | null>(
    null
  );

  // -------------------------------------------------------------------
  // Fetch all non-agent users + AI character agents
  // -------------------------------------------------------------------
  const fetchAllUsers = useCallback(async () => {
    if (!user) return;

    const { data } = await supabase
      .from("users")
      .select("id, username, avatar_url, is_agent")
      .order("username");

    if (!data) return;

    const humans: Pick<User, "id" | "username" | "avatar_url">[] = [];
    const agents: Pick<User, "id" | "username" | "avatar_url">[] = [];

    for (const u of data) {
      if (u.id === user.id) continue;
      if (u.is_agent && CHARACTER_AGENT_NAMES.has(u.username)) {
        agents.push(u);
      } else if (!u.is_agent) {
        humans.push(u);
      }
    }

    setOtherUsers(humans);
    setCharacterAgents(agents);
  }, [supabase, user]);

  useEffect(() => {
    fetchAllUsers();
  }, [fetchAllUsers]);

  // -------------------------------------------------------------------
  // Pre-populate the DM map with existing conversations (for active state
  // highlighting on page reload / initial mount)
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;

    async function buildDmMap() {
      // Get all conversations the current user is a member of
      const { data: memberships } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", user!.id);

      if (!memberships || memberships.length === 0) return;

      const convIds = memberships.map((m) => m.conversation_id);

      // Filter to DM conversations only
      const { data: dmConvs } = await supabase
        .from("conversations")
        .select("id")
        .in("id", convIds)
        .eq("type", "dm");

      if (!dmConvs || dmConvs.length === 0) return;

      const map: DmConversationMap = {};

      for (const conv of dmConvs) {
        const { data: members } = await supabase
          .from("conversation_members")
          .select("user_id")
          .eq("conversation_id", conv.id);

        if (!members) continue;

        if (members.length === 1 && members[0].user_id === user!.id) {
          // Self-DM
          map[user!.id] = conv.id;
        } else {
          // Regular DM — map the *other* user's ID to this conversation
          const other = members.find((m) => m.user_id !== user!.id);
          if (other) {
            map[other.user_id] = conv.id;
          }
        }
      }

      setDmMap((prev) => ({ ...prev, ...map }));
    }

    buildDmMap();
  }, [supabase, user]);

  // -------------------------------------------------------------------
  // Real-time subscription: automatically add / update / remove users
  // -------------------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel("dm-users-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "users" },
        () => {
          // Re-fetch the full list on any change (insert / update / delete)
          fetchAllUsers();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchAllUsers]);

  // -------------------------------------------------------------------
  // Resolve the active DM conversation or agent page from the URL
  // -------------------------------------------------------------------
  useEffect(() => {
    const dmMatch = pathname.match(/^\/chat\/dm\/(.+)$/);
    setActiveDmConvId(dmMatch ? dmMatch[1] : null);

    const agentMatch = pathname.match(/^\/chat\/agent\/([^/]+)$/);
    setActiveAgentUsername(
      agentMatch ? decodeURIComponent(agentMatch[1]) : null
    );
  }, [pathname]);

  // -------------------------------------------------------------------
  // Click handler — find or create DM and navigate
  // -------------------------------------------------------------------
  /**
   * Opens (or creates) a DM conversation with the given user and navigates to it.
   * @param targetUserId - The user to DM
   */
  const handleUserClick = async (targetUserId: string) => {
    // Use cached conversation ID if we already have one
    const cached = dmMap[targetUserId];
    if (cached) {
      router.push(`/chat/dm/${cached}`);
      onNavigate();
      return;
    }

    const convId = await findOrCreateDM(targetUserId);
    if (convId) {
      setDmMap((prev) => ({ ...prev, [targetUserId]: convId }));
      router.push(`/chat/dm/${convId}`);
      onNavigate();
    }
  };

  if (!user) return null;

  return (
    <>
      {/* Current user — shown first with "you" label (self-DM) */}
      <button
        onClick={() => handleUserClick(user.id)}
        onMouseEnter={() => {
          const convId = dmMap[user.id];
          if (convId) prefetchDM(supabase, convId);
        }}
        className={`
          flex h-[28px] w-full min-w-0 items-center gap-2 rounded-[6px] px-3 text-left
          ${
            activeDmConvId && dmMap[user.id] === activeDmConvId
              ? "bg-[var(--color-slack-sidebar-selected)] text-[var(--color-slack-sidebar-selected-text)]"
              : "text-[var(--color-slack-sidebar-text)] hover:bg-white/5"
          }
        `}
      >
        <DmAvatar avatarUrl={user.avatar_url} username={user.username} />
        <span className="flex min-w-0 flex-1 items-center text-[15px] leading-[17px]">
          <span className="truncate">{user.username}</span>
          <span className="shrink-0 ml-1 opacity-70">you</span>
        </span>
      </button>

      {/* AI character agents — shown before human users */}
      {characterAgents.map((a) => {
        const href = `/chat/agent/${encodeURIComponent(a.username)}`;
        const isActive = activeAgentUsername === a.username;

        return (
          <Link
            key={a.id}
            href={href}
            onClick={onNavigate}
            onMouseEnter={() => {
              if (user) prefetchAgentChat(supabase, a.username, user.id);
            }}
            className={`
              flex h-[28px] w-full min-w-0 items-center gap-2 rounded-[6px] px-3 text-left
              ${
                isActive
                  ? "bg-[var(--color-slack-sidebar-selected)] text-[var(--color-slack-sidebar-selected-text)]"
                  : "text-[var(--color-slack-sidebar-text)] hover:bg-white/5"
              }
            `}
          >
            <DmAvatar avatarUrl={a.avatar_url} username={a.username} />
            <span className="min-w-0 flex-1 truncate text-[15px] leading-[17px]">
              {a.username}
            </span>
          </Link>
        );
      })}

      {/* All other registered human users */}
      {otherUsers.map((u) => {
        const convId = dmMap[u.id];
        const isActive = !!convId && convId === activeDmConvId;

        return (
          <button
            key={u.id}
            onClick={() => handleUserClick(u.id)}
            onMouseEnter={() => {
              const convId = dmMap[u.id];
              if (convId) prefetchDM(supabase, convId);
            }}
            className={`
              flex h-[28px] w-full min-w-0 items-center gap-2 rounded-[6px] px-3 text-left
              ${
                isActive
                  ? "bg-[var(--color-slack-sidebar-selected)] text-[var(--color-slack-sidebar-selected-text)]"
                  : "text-[var(--color-slack-sidebar-text)] hover:bg-white/5"
              }
            `}
          >
            <DmAvatar avatarUrl={u.avatar_url} username={u.username} />
            <span className="min-w-0 flex-1 truncate text-[15px] leading-[17px]">
              {u.username}
            </span>
          </button>
        );
      })}
    </>
  );
}

/**
 * Avatar for DM entries.
 */
function DmAvatar({
  avatarUrl,
  username,
}: {
  avatarUrl: string | null;
  username: string;
}) {
  return (
    <div className="h-5 w-5 shrink-0 overflow-hidden rounded-[3px]">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={username}
          width={20}
          height={20}
          className="object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[#ffd57e] text-[10px] font-bold text-[#3f0e40]">
          {username[0]?.toUpperCase()}
        </div>
      )}
    </div>
  );
}
