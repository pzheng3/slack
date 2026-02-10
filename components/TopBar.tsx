"use client";

import Image from "next/image";

/**
 * Top navigation bar matching the Slack Figma design.
 * Dark purple background with centered search bar.
 */
export function TopBar() {
  return (
    <div className="flex h-[44px] items-center justify-between bg-[var(--color-slack-topbar)] overflow-hidden shadow-[0px_1px_0px_0px_rgba(255,255,255,0.1)]">
      {/* Left spacer */}
      <div className="flex flex-1 items-center justify-end pl-8 pr-4" />

      {/* Search bar */}
      <button className="flex w-[430px] items-center justify-center gap-1 rounded-[6px] bg-white/20 px-2 py-1 shadow-[0px_0px_0px_1px_rgba(29,28,29,0.3),0px_1px_3px_0px_rgba(0,0,0,0.08)]">
        <Image
          src="/icons/search.svg"
          alt=""
          width={15}
          height={15}
          className="opacity-100"
        />
        <span className="pl-2 text-[13px] leading-[1.38] text-white">
          Search Acme
        </span>
      </button>

      {/* Right spacer */}
      <div className="flex flex-1 items-center justify-end pl-8 pr-4" />
    </div>
  );
}
