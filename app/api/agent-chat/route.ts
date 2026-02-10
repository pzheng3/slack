import { GENERIC_AGENT } from "@/lib/constants";
import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/agent-chat
 *
 * Proxies chat requests to OpenAI using the Responses API.
 * The model has access to the `web_search_preview` tool, which it will invoke
 * automatically when the user's question requires up-to-date internet data.
 *
 * Streams the response back to the client as SSE events.
 *
 * Body: { systemPrompt?: string, messages: { role: string, content: string }[] }
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
  const { systemPrompt, messages } = body as {
    systemPrompt?: string;
    messages: { role: "user" | "assistant"; content: string }[];
  };

  // Resolve the system prompt
  const resolvedSystemPrompt = systemPrompt || GENERIC_AGENT.system_prompt;

  const openai = new OpenAI({ apiKey });

  // Build input items for the Responses API from conversation history
  const input = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  try {
    const stream = await openai.responses.create({
      model: "gpt-4o-mini",
      instructions: resolvedSystemPrompt,
      input,
      tools: [{ type: "web_search_preview" as const }],
      stream: true,
    });

    // Create a ReadableStream that forwards text deltas as SSE events
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            // Forward text chunks from the model's response
            if (event.type === "response.output_text.delta") {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ text: event.delta })}\n\n`
                )
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("OpenAI API error:", error);
    return NextResponse.json(
      { error: "Failed to get AI response" },
      { status: 500 }
    );
  }
}
