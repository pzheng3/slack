/**
 * Core data types mirroring the Supabase database schema.
 */

/** User record — includes both human users and AI agents */
export interface User {
  id: string;
  username: string;
  avatar_url: string | null;
  is_agent: boolean;
  created_at: string;
}

/** Conversation record — represents a channel, DM, or agent chat */
export interface Conversation {
  id: string;
  type: "channel" | "dm" | "agent";
  name: string | null;
  created_at: string;
}

/** Membership link between a user and a conversation */
export interface ConversationMember {
  conversation_id: string;
  user_id: string;
}

/** A single chat message */
export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

/** Message with sender info joined */
export interface MessageWithSender extends Message {
  sender: Pick<User, "id" | "username" | "avatar_url" | "is_agent">;
}
