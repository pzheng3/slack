import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/summarize-title
 *
 * Takes a user prompt and returns a 3–7 word short title that summarizes it.
 * Used to auto-name new agent sessions after the user sends their first message.
 *
 * Body: { prompt: string }
 * Response: { title: string }
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
  const { prompt } = body as { prompt: string };

  if (!prompt) {
    return NextResponse.json(
      { error: "Missing prompt" },
      { status: 400 }
    );
  }

  const openai = new OpenAI({ apiKey });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a title generator. Given a user message, produce a short title of 3 to 7 words in sentence case (capitalize only the first word) that captures the essence of the message. Reply with ONLY the title, no quotes, no punctuation at the end, no explanation.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 20,
      temperature: 0.5,
    });

    const title =
      completion.choices[0]?.message?.content?.trim() || "New conversation";

    return NextResponse.json({ title });
  } catch (error) {
    console.error("Summarize title error:", error);
    return NextResponse.json(
      { error: "Failed to generate title" },
      { status: 500 }
    );
  }
}
