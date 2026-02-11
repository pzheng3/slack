/**
 * Build entity annotation instructions for the AI system prompt.
 *
 * Instead of keyword-based post-processing, we instruct the AI model
 * to annotate entity references in its output using a Markdown link
 * syntax: `[display text](mention://category/entityId)`.
 *
 * The frontend then renders these special links as interactive mention
 * chips via a custom ReactMarkdown component.
 *
 * Returns a **prefix** (placed before the base prompt for highest priority)
 * and a **suffix** reminder (placed after all other instructions). This
 * "sandwich" technique ensures models reliably
 * follow the formatting.
 */

/**
 * Lightweight entity summary sent to the API for system prompt injection.
 * Only contains the fields the AI needs to produce mention links.
 */
export interface EntitySummary {
  /** Unique identifier (user id, conversation id, or app slug) */
  id: string;
  /** Display label (username, session name, channel name, app name) */
  label: string;
  /** Entity category: "people" | "channel" | "agent" | "app" */
  category: string;
}

/**
 * Result of building entity instructions, split into prefix and suffix
 * so callers can sandwich the base prompt between them.
 */
export interface EntityInstructions {
  /** Placed BEFORE the base system prompt (highest priority position) */
  prefix: string;
  /** Placed AFTER all other prompt sections as a brief reminder */
  suffix: string;
}

/**
 * Build entity annotation instructions using a "sandwich" layout:
 * - **prefix**: concise rules + entity lookup table (prepended to the prompt)
 * - **suffix**: one-line reminder (appended at the very end)
 *
 * The AI uses its semantic understanding of context to decide which
 * references are genuine entity mentions -- unlike keyword matching,
 * coincidental word matches (e.g. "general" in "in general") are
 * not annotated.
 *
 * @param entities - Lightweight summaries of available entities
 * @returns EntityInstructions with prefix and suffix, or null if no entities
 */
export function buildEntityInstructions(
  entities: EntitySummary[]
): EntityInstructions | null {
  if (!entities.length) return null;

  const people = entities.filter((e) => e.category === "people");
  const channels = entities.filter((e) => e.category === "channel");
  const agents = entities.filter((e) => e.category === "agent");
  const apps = entities.filter((e) => e.category === "app");

  // ---- Prefix: concise rules + entity list ----
  // IMPORTANT: No backticks around the mention syntax examples.
  // The AI copies the format literally; backticks would cause ReactMarkdown
  // to render them as <code> instead of parsing as markdown links.
  const prefixLines: string[] = [
    "# CRITICAL: Entity Mention Formatting",
    "",
    "When your response text refers to a known person, channel, or agent session listed below,",
    "you MUST write it as a standard Markdown link using the mention:// protocol.",
    "Do NOT wrap it in backticks or code formatting. Write it as a normal Markdown link.",
    "",
    "Format: [display name](mention://category/entityId)",
    "",
    "- For people: [@Bob](mention://people/abc)",
    "- For channels: [#general](mention://channel/xyz)",
    "- For agent sessions: [@Session Name](mention://agent/def)",
    "",
    "Only link genuine references to the entity. Do NOT link coincidental word matches.",
    "",
    "## Known Entities",
    "",
  ];

  /** Helper to add entity entries to the prefix */
  const addCategory = (
    heading: string,
    items: EntitySummary[],
    displayPrefix: string,
    cat: string
  ) => {
    if (items.length === 0) return;
    prefixLines.push(`${heading}:`);
    for (const e of items) {
      prefixLines.push(
        `- "${e.label}" → write as [${displayPrefix}${e.label}](mention://${cat}/${e.id})`
      );
    }
    prefixLines.push("");
  };

  addCategory("People", people, "@", "people");
  addCategory("Channels", channels, "#", "channel");
  addCategory("Agent Sessions", agents, "@", "agent");
  addCategory("Apps", apps, "@", "app");

  // Tool-use guidance
  if (people.length > 0 || channels.length > 0 || agents.length > 0) {
    prefixLines.push(
      "When calling tools (send_message, send_dm, etc.), use the plain entity name without @ or # prefixes."
    );
    prefixLines.push("");
  }

  prefixLines.push("---");
  prefixLines.push("");

  // ---- Suffix: brief reminder ----
  const suffix =
    "\n\nREMINDER: Every person, channel, or agent session name from the Known Entities list that you genuinely reference MUST be a Markdown link with the mention:// protocol (NOT wrapped in backticks). Example: [@Bob](mention://people/abc123) or [#general](mention://channel/xyz456). Do not forget this.";

  return {
    prefix: prefixLines.join("\n"),
    suffix,
  };
}
