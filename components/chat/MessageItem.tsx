"use client";

import Image from "next/image";
import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { AGENTS } from "@/lib/constants";
import { useDM } from "@/lib/hooks/useDM";
import { useEntityItems } from "@/components/providers/EntityLinkProvider";
import type { MessageWithSender } from "@/lib/types";
import type { MentionItem } from "@/lib/hooks/useMentionSuggestions";
import type { Components } from "react-markdown";
import { ToolCallStatusBlock, parseToolCalls } from "./ToolCallStatus";

/** Set of AI character agent usernames for mention click navigation */
const CHARACTER_AGENT_NAMES = new Set(AGENTS.map((a) => a.username));

/** A web-search source citation with positional info embedded in AI message content */
interface SourceCitation {
  url: string;
  title: string;
  start_index?: number;
  end_index?: number;
}

/** Pattern matching the embedded sources HTML comment */
const SOURCES_PATTERN = /\n*<!--SOURCES:([\s\S]*?)-->/;

/**
 * Extract the domain hostname from a URL for favicon fetching.
 *
 * @param url - The full URL string
 * @returns The bare hostname (e.g. "en.wikipedia.org")
 */
function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Derive a clean, human-friendly site name from a page title and URL.
 *
 * Strategy:
 * 1. Try to extract the site brand from the page title — most pages use
 *    a separator like " - ", " | ", " — " with the site name as the last segment
 *    (e.g. "Python (programming language) - Wikipedia" → "Wikipedia").
 * 2. Fall back to a prettified domain name (e.g. "en.wikipedia.org" → "Wikipedia").
 *
 * @param url   - The source URL
 * @param title - The page title from the annotation (may be empty)
 * @returns A short, capitalised site name
 */
function getSourceLabel(url: string, title: string): string {
  // 1. Try extracting from the page title's trailing segment
  if (title) {
    const separators = [" - ", " | ", " — ", " · ", " :: ", " » "];
    for (const sep of separators) {
      const idx = title.lastIndexOf(sep);
      if (idx !== -1) {
        const candidate = title.slice(idx + sep.length).trim();
        // Accept if it looks like a brand name (2-40 chars, not a full URL)
        if (
          candidate.length >= 2 &&
          candidate.length <= 40 &&
          !candidate.includes("http")
        ) {
          return candidate;
        }
      }
    }
  }

  // 2. Fallback: prettify the domain
  try {
    const hostname = new URL(url).hostname;
    // Strip common subdomains (www, m, lang codes)
    const clean = hostname.replace(
      /^(www|m|mobile|en|de|fr|es|pt|ja|zh|ko)\./i,
      ""
    );
    const parts = clean.split(".");
    const name = parts.length > 2 ? parts[parts.length - 2] : parts[0];
    // Short names (<=4 chars) are likely acronyms — uppercase them
    if (name.length <= 4) return name.toUpperCase();
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return url;
  }
}

/**
 * Build an inline HTML chip string for a source citation.
 * The chip shows a favicon and the source website name, wrapped in an anchor tag.
 *
 * @param source - The source citation to render
 * @returns An inline HTML string for the chip
 */
