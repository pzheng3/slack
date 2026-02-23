"use client";

import { useEffect, useRef } from "react";
import { useUser } from "./UserProvider";
import { useScheduledMessagesContext } from "./ScheduledMessagesProvider";

/** Polling interval when the tab is visible (15 seconds). */
const POLL_INTERVAL_VISIBLE_MS = 15_000;

/**
 * Polling interval when the tab is hidden (60 seconds).
 * Browsers throttle background timers anyway, but we use a longer
 * interval to reduce unnecessary network traffic while still
 * ensuring scheduled messages get sent even if the user is in
 * another tab.
 */
const POLL_INTERVAL_HIDDEN_MS = 60_000;

/**
 * Provider that polls the /api/send-scheduled endpoint at regular intervals
 * to process any due scheduled messages.
 *
 * Placed inside `ScheduledMessagesProvider` in the chat layout so it can
 * immediately refresh the local scheduled-messages state whenever the API
 * reports that one or more messages were sent. This removes the dependency
 * on Supabase Realtime for timely UI updates.
 */
export function SchedulePollerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useUser();
  const { refreshMessages } = useScheduledMessagesContext();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef(refreshMessages);
  refreshRef.current = refreshMessages;

  useEffect(() => {
    if (!user) return;

    /**
     * Fire a single poll to the send-scheduled API.
     * If the response indicates messages were sent, immediately refresh
     * the local scheduled-messages state so the UI updates without delay.
     */
    const poll = async () => {
      try {
        const res = await fetch("/api/send-scheduled", { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          if (data.sent > 0) {
            refreshRef.current();
          }
        }
      } catch {
        /* network errors should not break the app */
      }
    };

    /** (Re)start the interval with the given delay. */
    const startInterval = (ms: number) => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(poll, ms);
    };

    // Poll immediately on mount
    poll();
    startInterval(
      document.hidden ? POLL_INTERVAL_HIDDEN_MS : POLL_INTERVAL_VISIBLE_MS
    );

    /**
     * When the tab becomes visible again, poll immediately and switch to
     * the faster interval. When hidden, slow down but keep polling.
     */
    const handleVisibility = () => {
      if (document.hidden) {
        startInterval(POLL_INTERVAL_HIDDEN_MS);
      } else {
        poll();
        startInterval(POLL_INTERVAL_VISIBLE_MS);
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
