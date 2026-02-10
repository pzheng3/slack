"use client";

import { createBrowserClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";

const SupabaseContext = createContext<SupabaseClient | null>(null);

/**
 * Provides a singleton Supabase browser client to the component tree.
 * The client is only created on the client side to avoid build-time errors.
 */
export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);

  useEffect(() => {
    try {
      setSupabase(createBrowserClient());
    } catch (e) {
      console.error("Failed to initialize Supabase client:", e);
    }
  }, []);

  // Don't render children until client is ready
  if (!supabase) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse text-sm text-muted-foreground">
          Connecting...
        </div>
      </div>
    );
  }

  return (
    <SupabaseContext.Provider value={supabase}>
      {children}
    </SupabaseContext.Provider>
  );
}

/**
 * Hook to access the Supabase client from any client component.
 * @throws if used outside of SupabaseProvider
 */
export function useSupabase(): SupabaseClient {
  const ctx = useContext(SupabaseContext);
  if (!ctx) {
    throw new Error("useSupabase must be used within a SupabaseProvider");
  }
  return ctx;
}
