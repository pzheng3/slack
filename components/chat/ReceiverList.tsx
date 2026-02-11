"use client";

import Image from "next/image";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  MentionCategory,
  MentionItem,
} from "@/lib/hooks/useMentionSuggestions";
import type { Recipient } from "@/components/chat/ReceiverChip";

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

/** Tab definitions — excludes "app" since you can't send to apps. */
const TABS: { key: TabKey; label: string }[] = [
  { key: "recent", label: "Recent" },
  { key: "agent", label: "Agent" },
  { key: "people", label: "People" },
  { key: "channel", label: "Channel" },
];

/** Sendable categories (everything except "app"). */
type SendableCategory = Exclude<MentionCategory, "app">;

type TabKey = "recent" | SendableCategory;

/**
 * Synthetic "New agent" item that always appears first in the
 * Recent tab so users can quickly start a new agent session.
 */
const NEW_AGENT_ITEM: MentionItem = {
  id: "__new_agent__",
  label: "Start a new agent",
  avatar_url: "/images/Slackbot.png",
  category: "agent",
  // Far-future timestamp so it sorts first
  timestamp: "2999-01-01T00:00:00.000Z",
};

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

interface ReceiverListProps {
  /** Full list of all mentionable items (from useMentionSuggestions). */
  items: MentionItem[];
  /** Current search query typed in the To bar. */
  query: string;
  /** Called when the user selects a recipient (Enter). */
  onSelect: (recipient: Recipient) => void;
  /** Called when the user wants to jump straight to a chat (Cmd+Enter). */
  onOpenChat: (recipient: Recipient) => void;
  /** Called when the user dismisses the list (Escape). */
  onClose: () => void;
}

/** Handle exposed to the parent for keyboard navigation from the To bar input. */
export interface ReceiverListHandle {
  onKeyDown: (e: React.KeyboardEvent) => boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * Tabbed popover dropdown for selecting the message recipient.
 * Displayed as a floating popover below the To bar.
 *
 * - Excludes "app" category (can't send messages to apps)
 * - The To bar input acts as the search field (query is passed in)
 * - "New agent" is always the first item in the Recent tab
 * - Keyboard navigation: ArrowUp/Down to move, Left/Right to switch tabs, Enter to select
 *
 * Exposes a `ReceiverListHandle` via ref so the parent To bar input can
 * delegate keyboard events to it.
 */
export const ReceiverList = forwardRef<ReceiverListHandle, ReceiverListProps>(
  function ReceiverList({ items, query, onSelect, onOpenChat, onClose }, ref) {
  const [activeTab, setActiveTab] = useState<TabKey>("recent");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  /** Whether the Cmd (Meta) key is currently held down. */
  const [cmdHeld, setCmdHeld] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Meta") setCmdHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Meta") setCmdHeld(false);
    };
    const blur = () => setCmdHeld(false);

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const isSearching = query.length > 0;

  /** Filter out "app" items — can't send messages to apps. */
  const sendableItems = useMemo(
    () => items.filter((i) => i.category !== "app"),
    [items]
  );

  /* ---- derived data ------------------------------------------------ */

  /** Items grouped by category. */
  const byCategory = useMemo(() => {
    const map: Record<SendableCategory, MentionItem[]> = {
      agent: [],
      people: [],
      channel: [],
    };
    for (const item of sendableItems) {
      map[item.category as SendableCategory].push(item);
    }
    return map;
  }, [sendableItems]);

  /**
   * Relevance score for a single item against the query.
   *   3 — label starts with the query (prefix match)
   *   2 — label contains the query (substring match)
   *   1 — searchableContent contains the query (content-only match)
   *   0 — no match
   */
  const scoreItem = useCallback(
    (item: MentionItem, q: string): number => {
      const label = item.label.toLowerCase();
      if (label.startsWith(q)) return 3;
      if (label.includes(q)) return 2;
      if (
        item.searchableContent &&
        item.searchableContent.toLowerCase().includes(q)
      )
        return 1;
      return 0;
    },
    []
  );

  /** Items that match the query, sorted by relevance then recency. */
  const filtered = useMemo(() => {
    if (!isSearching) return sendableItems;
    const q = query.toLowerCase();

    // Also check if "New agent" matches the query
    const newAgentScore = scoreItem(NEW_AGENT_ITEM, q);

    type Scored = { item: MentionItem; score: number };
    const scored: Scored[] = [];

    if (newAgentScore > 0) {
      scored.push({ item: NEW_AGENT_ITEM, score: newAgentScore });
    }

    for (const item of sendableItems) {
      const s = scoreItem(item, q);
      if (s > 0) scored.push({ item, score: s });
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (
        new Date(b.item.timestamp).getTime() -
        new Date(a.item.timestamp).getTime()
      );
    });

    return scored.map((s) => s.item);
  }, [sendableItems, query, isSearching, scoreItem]);

