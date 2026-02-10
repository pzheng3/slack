"use client";

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
import { useState } from "react";

interface NewAgentSessionDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback to close the dialog */
  onOpenChange: (open: boolean) => void;
  /** Called with the session name when the user confirms */
  onCreateSession: (sessionName: string) => Promise<void>;
}

/**
 * Dialog for creating a new agent session.
 * Prompts the user to enter a name/prompt for the session.
 */
export function NewAgentSessionDialog({
  open,
  onOpenChange,
  onCreateSession,
}: NewAgentSessionDialogProps) {
  const [sessionName, setSessionName] = useState("");
  const [creating, setCreating] = useState(false);

  /**
   * Handle form submission — create the session and close the dialog.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = sessionName.trim();
    if (!trimmed) return;

    setCreating(true);
    try {
      await onCreateSession(trimmed);
      setSessionName("");
      onOpenChange(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>New Agent Session</DialogTitle>
          <DialogDescription>
            Enter a prompt to start a new AI agent session. The prompt will be
            used as the session name.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="py-4">
            <Input
              placeholder="e.g. Help me plan a product launch..."
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              autoFocus
              disabled={creating}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!sessionName.trim() || creating}
            >
              {creating ? "Creating..." : "Start Session"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
