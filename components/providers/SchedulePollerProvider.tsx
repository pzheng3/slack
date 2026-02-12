"use client";

import { useEffect, useRef } from "react";
import { useUser } from "./UserProvider";

/** Polling interval in milliseconds (30 seconds) */
const POLL_INTERVAL_MS = 30_000;

/**
 * Provider that polls the /api/send-scheduled endpoint at regular intervals
 * to process any due scheduled messages.
 *
 * Placed in the chat layout so it only runs while the user is logged in
 * and viewing the chat UI. Uses a simple setInterval with visibility
 * awareness — pauses when the tab is hidden and resumes when visible.
 */
export function SchedulePollerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useUser();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;

    /**
     * Fire a single poll to the send-scheduled API.
     * Errors are silently caught to avoid breaking the polling loop.
     */
    const poll = async () => {
      try {
        await fetch("/api/send-scheduled", { method: "POST" });
      } catch {
        // Silently ignore — network errors shouldn't break the app
      }
    };

    // Poll immediately on mount
    poll();

    // Set up interval
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    // Pause/resume on visibility change
    const handleVisibility = () => {
      if (document.hidden) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        poll(); // Poll immediately when tab becomes visible
        intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user]);

  return <>{children}</>;
}
