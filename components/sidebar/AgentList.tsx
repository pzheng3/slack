"use client";

import type { AgentSession } from "@/lib/hooks/useAgentSessions";
import { useSupabase } from "@/components/providers/SupabaseProvider";
import { useUnread } from "@/components/providers/UnreadProvider";
import { prefetchSessionChat } from "@/lib/prefetch";
import { X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback } from "react";
import { UnreadBadge } from "./UnreadBadge";

interface AgentListProps {
  /** Callback to close the mobile sidebar on navigation */
  onNavigate: () => void;
  /** User-created dynamic agent sessions */
  sessions?: AgentSession[];
  /** Callback to delete an agent session */
  onDeleteSession?: (sessionId: string) => void;
}

/**
 * Renders the list of AI agent sessions in the sidebar.
 * Shows user-created dynamic sessions in the Slack sidebar style.
 * Each item shows a close button on hover to delete the session.
 *
 * Prefetches session data on hover for instant navigation.
 */
export function AgentList({ onNavigate, sessions = [], onDeleteSession }: AgentListProps) {
  const pathname = usePathname();
  const supabase = useSupabase();
  const { unreadCounts } = useUnread();

  /**
   * Prefetch session data on hover so the page renders instantly on click.
   */
  const handlePrefetch = useCallback(
    (sessionId: string) => {
      prefetchSessionChat(supabase, sessionId);
    },
    [supabase]
  );

  return (
    <>
      {/* User-created dynamic sessions */}
      {sessions.map((session) => {
        const href = `/chat/agent/session/${session.id}`;
        const isActive = pathname === href;

        return (
          <div
            key={session.id}
            onMouseEnter={() => handlePrefetch(session.id)}
            className={`
              group flex h-[28px] w-full min-w-0 items-center rounded-[6px]
              ${
                isActive
                  ? "bg-[var(--color-slack-sidebar-selected)] text-[var(--color-slack-sidebar-selected-text)]"
                  : "text-[var(--color-slack-sidebar-text)] hover:bg-white/5"
              }
            `}
          >
            <Link
              href={href}
              onClick={onNavigate}
              className="flex min-w-0 flex-1 items-center gap-2 px-3"
            >
              <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-[3px]">
                <Image
                  src="/images/Slackbot.png"
                  alt={session.name}
                  width={20}
                  height={20}
                  className="object-cover"
                />
              </div>
              <span className="min-w-0 flex-1 truncate text-[15px] leading-[17px]">
                {session.name}
              </span>
            </Link>

            {/* Unread badge — hidden when active or on hover (close button takes its place) */}
            {!isActive && (unreadCounts[session.id] ?? 0) > 0 && (
              <span className="mr-2 group-hover:hidden">
                <UnreadBadge count={unreadCounts[session.id]} />
              </span>
            )}

            {/* Close button — visible on hover, 4px gap from text */}
            {onDeleteSession && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDeleteSession(session.id);
                }}
                className={`
                  mr-1 hidden shrink-0 items-center justify-center rounded-[4px] p-0.5
                  opacity-70 hover:opacity-100
                  group-hover:flex
                  ${isActive ? "text-[var(--color-slack-sidebar-selected-text)] hover:bg-[#4D2A51]/5" : "text-[var(--color-slack-sidebar-text)] hover:bg-white/10"}
                `}
                aria-label={`Delete ${session.name}`}
              >
                <X size={14} />
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}