function buildChipHtml(source: SourceCitation): string {
  const domain = getDomain(source.url);
  const label = getSourceLabel(source.url, source.title);
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&amp;sz=32`;
  const escapedTitle = (source.title || label)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
  const escapedLabel = label
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;");

  return (
    `<a href="${source.url}" target="_blank" rel="noopener noreferrer" ` +
    `title="${escapedTitle}" class="source-chip">` +
    `<img src="${faviconUrl}" alt="" width="14" height="14" />` +
    `<span>${escapedLabel}</span></a>`
  );
}

/**
 * Parse embedded source citations from message content and replace each
 * citation marker in the text with an inline favicon chip.
 *
 * Annotations include `start_index` / `end_index` pointing to the original
 * citation marker in the text. We iterate from the end of the string to the
 * start so that earlier indices stay valid after each replacement.
 *
 * @param content - The raw message content (may include `<!--SOURCES:...-->`)
 * @returns The content string with citation markers replaced by inline chip HTML
 */
function inlineSourceChips(content: string): string {
  const match = content.match(SOURCES_PATTERN);
  if (!match) return content;

  let sources: SourceCitation[];
  try {
    sources = JSON.parse(match[1]);
  } catch {
    return content;
  }

  // Strip the SOURCES comment from the content
  let text = content.replace(SOURCES_PATTERN, "").trim();

  // Only process sources that have valid position data
  const positioned = sources.filter(
    (s) =>
      typeof s.start_index === "number" &&
      typeof s.end_index === "number" &&
      s.start_index < s.end_index
  );

  if (positioned.length === 0) return text;

  // Sort descending by start_index so replacements don't shift earlier indices
  positioned.sort((a, b) => (b.start_index ?? 0) - (a.start_index ?? 0));

  for (const source of positioned) {
    const start = source.start_index!;
    const end = source.end_index!;
    if (start >= 0 && end <= text.length) {
      text =
        text.slice(0, start) + buildChipHtml(source) + text.slice(end);
    }
  }

  return text;
}

/**
 * Pattern matching Markdown links with the mention:// protocol.
 * Captures: [1] display text, [2] category (people|channel|agent|app), [3] entity ID.
 *
 * We pre-convert these to raw HTML `<span>` tags so that `rehypeRaw` passes them
 * through. This is more reliable than depending on react-markdown's URL transform
 * to handle custom protocols.
 */
const MENTION_LINK_RE =
  /\[([^\]]+)\]\(mention:\/\/(people|channel|agent|app)\/([^)]+)\)/g;

/**
 * Convert AI mention://  Markdown links into raw HTML mention spans.
 *
 * Transforms `[display](mention://category/entityId)` into
 * `<span class="mention" data-type="mention" data-id="category:entityId">display</span>`.
 *
 * This runs BEFORE ReactMarkdown so `rehypeRaw` can process the resulting HTML.
 *
 * @param content - Raw message content that may contain mention:// links
 * @returns Content with mention links replaced by HTML spans
 */
function convertMentionLinks(content: string): string {
  return content.replace(
    MENTION_LINK_RE,
    (_match, display: string, category: string, entityId: string) => {
      const safeDisplay = display
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
      return (
        `<span class="mention" data-type="mention" ` +
        `data-id="${category}:${entityId}">${safeDisplay}</span>`
      );
    }
  );
}

/**
 * Escape special regex characters in a string.
 *
 * @param s - The string to escape
 * @returns The escaped string safe for use in a RegExp constructor
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * HTML-escape a plain text string for safe embedding in HTML attributes/content.
 *
 * @param s - The string to escape
 * @returns The HTML-safe string
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Fallback pass that catches entity names the AI failed to format as
 * `mention://` links. This handles the common case where the AI outputs
 * **bold names** or plain names instead of Markdown mention links.
 *
 * Strategy:
 * 1. Split content around existing `<span class="mention"…>` tags so
 *    already-linked entities are never touched.
 * 2. In remaining segments, replace known entity names (longest-first)
 *    with mention span HTML. Matches both `**name**` and plain `name`.
 * 3. Uses exact case-sensitive matching with boundary checks.
 *
 * @param content  - Content that already went through `convertMentionLinks`
 * @param entities - Known entities from the workspace
 * @returns Content with missed entity references converted to mention spans
 */
function linkifyMissedEntities(
  content: string,
  entities: MentionItem[]
): string {
  if (!entities.length) return content;

  // Sort longest-first so "Steve Jobs" matches before "Steve"
  const sorted = [...entities].sort(
    (a, b) => b.label.length - a.label.length
  );

  // Split content into mention-span segments and raw-text segments.
  // Mention spans are preserved verbatim; only raw segments are scanned.
  const MENTION_SPAN_RE =
    /<span\s[^>]*class="mention"[^>]*>[\s\S]*?<\/span>/g;

  const spans: { start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = MENTION_SPAN_RE.exec(content)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length });
  }

  // If no existing mentions, process the whole string
  if (spans.length === 0) {
    return replaceEntitiesInSegment(content, sorted);
  }

  // Build output by interleaving raw segments (processed) and spans (kept)
  const parts: string[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (cursor < span.start) {
      parts.push(replaceEntitiesInSegment(content.slice(cursor, span.start), sorted));
    }
    parts.push(content.slice(span.start, span.end));
    cursor = span.end;
  }
  if (cursor < content.length) {
    parts.push(replaceEntitiesInSegment(content.slice(cursor), sorted));
  }

  return parts.join("");
}

/**
 * Replace known entity names in a raw text/markdown segment with mention
 * span HTML. Matches both markdown bold (`**name**`) and plain name text.
 *
 * @param segment  - A content segment with no existing mention spans
 * @param entities - Sorted entities (longest label first)
 * @returns The segment with entity names replaced by mention HTML
 */
