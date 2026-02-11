"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

/** A single entry in the navigation history stack. */
export interface HistoryEntry {
  /** The pathname that was visited. */
  path: string;
  /** A human-readable title (initially derived from the path, but may be
   *  enriched by the page component via `setCurrentTitle`). */
  title: string;
  /** The type of page — used for icon rendering in the history list. */
  type: "channel" | "dm" | "agent" | "agent-session" | "other";
  /** Timestamp when this entry was first recorded. */
  timestamp: number;
}

/** The value exposed by the navigation history context. */
export interface NavigationHistoryContextValue {
  /** The full history stack (oldest first). */
  history: HistoryEntry[];
  /** Index of the currently-active entry. */
  currentIndex: number;
  /** Whether there is a previous entry to go back to. */
  canGoBack: boolean;
  /** Whether there is a next entry to go forward to. */
  canGoForward: boolean;
  /** Navigate back one step. */
  goBack: () => void;
  /** Navigate forward one step. */
  goForward: () => void;
  /** Jump to a specific index in the history stack. */
  goToIndex: (idx: number) => void;
  /**
   * Update the title (and optionally type) of the *current* history entry.
   * Page components call this once they know their display name
   * (e.g. the DM partner's username, or a channel name).
   */
  setCurrentTitle: (title: string, type?: HistoryEntry["type"]) => void;
}

/* ================================================================== */
/*  Context                                                            */
/* ================================================================== */

const NavigationHistoryContext =
  createContext<NavigationHistoryContextValue | null>(null);

/* ================================================================== */
/*  Helper: derive a fallback title + type from the pathname           */
/* ================================================================== */

/**
 * Parse a chat pathname into a fallback human-readable title and page type.
 * Page components should override this via `setCurrentTitle`.
 */
function parsePath(path: string): { title: string; type: HistoryEntry["type"] } {
  if (path.startsWith("/chat/channel/")) {
    const name = decodeURIComponent(path.replace("/chat/channel/", ""));
    return { title: name, type: "channel" };
  }
  if (path.startsWith("/chat/agent/session/")) {
    return { title: "Agent Session", type: "agent-session" };
  }
  if (path.startsWith("/chat/agent/")) {
    const username = decodeURIComponent(path.replace("/chat/agent/", ""));
    return { title: username, type: "agent" };
  }
  if (path.startsWith("/chat/dm/")) {
    return { title: "Direct Message", type: "dm" };
  }
  return { title: path, type: "other" };
}

/** Maximum number of history entries to keep. */
const MAX_HISTORY = 50;

/* ================================================================== */
/*  Provider                                                           */
/* ================================================================== */

/**
 * Provider that tracks in-app navigation history and exposes
 * back / forward / go-to-index / setCurrentTitle via context.
 */
export function NavigationHistoryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const historyRef = useRef<HistoryEntry[]>([]);
  const indexRef = useRef(-1);
  const skipNextRef = useRef<string | null>(null);

  /** Version counter to force re-renders when ref values change. */
  const [, setVersion] = useState(0);
  const rerender = useCallback(() => setVersion((v) => v + 1), []);

  /* ---------------------------------------------------------------- */
  /*  Track pathname changes                                           */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (skipNextRef.current === pathname) {
      skipNextRef.current = null;
      return;
    }
    skipNextRef.current = null;

    const current = historyRef.current[indexRef.current];
    if (current?.path === pathname) return;

    const { title, type } = parsePath(pathname);
    const entry: HistoryEntry = {
      path: pathname,
      title,
      type,
      timestamp: Date.now(),
    };

    historyRef.current = [
      ...historyRef.current.slice(0, indexRef.current + 1),
      entry,
    ];
    indexRef.current = historyRef.current.length - 1;

    if (historyRef.current.length > MAX_HISTORY) {
      const excess = historyRef.current.length - MAX_HISTORY;
      historyRef.current = historyRef.current.slice(excess);
      indexRef.current -= excess;
    }

    rerender();
  }, [pathname, rerender]);

  /* ---------------------------------------------------------------- */
  /*  Navigation actions                                               */
  /* ---------------------------------------------------------------- */

  const goBack = useCallback(() => {
    if (indexRef.current <= 0) return;
    indexRef.current--;
    const target = historyRef.current[indexRef.current];
    skipNextRef.current = target.path;
    router.push(target.path);
    rerender();
  }, [router, rerender]);

  const goForward = useCallback(() => {
    if (indexRef.current >= historyRef.current.length - 1) return;
    indexRef.current++;
    const target = historyRef.current[indexRef.current];
    skipNextRef.current = target.path;
    router.push(target.path);
    rerender();
  }, [router, rerender]);

  const goToIndex = useCallback(
    (idx: number) => {
      if (
        idx < 0 ||
        idx >= historyRef.current.length ||
        idx === indexRef.current
      )
        return;
      indexRef.current = idx;
      const target = historyRef.current[idx];
      skipNextRef.current = target.path;
      router.push(target.path);
      rerender();
    },
    [router, rerender],
  );

  /* ---------------------------------------------------------------- */
  /*  Title enrichment (called by page components)                     */
  /* ---------------------------------------------------------------- */

  const setCurrentTitle = useCallback(
    (title: string, type?: HistoryEntry["type"]) => {
      const idx = indexRef.current;
      if (idx < 0 || idx >= historyRef.current.length) return;
      const entry = historyRef.current[idx];
      if (entry.title === title && (!type || entry.type === type)) return;
      historyRef.current[idx] = {
        ...entry,
        title,
        ...(type ? { type } : {}),
      };
      rerender();
    },
    [rerender],
  );

  /* ---------------------------------------------------------------- */
  /*  Context value                                                    */
  /* ---------------------------------------------------------------- */

  const value: NavigationHistoryContextValue = {
    history: historyRef.current,
    currentIndex: indexRef.current,
    canGoBack: indexRef.current > 0,
    canGoForward: indexRef.current < historyRef.current.length - 1,
    goBack,
    goForward,
    goToIndex,
    setCurrentTitle,
  };

  return (
    <NavigationHistoryContext.Provider value={value}>
      {children}
    </NavigationHistoryContext.Provider>
  );
}

/* ================================================================== */
/*  Consumer hooks                                                     */
/* ================================================================== */

/**
 * Hook to access the full navigation history context.
 * Used by the TopBar to render back/forward/history UI.
 */
export function useNavigationHistory(): NavigationHistoryContextValue {
  const ctx = useContext(NavigationHistoryContext);
  if (!ctx) {
    throw new Error(
      "useNavigationHistory must be used within a NavigationHistoryProvider",
    );
  }
  return ctx;
}

/**
 * Convenience hook for page components to register their display title.
 * Call this with the page's human-readable name (e.g. "Tiffany Wong",
 * "# general") once the name is available.
 *
 * @param title - The display title for the current page.
 * @param type  - Optional page type override.
 */
export function useSetNavigationTitle(
  title: string | undefined | null,
  type?: HistoryEntry["type"],
) {
  const ctx = useContext(NavigationHistoryContext);

  useEffect(() => {
    if (!ctx || !title) return;
    ctx.setCurrentTitle(title, type);
  }, [ctx, title, type]);
}
