"use client";

import { useSupabase } from "@/components/providers/SupabaseProvider";
import { useUser } from "@/components/providers/UserProvider";
import { CHANNELS, GENERIC_AGENT } from "@/lib/constants";
import type { Conversation } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Represents a user-created agent session */
export interface AgentSession {
  id: string;
  name: string;
  created_at: string;
}

/**
 * Hook for managing user-created agent sessions.
 * Fetches existing sessions from Supabase and provides a method to create
 * new ones. Sessions are conversations of type 'agent' that pair the current
 * user with the generic "AI Assistant" agent.
 */
export function useAgentSessions() {
  const supabase = useSupabase();
  const { user } = useUser();
  const router = useRouter();
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * Fetch all agent sessions the current user belongs to (those that also
   * include the generic AI Assistant agent).
   */
  const fetchSessions = useCallback(async () => {
    if (!user) return;

    // Get all conversation IDs the user is a member of
    const { data: memberships } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", user.id);

    if (!memberships || memberships.length === 0) {
      setSessions([]);
      setLoading(false);
      return;
    }

    const convIds = memberships.map((m) => m.conversation_id);

    // Find the generic AI Assistant agent
    const { data: genericAgent } = await supabase
      .from("users")
      .select("id")
      .eq("username", GENERIC_AGENT.username)
      .eq("is_agent", true)
      .single();

    if (!genericAgent) {
      setSessions([]);
      setLoading(false);
      return;
    }

    // Get conversations that are agent-type AND include the generic agent
    const { data: agentMemberships } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", genericAgent.id)
      .in("conversation_id", convIds);

    if (!agentMemberships || agentMemberships.length === 0) {
      setSessions([]);
      setLoading(false);
      return;
    }

    const sharedIds = agentMemberships.map((m) => m.conversation_id);

    const { data: conversations } = await supabase
      .from("conversations")
      .select("*")
      .in("id", sharedIds)
      .eq("type", "agent")
      .order("created_at", { ascending: false });

    if (conversations) {
      setSessions(
        conversations.map((c: Conversation) => ({
          id: c.id,
          name: c.name || "Untitled session",
          created_at: c.created_at,
        }))
      );
    }

    setLoading(false);
  }, [supabase, user]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  /**
   * Listen for "agent-session-renamed" custom events dispatched by
   * useSessionChat so the sidebar reflects name changes immediately.
   */
  useEffect(() => {
    const handleRenamed = (e: Event) => {
      const { sessionId, name } = (e as CustomEvent).detail;
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, name } : s))
      );
    };

    window.addEventListener("agent-session-renamed", handleRenamed);
    return () =>
      window.removeEventListener("agent-session-renamed", handleRenamed);
  }, []);

  /**
   * Listen for "agent-session-deleted" custom events dispatched by
   * useSessionChat when an empty session is auto-cleaned on unmount.
   */
  useEffect(() => {
    const handleDeleted = (e: Event) => {
      const { sessionId } = (e as CustomEvent).detail;
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    };

    window.addEventListener("agent-session-deleted", handleDeleted);
    return () =>
      window.removeEventListener("agent-session-deleted", handleDeleted);
  }, []);

  /**
   * Listen for "agent-session-created" custom events dispatched by
   * createSession so that OTHER hook instances (e.g. the sidebar) pick
   * up newly created sessions immediately without a full refetch.
   */
  useEffect(() => {
    const handleCreated = (e: Event) => {
      const session = (e as CustomEvent).detail as AgentSession;
      setSessions((prev) => {
        // Guard against duplicates (the instance that called createSession
        // already inserted via setSessions inside createSession itself).
        if (prev.some((s) => s.id === session.id)) return prev;
        return [session, ...prev];
      });
    };

    window.addEventListener("agent-session-created", handleCreated);
    return () =>
      window.removeEventListener("agent-session-created", handleCreated);
  }, []);

  /**
   * Options for {@link createSession}.
   */
  interface CreateSessionOptions {
    /** Skip the default "Hey! How can I help you?" greeting message. */
    skipGreeting?: boolean;
    /** Skip the automatic `router.push` to the new session page. */
    skipNavigation?: boolean;
  }

  /**
   * Create a new agent session.
   *
   * 1. Finds (or auto-creates) the generic "Slack Agent" agent user.
   * 2. Creates a conversation with type='agent' and the given name.
   * 3. Adds the current user + agent as conversation members.
   * 4. (Optional) Inserts the initial greeting message from the agent.
   * 5. Updates local state.
   * 6. (Optional) Navigates to the new session page.
   *
   * @param sessionName - The name for the new session
   * @param options     - Optional flags to skip the greeting or navigation
   * @returns The new conversation ID, or null on failure
   */
  const createSession = useCallback(
    async (
      sessionName: string,
      options?: CreateSessionOptions
    ): Promise<string | null> => {
      if (!user) return null;

      // --- Resolve the generic agent ID ---
      let agentId: string;

      const { data: existingAgent } = await supabase
        .from("users")
        .select("id")
        .eq("username", GENERIC_AGENT.username)
        .eq("is_agent", true)
        .single();

      if (existingAgent) {
        agentId = existingAgent.id;
      } else {
        // Auto-create the generic agent if it hasn't been seeded yet
        const { data: newAgent, error } = await supabase
          .from("users")
          .insert({
            username: GENERIC_AGENT.username,
            avatar_url: GENERIC_AGENT.avatar_url,
            is_agent: true,
          })
          .select()
          .single();

        if (error || !newAgent) {
          console.error("Failed to create generic agent:", error?.message);
          return null;
        }
        agentId = newAgent.id;
      }

      // --- Create the conversation ---
      const { data: conversation, error: convError } = await supabase
        .from("conversations")
        .insert({ type: "agent", name: sessionName })
        .select()
        .single();

      if (convError || !conversation) {
        console.error("Failed to create session:", convError?.message);
        return null;
      }

      // --- Add both user and agent as members ---
      const { error: memberError } = await supabase
        .from("conversation_members")
        .insert([
          { conversation_id: conversation.id, user_id: user.id },
          { conversation_id: conversation.id, user_id: agentId },
        ]);

      if (memberError) {
        console.error("Failed to add members:", memberError.message);
        return null;
      }

      // --- Insert initial greeting message from the agent (unless skipped) ---
      if (!options?.skipGreeting) {
        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          sender_id: agentId,
          content: "Hey! How can I help you?",
        });
      }

      // --- Update local state ---
      const newSession = {
        id: conversation.id,
        name: sessionName,
        created_at: conversation.created_at,
      };
      setSessions((prev) => [newSession, ...prev]);

      // --- Notify other hook instances (e.g. the sidebar) ---
      window.dispatchEvent(
        new CustomEvent("agent-session-created", { detail: newSession })
      );

      // --- Navigate to the new session (unless skipped) ---
      if (!options?.skipNavigation) {
        router.push(`/chat/agent/session/${conversation.id}`);
      }

      return conversation.id;
    },
    [supabase, user, router]
  );

  /**
   * Delete an agent session by removing the conversation row.
   * Related conversation_members and messages are cascade-deleted by the DB.
   * If the deleted session is the one currently viewed, navigates to the next
   * session in the list (or the previous one if it was the last item).
   * Falls back to /chat if no other sessions remain.
   *
   * @param sessionId - The ID of the session to delete
   */
  const deleteSession = useCallback(
    async (sessionId: string) => {
      // Determine the redirect target before mutating state
      const isViewing = window.location.pathname.includes(sessionId);
      let redirectTo: string | null = null;

      if (isViewing) {
        const idx = sessions.findIndex((s) => s.id === sessionId);
        // Prefer the next session; fall back to the previous one
        const next = sessions[idx + 1] ?? sessions[idx - 1];
        redirectTo = next
          ? `/chat/agent/session/${next.id}`
          : `/chat/channel/${CHANNELS[0]}`;
      }

      const { error } = await supabase
        .from("conversations")
        .delete()
        .eq("id", sessionId);

      if (error) {
        console.error("Failed to delete session:", error.message);
        return;
      }

      // Remove from local state
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));

      // Navigate to the determined target
      if (redirectTo) {
        router.push(redirectTo);
      }
    },
    [supabase, router, sessions]
  );

  return { sessions, loading, createSession, deleteSession, refreshSessions: fetchSessions };
}
