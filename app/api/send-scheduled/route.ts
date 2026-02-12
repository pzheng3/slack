import { createServerClient } from "@/lib/supabase/server";
import { GENERIC_AGENT } from "@/lib/constants";
import { NextResponse } from "next/server";

/**
 * POST /api/send-scheduled
 *
 * Processes all due scheduled messages (status = 'pending', send_at <= now).
 * For each message:
 * - If conversation_id exists: inserts directly into `messages` table
 * - If recipient_type = 'new_agent': creates a new agent session first,
 *   inserts the message, then dispatches a notification event via realtime
 * - Marks the scheduled_message as 'sent'
 *
 * Called periodically by the client-side polling mechanism (~30s interval).
 */
export async function POST() {
  const supabase = createServerClient();

  // Fetch all pending messages that are due
  const { data: dueMessages, error: fetchError } = await supabase
    .from("scheduled_messages")
    .select("*")
    .eq("status", "pending")
    .lte("send_at", new Date().toISOString())
    .order("send_at", { ascending: true });

  if (fetchError) {
    console.error("Failed to fetch due scheduled messages:", fetchError.message);
    return NextResponse.json(
      { error: "Failed to fetch scheduled messages" },
      { status: 500 }
    );
  }

  if (!dueMessages || dueMessages.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  let sentCount = 0;

  for (const scheduled of dueMessages) {
    try {
      let conversationId = scheduled.conversation_id;

      // --- Handle new agent session creation ---
      if (!conversationId && scheduled.recipient_type === "new_agent") {
        conversationId = await createAgentSession(
          supabase,
          scheduled.sender_id,
          scheduled.recipient_label || "Scheduled Agent"
        );

        if (!conversationId) {
          console.error(
            `Failed to create agent session for scheduled message ${scheduled.id}`
          );
          continue;
        }

        // Update the scheduled message with the new conversation_id
        await supabase
          .from("scheduled_messages")
          .update({ conversation_id: conversationId })
          .eq("id", scheduled.id);
      }

      if (!conversationId) {
        console.error(
          `No conversation_id for scheduled message ${scheduled.id}`
        );
        continue;
      }

      // --- Insert the message ---
      const { error: insertError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: scheduled.sender_id,
        content: scheduled.content,
      });

      if (insertError) {
        console.error(
          `Failed to send scheduled message ${scheduled.id}:`,
          insertError.message
        );
        continue;
      }

      // --- Mark as sent ---
      await supabase
        .from("scheduled_messages")
        .update({ status: "sent" })
        .eq("id", scheduled.id);

      sentCount++;
    } catch (err) {
      console.error(
        `Error processing scheduled message ${scheduled.id}:`,
        err
      );
    }
  }

  return NextResponse.json({ sent: sentCount });
}

/**
 * Creates a new agent session (conversation + members) for a scheduled message.
 * Mirrors the logic in useAgentSessions.createSession but runs server-side.
 *
 * @param supabase - The Supabase server client
 * @param userId   - The sender's user ID
 * @param name     - The session name
 * @returns The new conversation ID, or null on failure
 */
async function createAgentSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  name: string
): Promise<string | null> {
  // Resolve the generic agent
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

  // Create the conversation
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({ type: "agent", name })
    .select()
    .single();

  if (convError || !conversation) {
    console.error("Failed to create session:", convError?.message);
    return null;
  }

  // Add members
  const { error: memberError } = await supabase
    .from("conversation_members")
    .insert([
      { conversation_id: conversation.id, user_id: userId },
      { conversation_id: conversation.id, user_id: agentId },
    ]);

  if (memberError) {
    console.error("Failed to add members:", memberError.message);
    return null;
  }

  return conversation.id;
}
