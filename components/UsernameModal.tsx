"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useUser } from "./providers/UserProvider";

/**
 * A blocking modal that prompts the user to enter a username.
 * Displayed when no user identity exists (first visit).
 * Cannot be dismissed — the user must enter a valid username.
 */
export function UsernameModal() {
  const { user, loading, register } = useUser();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Don't render if still loading or user already exists
  if (loading || user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const err = await register(username);
    if (err) {
      setError(err);
      setSubmitting(false);
    }
    // On success, user context updates and this component unmounts
  };

  return (
    <Dialog open>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-xl">Welcome to Slack Input</DialogTitle>
          <DialogDescription>
            Choose a username to start chatting. This will be your display name
            across all conversations.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Input
              placeholder="Enter your username..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={submitting}
              autoFocus
              maxLength={30}
            />
            {error && (
              <p className="mt-1.5 text-sm text-destructive">{error}</p>
            )}
          </div>
          <Button type="submit" disabled={submitting || !username.trim()}>
            {submitting ? "Creating..." : "Join Chat"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
