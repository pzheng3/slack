import type { MutableRefObject } from "react";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import {
  SlashCommandList,
  type SlashCommandListHandle,
  type SlashCommandListProps,
} from "@/components/chat/SlashCommandList";
import type { SlashCommandItem } from "@/lib/types";

/**
 * Factory that creates the Tiptap `suggestion` config for the slash
 * command extension. Mirrors the pattern from `mention-suggestion.ts`.
 *
 * The SlashCommandList component handles its own filtering and tab logic,
 * so we always pass the **full** item list plus the raw query string.
 *
 * @param getItems - Callback that returns the current list of all slash command items
 * @param getRecentIds - Callback that returns the current recently-used item ids
 * @param recordRecent - Callback to record an item as recently used
 * @param isOpenRef - Mutable ref that tracks whether the slash popup is open,
 *                    so the editor can skip its Enter-to-send behaviour
 * @returns A Suggestion options object for the custom slash command extension
 */
export function createSlashSuggestion(
  getItems: () => SlashCommandItem[],
  getRecentIds: () => string[],
  recordRecent: (id: string) => void,
  isOpenRef: MutableRefObject<boolean>
): Omit<SuggestionOptions, "editor"> {
  return {
    char: "/",
    allowSpaces: false,
    /**
     * Only trigger at the start of a line or after whitespace.
     * This prevents the menu from appearing inside URLs like https://...
     */
    allow: ({ state, range }) => {
      const $from = state.doc.resolve(range.from);
      const textBefore = $from.parent.textBetween(
        0,
        $from.parentOffset,
        undefined,
        "\ufffc"
      );
      // Allow if `/` is at position 0 in the node, or preceded by whitespace
      const charBefore = textBefore.slice(-1);
      return (
        $from.parentOffset === 0 ||
        charBefore === "" ||
        /\s/.test(charBefore)
      );
    },

    /**
     * Return the full item list — filtering is done inside SlashCommandList.
     */
    items: () => getItems(),

    /**
     * Render callbacks that mount/position/unmount the SlashCommandList component.
     */
    render: () => {
      let renderer: ReactRenderer<
        SlashCommandListHandle,
        SlashCommandListProps
      > | null = null;
      let popup: HTMLDivElement | null = null;
      let clickOutsideHandler: ((e: MouseEvent) => void) | null = null;
      let resizeHandler: (() => void) | null = null;
      /** Store the latest clientRect getter so resize can recalculate. */
      let latestClientRect: (() => DOMRect | null) | null = null;

      /**
       * Tear down the popup, renderer, click listener, and sync the open ref.
       */
      const cleanup = () => {
        isOpenRef.current = false;
        if (clickOutsideHandler) {
          document.removeEventListener("mousedown", clickOutsideHandler);
          clickOutsideHandler = null;
        }
        if (resizeHandler) {
          window.removeEventListener("resize", resizeHandler);
          resizeHandler = null;
        }
        latestClientRect = null;
        popup?.remove();
        popup = null;
        renderer?.destroy();
        renderer = null;
      };

      return {
        /**
         * Called when the suggestion popup should appear.
         */
        onStart: (props: SuggestionProps) => {
          isOpenRef.current = true;
          renderer = new ReactRenderer(SlashCommandList, {
            props: {
              items: props.items as SlashCommandItem[],
              query: props.query,
              command: props.command,
              recentIds: getRecentIds(),
              onRecordRecent: recordRecent,
            },
            editor: props.editor,
          });

          popup = document.createElement("div");
          popup.style.position = "absolute";
          popup.style.zIndex = "50";
          document.body.appendChild(popup);

          popup.appendChild(renderer.element);

          latestClientRect = props.clientRect ?? null;
          updatePosition(popup, latestClientRect);

          // Reposition on window resize so the popup tracks the cursor.
          resizeHandler = () => updatePosition(popup, latestClientRect);
          window.addEventListener("resize", resizeHandler);

          // Dismiss when clicking outside
          requestAnimationFrame(() => {
            clickOutsideHandler = (e: MouseEvent) => {
              if (popup && !popup.contains(e.target as Node)) {
                cleanup();
              }
            };
            document.addEventListener("mousedown", clickOutsideHandler);
          });
        },

        /**
         * Called when the query or filtered items change.
         */
        onUpdate: (props: SuggestionProps) => {
          renderer?.updateProps({
            items: props.items as SlashCommandItem[],
            query: props.query,
            command: props.command,
            recentIds: getRecentIds(),
            onRecordRecent: recordRecent,
          });

          latestClientRect = props.clientRect ?? null;
          updatePosition(popup, latestClientRect);
        },

        /**
         * Forward keyboard events to the SlashCommandList for navigation.
         */
        onKeyDown: (props: { event: KeyboardEvent }) => {
          if (props.event.key === "Escape") {
            cleanup();
            return true;
          }

          return renderer?.ref?.onKeyDown(props) ?? false;
        },

        /**
         * Called when the suggestion popup should close.
         */
        onExit: () => {
          cleanup();
        },
      };
    },
  };
}

/**
 * Position the popup element above the cursor rect.
 * On narrow viewports the left edge is clamped so the menu
 * stays fully visible with a small margin.
 */
function updatePosition(
  popup: HTMLDivElement | null,
  clientRect: (() => DOMRect | null) | null | undefined
) {
  if (!popup || !clientRect) return;

  const rect = typeof clientRect === "function" ? clientRect() : null;
  if (!rect) return;

  const MARGIN = 16; // px from viewport edges
  const popupWidth = popup.offsetWidth || 0;

  // Clamp left so the popup doesn't overflow the right edge of the viewport
  let left = rect.left;
  if (left + popupWidth > window.innerWidth - MARGIN) {
    left = Math.max(MARGIN, window.innerWidth - MARGIN - popupWidth);
  }

  popup.style.left = `${left}px`;
  popup.style.top = `${rect.top + window.scrollY - 8}px`;
  popup.style.transform = "translateY(-100%)";
}
