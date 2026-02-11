"use client";

import Image from "next/image";
import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { AGENTS } from "@/lib/constants";
import { useDM } from "@/lib/hooks/useDM";
import type { MessageWithSender } from "@/lib/types";

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

  /**
   * Replace citation markers with inline chip HTML (memoized).
   * If the content has no sources, this returns the original string unchanged.
   */
  const processedContent = useMemo(
    () => inlineSourceChips(content),
    [content]
  );

  /**
   * Handle click events delegated from the message body.
   * If the target is a `.mention` span, parse its `data-id`
   * (format: `category:entityId`) and navigate to the chat session.
   */
  const handleClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      const target = (e.target as HTMLElement).closest?.(
        "[data-type='mention']"
      ) as HTMLElement | null;
      if (!target) return;

      const raw = target.getAttribute("data-id");
      if (!raw) return;

      const colonIdx = raw.indexOf(":");
      if (colonIdx === -1) return;

      const category = raw.slice(0, colonIdx);
      const entityId = raw.slice(colonIdx + 1);

      switch (category) {
        case "channel": {
          // entityId is the conversation UUID; label is the channel name
          const label = target.textContent?.replace(/^@/, "") ?? "";
          router.push(`/chat/channel/${encodeURIComponent(label)}`);
          break;
        }
        case "agent":
          router.push(`/chat/agent/session/${entityId}`);
          break;
        case "people": {
          // If the mentioned person is an AI character agent, navigate to agent chat
          const mentionLabel = target.textContent?.replace(/^@/, "") ?? "";
          if (CHARACTER_AGENT_NAMES.has(mentionLabel)) {
            router.push(
              `/chat/agent/${encodeURIComponent(mentionLabel)}`
            );
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

  if (isHtmlContent(processedContent)) {
    return (
      <div
        className="rich-text break-words text-[15px] leading-[1.467] text-[var(--color-slack-text)]"
        dangerouslySetInnerHTML={{ __html: processedContent }}
        onClick={handleClick}
      />
    );
  }

  // Render as Markdown with rehype-raw so inline source chip HTML passes through
  return (
    <div className="rich-text break-words text-[15px] leading-[1.467] text-[var(--color-slack-text)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
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
