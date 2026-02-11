"use client";

import Image from "next/image";
import type { MentionCategory } from "@/lib/hooks/useMentionSuggestions";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Placeholder colors for avatars that have no photo. */
const AVATAR_COLORS = [
  "#FFD57E",
  "#78D7DD",
  "#112377",
  "#FFB6BD",
  "#DE8969",
  "#608813",
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Pick a deterministic placeholder colour from a string id.
 */
function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** The recipient data needed to render a chip. */
export interface Recipient {
  /** Unique identifier (user id, conversation id) */
  id: string;
  /** Display label (username, session name, channel name) */
  label: string;
  /** Avatar URL or null */
  avatar_url: string | null;
  /** Which category the recipient belongs to */
  type: Exclude<MentionCategory, "app">;
}

interface ReceiverChipProps {
  /** The selected recipient */
  recipient: Recipient;
  /** Whether the chip is in an active/highlighted state (e.g. receiver list is open) */
  active?: boolean;
  /** Called when the chip is clicked (e.g. to open receiver popover) */
  onClick?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * Presentational chip for the "To" bar in the new message dialog.
 * Renders differently based on recipient type:
 * - **Person**: round avatar photo + name + chevron
 * - **Channel**: `#` hashtag icon + name + chevron
 * - **Agent**: Slackbot avatar + name + chevron
 *
 * Styled with a light blue background per the Figma design.
 */
export function ReceiverChip({ recipient, active, onClick }: ReceiverChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded-[7px] p-[3px] pr-1 text-[#1264a3] transition-colors ${
        active
          ? "bg-[rgba(29,155,209,0.2)]"
          : "bg-[rgba(29,155,209,0.1)] hover:bg-[rgba(29,155,209,0.15)]"
      }`}
    >
      {/* Avatar */}
      <ChipAvatar recipient={recipient} />

      {/* Label */}
      <span className="text-[15px] leading-[19px] whitespace-nowrap">
        {recipient.label}
      </span>

      {/* Chevron — inline SVG so it inherits the text color */}
      <svg
        width="15"
        height="15"
        viewBox="0 0 15 15"
        fill="none"
        className="shrink-0"
      >
        <path
          d="M4.5 6L7.5 9L10.5 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Avatar sub-component                                               */
/* ------------------------------------------------------------------ */

/**
 * Renders the appropriate 18×18 avatar for a chip:
 * - Channel: rounded square with # icon
 * - Agent: Slackbot image
 * - Person with photo: avatar image
 * - Person without photo: coloured initial
 */
function ChipAvatar({ recipient }: { recipient: Recipient }) {
  if (recipient.type === "channel") {
    return (
      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] bg-[rgba(29,28,29,0.1)]">
        <Image
          src="/icons/hashtag-thin.svg"
          alt="#"
          width={14}
          height={14}
          className="opacity-70"
        />
      </span>
    );
  }

  if (recipient.avatar_url) {
    return (
      <Image
        src={recipient.avatar_url}
        alt={recipient.label}
        width={18}
        height={18}
        className="shrink-0 rounded-[4px] object-cover"
      />
    );
  }

  return (
    <span
      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] text-[10px] font-bold text-white"
      style={{ backgroundColor: avatarColor(recipient.id) }}
    >
      {recipient.label.charAt(0).toUpperCase()}
    </span>
  );
}
