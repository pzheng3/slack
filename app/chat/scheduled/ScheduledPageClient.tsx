"use client";

import { useScheduledMessages } from "@/lib/hooks/useScheduledMessages";
import { useSupabase } from "@/components/providers/SupabaseProvider";
import { ScheduleDialog } from "@/components/chat/ScheduleDialog";
import type { ScheduledMessage } from "@/lib/types";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Formats a send_at timestamp into a human-readable relative/absolute label.
 * e.g. "Send today at 3:30 PM", "Send tomorrow at 9:00 AM"
 */
function formatSendTime(sendAt: string): string {
  const date = new Date(sendAt);
  const now = new Date();

  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const timeStr = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isToday) return `Send today at ${timeStr}`;
  if (isTomorrow) return `Send tomorrow at ${timeStr}`;

  return (
    `Send ${date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    })} at ${timeStr}`
  );
}

/**
 * Returns the fallback icon path based on recipient type.
 * Used when no real avatar is available (e.g. channels, new agents).
 */
function getFallbackIcon(recipientType: string | null, recipientLabel: string | null): string {
  switch (recipientType) {
    case "channel":
      return "/icons/hashtag-thick.svg";
    case "agent":
    case "new_agent": {
      const isIncognito = recipientLabel?.includes("(incognito)");
      return isIncognito ? "/images/Slackbot dark.png" : "/images/Slackbot.png";
    }
    default:
      return "/icons/person.svg";
  }
}

/**
 * Fetches real avatar URLs for scheduled message recipients.
 *
 * For "people" recipients, queries the users table by recipient_id.
 * For "agent" recipients, queries conversation_members to find the
 * agent user in that conversation and returns their avatar.
 *
 * @returns A map of recipient_id -> avatar_url
 */
function useRecipientAvatars(messages: ScheduledMessage[]) {
  const supabase = useSupabase();
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (messages.length === 0) return;

    const peopleIds = new Set<string>();
    const agentConvIds = new Set<string>();

    for (const msg of messages) {
      if (msg.recipient_type === "people" && msg.recipient_id) {
        peopleIds.add(msg.recipient_id);
      } else if (
        (msg.recipient_type === "agent") &&
        msg.recipient_id &&
        msg.recipient_id !== "__new_agent__"
      ) {
        agentConvIds.add(msg.recipient_id);
      }
    }

    if (peopleIds.size === 0 && agentConvIds.size === 0) return;

    let cancelled = false;

    (async () => {
      const map: Record<string, string> = {};

      if (peopleIds.size > 0) {
        const { data } = await supabase
          .from("users")
          .select("id, avatar_url")
          .in("id", [...peopleIds]);

        if (data) {
          for (const u of data) {
            if (u.avatar_url) map[u.id] = u.avatar_url;
          }
        }
      }

      if (agentConvIds.size > 0) {
        const { data } = await supabase
          .from("conversation_members")
          .select("conversation_id, user:users!user_id (id, avatar_url, is_agent)")
          .in("conversation_id", [...agentConvIds]);

        if (data) {
          for (const row of data) {
            const user = row.user as unknown as {
              id: string;
              avatar_url: string | null;
              is_agent: boolean;
            };
            if (user?.is_agent && user.avatar_url) {
              map[row.conversation_id] = user.avatar_url;
            }
          }
        }
      }

      if (!cancelled) setAvatarMap(map);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, messages]);

  return avatarMap;
}

/**
 * Sanitises Tiptap HTML for inline preview display.
 *
 * Keeps `<span>` tags (which carry mention / channel-mention classes and
 * data attributes) and `<a>` tags (links) but strips all other tags so
 * the preview renders as a single flowing line with styled chips.
 */
function inlineHtml(html: string): string {
  return html
    .replace(/<(?!\/?(?:span|a)\b)[^>]*>/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Full-page view for scheduled messages, accessible from /chat/scheduled.
 * Displays each pending scheduled message as a card with recipient info,
 * scheduled time, message preview, and "Send now" / "Cancel" actions.
 */
export default function ScheduledPageClient() {
  const { messages, loading, sendNow, cancelSchedule, reschedule } = useScheduledMessages();
  const avatarMap = useRecipientAvatars(messages);

  const [rescheduleTarget, setRescheduleTarget] = useState<string | null>(null);

  /** Called when the user picks a new time from the ScheduleDialog. */
  const handleReschedule = useCallback(
    async (newSendAt: Date) => {
      if (!rescheduleTarget) return;
      await reschedule(rescheduleTarget, newSendAt);
      setRescheduleTarget(null);
    },
    [reschedule, rescheduleTarget]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Page header */}
      <div className="flex h-[49px] items-center bg-white pl-[17px] pr-4 shadow-[0px_1px_0px_0px_var(--color-slack-border)] z-10">
        <div className="flex items-center gap-2">
          <span className="text-[18px] font-black leading-[1.33] text-[var(--color-slack-text)]">
            Scheduled
          </span>
          {messages.length > 0 && (
            <span className="text-[14px] font-normal text-[var(--color-slack-text)] opacity-50">
              {messages.length}
            </span>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-[15px] text-[var(--color-slack-text)] opacity-50">
            Loading scheduled messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-[15px] text-[var(--color-slack-text)] opacity-50">
              No scheduled messages
            </p>
          </div>
        ) : (
          <div className="flex flex-col py-2">
            {messages.map((msg) => (
              <ScheduledMessageCard
                key={msg.id}
                message={msg}
                avatarUrl={msg.recipient_id ? avatarMap[msg.recipient_id] : undefined}
                onSendNow={sendNow}
                onCancel={cancelSchedule}
                onChangeTime={setRescheduleTarget}
              />
            ))}
          </div>
        )}
      </div>

      {/* Reschedule dialog */}
      <ScheduleDialog
        open={rescheduleTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRescheduleTarget(null);
        }}
        onSchedule={handleReschedule}
      />
    </div>
  );
}

