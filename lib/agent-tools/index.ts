/**
 * Agent tool-use system — barrel export and dispatcher.
 *
 * Re-exports tool definitions and provides a single `executeToolCall`
 * function that routes a tool call to the correct executor.
 */

export { AGENT_FUNCTION_TOOLS } from "./definitions";
export type { AgentToolName } from "./definitions";
export type { ToolContext, ToolResult } from "./executors";

import type { AgentToolName } from "./definitions";
import type { ToolContext, ToolResult } from "./executors";
import {
  executeSendMessage,
  executeSendDm,
  executeGetChannelHistory,
  executeGetDmHistory,
  executeListChannels,
  executeCreateChannel,
  executeDeleteChannel,
  executeListUsers,
  executeListAgentSessions,
  executeCreateAgentSession,
  executeDeleteAgentSession,
} from "./executors";

/**
 * Dispatch a tool call to the appropriate executor.
 *
 * @param name - The function tool name (e.g. "send_message")
 * @param args - Parsed arguments object from the model
 * @param ctx  - Execution context (userId + supabase client)
 * @returns A structured ToolResult
 */
export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const toolName = name as AgentToolName;

  switch (toolName) {
    case "send_message":
      return executeSendMessage(
        args as { channel_name: string; content: string },
        ctx
      );

    case "send_dm":
      return executeSendDm(
        args as { target_username: string; content: string },
        ctx
      );

    case "get_channel_history":
      return executeGetChannelHistory(
        args as { channel_name: string; limit?: number },
        ctx
      );

    case "get_dm_history":
      return executeGetDmHistory(
        args as { target_username: string; limit?: number },
        ctx
      );

    case "list_channels":
      return executeListChannels(
        args as Record<string, never>,
        ctx
      );

    case "create_channel":
      return executeCreateChannel(
        args as { channel_name: string },
        ctx
      );

    case "delete_channel":
      return executeDeleteChannel(
        args as { channel_name: string },
        ctx
      );

    case "list_users":
      return executeListUsers(
        args as Record<string, never>,
        ctx
      );

    case "list_agent_sessions":
      return executeListAgentSessions(
        args as Record<string, never>,
        ctx
      );

    case "create_agent_session":
      return executeCreateAgentSession(
        args as { session_name: string },
        ctx
      );

    case "delete_agent_session":
      return executeDeleteAgentSession(
        args as { session_name: string },
        ctx
      );

    default:
      return {
        success: false,
        error: `Unknown tool: ${name}`,
      };
  }
}
