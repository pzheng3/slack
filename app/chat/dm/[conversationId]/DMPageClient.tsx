"use client";

import { MessageComposer } from "@/components/chat/MessageComposer";
import { MessageList } from "@/components/chat/MessageList";
import { useSupabase } from "@/components/providers/SupabaseProvider";
import { useUnread } from "@/components/providers/UnreadProvider";
import { useUser } from "@/components/providers/UserProvider";
import { useConversationById } from "@/lib/hooks/useConversation";
import { useMessages } from "@/lib/hooks/useMessages";
import { consumePendingPrompt } from "@/lib/pending-prompt";
import type { User } from "@/lib/types";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/**
 * Direct message chat page matching the Figma design.
 * Header shows avatar + name, with the Slack header shadow.
 *
 * Supports a "pending prompt" flow: when the user sends a DM from the
 * "Create New" dialog, the prompt is stored in a module-level store and
 * consumed here via `sendMessage()` from `useMessages`.
 *
 * @param {{ conversationId: string }} props
 */
export default function DMPageClient({
  conversationId,
}: {
  conversationId: string;
}) {
  const supabase = useSupabase();
  const { user } = useUser();
  const { markAsRead } = useUnread();
  const { conversation, loading: convLoading } =
    useConversationById(conversationId);
  const {
    messages,
    loading: msgsLoading,
    sendMessage,
  } = useMessages(conversation?.id ?? null);

  // Mark the DM as read on mount (conversationId is available immediately)
  useEffect(() => {
    markAsRead(conversationId);
  }, [conversationId, markAsRead]);

  const [otherUser, setOtherUser] = useState<Pick<
    User,
    "id" | "username" | "avatar_url"
  > | null>(null);

  const [isSelfDM, setIsSelfDM] = useState(false);

  // Fetch the other participant's info (or detect self-DM)
  useEffect(() => {
    if (!user || !conversationId) return;

    async function fetchOtherUser() {
      const { data: members } = await supabase
        .from("conversation_members")
        .select("user_id")
        .eq("conversation_id", conversationId)
        .neq("user_id", user!.id);

      if (members && members.length > 0) {
        const { data } = await supabase
          .from("users")
          .select("id, username, avatar_url")
          .eq("id", members[0].user_id)
          .single();

        if (data)
          setOtherUser(
            data as Pick<User, "id" | "username" | "avatar_url">
          );
        setIsSelfDM(false);
      } else {
        // Self-DM: current user is the only member
        setOtherUser({
          id: user!.id,
          username: user!.username,
          avatar_url: user!.avatar_url,
        });
        setIsSelfDM(true);
      }
    }

    fetchOtherUser();
  }, [supabase, user, conversationId]);

  /* ---- Pending prompt from the "Create New" dialog ---- */

  /** Stable ref so effects can call the latest sendMessage. */
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  /** Prevents the pending prompt from being consumed more than once. */
  const pendingProcessed = useRef(false);

  /** Reset when switching to a different DM. */
  useEffect(() => {
    pendingProcessed.current = false;
  }, [conversationId]);

  /**
   * After the conversation resolves, check for a pending prompt set by
   * the "Create New" dialog and auto-send it through sendMessage.
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
        sendMessageRef.current(prompt);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [convLoading, conversation]);

  /**
   * Listen for the `pending-prompt-ready` event for the case where the
   * DM page is already mounted (same DM send from dialog).
   */
  useEffect(() => {
    if (!conversation) return;

    const handler = (e: Event) => {
      const { conversationId: cid } = (e as CustomEvent).detail;
      if (cid !== conversation.id) return;

      const prompt = consumePendingPrompt(conversation.id);
      if (prompt) {
        sendMessageRef.current(prompt);
      }
    };

    window.addEventListener("pending-prompt-ready", handler);
    return () => window.removeEventListener("pending-prompt-ready", handler);
  }, [conversation]);

  const displayName = otherUser
    ? isSelfDM
      ? `${otherUser.username} (you)`
      : otherUser.username
    : "Direct Message";

  return (
    <>
      {/* DM header — matches Figma chat header */}
      <div className="flex h-[49px] items-center bg-white pl-[17px] pr-4 shadow-[0px_1px_0px_0px_var(--color-slack-border)] z-10">
        <button className="flex items-center gap-2 rounded-[6px] px-[3px] py-[3px]">
          <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-[3.7px]">
            {otherUser?.avatar_url ? (
              <Image
                src={otherUser.avatar_url}
                alt={displayName}
                width={24}
                height={24}
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#ffd57e] text-xs font-bold text-[var(--color-slack-badge-text)]">
                {displayName[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex items-center">
            <span className="text-[18px] font-black leading-[1.33] text-[var(--color-slack-text)]">
              {displayName}
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
        onSend={sendMessage}
        disabled={!conversation}
        autoFocus
      />
    </>
  );
}
