"use client";

import { MessageComposer } from "@/components/chat/MessageComposer";
import { MessageList } from "@/components/chat/MessageList";
import { useUnread } from "@/components/providers/UnreadProvider";
import { useSessionChat } from "@/lib/hooks/useSessionChat";
import { useScheduledMessages } from "@/lib/hooks/useScheduledMessages";
import { consumePendingPrompt } from "@/lib/pending-prompt";
import Image from "next/image";
import { useEffect, useRef } from "react";

/**
 * Session-based agent chat page.
 * Header shows the AI Assistant avatar + session name.
 *
 * Supports a "pending prompt" flow: when the user sends a message from the
 * "Create New" dialog, the prompt is stored in a module-level store
 * (see {@link lib/pending-prompt}) instead of being inserted directly into
 * the DB. This component consumes the prompt and feeds it through
 * `sendMessage()`, which both persists the message and triggers the AI
 * response via streaming.
 *
 * @param {{ sessionId: string }} props
 */
export default function SessionPageClient({
  sessionId,
}: {
  sessionId: string;
}) {
  const { messages, loading, streaming, sendMessage, agent, conversation } =
    useSessionChat(sessionId);
  const { markAsRead } = useUnread();
  const { scheduleMessage } = useScheduledMessages();

  // Mark the session as read on mount (sessionId === conversationId)
  useEffect(() => {
    markAsRead(sessionId);
  }, [sessionId, markAsRead]);

  const sessionName = conversation?.name || "Agent Session";

  /** Whether this is an incognito session (name ends with "(incognito)") */
  const isIncognito = sessionName.includes("(incognito)");

  /* ---- Stable ref so effects can call the latest sendMessage ---- */
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  /** Prevents the pending prompt from being consumed more than once. */
  const pendingProcessed = useRef(false);

  /** Reset when switching to a different session. */
  useEffect(() => {
    pendingProcessed.current = false;
  }, [sessionId]);

  /**
   * On mount (or when the session finishes loading), check for a pending
   * prompt that was set by the "Create New" dialog and auto-send it.
   *
   * Uses `setTimeout(fn, 0)` so that React Strict Mode's synchronous
   * unmount/remount cycle clears the timer from the first mount. This
   * prevents the prompt from being consumed by a dead component instance
   * whose state updates would be lost on the subsequent remount.
   */
  useEffect(() => {
    if (loading || !conversation || !agent || pendingProcessed.current) return;

    const timer = setTimeout(() => {
      const prompt = consumePendingPrompt(sessionId);
      if (prompt) {
        pendingProcessed.current = true;
        sendMessageRef.current(prompt);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [loading, conversation, agent, sessionId]);

  /**
   * Listen for the `pending-prompt-ready` custom event dispatched by
   * `setPendingPrompt`. This handles the case where the session page is
   * already mounted (e.g. the user sends to the *same* existing session
   * from the dialog without navigating away first).
   */
  useEffect(() => {
    const handler = (e: Event) => {
      const { conversationId } = (e as CustomEvent).detail;
      if (conversationId !== sessionId) return;

      const prompt = consumePendingPrompt(sessionId);
      if (prompt) {
        sendMessageRef.current(prompt);
      }
    };

    window.addEventListener("pending-prompt-ready", handler);
    return () => window.removeEventListener("pending-prompt-ready", handler);
  }, [sessionId]);

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${isIncognito ? "bg-[#f0f0f0]" : ""}`}>
      {/* Session header */}
      <div className={`flex h-[49px] items-center pl-[17px] pr-4 shadow-[0px_1px_0px_0px_var(--color-slack-border)] z-10 ${isIncognito ? "bg-[#f0f0f0]" : "bg-white"}`}>
        <button className="flex items-center gap-2 rounded-[6px] px-[3px] py-[3px]">
          {isIncognito ? (
            <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-[3.7px]">
              <Image
                src="/images/Slackbot dark.png"
                alt="Incognito"
                width={24}
                height={24}
                className="object-cover"
              />
            </div>
          ) : (
            <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-[3.7px]">
              <Image
                src={agent?.avatar_url || "/images/Slackbot.png"}
                alt={sessionName}
                width={24}
                height={24}
                className="object-cover"
              />
            </div>
          )}
          <div className="flex items-center">
            <span className="text-[18px] font-black leading-[1.33] text-[var(--color-slack-text)]">
              {sessionName}
            </span>
          </div>
        </button>
      </div>

      {/* Messages */}
      <MessageList
        messages={messages}
        loading={loading}
        streaming={streaming}
        agentAvatarOverride={isIncognito ? "/images/Slackbot dark.png" : undefined}
        agentNameOverride={isIncognito ? "Slack Secret Agent" : undefined}
      />

      {/* Composer — auto-focused so the user can type immediately */}
      <MessageComposer
        onSend={sendMessage}
        onSchedule={(content, sendAt) => {
          scheduleMessage(content, sendAt, sessionId, "agent", sessionId, sessionName);
        }}
        disabled={loading || streaming}
        autoFocus
        defaultShowToolbar={false}
        showAgentCommands
        hideVideoButton
        wrapperClassName={isIncognito ? "bg-[#f0f0f0] px-5 pb-6" : undefined}
      />
    </div>
  );
}
