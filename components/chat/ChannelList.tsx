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
import type { MentionItem } from "@/lib/hooks/useMentionSuggestions";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

/** Props passed by the Tiptap suggestion renderer. */
export interface ChannelListProps {
  /** Full list of all channel items (unfiltered). */
  items: MentionItem[];
  /** Current typed query after the # character. */
  query: string;
  /** Called when the user selects a channel. */
  command: (item: { id: string; label: string }) => void;
  /** Optional: called on Cmd+Return to navigate directly to the channel. */
  onOpen?: (item: MentionItem) => void;
}

/** Handle exposed to the suggestion renderer for keyboard navigation. */
export interface ChannelListHandle {
  onKeyDown: (params: { event: KeyboardEvent }) => boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * Simple # channel mention dropdown.
 * Shows a flat list of channels filtered by query, with keyboard navigation.
 * Supports Cmd+1–9 quick-select and Cmd+Return to open.
 */
export const ChannelList = forwardRef<ChannelListHandle, ChannelListProps>(
  function ChannelList({ items, query, command, onOpen }, ref) {
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

    /** Channels filtered by query (case-insensitive). */
    const filtered = useMemo(() => {
      if (!query) return items;
      const q = query.toLowerCase();
      return items.filter((i) => i.label.toLowerCase().includes(q));
    }, [items, query]);

    /* ---- reset selection when list changes ----------------------- */

    useEffect(() => {
      setSelectedIndex(0);
    }, [filtered]);

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
        const item = filtered[index];
        if (item) {
          command({ id: `channel:${item.id}`, label: item.label });
        }
      },
      [filtered, command]
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
              Math.min(filtered.length - 1, prev + 1)
            );
            return true;
          }

          /* Cmd+1 … Cmd+9 selects the corresponding channel directly. */
          if (
            (event.metaKey || event.ctrlKey) &&
            event.key >= "1" &&
            event.key <= "9"
          ) {
            const idx = parseInt(event.key, 10) - 1;
            if (idx < filtered.length) {
              event.preventDefault();
              selectItem(idx);
              return true;
            }
          }

          /* Cmd+Return — navigate directly to the channel. */
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            const item = filtered[selectedIndex];
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
      [filtered, selectedIndex, selectItem, onOpen]
    );

    /* ---- render -------------------------------------------------- */

    if (items.length === 0) return null;

    return (
      <div className="w-[405px] overflow-hidden rounded-lg bg-[#f8f8f8] shadow-[0px_0px_0px_1px_rgba(29,28,29,0.13),0px_4px_12px_0px_rgba(0,0,0,0.1)]">
        {/* Channel list — fixed height matching the @mention menu */}
        <div ref={listRef} className="h-[288px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[13px] text-[rgba(29,28,29,0.5)]">
              No channels found
            </div>
          ) : (
            filtered.map((item, index) => (
              <button
                key={item.id}
                className={`flex w-full items-center gap-2 px-4 py-[6px] text-left ${
                  index === selectedIndex ? "bg-[#ebebeb]" : ""
                }`}
                onClick={() => selectItem(index)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {/* # icon */}
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] bg-[rgba(29,28,29,0.1)]">
                  <Image
                    src="/icons/hashtag-thin.svg"
                    alt="#"
                    width={14}
                    height={14}
                    className="opacity-70"
                  />
                </span>

                {/* Channel name */}
                <span className="truncate text-[15px] font-semibold text-[#1d1c1d]">
                  {item.label}
                </span>

                {/* Right-side hint: ⌘number or ⌘↵ to open */}
                <span className="ml-auto shrink-0 text-[13px] text-[rgba(29,28,29,0.5)]">
                  {cmdHeld && index < 9
                    ? `⌘${index + 1}`
                    : index === selectedIndex && onOpen
                      ? "⌘↵ to open"
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
