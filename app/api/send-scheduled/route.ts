import { createServerClient } from "@/lib/supabase/server";
import { AGENTS, GENERIC_AGENT } from "@/lib/constants";
import {
  AGENT_FUNCTION_TOOLS,
  executeToolCall,
} from "@/lib/agent-tools";
import type { ToolContext } from "@/lib/agent-tools";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

/** Maximum number of agentic loop iterations to prevent runaway loops */
const MAX_TOOL_ROUNDS = 5;

/**
 * GET /api/send-scheduled
 *
 * Entry point for Vercel Cron. Verifies the CRON_SECRET header and then
 * delegates to the shared processing logic.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return processDueMessages();
}

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
 * Called periodically by the client-side polling mechanism and by
 * the Vercel Cron job (via GET).
 */
export async function POST() {
  return processDueMessages();
}

/**
 * Shared logic: fetch all due pending scheduled messages and send them.
 */
async function processDueMessages() {
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

        await supabase
          .from("scheduled_messages")
          .update({ conversation_id: conversationId })
          .eq("id", scheduled.id);
      }

      // --- Handle character agents (Elon Musk, Steve Jobs, etc.) ---
      // These are scheduled with recipient_type "people" and a null
      // conversation_id because the conversation is lazily created by
      // useAgentChat on the client. Resolve it server-side here.
      if (
        !conversationId &&
        scheduled.recipient_type === "people" &&
        scheduled.recipient_id
      ) {
        conversationId = await findOrCreateCharacterAgentConversation(
          supabase,
          scheduled.sender_id,
          scheduled.recipient_id,
          scheduled.recipient_label
        );

        if (conversationId) {
          await supabase
            .from("scheduled_messages")
            .update({ conversation_id: conversationId })
            .eq("id", scheduled.id);
        }
      }

      if (!conversationId) {
        console.error(
          `No conversation_id for scheduled message ${scheduled.id}`
        );
        continue;
      }

      // --- Guard against race with reschedule / cancel ---
      // The user may have rescheduled or cancelled this message after we
      // fetched the due batch. Re-check the DB to avoid sending a message
      // that is no longer due.
      const { data: freshMsg } = await supabase
        .from("scheduled_messages")
        .select("status, send_at")
        .eq("id", scheduled.id)
        .single();

      if (
        !freshMsg ||
        freshMsg.status !== "pending" ||
        new Date(freshMsg.send_at) > new Date()
      ) {
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

      // --- Trigger AI reply for agent conversations ---
      if (
        scheduled.recipient_type === "agent" ||
        scheduled.recipient_type === "new_agent" ||
        scheduled.recipient_type === "people"
      ) {
        try {
          await triggerAgentReply(
            supabase,
            conversationId,
            scheduled.sender_id
          );
        } catch (aiErr) {
          console.error(
            `Failed to trigger AI reply for scheduled message ${scheduled.id}:`,
            aiErr
          );
        }
      }

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
 * After a scheduled message is inserted into an agent conversation, call
 * OpenAI to generate the agent's reply and persist it.
 *
 * Mirrors the full `/api/agent-chat` behaviour: resolves the correct system
 * prompt, loads conversation history, includes all workspace function tools,
 * and runs the agentic loop (up to {@link MAX_TOOL_ROUNDS} iterations) so
 * the agent can call tools exactly as it would during a live chat session.
 *
 * @param supabase       - The Supabase server client
 * @param conversationId - The conversation the message was sent to
 * @param senderId       - The human user who scheduled the message
 */
async function triggerAgentReply(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  conversationId: string,
  senderId: string
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return;

  // 1. Verify the conversation is agent-type
  const { data: conv } = await supabase
    .from("conversations")
    .select("type")
    .eq("id", conversationId)
    .single();

  if (!conv || conv.type !== "agent") return;

  // 2. Find the agent user in this conversation
  const { data: members } = await supabase
    .from("conversation_members")
    .select(
      "user_id, user:users!user_id (id, username, avatar_url, is_agent)"
    )
    .eq("conversation_id", conversationId);

  if (!members) return;

  const agentMember = members.find(
    (m: { user: { is_agent: boolean } | null }) =>
      (m.user as { is_agent: boolean } | null)?.is_agent
  );
  if (!agentMember) return;

  const agentUser = agentMember.user as {
    id: string;
    username: string;
    is_agent: boolean;
  };

  // 3. Resolve the system prompt (character agent > generic)
  const agentDef = AGENTS.find((a) => a.username === agentUser.username);
  const systemPrompt = agentDef?.system_prompt ?? GENERIC_AGENT.system_prompt;

  // 4. Fetch conversation history
  const { data: history } = await supabase
    .from("messages")
    .select("sender_id, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(50);

  if (!history || history.length === 0) return;

  // 5. Build the input for the Responses API
  let currentInput: OpenAI.Responses.ResponseInput = history.map(
    (m: { sender_id: string; content: string }) => ({
      role: m.sender_id === agentUser.id
        ? ("assistant" as const)
        : ("user" as const),
      content: m.content,
    })
  );

  const openai = new OpenAI({ apiKey });

  const tools: OpenAI.Responses.Tool[] = [
    { type: "web_search_preview" as const },
    ...AGENT_FUNCTION_TOOLS,
  ];

  const toolContext: ToolContext = { userId: senderId, supabase };

  // 6. Agentic loop -- identical to /api/agent-chat
  let fullText = "";
  let iterations = 0;

  while (iterations < MAX_TOOL_ROUNDS) {
    iterations++;

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      instructions: systemPrompt,
      input: currentInput,
      tools,
    });

    // Collect text from this iteration
    for (const item of response.output) {
      if (item.type === "message") {
        const msg = item as OpenAI.Responses.ResponseOutputMessage;
        for (const block of msg.content) {
          if (block.type === "output_text") {
            fullText += (block as { type: "output_text"; text: string }).text;
          }
        }
      }
    }

    // Collect function calls
    const functionCalls = response.output.filter(
      (item): item is OpenAI.Responses.ResponseFunctionToolCallItem =>
        item.type === "function_call"
    );

    if (functionCalls.length === 0) break;

    // Execute each function call and build the next input
    const nextInputItems: OpenAI.Responses.ResponseInputItem[] = [];

    for (const item of response.output) {
      if (item.type === "message") {
        const msg = item as OpenAI.Responses.ResponseOutputMessage;
        const mappedContent = msg.content
          .filter((c) => c.type === "output_text")
          .map((c) => ({
            type: "output_text" as const,
            text: (c as { type: "output_text"; text: string }).text,
          }));
        if (mappedContent.length > 0) {
          nextInputItems.push({
            type: "message",
            role: "assistant",
            content: mappedContent,
          } as OpenAI.Responses.ResponseInputItem);
        }
      } else if (item.type === "function_call") {
        const fc = item as OpenAI.Responses.ResponseFunctionToolCallItem;
        nextInputItems.push({
          type: "function_call",
          call_id: fc.call_id,
          name: fc.name,
          arguments: fc.arguments,
        } as OpenAI.Responses.ResponseInputItem);
      }
    }

    for (const fc of functionCalls) {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(fc.arguments);
      } catch {
        /* skip malformed args */
      }

      const result = await executeToolCall(fc.name, parsedArgs, toolContext);

      nextInputItems.push({
        type: "function_call_output",
        call_id: fc.call_id,
        output: JSON.stringify(result),
      } as OpenAI.Responses.ResponseInputItem);
    }

    currentInput = [
      ...((Array.isArray(currentInput) ? currentInput : []) as OpenAI.Responses.ResponseInputItem[]),
      ...nextInputItems,
    ];
  }

  if (!fullText) return;

  // 7. Persist the AI response
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: agentUser.id,
    content: fullText,
  });
}

