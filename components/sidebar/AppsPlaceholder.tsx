"use client";

import Image from "next/image";

/** @type {{ name: string; icon: string }[]} */
const apps = [
  { name: "Cursor", icon: "/images/Cursor logo.png" },
  { name: "Notion", icon: "/images/Notion logo.png" },
  { name: "Figma", icon: "/images/Figma logo.png" },
];

/**
 * Apps section in the sidebar showing Notion, Figma, and Cursor entries.
 */
export function AppsPlaceholder() {
  return (
    <>
      {apps.map((app) => (
        <div
          key={app.name}
          className="flex h-[28px] w-full min-w-0 items-center gap-2 rounded-[6px] px-3 text-[var(--color-slack-sidebar-text)] hover:bg-white/5"
        >
          <div className="h-5 w-5 shrink-0 overflow-hidden rounded-[3px]">
            <Image
              src={app.icon}
              alt={app.name}
              width={20}
              height={20}
              className="object-cover"
            />
          </div>
          <span className="min-w-0 flex-1 truncate text-[15px] leading-[17px]">
            {app.name}
          </span>
        </div>
      ))}
    </>
  );
}
