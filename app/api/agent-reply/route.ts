import { AGENTS, GENERIC_AGENT } from "@/lib/constants";
import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/agent-reply
 *
 * Generates a non-streaming AI reply for an agent reacting to a channel message.
 * Used when a user mentions an AI agent in a channel or posts in a related channel.
 *
 * Unlike `/api/agent-chat` (SSE streaming), this endpoint returns the full
 * response as JSON so the caller can persist it to the DB in one step.
 *
 * Body: {
 *   agentUsername: string,
 *   recentMessages: { username: string, content: string }[],
 *   channelName?: string
 * }
 *
 * Response: { reply: string }
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const body = await req.json();
  const { agentUsername, recentMessages, channelName } = body as {
    agentUsername: string;
    recentMessages: { username: string; content: string }[];
    channelName?: string;
  };

  // Look up agent definition
  const agentDef =
    AGENTS.find((a) => a.username === agentUsername) ?? GENERIC_AGENT;

  // Build a context-aware system prompt for channel participation
  const channelContext = channelName
    ? `\n\nYou are currently in the #${channelName} channel. Respond naturally as a participant in the conversation. Keep your reply concise and relevant — a few sentences is usually enough. Don't repeat what others said. If you have nothing meaningful to add, reply with exactly "[NO_REPLY]".`
    : `\n\nYou were mentioned in a conversation. Reply naturally and concisely as yourself. A few sentences is usually enough.`;

  const systemPrompt = agentDef.system_prompt + channelContext;

  // Format recent messages as conversation context
  const conversationContext = recentMessages
    .map((m) => `${m.username}: ${m.content}`)
    .join("\n");

  const openai = new OpenAI({ apiKey });

  try {
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      instructions: systemPrompt,
      input: [
        {
          role: "user",
          content: `Here is the recent conversation:\n\n${conversationContext}\n\nRespond as ${agentUsername}.`,
        },
      ],
      tools: [{ type: "web_search_preview" as const }],
    });

    // Extract text from the response
    const reply = response.output
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content)
      .filter((block) => block.type === "output_text")
      .map((block) => block.text)
      .join("");

    // If the agent chose not to reply, return empty
    if (!reply || reply.trim() === "[NO_REPLY]") {
      return NextResponse.json({ reply: "" });
    }

    return NextResponse.json({ reply: reply.trim() });
  } catch (error) {
    console.error("OpenAI API error (agent-reply):", error);
    return NextResponse.json(
      { error: "Failed to get AI response" },
      { status: 500 }
    );
  }
}
