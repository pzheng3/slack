"use client";

import { MessageComposer } from "@/components/chat/MessageComposer";
import { MessageList } from "@/components/chat/MessageList";
import { useAgentAutoReply } from "@/lib/hooks/useAgentAutoReply";
import { useChannelConversation } from "@/lib/hooks/useConversation";
import { useMessages } from "@/lib/hooks/useMessages";
import Image from "next/image";
import { useCallback } from "react";

/**
 * Channel chat page matching the Figma design.
 * Header shows # icon + channel name.
 *
 * Integrates with `useAgentAutoReply` so that AI character agents
 * (Elon Musk, Steve Jobs) respond when @mentioned or when the user
 * posts in one of the agent's related channels.
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
      />
    </>
  );
}
