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
  SlashCommandCategory,
  SlashCommandItem,
} from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Tab definitions in display order. */
const TABS: { key: TabKey; label: string }[] = [
  { key: "recent", label: "Recent" },
  { key: "command", label: "Commands" },
  { key: "skill", label: "Skills" },
  { key: "app", label: "Apps" },
];

type TabKey = "recent" | SlashCommandCategory;

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

/** Props passed by the Tiptap suggestion renderer. */
export interface SlashCommandListProps {
  /** Full list of all slash command items (unfiltered). */
  items: SlashCommandItem[];
  /** Current typed query after the / character. */
  query: string;
  /** Called when the user selects an item. Passes full data needed for the node. */
  command: (item: {
    id: string;
    label: string;
    category: string;
    body: string;
  }) => void;
  /** Ordered list of recently-used item ids (most recent first). */
  recentIds: string[];
  /** Callback to record a command as recently used. */
  onRecordRecent: (id: string) => void;
}

/** Handle exposed to the suggestion renderer for keyboard navigation. */
export interface SlashCommandListHandle {
  onKeyDown: (params: { event: KeyboardEvent }) => boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * Tabbed `/` slash command dropdown with Recent / Commands / Skills / Apps tabs.
 *
 * - **No query (default):** "Recent" tab shows recently used items.
 *   Other tabs show all items in that category.
 * - **With query:** "Recent" becomes "Results" showing all matches.
 *   Other tabs show only matching items in their category.
 * - **Keyboard:** Up/Down moves through the visible list.
 *   Left/Right switches between tabs.
 * - **Hover:** Shows the full description of the hovered item.
 */
export const SlashCommandList = forwardRef<
  SlashCommandListHandle,
  SlashCommandListProps
>(function SlashCommandList(
  { items, query, command, recentIds, onRecordRecent },
  ref
) {
  const [activeTab, setActiveTab] = useState<TabKey>("recent");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  /** Whether the currently hovered row's subtitle text is truncated. */
  const [hoveredTruncated, setHoveredTruncated] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const isSearching = query.length > 0;

  /* ---- derived data -------------------------------------------- */

  /** Items grouped by category. */
  const byCategory = useMemo(() => {
    const map: Record<SlashCommandCategory, SlashCommandItem[]> = {
      command: [],
      skill: [],
      app: [],
    };
    for (const item of items) {
      map[item.category].push(item);
    }
    return map;
  }, [items]);

  /** Items filtered by query (case-insensitive on label + description). */
  const filtered = useMemo(() => {
    if (!isSearching) return items;
    const q = query.toLowerCase();
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q)
    );
  }, [items, query, isSearching]);

  /** Filtered items grouped by category. */
  const filteredByCategory = useMemo(() => {
    const map: Record<SlashCommandCategory, SlashCommandItem[]> = {
      command: [],
      skill: [],
      app: [],
    };
    for (const item of filtered) {
      map[item.category].push(item);
    }
    return map;
  }, [filtered]);

