"use client";

/**
 * Inline tool call status indicators shown within agent messages.
 *
 * Parses the `<!--TOOL_CALLS:[...]-->` metadata embedded in message
 * content and renders a compact gray text line for each tool invocation.
 * Successful actions are shown in past tense; in-progress ones in present.
 */

/** A single tool call entry embedded in message content */
export interface ToolCallEntry {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  success?: boolean;
  result?: string;
}

/** Pattern matching the embedded tool calls HTML comment */
export const TOOL_CALLS_PATTERN = /<!--TOOL_CALLS:([\s\S]*?)-->\n*/;

/**
 * Build a descriptive one-line summary for a tool call.
 * Uses present tense (in-progress) or past tense (completed).
 *
 * @param entry - The tool call entry
 * @returns A human-readable summary string
 */
function describeToolCall(entry: ToolCallEntry): string {
  const args = entry.arguments;
  const done = entry.success === true;

  switch (entry.name) {
    case "send_message":
      return done
        ? `Sent message to #${args.channel_name ?? "..."}`
        : `Sending message to #${args.channel_name ?? "..."}`;
    case "send_dm":
      return done
        ? `Sent DM to ${args.target_username ?? "..."}`
        : `Sending DM to ${args.target_username ?? "..."}`;
    case "get_channel_history":
      return done
        ? `Read #${args.channel_name ?? "..."} history`
        : `Reading #${args.channel_name ?? "..."} history`;
    case "get_dm_history":
      return done
        ? `Read DMs with ${args.target_username ?? "..."}`
        : `Reading DMs with ${args.target_username ?? "..."}`;
    case "list_channels":
      return done ? "Listed channels" : "Listing channels";
    case "create_channel":
      return done
        ? `Created #${args.channel_name ?? "..."}`
        : `Creating #${args.channel_name ?? "..."}`;
    case "delete_channel":
      return done
        ? `Deleted #${args.channel_name ?? "..."}`
        : `Deleting #${args.channel_name ?? "..."}`;
    case "list_users":
      return done ? "Listed users" : "Listing users";
    case "list_agent_sessions":
      return done ? "Listed agent sessions" : "Listing agent sessions";
    case "create_agent_session":
      return done
        ? `Created session "${args.session_name ?? "..."}"`
        : `Creating session "${args.session_name ?? "..."}"`;
    case "delete_agent_session":
      return done
        ? `Deleted session "${args.session_name ?? "..."}"`
        : `Deleting session "${args.session_name ?? "..."}"`;
    default:
      return entry.name;
  }
}

/**
 * Spinner icon shown while a tool is executing (no result yet).
 */
function SpinnerIcon() {
  return (
    <svg
      className="inline-block animate-spin h-3 w-3 ml-1 align-[-1px]"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/**
 * Renders a single tool call as a plain gray text line.
 * Shows past tense for success, present tense while in-progress,
 * and red text for errors.
 */
function ToolCallLine({ entry }: { entry: ToolCallEntry }) {
  const description = describeToolCall(entry);
  const isDone = entry.success !== undefined;
  const isError = isDone && !entry.success;
  const isInProgress = !isDone;

  return (
    <span
      className={`text-[13px] inline-flex items-center gap-1 ${
        isError
          ? "text-red-500"
          : "text-[var(--color-slack-text-secondary)]"
      }`}
    >
      {description}
      {isError && entry.result ? ` — ${entry.result}` : ""}
      {isInProgress && <SpinnerIcon />}
      {isDone && entry.success && (
        <svg className="h-3 w-3 shrink-0 text-[#007a5a]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )}
    </span>
  );
}

/**
 * Renders all tool call statuses for a message as plain gray text lines.
 * Used within `MessageItem` when tool call metadata is detected.
 *
 * @param toolCalls - Array of tool call entries parsed from message content
 */
export function ToolCallStatusBlock({
  toolCalls,
}: {
  toolCalls: ToolCallEntry[];
}) {
  if (toolCalls.length === 0) return null;

  return (
    <div className="mt-1 mb-1.5">
      {toolCalls.map((entry) => (
        <div key={entry.id}>
          <ToolCallLine entry={entry} />
        </div>
      ))}
    </div>
  );
}

/**
 * Parse tool call metadata from message content.
 *
 * @param content - Raw message content string
 * @returns Object with parsed tool calls and content with metadata stripped
 */
export function parseToolCalls(content: string): {
  toolCalls: ToolCallEntry[];
  cleanContent: string;
} {
  const match = content.match(TOOL_CALLS_PATTERN);
  if (!match) {
    return { toolCalls: [], cleanContent: content };
  }

  let toolCalls: ToolCallEntry[] = [];
  try {
    toolCalls = JSON.parse(match[1]);
  } catch {
    // Malformed metadata — ignore
  }

  const cleanContent = content.replace(TOOL_CALLS_PATTERN, "").trim();
  return { toolCalls, cleanContent };
}