function replaceEntitiesInSegment(
  segment: string,
  entities: MentionItem[]
): string {
  // Build replacements in a non-overlapping way using a single scan approach:
  // collect all match positions, resolve overlaps, then splice.
  const replacements: { start: number; end: number; html: string }[] = [];

  for (const entity of entities) {
    if (entity.label.length < 2) continue;

    const escaped = escapeRegExp(entity.label);
    const prefix = entity.category === "channel" ? "#" : "@";
    const spanHtml =
      `<span class="mention" data-type="mention" ` +
      `data-id="${entity.category}:${entity.id}">${escapeHtml(prefix + entity.label)}</span>`;

    // Try bold variant first: **name**
    const boldRe = new RegExp(`\\*\\*${escaped}\\*\\*`, "g");
    let bm: RegExpExecArray | null;
    while ((bm = boldRe.exec(segment)) !== null) {
      const start = bm.index;
      const end = start + bm[0].length;
      if (!overlaps(replacements, start, end)) {
        replacements.push({ start, end, html: spanHtml });
      }
    }

    // Plain name with boundary checks (not preceded by word char, @, #;
    // not followed by word char). This avoids matching inside URLs or
    // partial words.
    const plainRe = new RegExp(`(?<![\\w@#/])${escaped}(?!\\w)`, "g");
    let pm: RegExpExecArray | null;
    while ((pm = plainRe.exec(segment)) !== null) {
      const start = pm.index;
      const end = start + pm[0].length;
      if (!overlaps(replacements, start, end)) {
        replacements.push({ start, end, html: spanHtml });
      }
    }
  }

  if (replacements.length === 0) return segment;

  // Sort by start position descending so splicing doesn't shift indices
  replacements.sort((a, b) => b.start - a.start);
  let result = segment;
  for (const r of replacements) {
    result = result.slice(0, r.start) + r.html + result.slice(r.end);
  }
  return result;
}

/**
 * Check if a proposed [start, end) range overlaps with any existing replacement.
 *
 * @param existing - Already-collected replacement ranges
 * @param start    - Proposed start index
 * @param end      - Proposed end index
 * @returns True if there is an overlap
 */
function overlaps(
  existing: { start: number; end: number }[],
  start: number,
  end: number
): boolean {
  return existing.some((r) => start < r.end && end > r.start);
}

interface MessageItemProps {
  message: MessageWithSender;
  /** If true, renders a compact style (no avatar/name) for consecutive messages from the same sender */
  compact?: boolean;
  /** If true, shows a 3-dot typing animation instead of the message body */
  isTyping?: boolean;
}

/**
 * Three bouncing dots shown while waiting for the AI response to begin streaming.
 */
function TypingIndicator() {
  return (
    <span className="typing-indicator" aria-label="Typing">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </span>
  );
}

/**
 * Detect whether a message content string is Tiptap-generated HTML.
 * Tiptap always wraps output in block-level tags like <p>, <ul>, <ol>, <pre>.
 */
function isHtmlContent(content: string): boolean {
  return /^<(?:p|ul|ol|pre|h[1-6]|blockquote)\b/i.test(content.trim());
}

/**
 * Renders message content with proper formatting.
 * - Tiptap HTML (from the rich-text composer) is rendered via innerHTML.
 * - Everything else (AI responses, legacy plain text) is parsed as Markdown.
 *
 * Mention chips (`<span data-type="mention" data-id="category:id">`) are
 * clickable and navigate to the corresponding chat session.
 *
 * @param content - The raw message content string
 */