/**
 * Finds (or creates) the agent conversation between a user and a character
 * agent such as Elon Musk or Steve Jobs.
 *
 * Mirrors the init logic in `useAgentChat`: looks up shared "agent"-type
 * conversations between the two users, creating one if none exists.
 *
 * @param supabase       - The Supabase server client
 * @param senderId       - The human sender's user ID
 * @param agentUserId    - The agent's user ID (stored as recipient_id)
 * @param agentUsername  - The agent's display name (used as conversation name)
 * @returns The conversation ID, or null on failure
 */
async function findOrCreateCharacterAgentConversation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  senderId: string,
  agentUserId: string,
  agentUsername: string | null
): Promise<string | null> {
  // 1. Find conversations that both the sender and agent belong to
  const { data: senderMemberships } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", senderId);

  if (senderMemberships && senderMemberships.length > 0) {
    const senderConvIds = senderMemberships.map(
      (m: { conversation_id: string }) => m.conversation_id
    );

    const { data: agentMemberships } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", agentUserId)
      .in("conversation_id", senderConvIds);

    if (agentMemberships && agentMemberships.length > 0) {
      const sharedIds = agentMemberships.map(
        (m: { conversation_id: string }) => m.conversation_id
      );

      const { data: existingConv } = await supabase
        .from("conversations")
        .select("id")
        .in("id", sharedIds)
        .eq("type", "agent")
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      if (existingConv) {
        return existingConv.id;
      }
    }
  }

  // 2. No existing conversation -- create one
  const { data: newConv, error: convErr } = await supabase
    .from("conversations")
    .insert({ type: "agent", name: agentUsername ?? "Agent" })
    .select()
    .single();

  if (convErr || !newConv) {
    console.error(
      "Failed to create character-agent conversation:",
      convErr?.message
    );
    return null;
  }

  const { error: memberErr } = await supabase
    .from("conversation_members")
    .insert([
      { conversation_id: newConv.id, user_id: senderId },
      { conversation_id: newConv.id, user_id: agentUserId },
    ]);

  if (memberErr) {
    console.error(
      "Failed to add members to character-agent conversation:",
      memberErr.message
    );
    return null;
  }

  return newConv.id;
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
