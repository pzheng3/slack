"use client";

import { MessageComposer } from "@/components/chat/MessageComposer";
import { MessageList } from "@/components/chat/MessageList";
import { useUnread } from "@/components/providers/UnreadProvider";
import { useAgentAutoReply } from "@/lib/hooks/useAgentAutoReply";
import { useChannelConversation } from "@/lib/hooks/useConversation";
import { useMessages } from "@/lib/hooks/useMessages";
import { consumePendingPrompt } from "@/lib/pending-prompt";
import Image from "next/image";
import { useCallback, useEffect, useRef } from "react";

/**
 * Channel chat page matching the Figma design.
 * Header shows # icon + channel name.
 *
 * Integrates with `useAgentAutoReply` so that AI character agents
 * (Elon Musk, Steve Jobs) respond when @mentioned or when the user
 * posts in one of the agent's related channels.
 *
 * Supports a "pending prompt" flow: when the user sends a message from
 * the "Create New" dialog, the prompt is stored in a module-level store
 * and consumed here via `handleSend()`, which both inserts the message
 * (via `useMessages`) and triggers agent auto-replies.
 *
 * @param {{ name: string }} props
 */
export default function ChannelPageClient({ name }: { name: string }) {
  const { conversation, loading: convLoading } = useChannelConversation(name);
  const { messages, loading: msgsLoading, sendMessage } = useMessages(
    conversation?.id ?? null
  );
  const { triggerAutoReply } = useAgentAutoReply(
    conversation?.id ?? null,
    name,
    messages
  );
  const { markAsRead } = useUnread();

  // Mark the channel as read once the conversation resolves
  useEffect(() => {
    if (!convLoading && conversation) {
      markAsRead(conversation.id);
    }
  }, [convLoading, conversation, markAsRead]);

  /**
   * Send the user's message and then trigger any applicable agent auto-replies.
   */
  const handleSend = useCallback(
    async (content: string) => {
      await sendMessage(content);
      // Fire auto-reply asynchronously — don't block the UI
      triggerAutoReply(content);
    },
    [sendMessage, triggerAutoReply]
  );

  /* ---- Pending prompt from the "Create New" dialog ---- */

  /** Stable ref so effects can call the latest handleSend. */
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  /** Prevents the pending prompt from being consumed more than once. */
  const pendingProcessed = useRef(false);

  /** Reset when switching to a different channel. */
  useEffect(() => {
    pendingProcessed.current = false;
  }, [name]);

  /**
   * After the conversation resolves, check for a pending prompt set by
   * the "Create New" dialog and auto-send it through handleSend.
   *
   * Uses `setTimeout(fn, 0)` so that React Strict Mode's synchronous
   * unmount/remount cycle clears the timer from the first mount.
   */
  useEffect(() => {
    if (convLoading || !conversation || pendingProcessed.current) return;

    const timer = setTimeout(() => {
      const prompt = consumePendingPrompt(conversation.id);
      if (prompt) {
        pendingProcessed.current = true;
        handleSendRef.current(prompt);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [convLoading, conversation]);

  /**
   * Listen for the `pending-prompt-ready` event for the case where the
   * channel page is already mounted (same channel send from dialog).
   */
  useEffect(() => {
    if (!conversation) return;

    const handler = (e: Event) => {
      const { conversationId } = (e as CustomEvent).detail;
      if (conversationId !== conversation.id) return;

      const prompt = consumePendingPrompt(conversation.id);
      if (prompt) {
        handleSendRef.current(prompt);
      }
    };

    window.addEventListener("pending-prompt-ready", handler);
    return () => window.removeEventListener("pending-prompt-ready", handler);
  }, [conversation]);

  return (
    <>
      {/* Channel header — matches Figma chat header */}
      <div className="flex h-[49px] items-center bg-white pl-[17px] pr-4 shadow-[0px_1px_0px_0px_var(--color-slack-border)] z-10">
        <button className="flex items-center gap-2 rounded-[6px] px-[3px] py-[3px]">
          <Image
            src="/icons/hashtag-thick.svg"
            alt=""
            width={18}
            height={18}
            className="opacity-60"
          />
          <div className="flex items-center">
            <span className="text-[18px] font-black leading-[1.33] text-[var(--color-slack-text)]">
              {name}
            </span>
            <Image
              src="/icons/chevron-down.svg"
              alt=""
              width={18}
              height={18}
              className="opacity-60"
            />
          </div>
        </button>
      </div>

      {/* Messages */}
      <MessageList messages={messages} loading={convLoading || msgsLoading} />

      {/* Composer */}
      <MessageComposer
        onSend={handleSend}
        disabled={!conversation}
        autoFocus
      />
    </>
  );
}
