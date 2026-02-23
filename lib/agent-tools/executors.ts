/**
 * Server-side executor functions for agent tool calls.
 *
 * Each executor receives parsed arguments and a context object
 * containing the acting user's ID and a Supabase client,
 * then performs the requested operation and returns a structured result.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Execution context passed to every tool executor */
export interface ToolContext {
  /** The human user's UUID — tools act on their behalf */
  userId: string;
  /** Server-side Supabase client */
  supabase: SupabaseClient;
}

/** Standardised result returned by every executor */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ----------------------------------------------------------------
// Shared helpers
// ----------------------------------------------------------------

/**
 * Normalise a user-provided name by stripping leading @/# and trimming.
 *
 * @param name - Raw name from the tool arguments
 * @returns Cleaned name string
 */
function cleanName(name: string): string {
  return name.replace(/^[@#]+/, "").trim();
}

/**
 * Find a user by username with flexible matching.
 *
 * Tries in order:
 * 1. Exact match (after stripping @/#)
 * 2. Case-insensitive match
 *
 * @param supabase - Supabase client
 * @param rawUsername - The username as provided by the AI (may include @)
 * @returns The user row `{ id, username }` or null
 */
async function findUserByUsername(
  supabase: SupabaseClient,
  rawUsername: string
): Promise<{ id: string; username: string } | null> {
  const cleaned = cleanName(rawUsername);

  // 1. Exact match
  const { data: exact } = await supabase
    .from("users")
    .select("id, username")
    .eq("username", cleaned)
    .single();

  if (exact) return exact as { id: string; username: string };

  // 2. Case-insensitive match
  const { data: ilike } = await supabase
    .from("users")
    .select("id, username")
    .ilike("username", cleaned)
    .limit(1)
    .single();

  if (ilike) return ilike as { id: string; username: string };

  return null;
}

/**
 * Find a channel by name with flexible matching.
 *
 * @param supabase - Supabase client
 * @param rawName - The channel name as provided by the AI (may include #)
 * @returns The channel row `{ id, name }` or null
 */
async function findChannelByName(
  supabase: SupabaseClient,
  rawName: string
): Promise<{ id: string; name: string } | null> {
  const cleaned = cleanName(rawName).toLowerCase().replace(/\s+/g, "-");

  const { data: channel } = await supabase
    .from("conversations")
    .select("id, name")
    .eq("type", "channel")
    .eq("name", cleaned)
    .single();

  if (channel) return channel as { id: string; name: string };

  return null;
}

// ----------------------------------------------------------------
// send_message
// ----------------------------------------------------------------

/**
 * Send a message to a channel on behalf of the user.
 *
 * @param args - { channel_name: string, content: string }
 * @param ctx  - Tool execution context
 */
export async function executeSendMessage(
  args: { channel_name: string; content: string },
  ctx: ToolContext
): Promise<ToolResult> {
  const { supabase, userId } = ctx;

  // Find the channel (flexible matching)
  const channel = await findChannelByName(supabase, args.channel_name);

  if (!channel) {
    return {
      success: false,
      error: `Channel "#${cleanName(args.channel_name)}" not found.`,
    };
  }

  // Insert the message
  const { error: msgErr } = await supabase.from("messages").insert({
    conversation_id: channel.id,
    sender_id: userId,
    content: args.content,
  });

  if (msgErr) {
    return { success: false, error: `Failed to send message: ${msgErr.message}` };
  }

  return {
    success: true,
    data: { channel_name: channel.name, message: "Message sent." },
  };
}

// ----------------------------------------------------------------
// send_dm
// ----------------------------------------------------------------

/**
 * Send a direct message to a specific user on behalf of the current user.
 *
 * @param args - { target_username: string, content: string }
 * @param ctx  - Tool execution context
 */
export async function executeSendDm(
  args: { target_username: string; content: string },
  ctx: ToolContext
): Promise<ToolResult> {
  const { supabase, userId } = ctx;

  // Find the target user (flexible matching)
  const targetUser = await findUserByUsername(supabase, args.target_username);

  if (!targetUser) {
    return {
      success: false,
      error: `User "${cleanName(args.target_username)}" not found. Try using list_users to see available usernames.`,
    };
  }

  const targetUserId = targetUser.id;

  // Find or create a DM conversation between the two users
  let dmConversationId: string | null = null;

  // Get conversations the current user is a member of
  const { data: myMemberships } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", userId);

  if (myMemberships && myMemberships.length > 0) {
    const myConvIds = myMemberships.map(
      (m: { conversation_id: string }) => m.conversation_id
    );

    // Check if target user shares a DM conversation
    const { data: sharedMemberships } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", targetUserId)
      .in("conversation_id", myConvIds);

    if (sharedMemberships && sharedMemberships.length > 0) {
      const sharedIds = sharedMemberships.map(
        (m: { conversation_id: string }) => m.conversation_id
      );

      const { data: dmConv } = await supabase
        .from("conversations")
        .select("id")
        .in("id", sharedIds)
        .eq("type", "dm")
        .limit(1)
        .single();

      if (dmConv) {
        dmConversationId = dmConv.id;
      }
    }
  }

  // Create DM if none exists
  if (!dmConversationId) {
    const { data: newConv, error: convErr } = await supabase
      .from("conversations")
      .insert({ type: "dm", name: null })
      .select("id")
      .single();

    if (convErr || !newConv) {
      return {
        success: false,
        error: `Failed to create DM conversation: ${convErr?.message}`,
      };
    }

    dmConversationId = newConv.id;

    // Add both users as members
    await supabase.from("conversation_members").insert([
      { conversation_id: dmConversationId, user_id: userId },
      { conversation_id: dmConversationId, user_id: targetUserId },
    ]);
  }

  // Send the message
  const { error: msgErr } = await supabase.from("messages").insert({
    conversation_id: dmConversationId,
    sender_id: userId,
    content: args.content,
  });

  if (msgErr) {
    return { success: false, error: `Failed to send DM: ${msgErr.message}` };
  }

  return {
    success: true,
    data: {
      target_username: targetUser.username,
      message: `DM sent to ${targetUser.username}.`,
    },
  };
}

// ----------------------------------------------------------------
// get_channel_history
// ----------------------------------------------------------------

/**
 * Retrieve recent messages from a channel.
 *
 * @param args - { channel_name: string, limit?: number }
 * @param ctx  - Tool execution context
 */
export async function executeGetChannelHistory(
  args: { channel_name: string; limit?: number },
  ctx: ToolContext
): Promise<ToolResult> {
  const { supabase } = ctx;
  const limit = Math.min(args.limit ?? 20, 50);

  // Find the channel (flexible matching)
  const channel = await findChannelByName(supabase, args.channel_name);

  if (!channel) {
    return {
      success: false,
      error: `Channel "#${cleanName(args.channel_name)}" not found.`,
    };
  }

  // Fetch messages with sender info
  const { data: messages, error: msgErr } = await supabase
    .from("messages")
    .select("content, created_at, sender:users!sender_id (username, is_agent)")
    .eq("conversation_id", channel.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (msgErr) {
    return {
      success: false,
      error: `Failed to fetch messages: ${msgErr.message}`,
    };
  }

  // Format for readability (reverse to chronological order)
  const formatted = (messages ?? []).reverse().map((m: Record<string, unknown>) => {
    const sender = m.sender as { username: string; is_agent: boolean } | null;
    return {
      sender: sender?.username ?? "unknown",
      content: m.content,
      time: m.created_at,
    };
  });

  return {
    success: true,
    data: {
      channel_name: args.channel_name,
      message_count: formatted.length,
      messages: formatted,
    },
  };
}

// ----------------------------------------------------------------
// get_dm_history
// ----------------------------------------------------------------

/**
 * Retrieve recent DM messages with a specific user.
 *
 * @param args - { target_username: string, limit?: number }
 * @param ctx  - Tool execution context
 */
export async function executeGetDmHistory(
  args: { target_username: string; limit?: number },
  ctx: ToolContext
): Promise<ToolResult> {
  const { supabase, userId } = ctx;
  const limit = Math.min(args.limit ?? 20, 50);

  // Find the target user (flexible matching)
  const targetUser = await findUserByUsername(supabase, args.target_username);

  if (!targetUser) {
    return {
      success: false,
      error: `User "${cleanName(args.target_username)}" not found. Try using list_users to see available usernames.`,
    };
  }

  const targetUserId = targetUser.id;

  // Find shared DM conversation
  const { data: myMemberships } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", userId);

  if (!myMemberships || myMemberships.length === 0) {
    return {
      success: true,
      data: {
        target_username: args.target_username,
        message_count: 0,
        messages: [],
      },
    };
  }

  const myConvIds = myMemberships.map(
    (m: { conversation_id: string }) => m.conversation_id
  );

  const { data: sharedMemberships } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", targetUserId)
    .in("conversation_id", myConvIds);

  if (!sharedMemberships || sharedMemberships.length === 0) {
    return {
      success: true,
      data: {
        target_username: args.target_username,
        message_count: 0,
        messages: [],
      },
    };
  }

  const sharedIds = sharedMemberships.map(
    (m: { conversation_id: string }) => m.conversation_id
  );

  const { data: dmConv } = await supabase
    .from("conversations")
    .select("id")
    .in("id", sharedIds)
    .eq("type", "dm")
    .limit(1)
    .single();

  if (!dmConv) {
    return {
      success: true,
      data: {
        target_username: args.target_username,
        message_count: 0,
        messages: [],
      },
    };
  }

  // Fetch messages
  const { data: messages, error: msgErr } = await supabase
    .from("messages")
    .select("content, created_at, sender:users!sender_id (username)")
    .eq("conversation_id", dmConv.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (msgErr) {
    return {
      success: false,
      error: `Failed to fetch DM history: ${msgErr.message}`,
    };
  }

  const formatted = (messages ?? []).reverse().map((m: Record<string, unknown>) => {
    const sender = m.sender as { username: string } | null;
    return {
      sender: sender?.username ?? "unknown",
      content: m.content,
      time: m.created_at,
    };
  });

  return {
    success: true,
    data: {
      target_username: args.target_username,
      message_count: formatted.length,
      messages: formatted,
    },
  };
}

// ----------------------------------------------------------------
// list_channels
// ----------------------------------------------------------------

/**
 * List all channels in the workspace.
 *
 * @param _args - No arguments needed
 * @param ctx   - Tool execution context
 */
export async function executeListChannels(
  _args: Record<string, never>,
  ctx: ToolContext
): Promise<ToolResult> {
  const { supabase } = ctx;

  const { data: channels, error } = await supabase
    .from("conversations")
    .select("id, name, created_at")
    .eq("type", "channel")
    .order("name", { ascending: true });

  if (error) {
    return {
      success: false,
      error: `Failed to list channels: ${error.message}`,
    };
  }

  return {
    success: true,
    data: {
      channel_count: channels?.length ?? 0,
      channels: (channels ?? []).map((c: { id: string; name: string; created_at: string }) => ({
        name: c.name,
        created_at: c.created_at,
      })),
    },
  };
}

// ----------------------------------------------------------------
// create_channel
// ----------------------------------------------------------------

/**
 * Create a new channel.
 *
 * @param args - { channel_name: string }
 * @param ctx  - Tool execution context
 */
export async function executeCreateChannel(
  args: { channel_name: string },
  ctx: ToolContext
): Promise<ToolResult> {
  const { supabase } = ctx;

  // Normalise channel name: lowercase, spaces → hyphens
  const name = args.channel_name.toLowerCase().replace(/\s+/g, "-");

  // Check for duplicates
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("type", "channel")
    .eq("name", name)
    .single();

  if (existing) {
    return {
      success: false,
      error: `Channel "#${name}" already exists.`,
    };
  }

  const { data: newChannel, error } = await supabase
    .from("conversations")
    .insert({ type: "channel", name })
    .select("id, name")
    .single();

  if (error || !newChannel) {
    return {
      success: false,
      error: `Failed to create channel: ${error?.message}`,
    };
  }

  return {
    success: true,
    data: {
      channel_name: name,
      channel_id: newChannel.id,
      message: `Channel "#${name}" created successfully.`,
      mention_format: `When referring to this channel, write it as: [#${name}](mention://channel/${newChannel.id})`,
    },
  };
}

// ----------------------------------------------------------------
// delete_channel
// ----------------------------------------------------------------

/**
 * Delete an existing channel.
 *
 * @param args - { channel_name: string }
 * @param ctx  - Tool execution context
 */
export async function executeDeleteChannel(
  args: { channel_name: string },
  ctx: ToolContext
): Promise<ToolResult> {
  const { supabase } = ctx;

  // Find the channel (flexible matching)
  const channel = await findChannelByName(supabase, args.channel_name);

  if (!channel) {
    return {
      success: false,
      error: `Channel "#${cleanName(args.channel_name)}" not found.`,
    };
  }

  const { error: delErr } = await supabase
    .from("conversations")
    .delete()
    .eq("id", channel.id);

  if (delErr) {
    return {
      success: false,
      error: `Failed to delete channel: ${delErr.message}`,
    };
  }

  return {
    success: true,
    data: {
      channel_name: args.channel_name,
      message: `Channel "#${args.channel_name}" has been deleted.`,
    },
  };
}

// ----------------------------------------------------------------
// list_users
// ----------------------------------------------------------------

/**
 * List all users in the workspace.
 *
 * @param _args - No arguments needed
 * @param ctx   - Tool execution context
 */
export async function executeListUsers(
  _args: Record<string, never>,
  ctx: ToolContext
): Promise<ToolResult> {
  const { supabase } = ctx;

  const { data: users, error } = await supabase
    .from("users")
    .select("id, username, is_agent, created_at")
    .order("username", { ascending: true });

  if (error) {
    return {
      success: false,
      error: `Failed to list users: ${error.message}`,
    };
  }

  return {
    success: true,
    data: {
      user_count: users?.length ?? 0,
      users: (users ?? []).map(
        (u: { id: string; username: string; is_agent: boolean; created_at: string }) => ({
          username: u.username,
          is_agent: u.is_agent,
          type: u.is_agent ? "AI Agent" : "Human",
        })
      ),
    },
  };
}

// ----------------------------------------------------------------
// list_agent_sessions
// ----------------------------------------------------------------

/**
 * List the current user's agent sessions.
 *
 * @param _args - No arguments needed
 * @param ctx   - Tool execution context
 */
export async function executeListAgentSessions(
  _args: Record<string, never>,
  ctx: ToolContext
): Promise<ToolResult> {
  const { supabase, userId } = ctx;

  // Get all conversations the user is a member of
  const { data: memberships } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", userId);

  if (!memberships || memberships.length === 0) {
    return {
      success: true,
      data: { session_count: 0, sessions: [] },
    };
  }

  const convIds = memberships.map(
    (m: { conversation_id: string }) => m.conversation_id
  );

  // Find agent-type conversations the user is in
  const { data: sessions, error } = await supabase
    .from("conversations")
    .select("id, name, created_at")
    .in("id", convIds)
    .eq("type", "agent")
    .order("created_at", { ascending: false });

  if (error) {
    return {
      success: false,
      error: `Failed to list sessions: ${error.message}`,
    };
  }

  return {
    success: true,
    data: {
      session_count: sessions?.length ?? 0,
      sessions: (sessions ?? []).map(
        (s: { id: string; name: string | null; created_at: string }) => ({
          id: s.id,
          name: s.name ?? "Untitled",
          created_at: s.created_at,
        })
      ),
    },
  };
}

// ----------------------------------------------------------------
// delete_agent_session
// ----------------------------------------------------------------

/**
 * Delete an agent session by its UUID.
 * The model must call list_agent_sessions first to obtain the session_id.
 *
 * @param args - { session_id: string }
 * @param ctx  - Tool execution context
 */
export async function executeDeleteAgentSession(
  args: { session_id: string },
  ctx: ToolContext
): Promise<ToolResult> {
  const { supabase, userId } = ctx;

  if (!args.session_id) {
    return {
      success: false,
      error:
        "session_id is required. " +
        "Call list_agent_sessions first to get session IDs.",
    };
  }

  // Verify the user is a member of this conversation
  const { data: membership } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", userId)
    .eq("conversation_id", args.session_id)
    .maybeSingle();

  if (!membership) {
    return {
      success: false,
      error: `You are not a member of session "${args.session_id}", or it does not exist.`,
    };
  }

  // Verify it is an agent-type conversation
  const { data: session } = await supabase
    .from("conversations")
    .select("id, name")
    .eq("id", args.session_id)
    .eq("type", "agent")
    .maybeSingle();

  if (!session) {
    return {
      success: false,
      error: `Session "${args.session_id}" is not an agent session or does not exist.`,
    };
  }

  // Delete and verify via .select()
  const { data: deleted, error: delErr } = await supabase
    .from("conversations")
    .delete()
    .eq("id", session.id)
    .select("id")
    .maybeSingle();

  if (delErr) {
    return {
      success: false,
      error: `Failed to delete session: ${delErr.message}`,
    };
  }

  if (!deleted) {
    return {
      success: false,
      error:
        `Session "${session.name}" (${session.id}) was found but could not be deleted. ` +
        "It may have already been removed or a database policy is blocking the operation.",
    };
  }

  return {
    success: true,
    data: {
      session_id: session.id,
      session_name: session.name ?? "Untitled",
      message: `Agent session "${session.name}" has been deleted.`,
    },
  };
}
