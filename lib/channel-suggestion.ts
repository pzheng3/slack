import type { MutableRefObject } from "react";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import {
  ChannelList,
  type ChannelListHandle,
  type ChannelListProps,
} from "@/components/chat/ChannelList";
import type { MentionItem } from "@/lib/hooks/useMentionSuggestions";

/**
 * Unique plugin key for the # channel suggestion.
 * Without this, both the @mention and #channel suggestion plugins would share
 * the default `MentionPluginKey` from `@tiptap/extension-mention`, causing
 * their ProseMirror plugin state to collide.
 */
const ChannelMentionPluginKey = new PluginKey("channelMention");

/**
 * Factory that creates the Tiptap `suggestion` config for the # channel
 * mention extension. Works like `createMentionSuggestion` but triggers
 * on `#` and renders the simpler ChannelList component.
 *
 * @param getChannels - Callback that returns the current list of channel items
 * @param isOpenRef - Mutable ref that tracks whether the popup is open,
 *                    so the editor can skip its Enter-to-send behaviour
 * @returns A Suggestion options object for the channel mention extension
 */
export function createChannelSuggestion(
  getChannels: () => MentionItem[],
  isOpenRef: MutableRefObject<boolean>,
  options?: { placement?: "above" | "below"; onOpen?: (item: MentionItem) => void }
): Omit<SuggestionOptions, "editor"> {
  const placement = options?.placement ?? "above";
  const onOpen = options?.onOpen;
  return {
    char: "#",
    pluginKey: ChannelMentionPluginKey,
    allowSpaces: false,

    /**
     * Return the full channel list — filtering is done inside ChannelList.
     */
    items: () => getChannels(),

    /**
     * Render callbacks that mount/position/unmount the ChannelList component.
     */
    render: () => {
      let renderer: ReactRenderer<ChannelListHandle, ChannelListProps> | null =
        null;
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
          renderer = new ReactRenderer(ChannelList, {
            props: {
              items: props.items as MentionItem[],
              query: props.query,
              command: props.command,
              onOpen,
            },
            editor: props.editor,
          });

          popup = document.createElement("div");
          popup.style.position = "absolute";
          popup.style.zIndex = "101";
          document.body.appendChild(popup);

          popup.appendChild(renderer.element);

          latestClientRect = props.clientRect ?? null;
          updatePosition(popup, latestClientRect, placement);

          // Reposition on window resize
          resizeHandler = () => updatePosition(popup, latestClientRect, placement);
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
            items: props.items as MentionItem[],
            query: props.query,
            command: props.command,
            onOpen,
          });

          latestClientRect = props.clientRect ?? null;
          updatePosition(popup, latestClientRect, placement);
        },

        /**
         * Forward keyboard events to the ChannelList for navigation.
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
 * Position the popup element above or below the cursor rect.
 */
function updatePosition(
  popup: HTMLDivElement | null,
  clientRect: (() => DOMRect | null) | null | undefined,
  placement: "above" | "below" = "above"
) {
  if (!popup || !clientRect) return;

  const rect = typeof clientRect === "function" ? clientRect() : null;
  if (!rect) return;

  const MARGIN = 16;
  const popupWidth = popup.offsetWidth || 0;

  let left = rect.left;
  if (left + popupWidth > window.innerWidth - MARGIN) {
    left = Math.max(MARGIN, window.innerWidth - MARGIN - popupWidth);
  }

  popup.style.left = `${left}px`;

  if (placement === "below") {
    popup.style.top = `${rect.bottom + window.scrollY + 8}px`;
    popup.style.transform = "none";
  } else {
    popup.style.top = `${rect.top + window.scrollY - 8}px`;
    popup.style.transform = "translateY(-100%)";
  }
}
