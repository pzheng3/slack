/**
 * Dispatch custom DOM events so the sidebar picks up entities
 * created or deleted by agent tool calls.
 *
 * Called from the SSE streaming handlers in useAgentChat / useSessionChat
 * when a `tool_result` event indicates a successful mutation.
 */

/**
 * Inspect a completed tool result and dispatch the appropriate
 * custom event so sidebar hooks (useChannels, useAgentSessions)
 * can update their local state without a full refetch.
 *
 * @param toolName - The name of the tool that was executed
 * @param success  - Whether the tool succeeded
 * @param result   - The serialised result string from the server
 */
export function dispatchSidebarEvent(
  toolName: string,
  success: boolean,
  result?: string
): void {
  if (!success || !result) return;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(result);
  } catch {
    return;
  }

  switch (toolName) {
    case "create_channel": {
      if (data.channel_name && data.channel_id) {
        window.dispatchEvent(
          new CustomEvent("channel-created", {
            detail: {
              id: data.channel_id,
              name: data.channel_name,
            },
          })
        );
      }
      break;
    }

    case "delete_channel": {
      if (data.channel_name) {
        window.dispatchEvent(
          new CustomEvent("channel-deleted", {
            detail: { channel_name: data.channel_name },
          })
        );
      }
      break;
    }

    case "create_agent_session": {
      if (data.session_id && data.session_name) {
        window.dispatchEvent(
          new CustomEvent("agent-session-created", {
            detail: {
              id: data.session_id,
              name: data.session_name,
              created_at: new Date().toISOString(),
            },
          })
        );
      }
      break;
    }

    case "delete_agent_session": {
      if (data.session_id) {
        window.dispatchEvent(
          new CustomEvent("agent-session-deleted", {
            detail: { sessionId: data.session_id },
          })
        );
      }
      break;
    }

    default:
      break;
  }
}
