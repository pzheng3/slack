/**
 * Module-level store for passing a pending prompt from the "Create New"
 * dialog to any chat page (agent session, channel, or DM).
 *
 * Instead of inserting messages directly into the database from the dialog,
 * the prompt is stored here keyed by conversation ID. The destination page
 * then consumes the prompt and feeds it through its own `sendMessage()`
 * (or `handleSend()`) flow. This ensures:
 *
 * - Agent sessions: `useSessionChat.sendMessage()` inserts the message AND
 *   triggers the AI response via streaming.
 * - Channels: `handleSend()` inserts via `useMessages.sendMessage()` AND
 *   triggers `useAgentAutoReply`.
 * - DMs: `useMessages.sendMessage()` inserts the message into the correct
 *   existing DM conversation.
 *
 * A custom DOM event (`pending-prompt-ready`) is dispatched so that
 * already-mounted pages can react without remounting.
 */

/** Internal map: conversationId → HTML content of the pending prompt. */
const pendingPrompts = new Map<string, string>();

/**
 * Store a pending prompt for a conversation and notify any
 * already-mounted page via a custom DOM event.
 *
 * @param conversationId - The conversation/session UUID
 * @param content        - The HTML content to send as the user's message
 */
export function setPendingPrompt(
  conversationId: string,
  content: string
): void {
  pendingPrompts.set(conversationId, content);

  // Dispatch a DOM event so pages that are already mounted can
  // pick up the prompt without waiting for a remount / useEffect cycle.
  window.dispatchEvent(
    new CustomEvent("pending-prompt-ready", {
      detail: { conversationId },
    })
  );
}

/**
 * Consume (read + delete) the pending prompt for a conversation.
 * Returns `null` if there is no pending prompt for the given ID.
 *
 * @param conversationId - The conversation/session UUID
 * @returns The HTML content, or null
 */
export function consumePendingPrompt(
  conversationId: string
): string | null {
  const content = pendingPrompts.get(conversationId) ?? null;
  pendingPrompts.delete(conversationId);
  return content;
}
