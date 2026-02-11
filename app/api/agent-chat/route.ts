import { AGENTS, GENERIC_AGENT } from "@/lib/constants";
import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { buildEntityInstructions } from "@/lib/entity-linkify";
import type { EntitySummary, EntityInstructions } from "@/lib/entity-linkify";
import { createServerClient } from "@/lib/supabase/server";
import {
  AGENT_FUNCTION_TOOLS,
  executeToolCall,
} from "@/lib/agent-tools";
import type { ToolContext } from "@/lib/agent-tools";

/** Maximum number of agentic loop iterations to prevent runaway loops */
const MAX_TOOL_ROUNDS = 5;

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
 * and extracts the skill name from data-id (e.g. "skill-code-reviewer" -> "code-reviewer").
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
 *
 * Skills can be detected in two ways:
 * 1. Via the `activatedSkills` array sent explicitly by the client
 *    (preferred -- works even after buildAIContent has stripped HTML)
 * 2. Fallback: extracted from the latest user message's HTML content
 *    (for backwards compatibility)
 *
 * @param basePrompt - The base system prompt
 * @param messages - The conversation messages
 * @param activatedSkills - Skill names explicitly passed by the client
 * @returns Enhanced system prompt with skill instructions
 */
function buildSkillEnhancedPrompt(
  basePrompt: string,
  messages: { role: string; content: string }[],
  activatedSkills?: string[]
): string {
  // Use explicitly provided skill names if available; otherwise
  // fall back to extracting from the latest user message HTML.
  let skillNames = activatedSkills ?? [];

  if (skillNames.length === 0) {
    const lastUserMsg = [...messages]
      .reverse()
      .find((m) => m.role === "user");

    if (!lastUserMsg) return basePrompt;
    skillNames = extractSkillNames(lastUserMsg.content);
  }

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

// ----------------------------------------------------------------
// Streaming helpers
// ----------------------------------------------------------------

/** Helper to enqueue an SSE event to the stream controller */
function sendSSE(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  data: unknown
) {
  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
  );
}

/**
 * Collected function call from the streaming response.
 */
interface CollectedFunctionCall {
  callId: string;
  name: string;
  arguments: string;
}

/**
 * Run a single OpenAI Responses API call with streaming.
 * Forwards text deltas to the SSE stream and collects function calls.
 *
 * @returns Object with collected function calls, response output items,
 *          web-search annotations, and the response ID.
 */
async function streamOpenAIResponse(
  openai: OpenAI,
  enhancedPrompt: string,
  input: OpenAI.Responses.ResponseInput,
  tools: OpenAI.Responses.Tool[],
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder
): Promise<{
  functionCalls: CollectedFunctionCall[];
  outputItems: OpenAI.Responses.ResponseOutputItem[];
  annotations: { url?: string; title?: string; start_index?: number; end_index?: number }[];
}> {
  const stream = await openai.responses.create({
    model: "gpt-4.1-mini",
    instructions: enhancedPrompt,
    input,
    tools,
    stream: true,
  });

  let outputItems: OpenAI.Responses.ResponseOutputItem[] = [];
  let annotations: { url?: string; title?: string; start_index?: number; end_index?: number }[] = [];

  for await (const event of stream) {
    // Forward text chunks from the model's response
    if (event.type === "response.output_text.delta") {
      sendSSE(controller, encoder, { text: event.delta });
    }

    // When the response completes, extract output items and annotations
    if (event.type === "response.completed") {
      outputItems = event.response.output;

      // Extract web-search citation annotations
      annotations = event.response.output
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
    }
  }

  // Extract function calls from the completed response output items
  // (more reliable than collecting from streaming events)
  const functionCalls: CollectedFunctionCall[] = outputItems
    .filter((item): item is OpenAI.Responses.ResponseFunctionToolCallItem =>
      item.type === "function_call"
    )
    .map((item) => ({
      callId: item.call_id,
      name: item.name,
      arguments: item.arguments,
    }));

  return { functionCalls, outputItems, annotations };
}

