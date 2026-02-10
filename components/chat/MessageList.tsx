"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import type { MessageWithSender } from "@/lib/types";
import { useEffect, useRef } from "react";
import { MessageItem } from "./MessageItem";

interface MessageListProps {
  messages: MessageWithSender[];
  loading?: boolean;
}

/**
 * Scrollable list of messages matching the Figma design.
 * Auto-scrolls to the bottom when new messages arrive.
 */
export function MessageList({ messages, loading = false }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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

          return (
            <MessageItem key={msg.id} message={msg} compact={compact} />
          );
        })}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
