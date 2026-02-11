/**
 * Utility for extracting slash command / skill instruction bodies from
 * message HTML and building AI-friendly content.
 *
 * The display HTML (stored in DB) keeps the styled `<span>` tags so
 * the message list renders them as chips. When sending to the AI model,
 * we parse out the `data-body` instruction text and prepend it clearly
 * so the model follows the prompt.
 *
 * Cross-entity context: when a message contains an `@entity /command`
 * pattern (e.g. `@watercooler /summarize`), the system detects the
 * @mention preceding the slash command and fetches messages from that
 * entity to inject as context for the AI model.
 */

/* ------------------------------------------------------------------ */
/*  Entity Reference Types                                             */
/* ------------------------------------------------------------------ */

/**
 * Represents a reference to another entity (channel, DM, agent session)
 * extracted from an @mention that precedes a slash command.
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
 * Parse message HTML and extract @mention entities that are paired with
 * a slash command. This detects the `@entity /command` pattern so the
 * caller can fetch messages from the referenced entity and inject them
 * as context for the AI model.
 *
 * Only mentions that directly precede a slash command (possibly separated
 * by whitespace) are extracted — standalone mentions are ignored.
 *
 * @param html - Raw HTML content from the Tiptap editor
 * @returns Array of entity references found paired with slash commands
 */
export function extractEntityReferences(html: string): EntityReference[] {
  // Quick bail-outs
  if (!html.includes('data-type="mention"')) return [];
  if (!html.includes('data-type="slash-command"')) return [];
  if (typeof window === "undefined") return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const refs: EntityReference[] = [];
  const slashNodes = doc.querySelectorAll('span[data-type="slash-command"]');

  slashNodes.forEach((slashNode) => {
    // Walk backwards from the slash command node to find the nearest mention.
    // Skip whitespace-only text nodes between them.
    let prev: Node | null = slashNode.previousSibling;
    while (prev && prev.nodeType === Node.TEXT_NODE && !prev.textContent?.trim()) {
      prev = prev.previousSibling;
    }

    if (
      prev &&
      prev.nodeType === Node.ELEMENT_NODE &&
      (prev as Element).getAttribute("data-type") === "mention"
    ) {
      const dataId = (prev as Element).getAttribute("data-id") || "";
      const label = (prev as Element).textContent?.replace(/^@/, "") || "";
      const colonIdx = dataId.indexOf(":");

      if (colonIdx > 0) {
        refs.push({
          category: dataId.slice(0, colonIdx),
          entityId: dataId.slice(colonIdx + 1),
          label,
        });
      }
    }
  });

  return refs;
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
    messages: formatted,
  };
}

/* ------------------------------------------------------------------ */
/*  AI Content Building                                                */
/* ------------------------------------------------------------------ */

/**
 * Parse message HTML, extract any slash-command instruction bodies,
 * and return a plain-text version suitable for the AI model.
 *
 * - If the HTML contains no slash-command nodes, it is returned as-is.
 * - If it contains one or more, the instruction bodies are prepended
 *   and the remaining user text is appended.
 *
 * When `entityContext` is provided (messages fetched from a referenced
 * entity), they are injected into the prompt so the command operates
 * on the correct context rather than the current conversation.
 *
 * @param html - Raw HTML content from the Tiptap editor
 * @param entityContext - Optional context from a referenced entity
 * @returns Content formatted for the AI model with instructions prepended
 */
export function buildAIContent(
  html: string,
  entityContext?: { label: string; category: string; messages: string } | null
): string {
  // Quick bail-out — no slash command nodes in the HTML
  if (!html.includes('data-type="slash-command"')) return html;

  // Guard against SSR (DOMParser is browser-only)
  if (typeof window === "undefined") return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const slashNodes = doc.querySelectorAll('span[data-type="slash-command"]');

  if (slashNodes.length === 0) return html;

  const instructions: { label: string; body: string }[] = [];

  slashNodes.forEach((node) => {
    const label = node.getAttribute("data-label") || node.textContent || "";
    const body = node.getAttribute("data-body") || "";
    if (body.trim()) {
      instructions.push({ label: label.trim(), body: body.trim() });
    }
    // Remove the node so we can isolate the user's own text
    node.remove();
  });

  // Also remove mention nodes that were paired with slash commands
  // (they are part of the entity reference, not standalone mentions)
  doc.querySelectorAll('span[data-type="mention"]').forEach((mention) => {
    const dataId = mention.getAttribute("data-id") || "";
    if (entityContext && dataId.includes(entityContext.category)) {
      mention.remove();
    }
  });

  // Nothing actionable — return original HTML
  if (instructions.length === 0) return html;

  // Remaining text is whatever the user typed after the command chip
  const userText = (doc.body.textContent || "").trim();

  // Build the AI-friendly content:
  //   [Entity context from #channel / @session]
  //   <messages>
  //
  //   [/command instructions]
  //   <body>
  //
  //   <user's additional text>
  let result = "";

  // Inject cross-entity context if available
  if (entityContext?.messages) {
    const entityLabel =
      entityContext.category === "channel"
        ? `#${entityContext.label}`
        : `@${entityContext.label}`;

    result += `[Context from ${entityLabel}]\nBelow are the messages from ${entityLabel}. Use these as the context for the command that follows.\n\n${entityContext.messages}\n\n[End of ${entityLabel} context]\n\n`;
  }

  for (const { label, body } of instructions) {
    result += `[${label} instructions]\n${body}\n\n`;
  }

  if (userText) {
    result += userText;
  }

  return result.trim();
}
