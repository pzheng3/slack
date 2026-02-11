"use client";

import type { User } from "@/lib/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { USER_AVATAR_MAP } from "@/lib/constants";
import { useSupabase } from "./SupabaseProvider";

interface UserContextValue {
  /** The current user, or null if not yet identified */
  user: User | null;
  /** Whether the provider is still loading from localStorage / DB */
  loading: boolean;
  /** Register a new username; returns an error string on failure */
  register: (username: string) => Promise<string | null>;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  loading: true,
  register: async () => "UserProvider not mounted",
});

const STORAGE_KEY = "slack_input_user_id";
const STORAGE_USERNAME_KEY = "slack_input_username";

/** Default avatar images for new users — randomly assigned on registration */
const DEFAULT_AVATARS = [
  "/images/No Photo A.png",
  "/images/No Photo B.png",
  "/images/No Photo C.png",
  "/images/No Photo D.png",
  "/images/No Photo E.png",
  "/images/No Photo F.png",
];

/**
 * Provides the current user identity to the component tree.
 * On mount, checks localStorage for an existing userId and verifies it
 * against Supabase. If no user exists, `user` stays null and the app
 * should show the UsernameModal.
 */
export function UserProvider({ children }: { children: React.ReactNode }) {
  const supabase = useSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * On mount: restore user identity from localStorage.
   * If the stored userId still exists in the DB, load it.
   * If the DB record was deleted (e.g. after a reseed) but we still have a
   * stored username, automatically re-register with that username so the
   * user never sees the modal again on the same device.
   */
  useEffect(() => {
    async function loadUser() {
      const storedId = localStorage.getItem(STORAGE_KEY);
      const storedUsername = localStorage.getItem(STORAGE_USERNAME_KEY);

      if (storedId) {
        const { data } = await supabase
          .from("users")
          .select("*")
          .eq("id", storedId)
          .single();
        if (data) {
          setUser(data as User);
          setLoading(false);
          return;
        }
      }

      // DB record gone but we remember the username — auto re-register
      if (storedUsername) {
        // First check if someone else claimed this username
        const { data: existing } = await supabase
          .from("users")
          .select("*")
          .eq("username", storedUsername)
          .single();

        if (existing) {
          // Username still exists (maybe same person, different id after reseed)
          localStorage.setItem(STORAGE_KEY, existing.id);
          setUser(existing as User);
          setLoading(false);
          return;
        }

        // Re-create the user with the remembered username
        const avatar =
          USER_AVATAR_MAP[storedUsername] ??
          DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];
        const { data: newUser } = await supabase
          .from("users")
          .insert({ username: storedUsername, avatar_url: avatar, is_agent: false })
          .select()
          .single();

        if (newUser) {
          localStorage.setItem(STORAGE_KEY, newUser.id);
          setUser(newUser as User);
          setLoading(false);
          return;
        }
      }

      // Nothing to restore — clear stale keys
      localStorage.removeItem(STORAGE_KEY);
      setLoading(false);
    }
    loadUser();
  }, [supabase]);

  /**
   * Register a new username. Checks uniqueness, inserts into DB,
   * stores userId in localStorage, and updates context.
   * @returns error message string on failure, null on success
   */
  const register = useCallback(
    async (username: string): Promise<string | null> => {
      const trimmed = username.trim();
      if (!trimmed) return "Username cannot be empty";
      if (trimmed.length < 2) return "Username must be at least 2 characters";
      if (trimmed.length > 30) return "Username must be 30 characters or less";

      // Check if username already exists — if so, log in as that user
      const { data: existing } = await supabase
        .from("users")
        .select("*")
        .eq("username", trimmed)
        .single();

      if (existing) {
        localStorage.setItem(STORAGE_KEY, existing.id);
        localStorage.setItem(STORAGE_USERNAME_KEY, trimmed);
        setUser(existing as User);
        return null; // success — logged in as existing user
      }

      // Use a custom avatar if one is mapped, otherwise pick a random default
      const randomAvatar =
        USER_AVATAR_MAP[trimmed] ??
        DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];
      const { data, error } = await supabase
        .from("users")
        .insert({ username: trimmed, avatar_url: randomAvatar, is_agent: false })
        .select()
        .single();

      if (error) return error.message;

      localStorage.setItem(STORAGE_KEY, data.id);
      localStorage.setItem(STORAGE_USERNAME_KEY, trimmed);
      setUser(data as User);
      return null;
    },
    [supabase]
  );

  return (
    <UserContext.Provider value={{ user, loading, register }}>
      {children}
    </UserContext.Provider>
  );
}

/**
 * Hook to access the current user context.
 */
export function useUser() {
  return useContext(UserContext);
}
