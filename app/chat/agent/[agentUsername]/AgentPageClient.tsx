"use client";

import { MessageComposer } from "@/components/chat/MessageComposer";
import { MessageList } from "@/components/chat/MessageList";
import { useUnread } from "@/components/providers/UnreadProvider";
import { AGENTS } from "@/lib/constants";
import { useAgentChat } from "@/lib/hooks/useAgentChat";
import { consumePendingPrompt } from "@/lib/pending-prompt";
import Image from "next/image";
import { useEffect, useMemo, useRef } from "react";

/**
 * Agent chat page matching the Figma design.
 * Header shows agent avatar + name.
 *
 * Supports a "pending prompt" flow: when the user sends a message to a
 * character agent from the "Create New" dialog, the prompt is stored in
 * the pending-prompt store keyed by `"agent:{username}"`. This component
 * consumes the prompt and feeds it through `useAgentChat.sendMessage()`,
 * which inserts the message and triggers the AI response via streaming.
 *
 * @param {{ agentUsername: string }} props
 */
export default function AgentPageClient({
  agentUsername,
}: {
  agentUsername: string;
}) {
  const { messages, loading, streaming, sendMessage, agent, conversation } =
    useAgentChat(agentUsername);
  const { markAsRead } = useUnread();

  // Mark the agent conversation as read once it resolves
  useEffect(() => {
    if (!loading && conversation) {
      markAsRead(conversation.id);
    }
  }, [loading, conversation, markAsRead]);

  /**
   * Character agents (e.g. Elon Musk, Steve Jobs) use a people-style
   * composer — with the default toolbar, no agent slash commands, and
   * the video button visible — to feel more like a DM conversation.
   */
  const isCharacterAgent = useMemo(
    () => AGENTS.some((a) => a.username === agentUsername),
    [agentUsername]
  );

  /* ---- Pending prompt from the "Create New" dialog ---- */

  /** Stable ref so effects can call the latest sendMessage. */
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  /** Prevents the pending prompt from being consumed more than once. */
  const pendingProcessed = useRef(false);

  /** Reset when switching to a different agent. */
  useEffect(() => {
    pendingProcessed.current = false;
  }, [agentUsername]);

  /**
   * After the agent chat finishes loading, check for a pending prompt
   * set by the "Create New" dialog and auto-send it.
   *
   * Uses `setTimeout(fn, 0)` so that React Strict Mode's synchronous
   * unmount/remount cycle clears the timer from the first mount.
   */
  useEffect(() => {
    if (loading || !agent || pendingProcessed.current) return;

    const promptKey = `agent:${agentUsername}`;
    const timer = setTimeout(() => {
      const prompt = consumePendingPrompt(promptKey);
      if (prompt) {
        pendingProcessed.current = true;
        sendMessageRef.current(prompt);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [loading, agent, agentUsername]);

  /**
   * Listen for the `pending-prompt-ready` event for the case where the
   * agent page is already mounted (same agent send from dialog).
   */
  useEffect(() => {
    const promptKey = `agent:${agentUsername}`;

    const handler = (e: Event) => {
      const { conversationId } = (e as CustomEvent).detail;
      if (conversationId !== promptKey) return;

      const prompt = consumePendingPrompt(promptKey);
      if (prompt) {
        sendMessageRef.current(prompt);
      }
    };

    window.addEventListener("pending-prompt-ready", handler);
    return () => window.removeEventListener("pending-prompt-ready", handler);
  }, [agentUsername]);

  return (
    <>
      {/* Agent header — matches Figma chat header */}
      <div className="flex h-[49px] items-center bg-white pl-[17px] pr-4 shadow-[0px_1px_0px_0px_var(--color-slack-border)] z-10">
        <button className="flex items-center gap-2 rounded-[6px] px-[3px] py-[3px]">
          <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-[3.7px]">
            <Image
              src={agent?.avatar_url || "/images/Slackbot.png"}
              alt={agentUsername}
              width={24}
              height={24}
              className="object-cover"
            />
          </div>
          <div className="flex items-center">
            <span className="text-[18px] font-black leading-[1.33] text-[var(--color-slack-text)]">
              {agentUsername}
            </span>
          </div>
        </button>
      </div>

      {/* Messages */}
      <MessageList messages={messages} loading={loading} streaming={streaming} />

      {/* Composer — character agents get a people-style input field */}
      <MessageComposer
        onSend={sendMessage}
        disabled={loading || streaming}
        autoFocus
        defaultShowToolbar={isCharacterAgent}
        showAgentCommands={!isCharacterAgent}
        hideVideoButton={!isCharacterAgent}
      />
    </>
  );
}