/**
 * A single scheduled message card with recipient info, send time,
 * content preview, and action buttons.
 */
function ScheduledMessageCard({
  message,
  avatarUrl,
  onSendNow,
  onCancel,
  onChangeTime,
}: {
  message: ScheduledMessage;
  /** Real avatar URL resolved from the users table, if available */
  avatarUrl?: string;
  onSendNow: (id: string) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
  /** Opens the reschedule dialog for this message */
  onChangeTime: (id: string) => void;
}) {
  const [actionLoading, setActionLoading] = useState<"send" | "cancel" | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const fallbackIcon = getFallbackIcon(message.recipient_type, message.recipient_label);
  const iconSrc = avatarUrl || fallbackIcon;
  const isImage = avatarUrl ? true : fallbackIcon.startsWith("/images/");

  /** Detect whether the text content overflows (is truncated). */
  useEffect(() => {
    const el = textRef.current;
    if (el) {
      setIsTruncated(el.scrollWidth > el.clientWidth);
    }
  }, [message.content]);

  /**
   * Handle "Send now" click.
   */
  const handleSendNow = useCallback(async () => {
    setActionLoading("send");
    await onSendNow(message.id);
    setActionLoading(null);
  }, [onSendNow, message.id]);

  /**
   * Handle "Cancel" click.
   */
  const handleCancel = useCallback(async () => {
    setActionLoading("cancel");
    await onCancel(message.id);
    setActionLoading(null);
  }, [onCancel, message.id]);

  return (
    <div className="group flex items-start gap-3 border-b border-[var(--color-slack-border)] px-5 py-3 hover:bg-[#f8f8f8] transition-colors">
      {/* Recipient icon */}
      <div className="relative mt-0.5 h-9 w-9 shrink-0 overflow-hidden rounded-[5.5px]">
        {isImage ? (
          <Image
            src={iconSrc}
            alt=""
            width={36}
            height={36}
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#f0f0f0] rounded-[5.5px]">
            <Image
              src={iconSrc}
              alt=""
              width={20}
              height={20}
              className="opacity-60"
            />
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Recipient label + scheduled time */}
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold text-[var(--color-slack-text)]">
            {message.recipient_label || "Message"}
          </span>
          <span className="text-[13px] text-[var(--color-slack-text)] opacity-50">
            {formatSendTime(message.send_at)}
          </span>
        </div>

        {/* Message preview -- renders inline HTML so @mention / #channel chips keep their styling */}
        <div className="flex min-w-0 items-baseline gap-1">
          <div
            ref={textRef}
            className={`rich-text min-w-0 text-[15px] leading-[22px] text-[var(--color-slack-text)] opacity-70 ${expanded ? "whitespace-pre-wrap break-words" : "truncate"}`}
            dangerouslySetInnerHTML={{ __html: inlineHtml(message.content) }}
          />
          {expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="shrink-0 text-[13px] font-medium text-[#1264a3] hover:underline"
            >
              show&nbsp;less
            </button>
          ) : (
            isTruncated && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="hidden shrink-0 text-[13px] font-medium text-[#1264a3] hover:underline group-hover:inline"
              >
                show&nbsp;more
              </button>
            )
          )}
        </div>
      </div>

      {/* Action buttons -- right side, visible on hover, no reserved space */}
      <div className="hidden shrink-0 items-center gap-2 group-hover:flex">
        <button
          type="button"
          onClick={handleSendNow}
          disabled={actionLoading !== null}
          className="rounded-[4px] bg-[var(--color-slack-send-active)] px-3 py-1 text-[13px] font-medium text-white hover:opacity-90 transition-colors disabled:opacity-50"
        >
          {actionLoading === "send" ? "Sending..." : "Send now"}
        </button>
        <button
          type="button"
          onClick={() => onChangeTime(message.id)}
          disabled={actionLoading !== null}
          className="rounded-[4px] border border-[var(--color-slack-border)] bg-white px-3 py-1 text-[13px] font-medium text-[var(--color-slack-text)] hover:bg-[#f0f0f0] transition-colors disabled:opacity-50"
        >
          Reschedule
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={actionLoading !== null}
          className="rounded-[4px] border border-[var(--color-slack-border)] bg-white px-3 py-1 text-[13px] font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {actionLoading === "cancel" ? "Cancelling..." : "Cancel"}
        </button>
      </div>
    </div>
  );
}