  /** Filtered items grouped by category. */
  const filteredByCategory = useMemo(() => {
    const map: Record<SendableCategory, MentionItem[]> = {
      agent: [],
      people: [],
      channel: [],
    };
    for (const item of filtered) {
      map[item.category as SendableCategory].push(item);
    }
    return map;
  }, [filtered]);

  /** The visible item list for the current tab. */
  const visibleItems = useMemo((): MentionItem[] => {
    if (activeTab === "recent") {
      if (isSearching) {
        return filtered.slice(0, 20);
      }
      // Recent mode — "New agent" first, then all items sorted by recency
      const sorted = [...sendableItems]
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() -
            new Date(a.timestamp).getTime()
        )
        .slice(0, 19);
      return [NEW_AGENT_ITEM, ...sorted];
    }
    const source = isSearching
      ? filteredByCategory[activeTab]
      : byCategory[activeTab];

    // In the Agent tab, also prepend "New agent" when not searching
    if (activeTab === "agent" && !isSearching) {
      return [NEW_AGENT_ITEM, ...source.slice(0, 19)];
    }
    return source.slice(0, 20);
  }, [activeTab, isSearching, sendableItems, filtered, filteredByCategory, byCategory]);

  /** Tab list — swap "Recent" for "All results" when searching. */
  const tabList = useMemo(
    () =>
      TABS.map((t) =>
        t.key === "recent" && isSearching
          ? { ...t, label: "All results" }
          : t
      ),
    [isSearching]
  );

  /* ---- reset selection when list or tab changes -------------------- */

  useEffect(() => {
    setSelectedIndex(0);
  }, [visibleItems, activeTab]);

  /** Reset to Recent tab when query clears. */
  useEffect(() => {
    if (!isSearching) {
      setActiveTab("recent");
    }
  }, [isSearching]);

  /** Scroll the selected item into view when navigating via keyboard. */
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const child = container.children[selectedIndex] as HTMLElement | undefined;
    child?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  /* ---- actions ----------------------------------------------------- */

  /**
   * Build a Recipient object from a visible item by index.
   */
  const toRecipient = useCallback(
    (index: number): Recipient | null => {
      const item = visibleItems[index];
      if (!item) return null;
      return {
        id: item.id,
        label: item.label,
        avatar_url: item.avatar_url,
        type: item.category as Exclude<MentionCategory, "app">,
      };
    },
    [visibleItems]
  );

  /**
   * Select an item and notify the parent.
   */
  const selectItem = useCallback(
    (index: number) => {
      const r = toRecipient(index);
      if (r) onSelect(r);
    },
    [toRecipient, onSelect]
  );

  /**
   * Open chat for an item directly (Cmd+Enter).
   */
  const openChatItem = useCallback(
    (index: number) => {
      const r = toRecipient(index);
      if (r) onOpenChat(r);
    },
    [toRecipient, onOpenChat]
  );

  /**
   * Switch to the next/previous tab.
   */
  const switchTab = useCallback(
    (direction: -1 | 1) => {
      setActiveTab((current) => {
        const idx = TABS.findIndex((t) => t.key === current);
        const next = (idx + direction + TABS.length) % TABS.length;
        return TABS[next].key;
      });
    },
    []
  );

  /* ---- imperative keyboard handler --------------------------------- */

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: (e: React.KeyboardEvent): boolean => {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(0, prev - 1));
          return true;
        }

        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) =>
            Math.min(visibleItems.length - 1, prev + 1)
          );
          return true;
        }

        if (e.key === "ArrowLeft" && !query) {
          e.preventDefault();
          switchTab(-1);
          return true;
        }

        if (e.key === "ArrowRight" && !query) {
          e.preventDefault();
          switchTab(1);
          return true;
        }

        /* Cmd+1 … Cmd+9 selects the corresponding item directly. */
        if (
          (e.metaKey || e.ctrlKey) &&
          e.key >= "1" &&
          e.key <= "9"
        ) {
          const idx = parseInt(e.key, 10) - 1;
          if (idx < visibleItems.length) {
            e.preventDefault();
            selectItem(idx);
            return true;
          }
        }

        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          openChatItem(selectedIndex);
          return true;
        }

        if (e.key === "Enter") {
          e.preventDefault();
          selectItem(selectedIndex);
          return true;
        }

        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
          return true;
        }

        return false;
      },
    }),
    [visibleItems, selectedIndex, selectItem, openChatItem, switchTab, query, onClose]
  );

  /* ---- render ------------------------------------------------------ */

  return (
    <div className="w-full overflow-hidden rounded-lg bg-[#f8f8f8] shadow-[0px_0px_0px_1px_rgba(29,28,29,0.13),0px_4px_16px_0px_rgba(0,0,0,0.16),0px_8px_32px_0px_rgba(0,0,0,0.1)]">
      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b border-[rgba(29,28,29,0.13)] px-2 pt-2">
        {tabList.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 px-3 pb-2 border-b-2 text-[13px] font-semibold transition-colors ${
              activeTab === tab.key
                ? "border-[#1264a3] text-[#1264a3]"
                : "border-transparent text-[rgba(29,28,29,0.7)] hover:text-[#1d1c1d]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Item list */}
      <div ref={listRef} className="h-[280px] overflow-y-auto py-1 subtle-scrollbar">
        {visibleItems.length === 0 ? (
          <div className="flex h-20 items-center justify-center text-[13px] text-[rgba(29,28,29,0.5)]">
            No results
          </div>
        ) : (
          visibleItems.map((item, index) => (
            <button
              key={`${item.category}-${item.id}`}
              className={`flex w-full items-center gap-2 px-4 py-[6px] text-left ${
                index === selectedIndex ? "bg-[#ebebeb]" : ""
              }`}
              onClick={() => selectItem(index)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {/* Avatar / Icon */}
              <ReceiverAvatar item={item} />

              {/* Label */}
              <span className="truncate text-[15px] font-semibold text-[#1d1c1d]">
                {item.label}
              </span>

              {/* Right-side hint: Cmd+number shortcut, selection hint, or category */}
              <span className="ml-auto shrink-0 text-[13px] text-[rgba(29,28,29,0.5)]">
                {cmdHeld && index < 9
                  ? `⌘${index + 1}`
                  : index === selectedIndex
                    ? "⌘↵ to open"
                    : activeTab === "recent"
                      ? item.category.charAt(0).toUpperCase() +
                        item.category.slice(1)
                      : ""}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  Avatar sub-component                                               */
/* ------------------------------------------------------------------ */

/**
 * Renders the appropriate avatar for a receiver list item:
 * - Image for items with avatar_url
 * - # icon for channels
 * - Colored initial placeholder otherwise
 */
function ReceiverAvatar({ item }: { item: MentionItem }) {
  if (item.category === "channel") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] bg-[rgba(29,28,29,0.1)]">
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

  if (item.avatar_url) {
    return (
      <Image
        src={item.avatar_url}
        alt={item.label}
        width={20}
        height={20}
        className="shrink-0 rounded-[3px] object-cover"
      />
    );
  }

  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] text-[11px] font-bold text-white"
      style={{ backgroundColor: avatarColor(item.id) }}
    >
      {item.label.charAt(0).toUpperCase()}
    </span>
  );
}
