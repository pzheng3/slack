/**
 * OpenAI function tool definitions for the agent tool-use system.
 *
 * Each definition follows the OpenAI function calling JSON Schema format
 * and maps to an executor in `executors.ts`.
 */

import type OpenAI from "openai";

type FunctionTool = OpenAI.Responses.FunctionTool;

// ----------------------------------------------------------------
// Messaging Tools
// ----------------------------------------------------------------

/** Send a message to a channel on behalf of the user */
const sendMessage: FunctionTool = {
  type: "function",
  name: "send_message",
  description:
    "Send a message to a Slack channel on behalf of the current user. " +
    "Use this when the user asks you to post or say something in a channel.",
  parameters: {
    type: "object",
    properties: {
      channel_name: {
        type: "string",
        description:
          'The name of the channel to send the message to (e.g. "general", "marketing").',
      },
      content: {
        type: "string",
        description: "The message content to send.",
      },
    },
    required: ["channel_name", "content"],
    additionalProperties: false,
  },
  strict: true,
};

/** Send a direct message to a specific user */
const sendDm: FunctionTool = {
  type: "function",
  name: "send_dm",
  description:
    "Send a direct message to a specific user on behalf of the current user. " +
    "Use this when the user asks you to DM or message someone.",
  parameters: {
    type: "object",
    properties: {
      target_username: {
        type: "string",
        description: "The username of the person to send the DM to.",
      },
      content: {
        type: "string",
        description: "The message content to send.",
      },
    },
    required: ["target_username", "content"],
    additionalProperties: false,
  },
  strict: true,
};

/** Get recent messages from a channel */
const getChannelHistory: FunctionTool = {
  type: "function",
  name: "get_channel_history",
  description:
    "Retrieve recent messages from a Slack channel. " +
    "Use this when the user asks what happened in a channel or wants a summary.",
  parameters: {
    type: "object",
    properties: {
      channel_name: {
        type: "string",
        description: "The name of the channel to read messages from.",
      },
      limit: {
        type: "number",
        description:
          "Maximum number of recent messages to retrieve. Defaults to 20.",
      },
    },
    required: ["channel_name"],
    additionalProperties: false,
  },
  strict: false,
};

/** Get recent DM messages with a specific user */
const getDmHistory: FunctionTool = {
  type: "function",
  name: "get_dm_history",
  description:
    "Retrieve recent direct messages between the current user and another user. " +
    "Use this when the user asks about their conversation with someone.",
  parameters: {
    type: "object",
    properties: {
      target_username: {
        type: "string",
        description: "The username of the other person in the DM.",
      },
      limit: {
        type: "number",
        description:
          "Maximum number of recent messages to retrieve. Defaults to 20.",
      },
    },
    required: ["target_username"],
    additionalProperties: false,
  },
  strict: false,
};

// ----------------------------------------------------------------
// Channel Management Tools
// ----------------------------------------------------------------

/** List all channels in the workspace */
const listChannels: FunctionTool = {
  type: "function",
  name: "list_channels",
  description:
    "List all channels in the workspace. " +
    "Use this when the user asks what channels exist or wants to browse channels.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  strict: true,
};

/** Create a new channel */
const createChannel: FunctionTool = {
  type: "function",
  name: "create_channel",
  description:
    "Create a new Slack channel. " +
    "Use this when the user asks to create or set up a new channel.",
  parameters: {
    type: "object",
    properties: {
      channel_name: {
        type: "string",
        description:
          'The name for the new channel (e.g. "project-alpha"). ' +
          "Will be lowercased and spaces replaced with hyphens.",
      },
    },
    required: ["channel_name"],
    additionalProperties: false,
  },
  strict: true,
};

/** Delete a channel */
const deleteChannel: FunctionTool = {
  type: "function",
  name: "delete_channel",
  description:
    "Delete an existing Slack channel. " +
    "Use this when the user explicitly asks to delete or remove a channel. " +
    "This action is irreversible.",
  parameters: {
    type: "object",
    properties: {
      channel_name: {
        type: "string",
        description: "The name of the channel to delete.",
      },
    },
    required: ["channel_name"],
    additionalProperties: false,
  },
  strict: true,
};

// ----------------------------------------------------------------
// User Directory Tools
// ----------------------------------------------------------------

/** List all users in the workspace */
const listUsers: FunctionTool = {
  type: "function",
  name: "list_users",
  description:
    "List all users in the workspace, including both human users and AI agents. " +
    "Use this when the user asks who is in the workspace or wants to find someone.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  strict: true,
};

// ----------------------------------------------------------------
// Agent Session Management Tools
// ----------------------------------------------------------------

/** List the user's agent sessions */
const listAgentSessions: FunctionTool = {
  type: "function",
  name: "list_agent_sessions",
  description:
    "List the current user's agent chat sessions. " +
    "Use this when the user asks about their existing agent conversations.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  strict: true,
};

/** Create a new agent session */
const createAgentSession: FunctionTool = {
  type: "function",
  name: "create_agent_session",
  description:
    "Create a new agent chat session. " +
    "Use this when the user asks to start a new agent conversation or session.",
  parameters: {
    type: "object",
    properties: {
      session_name: {
        type: "string",
        description:
          "A descriptive name for the new session (e.g. 'Project Planning').",
      },
    },
    required: ["session_name"],
    additionalProperties: false,
  },
  strict: true,
};

/** Delete an agent session */
const deleteAgentSession: FunctionTool = {
  type: "function",
  name: "delete_agent_session",
  description:
    "Delete an existing agent chat session. " +
    "Use this when the user asks to remove or clean up an agent session. " +
    "This action is irreversible.",
  parameters: {
    type: "object",
    properties: {
      session_name: {
        type: "string",
        description:
          "The name of the agent session to delete. Use list_agent_sessions first if unsure.",
      },
    },
    required: ["session_name"],
    additionalProperties: false,
  },
  strict: true,
};

// ----------------------------------------------------------------
// All function tools (exported)
// ----------------------------------------------------------------

/**
 * All function tool definitions for the agent tool-use system.
 * These are passed to the OpenAI Responses API `tools` parameter
 * alongside `web_search_preview`.
 */
export const AGENT_FUNCTION_TOOLS: FunctionTool[] = [
  sendMessage,
  sendDm,
  getChannelHistory,
  getDmHistory,
  listChannels,
  createChannel,
  deleteChannel,
  listUsers,
  listAgentSessions,
  createAgentSession,
  deleteAgentSession,
];

/** Names of all registered function tools */
export type AgentToolName =
  | "send_message"
  | "send_dm"
  | "get_channel_history"
  | "get_dm_history"
  | "list_channels"
  | "create_channel"
  | "delete_channel"
  | "list_users"
  | "list_agent_sessions"
  | "create_agent_session"
  | "delete_agent_session";
