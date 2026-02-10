"use client";

import type { Channel } from "@/lib/hooks/useChannels";
import { X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface ChannelListProps {
  /** Callback to close the mobile sidebar on navigation */
  onNavigate: () => void;
  /** Dynamic channel list fetched from Supabase */
  channels?: Channel[];
  /** Callback to delete a channel — triggers confirmation in parent */
  onDeleteChannel?: (channelId: string, channelName: string) => void;
}

/**
 * Renders the list of channels in the sidebar.
 * Each channel has a thin hashtag icon, the channel name,
 * and a close button visible on hover (matching agent list behavior).
 */
export function ChannelList({ onNavigate, channels = [], onDeleteChannel }: ChannelListProps) {
  const pathname = usePathname();

  return (
    <>
      {channels.map((channel) => {
        const href = `/chat/channel/${channel.name}`;
        const isActive = pathname === href;

        return (
          <div
            key={channel.id}
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
              <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                <Image
                  src="/icons/hashtag-thin.svg"
                  alt=""
                  width={18}
                  height={18}
                  className={isActive ? "opacity-70" : "brightness-0 invert opacity-70"}
                />
              </div>
              <span className="min-w-0 flex-1 truncate text-[15px] leading-[17px]">
                {channel.name}
              </span>
            </Link>

            {/* Close button — visible on hover */}
            {onDeleteChannel && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDeleteChannel(channel.id, channel.name);
                }}
                className={`
                  mr-1 hidden shrink-0 items-center justify-center rounded-[4px] p-0.5
                  opacity-70 hover:opacity-100
                  group-hover:flex
                  ${isActive ? "text-[var(--color-slack-sidebar-selected-text)] hover:bg-[#4D2A51]/5" : "text-[var(--color-slack-sidebar-text)] hover:bg-white/10"}
                `}
                aria-label={`Delete #${channel.name}`}
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
