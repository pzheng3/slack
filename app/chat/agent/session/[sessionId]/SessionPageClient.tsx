"use client";

import { MessageComposer } from "@/components/chat/MessageComposer";
import { MessageList } from "@/components/chat/MessageList";
import { useSessionChat } from "@/lib/hooks/useSessionChat";
import Image from "next/image";

/**
 * Session-based agent chat page.
 * Header shows the AI Assistant avatar + session name.
 * @param {{ sessionId: string }} props
 */
export default function SessionPageClient({
  sessionId,
}: {
  sessionId: string;
}) {
  const { messages, loading, streaming, sendMessage, agent, conversation } =
    useSessionChat(sessionId);

  const sessionName = conversation?.name || "Agent Session";

  return (
    <>
      {/* Session header */}
      <div className="flex h-[49px] items-center bg-white pl-[17px] pr-4 shadow-[0px_1px_0px_0px_var(--color-slack-border)] z-10">
        <button className="flex items-center gap-2 rounded-[6px] px-[3px] py-[3px]">
          <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-[3.7px]">
            <Image
              src={agent?.avatar_url || "/images/Slackbot.png"}
              alt={sessionName}
              width={24}
              height={24}
              className="object-cover"
            />
          </div>
          <div className="flex items-center">
            <span className="text-[18px] font-black leading-[1.33] text-[var(--color-slack-text)]">
              {sessionName}
            </span>
          </div>
        </button>
      </div>

      {/* Messages */}
      <MessageList messages={messages} loading={loading} />

      {/* Composer — auto-focused so the user can type immediately */}
      <MessageComposer
        onSend={sendMessage}

        disabled={loading || streaming}
        autoFocus
      />
    </>
  );
}