function MessageBody({ content }: { content: string }) {
  const router = useRouter();
  const { findOrCreateDM } = useDM();
  const allEntities = useEntityItems();

  /**
   * Parse tool call metadata from the content (if any).
   * Tool call entries are rendered as a separate status block above the text.
   */
  const { toolCalls, cleanContent: contentWithoutToolCalls } = useMemo(
    () => parseToolCalls(content),
    [content]
  );

  /**
   * Content processing pipeline (memoized):
   * 1. Replace citation markers with inline source chip HTML
   * 2. Convert AI mention:// Markdown links into mention spans
   * 3. Fallback (AI/markdown only): catch entity names the AI missed
   *
   * Step 3 is skipped for Tiptap HTML because user messages already
   * contain proper mention spans from the editor — running the fallback
   * on HTML would risk corrupting attribute values that happen to
   * contain entity names (e.g. `data-label="general"`).
   */
  const processedContent = useMemo(() => {
    const withChips = inlineSourceChips(contentWithoutToolCalls);
    const withMentionLinks = convertMentionLinks(withChips);
    // Tiptap HTML already has proper mentions — skip the fallback
    if (isHtmlContent(withMentionLinks)) return withMentionLinks;
    return linkifyMissedEntities(withMentionLinks, allEntities);
  }, [contentWithoutToolCalls, allEntities]);

  /**
   * Navigate to an entity's chat page based on category and id.
   * Used by both the delegated click handler (for Tiptap HTML) and
   * the inline click handlers on ReactMarkdown mention chips.
   */
  const navigateToEntity = useCallback(
    async (category: string, entityId: string, displayLabel: string) => {
      switch (category) {
        case "channel": {
          const label = displayLabel.replace(/^[#@]+/, "");
          router.push(`/chat/channel/${encodeURIComponent(label)}`);
          break;
        }
        case "agent":
          router.push(`/chat/agent/session/${entityId}`);
          break;
        case "people": {
          const mentionLabel = displayLabel.replace(/^@/, "");
          if (CHARACTER_AGENT_NAMES.has(mentionLabel)) {
            router.push(`/chat/agent/${encodeURIComponent(mentionLabel)}`);
          } else {
            const convId = await findOrCreateDM(entityId);
            if (convId) router.push(`/chat/dm/${convId}`);
          }
          break;
        }
        default:
          break;
      }
    },
    [router, findOrCreateDM]
  );

  /**
   * Handle click events delegated from the message body.
   * Used for Tiptap HTML mentions (dangerouslySetInnerHTML branch).
   * Parses `data-id` (format: `category:entityId`) and navigates.
   */
  const handleClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      const target = (e.target as HTMLElement).closest?.(
        "[data-type='mention'], [data-type='channelMention']"
      ) as HTMLElement | null;
      if (!target) return;

      const raw = target.getAttribute("data-id");
      if (!raw) return;

      const colonIdx = raw.indexOf(":");
      if (colonIdx === -1) return;

      const category = raw.slice(0, colonIdx);
      const entityId = raw.slice(colonIdx + 1);
      const displayLabel = target.textContent ?? "";

      await navigateToEntity(category, entityId, displayLabel);
    },
    [navigateToEntity]
  );

  /**
   * Custom ReactMarkdown component overrides.
   * Ensures external links open in a new tab.
   */
  const markdownComponents = useMemo<Components>(
    () => ({
      a: ({ href, children, ...props }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
          {children}
        </a>
      ),
    }),
    []
  );

  if (isHtmlContent(processedContent)) {
    return (
      <>
        {toolCalls.length > 0 && (
          <ToolCallStatusBlock toolCalls={toolCalls} />
        )}
        <div
          className="rich-text break-words text-[15px] leading-[1.467] text-[var(--color-slack-text)]"
          dangerouslySetInnerHTML={{ __html: processedContent }}
          onClick={handleClick}
        />
      </>
    );
  }

  // Render as Markdown with rehype-raw so inline source chip HTML passes
  // through. The custom `a` component converts mention:// links from the AI
  // into interactive mention chips. The click handler on the wrapper enables
  // navigation when chips are clicked.
  return (
    <>
      {toolCalls.length > 0 && (
        <ToolCallStatusBlock toolCalls={toolCalls} />
      )}
      <div
        className="rich-text break-words text-[15px] leading-[1.467] text-[var(--color-slack-text)]"
        onClick={handleClick}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={markdownComponents}
        >
          {processedContent}
        </ReactMarkdown>
      </div>
    </>
  );
}

/**
 * Renders a single chat message matching the Figma design.
 * Avatar (36px rounded), bold sender name (Lato Black 15px), timestamp (12px #616061), and message text.
 * Supports Tiptap HTML, Markdown, and plain-text content.
 */
export function MessageItem({ message, compact = false, isTyping = false }: MessageItemProps) {
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  /** Compact (consecutive) messages show time without the AM/PM suffix */
  const compactTime = time.replace(/\s*(AM|PM)$/i, "");

  if (compact) {
    return (
      <div className="group flex items-start gap-2 px-5 py-0.5 hover:bg-[var(--color-slack-border-light)]">
        <span className="w-9 shrink-0 pt-[2px] text-right text-[12px] leading-[1.467] text-[var(--color-slack-text-secondary)] opacity-0 group-hover:opacity-100">
          {compactTime}
        </span>
        <div className="min-w-0 flex-1 px-2">
          <MessageBody content={message.content} />
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-2 px-5 py-2 hover:bg-[var(--color-slack-border-light)]">
      {/* Avatar */}
      <div className="flex shrink-0 items-center justify-center pt-1">
        <div className="relative h-9 w-9 overflow-hidden rounded-[5.5px]">
          {message.sender.avatar_url ? (
            <Image
              src={message.sender.avatar_url}
              alt={message.sender.username}
              width={36}
              height={36}
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[#ffd57e] text-sm font-bold text-[var(--color-slack-badge-text)]">
              {message.sender.username[0]?.toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 px-2">
        {/* Header: name + timestamp */}
        <div className="flex items-center gap-[18px]">
          <div className="flex items-center gap-1">
            <button className="text-[15px] font-black leading-[1.467] text-[var(--color-slack-text)] hover:underline">
              {message.sender.username}
            </button>
          </div>
          <span className="text-[12px] leading-[1.467] text-[var(--color-slack-text-secondary)]">
            {time}
          </span>
        </div>

        {/* Message body */}
        <div className="pb-1">
          {isTyping ? <TypingIndicator /> : <MessageBody content={message.content} />}
        </div>
      </div>
    </div>
  );
}
