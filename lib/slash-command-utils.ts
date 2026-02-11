/**
 * Utility for extracting @mention contexts and /command instructions from
 * message HTML and building AI-friendly content.
 *
 * The display HTML (stored in DB) keeps the styled `<span>` tags so
 * the message list renders them as chips. When sending to the AI model,
 * we parse the HTML and build a structured prompt:
 *
 * 1. **@mentions → context**: Every `@mention` pulls the conversation
 *    history from that entity (channel, DM, or agent session) and injects
 *    it as context for the AI.
 * 2. **`/commands` → instructions**: Every `/command` or `/skill` chip
 *    adds its instruction body to the prompt.
 * 3. **User text**: Whatever the user typed after the chips.
 *
 * These are independent building blocks — you can use mentions without
 * commands, commands without mentions, or both together. Multiple
 * mentions and multiple commands are all supported:
 *
 *   `@general @random /summarize /draft tell me more`
 *   → context from #general + context from #random
 *   + /summarize instructions + /draft instructions
 *   + "tell me more"
 */

/* ------------------------------------------------------------------ */
/*  Entity Reference Types                                             */
/* ------------------------------------------------------------------ */

/**
 * Represents a reference to another entity (channel, DM, agent session)
 * extracted from an @mention in the message. Each mention's conversation
 * history will be fetched and injected as context for the AI.
 */
export interface EntityReference {
  /** The mention category: "channel", "agent", "people", "app" */
  category: string;
  /** The entity's unique identifier (conversation UUID or user UUID) */
  entityId: string;
  /** The display label shown in the mention chip (e.g. "watercooler") */
  label: string;
}

/* ------------------------------------------------------------------ */
/*  Entity Reference Extraction                                        */
/* ------------------------------------------------------------------ */

/**
 * Parse message HTML and extract ALL @mention entities. Every mention
 * represents an entity whose conversation history should be pulled in
 * as context for the AI — they are independent of slash commands.
 *
 * Supported patterns:
 * - `@general` — context from #general
 * - `@general @random` — context from both channels
 * - `@general /summarize` — context + command (independent)
 * - `@elon-musk @general /draft /summarize explain` — all combine
 *
 * "app" category mentions are skipped since they have no conversation
 * history to fetch.
 *
 * @param html - Raw HTML content from the Tiptap editor
 * @returns Array of entity references found in the message
 */
export function extractEntityReferences(html: string): EntityReference[] {
  if (!html.includes('data-type="mention"')) return [];
  if (typeof window === "undefined") return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const refs: EntityReference[] = [];
  const seen = new Set<string>();
  const mentionNodes = doc.querySelectorAll('span[data-type="mention"]');

  mentionNodes.forEach((node) => {
    const dataId = node.getAttribute("data-id") || "";
    // Strip the leading "@" (people/agent) or "#" (channel) prefix
    const label = (node.textContent || "").replace(/^[@#]/, "");
    const colonIdx = dataId.indexOf(":");

    if (colonIdx <= 0) return;

    const category = dataId.slice(0, colonIdx);

    // Skip "app" mentions — they have no conversation history
    if (category === "app") return;

    if (!seen.has(dataId)) {
      seen.add(dataId);
      refs.push({
        category,
        entityId: dataId.slice(colonIdx + 1),
        label,
      });
    }
  });

  return refs;
}

/* ------------------------------------------------------------------ */
/*  Skill Name Extraction (client-side)                                */
/* ------------------------------------------------------------------ */

/**
 * Extract activated skill names from message HTML.
 * Looks for slash command chip spans with data-id="skill-*"
 * and extracts the skill name (e.g. "skill-code-reviewer" → "code-reviewer").
 *
 * This is the client-side equivalent of the server-side extractSkillNames
 * in the agent-chat API route, used to preserve skill detection after
 * buildAIContent converts HTML to plain text.
 *
 * @param html - The raw HTML content of the message
 * @returns Array of skill names found in the message
 */
export function extractSkillNames(html: string): string[] {
  const skills: string[] = [];
  const regex = /data-id="skill-([^"]+)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    skills.push(match[1]);
  }
  return [...new Set(skills)];
}

/* ------------------------------------------------------------------ */
/*  Cross-Entity Context Fetching                                      */
/* ------------------------------------------------------------------ */

/** Shape of the entity context returned by fetchEntityContext. */
export interface EntityContext {
  /** Display label of the referenced entity */
  label: string;
  /** Category of the entity ("channel", "agent", "people") */
  category: string;
  /** The entity's unique identifier (mirrors EntityReference.entityId) */
  entityId: string;
  /** Formatted plain-text messages from the entity */
  messages: string;
}

/**
 * Strip HTML tags from a string, returning plain text.
 *
 * @param html - HTML string to strip
 * @returns Plain text content
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/**
 * Fetch messages from a referenced entity (channel, DM, or agent session)
 * using the provided Supabase client. This runs client-side so it inherits
 * the user's authentication and RLS policies.
 *
 * For channels and agent sessions, `entityId` is the conversation UUID.
 * For people mentions, it resolves the DM conversation with that person.
 *
 * @param supabase - Authenticated Supabase client (typed as `any` to avoid
 *                   tight coupling to a specific Supabase generic signature)
 * @param ref - The entity reference extracted from the message
 * @param currentUserId - The current user's ID (needed for DM lookup)
 * @param limit - Max number of messages to fetch (default: 100)
 * @returns EntityContext with formatted messages, or null if not found
 */
