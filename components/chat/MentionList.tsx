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

/** Tab definitions in display order. */
const TABS: { key: TabKey; label: string }[] = [
  { key: "recent", label: "Recent" },
  { key: "agent", label: "Agent" },
  { key: "people", label: "People" },
  { key: "channel", label: "Channel" },
  { key: "app", label: "App" },
];

type TabKey = "recent" | MentionCategory;

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
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

/** Props passed by the Tiptap suggestion renderer. */
export interface MentionListProps {
  /** Full list of all mentionable items (unfiltered). */
  items: MentionItem[];
  /** Current typed query after the @ character. */
  query: string;
  /** Called when the user selects an item. */
  command: (item: { id: string; label: string }) => void;
  /** Optional: called on Cmd+Return to navigate directly to the entity. */
  onOpen?: (item: MentionItem) => void;
}

/** Handle exposed to the suggestion renderer for keyboard navigation. */
export interface MentionListHandle {
  onKeyDown: (params: { event: KeyboardEvent }) => boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * Tabbed @mention dropdown with Recent / Agent / People / Channel / App tabs.
 *
 * - **No query (default):** "Recent" tab shows 3 of each category sorted
 *   by recency. Other tabs show all items in that category.
 * - **With query:** "Recent" becomes "Results" showing all matches.
 *   Other tabs show only matching items in their category.
 * - **Keyboard:** Up/Down moves through the visible list.
 *   Left/Right switches between tabs.
 */
export const MentionList = forwardRef<MentionListHandle, MentionListProps>(
  function MentionList({ items, query, command, onOpen }, ref) {
    const [activeTab, setActiveTab] = useState<TabKey>("recent");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [cmdHeld, setCmdHeld] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);

    /** Track Meta key for showing ⌘1–⌘9 shortcut hints. */
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

    /* ---- derived data -------------------------------------------- */

    /** Items grouped by category. */
    const byCategory = useMemo(() => {
      const map: Record<MentionCategory, MentionItem[]> = {
        agent: [],
        people: [],
        channel: [],
        app: [],
      };
      for (const item of items) {
        map[item.category].push(item);
      }
      return map;
    }, [items]);

    /**
     * Relevance score for a single item against the query.
     * Higher = better match. Title matches outrank content-only matches;
     * prefix matches outrank substring matches.
     *
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

    /**
     * Items that match the query, sorted by relevance then recency.
     * Title matches always appear before content-only matches.
     */
    const filtered = useMemo(() => {
      if (!isSearching) return items;
      const q = query.toLowerCase();

      type Scored = { item: MentionItem; score: number };
      const scored: Scored[] = [];
      for (const item of items) {
        const s = scoreItem(item, q);
        if (s > 0) scored.push({ item, score: s });
      }

      // Primary: score desc, secondary: recency desc
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (
          new Date(b.item.timestamp).getTime() -
          new Date(a.item.timestamp).getTime()
        );
      });

      return scored.map((s) => s.item);
    }, [items, query, isSearching, scoreItem]);

    /** Filtered items grouped by category. */
    const filteredByCategory = useMemo(() => {
      const map: Record<MentionCategory, MentionItem[]> = {
        agent: [],
        people: [],
        channel: [],
        app: [],
      };
      for (const item of filtered) {
        map[item.category].push(item);
      }
      return map;
    }, [filtered]);

    /** The visible item list for the current tab. */
    const visibleItems = useMemo((): MentionItem[] => {
      if (activeTab === "recent") {
        if (isSearching) {
          // "All results" — already sorted by relevance then recency
          return filtered.slice(0, 20);
        }
        // Recent mode — all items sorted purely by interaction recency
        return [...items]
          .sort(
            (a, b) =>
              new Date(b.timestamp).getTime() -
              new Date(a.timestamp).getTime()
          )
          .slice(0, 20);
      }
      // Specific category tab — filtered list is already relevance-sorted
      const source = isSearching
        ? filteredByCategory[activeTab]
        : byCategory[activeTab];
      return source.slice(0, 20);
    }, [activeTab, isSearching, items, filtered, filteredByCategory, byCategory]);

    /** Tab list — swap "Recent" label for "Results" when searching. */
    const tabList = useMemo(
      () =>
        TABS.map((t) =>
          t.key === "recent" && isSearching
            ? { ...t, label: "All results" }
            : t
        ),
      [isSearching]
    );

    /* ---- reset selection when list or tab changes ---------------- */

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

    /* ---- actions ------------------------------------------------- */

    const selectItem = useCallback(
      (index: number) => {
        const item = visibleItems[index];
        if (item) {
          // Encode category:id so rendered mention chips can navigate on click.
          command({ id: `${item.category}:${item.id}`, label: item.label });
        }
      },
      [visibleItems, command]
    );

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

    /* ---- imperative keyboard handler ----------------------------- */

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedIndex((prev) => Math.max(0, prev - 1));
            return true;
          }

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelectedIndex((prev) =>
              Math.min(visibleItems.length - 1, prev + 1)
            );
            return true;
          }

          if (event.key === "ArrowLeft") {
            event.preventDefault();
            switchTab(-1);
            return true;
          }

          if (event.key === "ArrowRight") {
            event.preventDefault();
            switchTab(1);
            return true;
          }

          /* Cmd+1 … Cmd+9 selects the corresponding item directly. */
          if (
            (event.metaKey || event.ctrlKey) &&
            event.key >= "1" &&
            event.key <= "9"
          ) {
            const idx = parseInt(event.key, 10) - 1;
            if (idx < visibleItems.length) {
              event.preventDefault();
              selectItem(idx);
              return true;
            }
          }

          /* Cmd+Return — navigate directly to the entity. */
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            const item = visibleItems[selectedIndex];
            if (item && onOpen) onOpen(item);
            return true;
          }

          if (event.key === "Enter") {
            event.preventDefault();
            selectItem(selectedIndex);
            return true;
          }

          if (event.key === "Escape") {
            return true;
          }

          return false;
        },
      }),
      [visibleItems, selectedIndex, selectItem, switchTab, onOpen]
    );

    /* ---- render -------------------------------------------------- */

    if (items.length === 0) return null;

    return (
      <div className="w-[calc(100vw-2rem)] max-w-[405px] overflow-hidden rounded-lg bg-[#f8f8f8] shadow-[0px_0px_0px_1px_rgba(29,28,29,0.13),0px_4px_12px_0px_rgba(0,0,0,0.1)]">
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

        {/* Item list — fixed height so switching tabs doesn't resize */}
        <div ref={listRef} className="h-[288px] overflow-y-auto py-1 subtle-scrollbar">
          {visibleItems.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[13px] text-[rgba(29,28,29,0.5)]">
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
                <MentionAvatar item={item} />

                {/* Label */}
                <span className="truncate text-[15px] font-semibold text-[#1d1c1d]">
                  {item.label}
                </span>

                {/* Right-side hint: ⌘number, ⌘↵ to open, or category badge */}
                <span className="ml-auto shrink-0 text-[13px] text-[rgba(29,28,29,0.5)]">
                  {cmdHeld && index < 9
                    ? `⌘${index + 1}`
                    : index === selectedIndex && onOpen
                      ? "⌘↵ to open"
                      : activeTab === "recent"
                        ? item.category.charAt(0).toUpperCase() + item.category.slice(1)
                        : ""}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }
);

/* ------------------------------------------------------------------ */
/*  Avatar sub-component                                               */
/* ------------------------------------------------------------------ */

/**
 * Renders the appropriate avatar for a mention item:
 * - Image for items with avatar_url
 * - # icon for channels
 * - Colored initial placeholder otherwise
 */
function MentionAvatar({ item }: { item: MentionItem }) {
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
