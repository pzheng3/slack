"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import type { MessageWithSender } from "@/lib/types";
import { useEffect, useLayoutEffect, useRef } from "react";
import { MessageItem } from "./MessageItem";

interface MessageListProps {
  messages: MessageWithSender[];
  loading?: boolean;
  /** When true, enables smart auto-scroll that follows the growing AI response */
  streaming?: boolean;
}

/**
 * Scrollable list of messages matching the Figma design.
 *
 * Scroll behaviour:
 * - **Non-streaming**: scrolls to the bottom whenever new messages arrive.
 * - **Streaming**: pushes the chat feed up to follow the AI response as it
 *   generates. Once the user's prompt message (the one that triggered the
 *   response) reaches the top of the visible scroll area, scrolling stops so
 *   the user can begin reading the answer in place.
 */
export function MessageList({
  messages,
  loading = false,
  streaming = false,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLDivElement>(null);

  /** Index of the user's prompt message that triggered the current AI stream */
  const promptIdxRef = useRef<number>(-1);

  /** Mirror of the `streaming` prop so the length-based effect can read it synchronously */
  const streamingRef = useRef(false);
  streamingRef.current = streaming;

  /**
   * Track the first message ID so we can distinguish a session switch
   * (messages replaced entirely) from a new message appended within the
   * same conversation. On session switch / initial load we scroll
   * instantly (no visible animation). On a new message we smooth-scroll.
   */
  const prevFirstMsgIdRef = useRef<string | null>(null);
  const firstMsgId = messages.length > 0 ? messages[0].id : null;

  // When streaming starts, record which message is the user's prompt
  // (second-to-last, since the last message is the AI streaming placeholder).
  useEffect(() => {
    if (streaming) {
      promptIdxRef.current =
        messages.length >= 2 ? messages.length - 2 : -1;
    } else {
      promptIdxRef.current = -1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to streaming toggle
  }, [streaming]);

  /**
   * Ref for the `requestAnimationFrame` id used by the session-switch
   * scroll so we can cancel it if the component unmounts or re-renders
   * before the callback fires.
   */
  const rafIdRef = useRef(0);

  /**
   * Non-streaming: scroll to bottom when new messages arrive.
   *
   * Uses `useLayoutEffect` so the scroll happens synchronously before the
   * browser paints, giving accurate `scrollHeight` measurements and
   * preventing a visible flash of wrong scroll position.
   *
   * For session switches / first load we jump instantly (no animation) and
   * schedule a follow-up `requestAnimationFrame` callback to catch any late
   * layout shifts (images loading, fonts rendering, Radix viewport resizing).
   *
   * For new messages within the same conversation we smooth-scroll.
   */
  useLayoutEffect(() => {
    if (streamingRef.current) return;
    if (messages.length === 0) {
      prevFirstMsgIdRef.current = null;
      return;
    }

    const isNewSession = firstMsgId !== prevFirstMsgIdRef.current;
    prevFirstMsgIdRef.current = firstMsgId;

    const bottom = bottomRef.current;
    if (!bottom) return;

    // Find the Radix ScrollArea viewport (same selector the streaming logic uses)
    const viewport = bottom.closest(
      '[data-slot="scroll-area-viewport"]'
    ) as HTMLElement | null;

    if (!viewport) {
      // Fallback if viewport not found
      bottom.scrollIntoView({ behavior: isNewSession ? "instant" : "smooth" });
      return;
    }

    /** Jump the viewport to its maximum scroll offset. */
    const scrollToMax = () => {
      viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight;
    };

    if (isNewSession) {
      // Session switch or first load — jump to absolute bottom immediately
      scrollToMax();
      // Follow-up after browser layout to catch any late content shifts
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(scrollToMax);
    } else {
      // New message in same conversation — smooth scroll to absolute bottom
      const maxScroll = viewport.scrollHeight - viewport.clientHeight;
      viewport.scrollTo({ top: maxScroll, behavior: "smooth" });
    }

    return () => cancelAnimationFrame(rafIdRef.current);
  }, [messages.length, firstMsgId]);

  /**
   * Keep scroll pinned to the bottom while content resizes (e.g. images
   * loading, lazy content appearing) — but only when NOT streaming.
   *
   * Uses a `ResizeObserver` on the viewport's inner content wrapper. If the
   * viewport is already near the bottom (within 50 px tolerance) we snap it
   * to the new maximum scroll offset. This avoids hijacking the user's
   * scroll position if they intentionally scrolled up to read history.
   */
  useEffect(() => {
    const bottom = bottomRef.current;
    if (!bottom) return;

    const viewport = bottom.closest(
      '[data-slot="scroll-area-viewport"]'
    ) as HTMLElement | null;
    if (!viewport) return;

    // Radix wraps children in a div inside the viewport — observe that
    const content = viewport.firstElementChild;
    if (!content) return;

    const ro = new ResizeObserver(() => {
      if (streamingRef.current) return;
      const maxScroll = viewport.scrollHeight - viewport.clientHeight;
      // Only pin if we're already near the bottom
      if (maxScroll - viewport.scrollTop <= 50) {
        viewport.scrollTop = maxScroll;
      }
    });

    ro.observe(content);
    return () => ro.disconnect();
  }, [messages.length, firstMsgId]);

  // Streaming: smart-scroll after every content update.
  // Runs synchronously before paint so the scroll position is correct
  // before the user sees the new content.
  useLayoutEffect(() => {
    if (!streaming) return;

    const bottom = bottomRef.current;
    if (!bottom) return;

    // Walk up from the bottom sentinel to find the Radix scroll viewport
    const viewport = bottom.closest(
      '[data-slot="scroll-area-viewport"]'
    ) as HTMLElement | null;
    if (!viewport) return;

    const promptEl = promptRef.current;
    if (!promptEl) {
      // No prompt element tracked — fall back to scroll-to-bottom
      viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight;
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const promptRect = promptEl.getBoundingClientRect();

    // How many pixels of the prompt are still below the viewport's top edge
    const gap = promptRect.top - viewportRect.top;

    if (gap <= 0) {
      // The prompt has reached (or passed) the top — stop scrolling
      return;
    }

    // Scroll as far down as possible without pushing the prompt above the top
    const desiredScroll =
      viewport.scrollHeight - viewport.clientHeight;
    const maxScroll = viewport.scrollTop + gap;
    viewport.scrollTop = Math.min(desiredScroll, maxScroll);
  }, [messages, streaming]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-white">
        <span className="text-[15px] text-[var(--color-slack-text-secondary)]">
          Loading messages...
        </span>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-[15px] text-[var(--color-slack-text-secondary)]">
            No messages yet
          </p>
          <p className="text-[13px] text-[var(--color-slack-text-placeholder)]">
            Be the first to say something!
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 overflow-hidden">
      <div className="flex flex-col py-2">
        {messages.map((msg, i) => {
          // Compact style if same sender as previous message (within 5 min)
          const prev = i > 0 ? messages[i - 1] : null;
          const compact =
            prev !== null &&
            prev.sender_id === msg.sender_id &&
            new Date(msg.created_at).getTime() -
              new Date(prev.created_at).getTime() <
              5 * 60 * 1000;

          // Show typing indicator on the streaming placeholder while
          // waiting for the first token (last message, empty content)
          const isTyping =
            streaming &&
            i === messages.length - 1 &&
            msg.content === "";

          // During streaming, wrap the prompt message with a ref
          // so we can track when it reaches the viewport top
          if (streaming && i === promptIdxRef.current) {
            return (
              <div key={msg.id} ref={promptRef}>
                <MessageItem message={msg} compact={compact} />
              </div>
            );
          }

          return (
            <MessageItem key={msg.id} message={msg} compact={compact} isTyping={isTyping} />
          );
        })}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
