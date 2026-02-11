"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDM } from "@/lib/hooks/useDM";
import type { MentionItem } from "@/lib/hooks/useMentionSuggestions";

/**
 * Hook that provides a navigation callback for mention items.
 * Used by both the @mention and #channel menus to handle
 * Cmd+Return "open" and click-to-navigate on mention chips.
 *
 * @returns navigateToItem - Navigate to the chat session for a given MentionItem
 */
export function useMentionNavigation() {
  const router = useRouter();
  const { findOrCreateDM } = useDM();

  const navigateToItem = useCallback(
    async (item: MentionItem) => {
      switch (item.category) {
        case "channel":
          router.push(`/chat/channel/${encodeURIComponent(item.label)}`);
          break;
        case "agent":
          router.push(`/chat/agent/session/${item.id}`);
          break;
        case "people": {
          const convId = await findOrCreateDM(item.id);
          if (convId) router.push(`/chat/dm/${convId}`);
          break;
        }
        default:
          break;
      }
    },
    [router, findOrCreateDM]
  );

  return navigateToItem;
}
