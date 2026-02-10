import type { MutableRefObject } from "react";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import {
  MentionList,
  type MentionListHandle,
  type MentionListProps,
} from "@/components/chat/MentionList";
import type { MentionItem } from "@/lib/hooks/useMentionSuggestions";

/**
 * Factory that creates the Tiptap `suggestion` config for the Mention
 * extension. Accepts a getter function so the component can supply the
 * latest item list from the `useMentionSuggestions` hook.
 *
 * The MentionList component handles its own filtering and tab logic,
 * so we always pass the **full** item list plus the raw query string.
 *
 * @param getItems - Callback that returns the current list of all mentionable items
 * @param isOpenRef - Mutable ref that tracks whether the mention popup is open,
 *                    so the editor can skip its Enter-to-send behaviour
 * @returns A Suggestion options object for `Mention.configure({ suggestion })`
 */
export function createMentionSuggestion(
  getItems: () => MentionItem[],
  isOpenRef: MutableRefObject<boolean>
): Omit<SuggestionOptions, "editor"> {
  return {
    char: "@",
    allowSpaces: false,

    /**
     * Return the full item list — filtering is done inside MentionList.
     * We still pass the query through so the render callbacks can forward it.
     */
    items: ({ query }: { query: string }) => {
      // Return a wrapper with both the full list and query
      // Tiptap expects an array, so we return the full list.
      // The query is forwarded separately via the render props.
      return getItems();
    },

    /**
     * Render callbacks that mount/position/unmount the MentionList component.
     */
    render: () => {
      let renderer: ReactRenderer<MentionListHandle, MentionListProps> | null =
        null;
      let popup: HTMLDivElement | null = null;
      let clickOutsideHandler: ((e: MouseEvent) => void) | null = null;

      /**
       * Tear down the popup, renderer, click listener, and sync the open ref.
       * Safe to call multiple times (guards against nulls).
       */
      const cleanup = () => {
        isOpenRef.current = false;
        if (clickOutsideHandler) {
          document.removeEventListener("mousedown", clickOutsideHandler);
          clickOutsideHandler = null;
        }
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
          renderer = new ReactRenderer(MentionList, {
            props: {
              items: props.items as MentionItem[],
              query: props.query,
              command: props.command,
            },
            editor: props.editor,
          });

          popup = document.createElement("div");
          popup.style.position = "absolute";
          popup.style.zIndex = "50";
          document.body.appendChild(popup);

          popup.appendChild(renderer.element);

          updatePosition(popup, props.clientRect);

          // Dismiss when clicking anywhere outside the popup.
          // Uses requestAnimationFrame so the current mousedown/keydown that
          // triggered the suggestion isn't caught immediately.
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
            items: props.items as MentionItem[],
            query: props.query,
            command: props.command,
          });

          updatePosition(popup, props.clientRect);
        },

        /**
         * Forward keyboard events to the MentionList for navigation.
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
 */
function updatePosition(
  popup: HTMLDivElement | null,
  clientRect: (() => DOMRect | null) | null | undefined
) {
  if (!popup || !clientRect) return;

  const rect = typeof clientRect === "function" ? clientRect() : null;
  if (!rect) return;

  popup.style.left = `${rect.left}px`;
  popup.style.top = `${rect.top + window.scrollY - 8}px`;
  popup.style.transform = "translateY(-100%)";
}
