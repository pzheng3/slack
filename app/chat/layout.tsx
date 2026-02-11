"use client";

import { Sidebar } from "@/components/sidebar/Sidebar";
import { TopBar } from "@/components/TopBar";
import { NewMessageDialog } from "@/components/chat/NewMessageDialog";
import { useUser } from "@/components/providers/UserProvider";
import { Menu } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/** Minimum / maximum sidebar width in px */
const SIDEBAR_MIN_WIDTH = 260;
const SIDEBAR_MAX_WIDTH = 360;
const SIDEBAR_DEFAULT_WIDTH = 260;

/**
 * Chat layout — the Slack-like shell matching the Figma design.
 * Structure: full-width top bar, then resizable sidebar + main content below.
 */
export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [newMessageOpen, setNewMessageOpen] = useState(false);

  /** Open the new-message dialog. */
  const handleOpenNewMessage = useCallback(() => {
    setNewMessageOpen(true);
  }, []);

  /** Close the new-message dialog. */
  const handleCloseNewMessage = useCallback(() => {
    setNewMessageOpen(false);
  }, []);

  /** Global Cmd+N shortcut to open the new-message dialog. */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        setNewMessageOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Show nothing while loading or if no user (the modal handles that)
  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-slack-bg)]">
        <div className="animate-pulse text-white/70">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--color-slack-bg)]">
      {/* Full-width top bar */}
      <TopBar />

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
          minWidth={SIDEBAR_MIN_WIDTH}
          maxWidth={SIDEBAR_MAX_WIDTH}
          onOpenNewMessage={handleOpenNewMessage}
        />

        {/* Main content area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile-only hamburger bar */}
          <div className="flex h-10 items-center bg-white px-3 lg:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-md p-1.5 hover:bg-[var(--color-slack-border-light)]"
            >
              <Menu className="h-5 w-5 text-[var(--color-slack-text)]" />
            </button>
          </div>

          {/* Chat content — each page renders its own header + messages + composer */}
          <main className="flex min-h-0 flex-1 flex-col bg-white">{children}</main>
        </div>
      </div>

      {/* New message dialog — command palette style */}
      <NewMessageDialog open={newMessageOpen} onClose={handleCloseNewMessage} />
    </div>
  );
}