  /** The visible item list for the current tab. */
  const visibleItems = useMemo((): SlashCommandItem[] => {
    if (activeTab === "recent") {
      if (isSearching) {
        // "All results" mode — all matching items
        return filtered.slice(0, 20);
      }
      // Recent mode — items ordered by recency from localStorage
      if (recentIds.length === 0) {
        // If no recents yet, show all items
        return items.slice(0, 20);
      }
      const itemMap = new Map(items.map((i) => [i.id, i]));
      const recent: SlashCommandItem[] = [];
      for (const id of recentIds) {
        const item = itemMap.get(id);
        if (item) recent.push(item);
      }
      return recent.slice(0, 20);
    }
    // Specific category tab
    const source = isSearching
      ? filteredByCategory[activeTab]
      : byCategory[activeTab];
    return source.slice(0, 20);
  }, [activeTab, isSearching, items, filtered, filteredByCategory, byCategory, recentIds]);

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
    setHoveredIndex(null);
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
        onRecordRecent(item.id);
        command({
          id: item.id,
          label: item.label,
          category: item.category,
          body: item.body,
        });
      }
    },
    [visibleItems, command, onRecordRecent]
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
    [visibleItems, selectedIndex, selectItem, switchTab]
  );

  /* ---- render -------------------------------------------------- */

  if (items.length === 0) return null;

  /** The item whose description tooltip is shown. */
  const tooltipItem =
    hoveredIndex !== null ? visibleItems[hoveredIndex] : null;

  return (
    <div className="relative w-[575px] rounded-lg bg-[#f8f8f8] shadow-[0px_0px_0px_1px_rgba(29,28,29,0.13),0px_4px_12px_0px_rgba(0,0,0,0.1)]">
      {/* Tab bar */}
      <div className="flex border-b border-[rgba(29,28,29,0.13)] px-2 pt-2">
        {tabList.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 pb-2 border-b-2 text-[13px] font-semibold transition-colors ${
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
      <div ref={listRef} className="h-[320px] overflow-y-auto py-2">
        {visibleItems.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[13px] text-[rgba(29,28,29,0.5)]">
            No results
          </div>
        ) : (
          visibleItems.map((item, index) => (
            <SlashCommandRow
              key={`${item.category}-${item.id}`}
              item={item}
              selected={index === selectedIndex}
              onSelect={() => selectItem(index)}
              onMouseEnter={(truncated) => {
                setSelectedIndex(index);
                setHoveredIndex(index);
                setHoveredTruncated(truncated);
              }}
              onMouseLeave={() => {
                setHoveredIndex(null);
                setHoveredTruncated(false);
              }}
            />
          ))
        )}
      </div>

      {/* Hover description tooltip — only when subtitle is truncated */}
      {hoveredIndex !== null &&
        hoveredTruncated &&
        tooltipItem &&
        (tooltipItem.category === "command" ||
          tooltipItem.category === "skill") &&
        tooltipItem.description && (
          <DescriptionTooltip
            description={tooltipItem.description}
            itemIndex={hoveredIndex}
          />
        )}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  Row sub-component                                                  */
/* ------------------------------------------------------------------ */

/**
 * A single row in the slash command dropdown.
 * Shows an icon/avatar, bold label, and description subtitle.
 * Matches the Figma design: 8px left padding, 20px icon, bold 15px label,
 * 13px description in muted color.
 *
 * @param item - The slash command item to render
 * @param selected - Whether this row is keyboard-selected / hovered
 * @param onSelect - Click handler
 * @param onMouseEnter - Mouse enter handler
 * @param onMouseLeave - Mouse leave handler
 */
function SlashCommandRow({
  item,
  selected,
  onSelect,
  onMouseEnter,
  onMouseLeave,
}: {
  item: SlashCommandItem;
  selected: boolean;
  onSelect: () => void;
  /** Called with `true` when the subtitle is truncated, `false` otherwise. */
  onMouseEnter: (truncated: boolean) => void;
  onMouseLeave: () => void;
}) {
  const subtitleRef = useRef<HTMLDivElement>(null);

  /** Strip leading "/" from command/skill labels for display. */
  const displayLabel =
    item.category !== "app" && item.label.startsWith("/")
      ? item.label.slice(1)
      : item.label;

  return (
    <button
      className={`flex w-full items-center py-[10px] pl-2 text-left ${
        selected ? "bg-[#ebebeb]" : ""
      }`}
      onClick={onSelect}
      onMouseEnter={() => {
        const el = subtitleRef.current;
        const truncated = el ? el.scrollWidth > el.clientWidth : false;
        onMouseEnter(truncated);
      }}
      onMouseLeave={onMouseLeave}
    >
      {/* Icon / Avatar */}
      <div className="flex shrink-0 items-center px-2">
        <SlashCommandIcon item={item} />
      </div>

      {/* Label + description */}
      <div className="flex min-w-0 flex-col items-start pr-2">
        <span className="text-[15px] font-bold leading-[22px] text-[#1d1c1d]">
          {displayLabel}
        </span>
        <div
          ref={subtitleRef}
          className="truncate w-full text-[13px] leading-[18px] text-[rgba(29,28,29,0.7)]"
        >
          {item.category === "app" ? (
            <AppSubtitle item={item} />
          ) : (
            <span>
              <span className="font-bold">
                {item.category === "command" ? "Command" : "Skill"}
              </span>
              {item.description ? ` · ${item.description}` : ""}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Icon sub-component                                                 */
/* ------------------------------------------------------------------ */

/**
 * Renders the appropriate icon for a slash command item:
 * - Image avatar for app items with avatar_url
 * - SVG icon from /icons/ for items with an icon field
 * - Default shortcut icon otherwise
 *
 * @param item - The slash command item
 */
function SlashCommandIcon({ item }: { item: SlashCommandItem }) {
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

  const iconName = item.icon || "shortcut";
  return (
    <Image
      src={`/icons/${iconName}.svg`}
      alt={item.label}
      width={20}
      height={20}
      className="shrink-0 opacity-70"
    />
  );
}

/* ------------------------------------------------------------------ */
/*  App subtitle sub-component                                         */
/* ------------------------------------------------------------------ */

/** Slack-owned avatar paths — commands using these show "Slack · description". */
const SLACK_AVATARS = new Set(["/images/Slack.png", "/images/Slackbot.png"]);

/**
 * Subtitle line for app items in the slash command dropdown.
 *
 * - **Slack apps:**        `Slack · Description`
 * - **Third-party apps:**  `App · AppName · Description`
 *
 * "App" / app-name tokens are bold; description is normal weight.
 *
 * @param item - The app slash command item
 */
function AppSubtitle({ item }: { item: SlashCommandItem }) {
  const isSlack = SLACK_AVATARS.has(item.avatar_url ?? "");

  if (isSlack) {
    return (
      <span>
        <span className="font-bold">Slack</span>
        {item.description && <span> &middot; {item.description}</span>}
      </span>
    );
  }

  // Derive the app name from the command label: "/notion create ..." → "Notion"
  const rawName = item.label.startsWith("/")
    ? item.label.slice(1).split(" ")[0]
    : "App";
  const appName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  return (
    <span>
      <span className="font-bold">App</span>
      <span> &middot; </span>
      <span className="font-bold">{appName}</span>
      {item.description && <span> &middot; {item.description}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Tooltip sub-component                                              */
/* ------------------------------------------------------------------ */

/**
 * Floating tooltip that shows the full description text
 * when hovering over a command or skill row.
 * Positioned to the right of the dropdown, vertically aligned
 * to the hovered item index.
 *
 * @param description - The description text to display
 * @param itemIndex - Index of the hovered item (used for vertical positioning)
 */
function DescriptionTooltip({
  description,
  itemIndex,
}: {
  description: string;
  itemIndex: number;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const VIEWPORT_MARGIN = 8;

  // Each row is ~42px. Tab bar ~37px, list padding-top 8px.
  const idealTop = 37 + 8 + itemIndex * 42;

  /**
   * After paint, check if the tooltip overflows the viewport
   * and nudge it back inside with a margin.
   */
  useEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();

    // Clamp bottom edge
    if (rect.bottom > window.innerHeight - VIEWPORT_MARGIN) {
      const overflow = rect.bottom - (window.innerHeight - VIEWPORT_MARGIN);
      el.style.transform = `translateY(${idealTop - overflow}px)`;
    }

    // Clamp top edge
    if (rect.top < VIEWPORT_MARGIN) {
      el.style.transform = `translateY(${idealTop + (VIEWPORT_MARGIN - rect.top)}px)`;
    }

    // Clamp right edge
    if (rect.right > window.innerWidth - VIEWPORT_MARGIN) {
      el.style.left = "auto";
      el.style.right = "100%";
      el.style.marginLeft = "0";
      el.style.marginRight = "8px";
    }
  }, [idealTop]);

  return (
    <div
      ref={tooltipRef}
      className="absolute left-full top-0 z-50 ml-2 w-[220px]"
      style={{ transform: `translateY(${idealTop}px)` }}
    >
      <div className="rounded-md bg-[#1d1c1d] px-3 py-2 text-[13px] leading-[18px] text-white shadow-lg">
        {description}
      </div>
    </div>
  );
}