export async function fetchEntityContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ref: EntityReference,
  currentUserId: string,
  limit = 100
): Promise<EntityContext | null> {
  let conversationId: string;

  if (ref.category === "channel" || ref.category === "agent") {
    // For channels and agent sessions, the entityId IS the conversation UUID
    conversationId = ref.entityId;
  } else if (ref.category === "people") {
    // For people, find the DM conversation between current user and the person
    const { data: currentUserMembers } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", currentUserId);

    if (!currentUserMembers || currentUserMembers.length === 0) return null;

    const myConvIds = currentUserMembers.map(
      (m: { conversation_id: string }) => m.conversation_id
    );

    const { data: otherMembers } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", ref.entityId)
      .in("conversation_id", myConvIds);

    if (!otherMembers || otherMembers.length === 0) return null;

    const sharedIds = otherMembers.map(
      (m: { conversation_id: string }) => m.conversation_id
    );

    // Look for a DM conversation among shared conversations
    const { data: dmConv } = await supabase
      .from("conversations")
      .select("id")
      .in("id", sharedIds)
      .eq("type", "dm")
      .limit(1)
      .single();

    if (!dmConv) return null;
    conversationId = dmConv.id;
  } else {
    return null;
  }

  // Fetch messages with sender info from the target conversation
  const { data: msgs } = await supabase
    .from("messages")
    .select(
      "content, created_at, sender:users!sender_id (username)"
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (!msgs || msgs.length === 0) return null;

  // Format messages as plain text for the AI model
  const formatted = msgs
    .map((m: { content: string; created_at: string; sender: { username: string } | null }) => {
      const username = m.sender?.username || "Unknown";
      const time = new Date(m.created_at).toLocaleString();
      const content = stripHtml(m.content);
      return `[${username}] (${time}): ${content}`;
    })
    .join("\n");

  return {
    label: ref.label,
    category: ref.category,
    entityId: ref.entityId,
    messages: formatted,
  };
}

/* ------------------------------------------------------------------ */
/*  AI Content Building                                                */
/* ------------------------------------------------------------------ */

/**
 * Parse message HTML, extract @mention contexts and /command instructions,
 * and return a structured plain-text prompt for the AI model.
 *
 * The prompt is assembled from three independent layers:
 * 1. **Entity contexts** (from @mentions) — conversation histories
 * 2. **Command instructions** (from /commands) — task instructions
 * 3. **User text** — whatever the user typed alongside the chips
 *
 * Any combination works: mentions only, commands only, or both together.
 *
 * @param html - Raw HTML content from the Tiptap editor
 * @param entityContexts - Optional array of contexts from @mentioned entities
 * @returns Content formatted for the AI model
 */
export function buildAIContent(
  html: string,
  entityContexts?: EntityContext[] | null
): string {
  const hasMentions = html.includes('data-type="mention"');
  const hasSlashCommands = html.includes('data-type="slash-command"');
  const hasEntityContexts =
    entityContexts && entityContexts.length > 0;

  // Quick bail-out — nothing to process
  if (!hasMentions && !hasSlashCommands && !hasEntityContexts) return html;

  // Guard against SSR (DOMParser is browser-only)
  if (typeof window === "undefined") return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const instructions: { label: string; body: string }[] = [];

  // Extract slash command instruction bodies and remove them from DOM
  if (hasSlashCommands) {
    const slashNodes = doc.querySelectorAll(
      'span[data-type="slash-command"]'
    );

    slashNodes.forEach((node) => {
      const label =
        node.getAttribute("data-label") || node.textContent || "";
      const body = node.getAttribute("data-body") || "";
      if (body.trim()) {
        instructions.push({ label: label.trim(), body: body.trim() });
      }
      // Remove the node so we can isolate the user's own text
      node.remove();
    });
  }

  // Remove mention nodes that resolved to entity contexts
  // (their conversation history is injected separately)
  if (hasEntityContexts) {
    const entityIds = new Set(
      entityContexts!.map((ec) => `${ec.category}:${ec.entityId}`)
    );

    doc
      .querySelectorAll('span[data-type="mention"]')
      .forEach((mention) => {
        const dataId = mention.getAttribute("data-id") || "";
        if (entityIds.has(dataId)) {
          mention.remove();
        }
      });
  }

  // Nothing to inject — no instructions AND no entity contexts → return as-is
  if (instructions.length === 0 && !hasEntityContexts) return html;

  // Remaining text is whatever the user typed alongside the chips
  const userText = (doc.body.textContent || "").trim();

  // Build the AI-friendly content:
  //   [Context from #channel1]       ← from @mentions
  //   <messages>
  //   [Context from @person]          ← from @mentions
  //   <messages>
  //
  //   [/command instructions]         ← from /commands
  //   <body>
  //
  //   <user's additional text>        ← typed text
  let result = "";

  // Layer 1: Inject conversation history from all @mentioned entities
  if (hasEntityContexts) {
    for (const ec of entityContexts!) {
      if (!ec.messages) continue;

      const entityLabel =
        ec.category === "channel"
          ? `#${ec.label}`
          : `@${ec.label}`;

      result += `[Context from ${entityLabel}]\nBelow are the messages from ${entityLabel}. Use them as context for your response.\n\n${ec.messages}\n\n[End of ${entityLabel} context]\n\n`;
    }
  }

  // Layer 2: Inject command/skill instruction bodies
  for (const { label, body } of instructions) {
    result += `[${label} instructions]\n${body}\n\n`;
  }

  // Layer 3: Append the user's own text
  if (userText) {
    result += userText;
  }

  return result.trim();
}