/**
 * POST /api/agent-chat
 *
 * Proxies chat requests to OpenAI using the Responses API with an agentic
 * tool-use loop. The agent can call workspace functions (send messages,
 * manage channels, etc.) and the results are fed back to the model until
 * it produces a final text response.
 *
 * When a user activates a skill via the slash menu, the skill's instructions
 * (from SKILL.md) and referenced resources are automatically loaded and
 * injected into the system prompt following the Agent Skills progressive
 * disclosure pattern.
 *
 * The model has access to:
 * - `web_search_preview` (built-in) for real-time internet data
 * - 11 workspace function tools for performing actions on behalf of the user
 *
 * Streams the response back to the client as SSE events:
 * - `{ text }` — text delta from the model
 * - `{ tool_call }` — the agent is invoking a workspace tool
 * - `{ tool_result }` — a tool has finished executing
 * - `{ sources }` — web-search citation annotations
 * - `[DONE]` — stream end
 *
 * Body: {
 *   agentUsername?: string,
 *   systemPrompt?: string,
 *   messages: { role: string, content: string }[],
 *   activatedSkills?: string[],
 *   availableEntities?: EntitySummary[],
 *   userId?: string
 * }
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
  const {
    agentUsername,
    systemPrompt,
    messages,
    activatedSkills,
    availableEntities,
    userId,
  } = body as {
    agentUsername?: string;
    systemPrompt?: string;
    messages: { role: "user" | "assistant"; content: string }[];
    activatedSkills?: string[];
    availableEntities?: EntitySummary[];
    userId?: string;
  };

  // Resolve the system prompt -- agent-specific > explicit > generic
  const resolvedSystemPrompt = resolveSystemPrompt(agentUsername, systemPrompt);

  // Enhance the system prompt with any activated skill instructions
  let enhancedPrompt = buildSkillEnhancedPrompt(
    resolvedSystemPrompt,
    messages,
    activatedSkills
  );

  // Sandwich entity annotation instructions around the prompt:
  // prefix (before base prompt) for highest priority, suffix (after
  // everything) as a reminder. This helps the model reliably follow
  // the mention:// formatting.
  const entityInstr: EntityInstructions | null =
    availableEntities && availableEntities.length > 0
      ? buildEntityInstructions(availableEntities)
      : null;

  if (entityInstr) {
    enhancedPrompt = entityInstr.prefix + enhancedPrompt + entityInstr.suffix;
  }

  const openai = new OpenAI({ apiKey });

  // Build initial input items for the Responses API from conversation history
  const initialInput: OpenAI.Responses.ResponseInput = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Build the tools array: web search + workspace function tools
  const tools: OpenAI.Responses.Tool[] = [
    { type: "web_search_preview" as const },
    ...AGENT_FUNCTION_TOOLS,
  ];

  // Create the Supabase client and tool context for server-side execution
  const supabase = createServerClient();
  const toolContext: ToolContext | null = userId
    ? { userId, supabase }
    : null;

  try {
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          let currentInput: OpenAI.Responses.ResponseInput = initialInput;
          let iterations = 0;

          // ---- Agentic loop ----
          // Each iteration: call OpenAI, stream text, collect function calls.
          // If function calls exist, execute them and feed results back.
          // Repeat until no function calls or max iterations reached.
          while (iterations < MAX_TOOL_ROUNDS) {
            iterations++;

            const { functionCalls, outputItems, annotations } =
              await streamOpenAIResponse(
                openai,
                enhancedPrompt,
                currentInput,
                tools,
                controller,
                encoder
              );

            // No function calls — we're done
            if (functionCalls.length === 0) {
              // Emit web-search source citations if any
              if (annotations.length > 0) {
                sendSSE(controller, encoder, { sources: annotations });
              }
              break;
            }

            // ---- Execute function calls ----
            if (!toolContext) {
              // No userId provided — can't execute tools. Inform the model.
              sendSSE(controller, encoder, {
                tool_result: {
                  id: functionCalls[0].callId,
                  name: functionCalls[0].name,
                  success: false,
                  result: "Tool execution not available: no user context provided.",
                },
              });
              break;
            }

            // Build the next input: previous input + model output + function results
            const nextInputItems: OpenAI.Responses.ResponseInputItem[] = [];

            // Include the model's output items (text + function calls)
            for (const item of outputItems) {
              if (item.type === "message") {
                // Re-include any text the model produced
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

            // Execute each function call and collect results
            for (const call of functionCalls) {
              // Notify client that a tool is being called
              let parsedArgs: Record<string, unknown> = {};
              try {
                parsedArgs = JSON.parse(call.arguments);
              } catch {
                // If parsing fails, pass empty object
              }

              sendSSE(controller, encoder, {
                tool_call: {
                  id: call.callId,
                  name: call.name,
                  arguments: parsedArgs,
                },
              });

              // Execute the tool
              const result = await executeToolCall(
                call.name,
                parsedArgs,
                toolContext
              );

              // Notify client of the result
              sendSSE(controller, encoder, {
                tool_result: {
                  id: call.callId,
                  name: call.name,
                  success: result.success,
                  result: result.success
                    ? JSON.stringify(result.data)
                    : result.error,
                },
              });

              // Add the function result to the conversation
              nextInputItems.push({
                type: "function_call_output",
                call_id: call.callId,
                output: JSON.stringify(result),
              } as OpenAI.Responses.ResponseInputItem);
            }

            // Continue the loop with the augmented input
            currentInput = [
              ...((Array.isArray(currentInput) ? currentInput : []) as OpenAI.Responses.ResponseInputItem[]),
              ...nextInputItems,
            ];
          }

          // End the stream
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          console.error("[agent-chat] Streaming error:", err);
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
