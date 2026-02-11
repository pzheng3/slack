import { AGENTS, GENERIC_AGENT } from "@/lib/constants";
import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import matter from "gray-matter";

/**
 * Resolve the system prompt for a given agent.
 * Priority: explicit systemPrompt param > AGENTS match by username > GENERIC_AGENT.
 *
 * @param agentUsername - The agent's username (optional)
 * @param systemPrompt - An explicit system prompt override (optional)
 * @returns The resolved system prompt string
 */
function resolveSystemPrompt(
  agentUsername?: string,
  systemPrompt?: string
): string {
  if (systemPrompt) return systemPrompt;

  if (agentUsername) {
    const agentDef = AGENTS.find((a) => a.username === agentUsername);
    if (agentDef) return agentDef.system_prompt;
  }

  return GENERIC_AGENT.system_prompt;
}

/**
 * Extract activated skill names from message HTML.
 * Looks for slash command chip spans with data-category="skill"
 * and extracts the skill name from data-id (e.g. "skill-code-reviewer" → "code-reviewer").
 *
 * @param html - The raw HTML content of the message
 * @returns Array of skill names found in the message
 */
function extractSkillNames(html: string): string[] {
  const skills: string[] = [];
  // Match slash command spans that are skills
  const regex = /data-id="skill-([^"]+)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    skills.push(match[1]);
  }
  return [...new Set(skills)]; // deduplicate
}

/**
 * Load a skill's full instructions from its SKILL.md file.
 * Also loads referenced resources that are mentioned in the body.
 * Follows the Agent Skills progressive disclosure pattern.
 *
 * @param skillName - The skill directory name (e.g. "code-reviewer")
 * @returns The skill instructions string, or null if not found
 */
function loadSkillInstructions(skillName: string): string | null {
  const root = process.cwd();
  const skillDir = path.join(root, "content", "skills", skillName);
  const skillMdPath = path.join(skillDir, "SKILL.md");

  if (!fs.existsSync(skillMdPath)) return null;

  try {
    const raw = fs.readFileSync(skillMdPath, "utf-8");
    const { data, content } = matter(raw);

    let instructions = content.trim();

    // Progressive disclosure: auto-load referenced resources mentioned in the body
    // Look for markdown links to references/ files and inline their content
    const refRegex = /\[([^\]]+)\]\((references\/[^)]+)\)/g;
    let refMatch;
    const loadedRefs: string[] = [];

    while ((refMatch = refRegex.exec(instructions)) !== null) {
      const refPath = path.join(skillDir, refMatch[2]);
      if (fs.existsSync(refPath)) {
        try {
          const refContent = fs.readFileSync(refPath, "utf-8");
          loadedRefs.push(
            `\n\n---\n## Reference: ${refMatch[1]}\n\n${refContent.trim()}`
          );
        } catch {
          // Skip unreadable references
        }
      }
    }

    // Compose the full skill context
    const skillHeader = `## Active Skill: ${(data.name as string) || skillName}`;
    const description = data.description
      ? `\n> ${data.description}\n`
      : "";

    return [skillHeader, description, instructions, ...loadedRefs].join("\n");
  } catch {
    return null;
  }
}

/**
 * Build an enhanced system prompt by injecting activated skill instructions.
 * Skills are extracted from the latest user message's HTML content.
 *
 * @param basePrompt - The base system prompt
 * @param messages - The conversation messages
 * @returns Enhanced system prompt with skill instructions
 */
function buildSkillEnhancedPrompt(
  basePrompt: string,
  messages: { role: string; content: string }[]
): string {
  // Check the latest user message for skill activations
  const lastUserMsg = [...messages]
    .reverse()
    .find((m) => m.role === "user");

  if (!lastUserMsg) return basePrompt;

  const skillNames = extractSkillNames(lastUserMsg.content);
  if (skillNames.length === 0) return basePrompt;

  // Load all activated skills
  const skillInstructions = skillNames
    .map(loadSkillInstructions)
    .filter((s): s is string => s !== null);

  if (skillInstructions.length === 0) return basePrompt;

  // Inject skill instructions into the system prompt
  const skillSection = [
    "\n\n# Activated Skills",
    "The user has activated the following skills. Follow their instructions carefully.",
    ...skillInstructions,
  ].join("\n\n");

  return basePrompt + skillSection;
}

/**
 * POST /api/agent-chat
 *
 * Proxies chat requests to OpenAI using the Responses API.
 * When a user activates a skill via the slash menu, the skill's instructions
 * (from SKILL.md) and referenced resources are automatically loaded and
 * injected into the system prompt following the Agent Skills progressive
 * disclosure pattern.
 *
 * The model has access to the `web_search_preview` tool, which it will invoke
 * automatically when the user's question requires up-to-date internet data.
 *
 * Streams the response back to the client as SSE events.
 *
 * Body: { agentUsername?: string, systemPrompt?: string, messages: { role: string, content: string }[] }
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
  const { agentUsername, systemPrompt, messages } = body as {
    agentUsername?: string;
    systemPrompt?: string;
    messages: { role: "user" | "assistant"; content: string }[];
  };

  // Resolve the system prompt — agent-specific > explicit > generic
  const resolvedSystemPrompt = resolveSystemPrompt(agentUsername, systemPrompt);

  // Enhance the system prompt with any activated skill instructions
  const enhancedPrompt = buildSkillEnhancedPrompt(
    resolvedSystemPrompt,
    messages
  );

  const openai = new OpenAI({ apiKey });

  // Build input items for the Responses API from conversation history
  const input = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  try {
    const stream = await openai.responses.create({
      model: "gpt-4o-mini",
      instructions: enhancedPrompt,
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

            // When the response completes, extract web-search citation annotations
            if (event.type === "response.completed") {
              const annotations = event.response.output
                .filter(
                  (item: { type: string }) => item.type === "message"
                )
                .flatMap(
                  (item: { type: string; content?: Array<{ type: string; annotations?: Array<{ type: string; url?: string; title?: string; start_index?: number; end_index?: number }> }> }) =>
                    item.content ?? []
                )
                .filter(
                  (block: { type: string }) => block.type === "output_text"
                )
                .flatMap(
                  (block: { type: string; annotations?: Array<{ type: string; url?: string; title?: string; start_index?: number; end_index?: number }> }) =>
                    block.annotations ?? []
                )
                .filter(
                  (a: { type: string }) => a.type === "url_citation"
                )
                .map((a: { url?: string; title?: string; start_index?: number; end_index?: number }) => ({
                  url: a.url,
                  title: a.title,
                  start_index: a.start_index,
                  end_index: a.end_index,
                }));

              if (annotations.length > 0) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ sources: annotations })}\n\n`
                  )
                );
              }
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
