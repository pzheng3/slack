"use client";

import Image from "next/image";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useDM } from "@/lib/hooks/useDM";
import type { MessageWithSender } from "@/lib/types";

interface MessageItemProps {
  message: MessageWithSender;
  /** If true, renders a compact style (no avatar/name) for consecutive messages from the same sender */
  compact?: boolean;
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
          const convId = await findOrCreateDM(entityId);
          if (convId) router.push(`/chat/dm/${convId}`);
          break;
        }
        default:
          break;
      }
    },
    [router, findOrCreateDM]
  );

  if (isHtmlContent(content)) {
    return (
      <div
        className="rich-text break-words text-[15px] leading-[1.467] text-[var(--color-slack-text)]"
        dangerouslySetInnerHTML={{ __html: content }}
        onClick={handleClick}
      />
    );
  }

  // Render as Markdown (covers AI responses and user plain text with markdown syntax)
  return (
    <div className="rich-text break-words text-[15px] leading-[1.467] text-[var(--color-slack-text)]">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

/**
 * Renders a single chat message matching the Figma design.
 * Avatar (36px rounded), bold sender name (Lato Black 15px), timestamp (12px #616061), and message text.
 * Supports Tiptap HTML, Markdown, and plain-text content.
 */
export function MessageItem({ message, compact = false }: MessageItemProps) {
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (compact) {
    return (
      <div className="group flex items-start gap-2 px-5 py-0.5">
        <span className="w-[44px] shrink-0 pt-[2px] text-right text-[12px] leading-[1.467] text-[var(--color-slack-text-secondary)] opacity-0 group-hover:opacity-100">
          {time}
        </span>
        <div className="min-w-0 flex-1 px-2">
          <MessageBody content={message.content} />
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-2 px-5 py-2">
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
            <button className="text-[15px] font-black leading-[1.467] text-[var(--color-slack-text)]">
              {message.sender.username}
            </button>
          </div>
          <span className="text-[12px] leading-[1.467] text-[var(--color-slack-text-secondary)]">
            {time}
          </span>
        </div>

        {/* Message body */}
        <div className="pb-1">
          <MessageBody content={message.content} />
        </div>
      </div>
    </div>
  );
}
