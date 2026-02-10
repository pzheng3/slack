"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import { AgentList } from "./AgentList";
import { ChannelList } from "./ChannelList";
import { DirectMessageList } from "./DirectMessageList";
import { AppsPlaceholder } from "./AppsPlaceholder";
import { useAgentSessions } from "@/lib/hooks/useAgentSessions";
import { useChannels } from "@/lib/hooks/useChannels";

interface SidebarProps {
  /** Whether the mobile sidebar is open */
  open: boolean;
  /** Callback to close the mobile sidebar */
  onClose: () => void;
  /** Current sidebar width in px */
  width: number;
  /** Called when the user drags the resize handle */
  onWidthChange: (width: number) => void;
  /** Minimum sidebar width in px */
  minWidth: number;
  /** Maximum sidebar width in px */
  maxWidth: number;
}

/**
 * Slack-like sidebar matching the Figma design.
 * Dark purple (#552e5a) background with sections: Agents, Channels, Direct Messages, Apps.
 * Width is user-resizable via a drag handle on the right edge.
 */
export function Sidebar({
  open,
  onClose,
  width,
  onWidthChange,
  minWidth,
  maxWidth,
}: SidebarProps) {
  const isResizing = useRef(false);
  const { sessions, createSession, deleteSession } = useAgentSessions();
  const { channels, createChannel, deleteChannel } = useChannels();

  // --- Add Channel dialog state ---
  const [addChannelOpen, setAddChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [addChannelError, setAddChannelError] = useState<string | null>(null);
  const [addChannelSubmitting, setAddChannelSubmitting] = useState(false);

  // --- Delete Channel confirmation dialog state ---
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  /**
   * Open the "Add channel" dialog.
   */
  const handleAddChannelClick = useCallback(() => {
    setNewChannelName("");
    setAddChannelError(null);
    setAddChannelOpen(true);
  }, []);

  /**
   * Submit the new channel name.
   */
  const handleAddChannelSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setAddChannelError(null);
      setAddChannelSubmitting(true);

      const error = await createChannel(newChannelName);
      if (error) {
        setAddChannelError(error);
        setAddChannelSubmitting(false);
        return;
      }

      setAddChannelSubmitting(false);
      setAddChannelOpen(false);
      onClose();
    },
    [createChannel, newChannelName, onClose]
  );

  /**
   * Open the delete confirmation dialog for a channel.
   */
  const handleDeleteChannelClick = useCallback((channelId: string, channelName: string) => {
    setDeleteTarget({ id: channelId, name: channelName });
  }, []);

  /**
   * Confirm channel deletion.
   */
  const handleDeleteChannelConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    await deleteChannel(deleteTarget.id);
    setDeleteSubmitting(false);
    setDeleteTarget(null);
  }, [deleteChannel, deleteTarget]);

  /**
   * Start tracking pointer to resize the sidebar.
   */
  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      isResizing.current = true;

      const startX = e.clientX;
      const startWidth = width;

      const handlePointerMove = (ev: PointerEvent) => {
        if (!isResizing.current) return;
        const delta = ev.clientX - startX;
        const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
        onWidthChange(newWidth);
      };

      const handlePointerUp = () => {
        isResizing.current = false;
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width, onWidthChange, minWidth, maxWidth],
  );

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        style={{ width: `${width}px` }}
        className={`
          fixed top-[44px] left-0 z-50 flex h-[calc(100vh-44px)] flex-shrink-0 flex-col
          overflow-hidden border-r border-[rgba(255,255,255,0.1)] bg-[var(--color-slack-sidebar)]
          transition-transform duration-200 ease-in-out
          lg:relative lg:top-0 lg:z-auto lg:translate-x-0
          ${open ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Workspace header */}
        <WorkspaceHeader />

        {/* Scrollable sections */}
        <ScrollArea className="flex-1 overflow-hidden">
          {/* Agents section */}
          <SidebarSection label="Agents" onAddClick={async () => {
            await createSession("New agent");
            onClose();
          }}>
            <AgentList onNavigate={onClose} sessions={sessions} onDeleteSession={deleteSession} />
          </SidebarSection>

          {/* Channels section */}
          <SidebarSection label="Channels" onAddClick={handleAddChannelClick}>
            <ChannelList
              onNavigate={onClose}
              channels={channels}
              onDeleteChannel={handleDeleteChannelClick}
            />
          </SidebarSection>

          {/* Direct Messages section */}
          <SidebarSection label="Direct messages" hideAddButton>
            <DirectMessageList onNavigate={onClose} />
          </SidebarSection>

          {/* Apps section */}
          <SidebarSection label="Apps" noBorder hideAddButton>
            <AppsPlaceholder />
          </SidebarSection>
        </ScrollArea>

        {/* Resize handle — right edge */}
        <div
          onPointerDown={handleResizeStart}
          className="
            absolute right-0 top-0 z-10 hidden h-full w-[5px] cursor-col-resize
            lg:block
            after:absolute after:inset-y-0 after:left-1/2 after:-translate-x-1/2
            after:w-px after:bg-transparent after:transition-colors after:duration-150
            hover:after:bg-white/30
            active:after:bg-white/50
          "
        />
      </aside>

      {/* Add Channel dialog */}
      <Dialog open={addChannelOpen} onOpenChange={setAddChannelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create a channel</DialogTitle>
            <DialogDescription>
              Enter a name for your new channel. Names will be lowercased and
              spaces replaced with hyphens.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddChannelSubmit} className="flex flex-col gap-4">
            <div>
              <Input
                placeholder="e.g. project-updates"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                disabled={addChannelSubmitting}
                autoFocus
                maxLength={50}
              />
              {addChannelError && (
                <p className="mt-1.5 text-sm text-destructive">{addChannelError}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddChannelOpen(false)}
                disabled={addChannelSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={addChannelSubmitting || !newChannelName.trim()}>
                {addChannelSubmitting ? "Creating..." : "Create Channel"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Channel confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete channel</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>#{deleteTarget?.name}</strong>? All messages
              in this channel will be permanently removed. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteChannelConfirm}
              disabled={deleteSubmitting}
            >
              {deleteSubmitting ? "Deleting..." : "Delete Channel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Workspace header — "Acme" with compose button.
 */
function WorkspaceHeader() {
  return (
    <div className="flex h-[50px] items-center justify-between border-b border-[var(--color-slack-sidebar-border)] px-4">
      <button className="flex min-w-0 items-center rounded-[6px] px-2 py-1">
        <span className="truncate text-[18px] font-bold leading-[1.33] text-white">
          Acme
        </span>
      </button>
      <button className="shrink-0 rounded-[4px] p-[3px] opacity-80 hover:opacity-100">
        <Image
          src="/icons/new-message.svg"
          alt="New message"
          width={20}
          height={20}
          className="brightness-0 invert"
        />
      </button>
    </div>
  );
}

/**
 * A collapsible sidebar section with a caret and label.
 * Clicking the section header toggles between expanded and collapsed states.
 * When collapsed, the caret points right and children are hidden.
 */
function SidebarSection({
  label,
  children,
  noBorder = false,
  hideAddButton = false,
  defaultCollapsed = false,
  onAddClick,
}: {
  label: string;
  children: React.ReactNode;
  noBorder?: boolean;
  hideAddButton?: boolean;
  /** Whether the section starts collapsed */
  defaultCollapsed?: boolean;
  /** Callback when the "Add" button is clicked */
  onAddClick?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className={`flex w-full min-w-0 flex-col overflow-hidden px-2 pt-3 ${noBorder ? "pb-3" : ""}`}>
      {/* Section header — click to toggle collapse */}
      <div
        className="flex w-full items-center px-2 cursor-pointer"
        onClick={() => setCollapsed((prev) => !prev)}
        role="button"
        aria-expanded={!collapsed}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setCollapsed((prev) => !prev);
          }
        }}
      >
        <span className="shrink-0 rounded-[4px] p-1">
          <Image
            src={collapsed ? "/icons/caret-right.svg" : "/icons/caret-down.svg"}
            alt=""
            width={18}
            height={18}
            className="brightness-0 invert opacity-70"
          />
        </span>
        <span className="min-w-0 rounded-[6px] pl-[5px]">
          <span className="flex h-[28px] items-center truncate text-[15px] leading-[17px] text-[var(--color-slack-sidebar-text)]">
            {label}
          </span>
        </span>
      </div>

      {/* Section items — hidden when collapsed */}
      {!collapsed && (
        <>
          <div className="flex w-full min-w-0 flex-col">
            {children}
          </div>

          {/* Add button */}
          {!hideAddButton && <AddButton label={label} onClick={onAddClick} />}
        </>
      )}
    </div>
  );
}

/**
 * "Add channels / Add agent / Add apps" button at the bottom of each section.
 * @param {{ label: string, onClick?: () => void }} props
 */
function AddButton({ label, onClick }: { label: string; onClick?: () => void }) {
  const addLabels: Record<string, string> = {
    Agents: "Add agent",
    Channels: "Add channel",
    "Direct messages": "Add channels",
    Apps: "Add apps",
  };

  const addLabel = addLabels[label] ?? `Add ${label.toLowerCase()}`;

  return (
    <button
      onClick={onClick}
      className="flex w-full min-w-0 items-center gap-2 rounded-[6px] px-3 py-1 hover:bg-white/5"
    >
      <div className="flex shrink-0 items-start rounded-[4px] bg-[var(--color-slack-sidebar-btn-bg)] p-1">
        <Image
          src="/icons/plus.svg"
          alt=""
          width={12}
          height={12}
          className="brightness-0 invert opacity-70"
        />
      </div>
      <span className="min-w-0 flex-1 truncate text-left text-[15px] leading-[17px] text-[var(--color-slack-sidebar-text)]">
        {addLabel}
      </span>
    </button>
  );
}
