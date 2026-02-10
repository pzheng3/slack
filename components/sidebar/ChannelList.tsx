"use client";

import { CHANNELS } from "@/lib/constants";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface ChannelListProps {
  onNavigate: () => void;
}

/**
 * Renders the list of channels in the sidebar, matching the Figma design.
 * Each channel has a thin hashtag icon and the channel name.
 */
export function ChannelList({ onNavigate }: ChannelListProps) {
  const pathname = usePathname();

  return (
    <>
      {CHANNELS.map((name) => {
        const href = `/chat/channel/${name}`;
        const isActive = pathname === href;

        return (
          <Link
            key={name}
            href={href}
            onClick={onNavigate}
            className={`
              flex h-[28px] w-full min-w-0 items-center gap-2 rounded-[6px] px-3
              ${
                isActive
                  ? "bg-[var(--color-slack-sidebar-selected)] text-[var(--color-slack-sidebar-selected-text)]"
                  : "text-[var(--color-slack-sidebar-text)] hover:bg-white/5"
              }
            `}
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
            <span className="min-w-0 flex-1 truncate text-[15px] leading-[17px]">{name}</span>
          </Link>
        );
      })}
    </>
  );
}
