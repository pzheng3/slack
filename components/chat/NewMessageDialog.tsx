"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@/components/providers/UserProvider";
import { useDM } from "@/lib/hooks/useDM";
import { useAgentSessions } from "@/lib/hooks/useAgentSessions";
import { useMentionSuggestions } from "@/lib/hooks/useMentionSuggestions";
import { useMentionNavigation } from "@/lib/hooks/useMentionNavigation";
import { createMentionSuggestion } from "@/lib/mention-suggestion";
import { ChannelMention } from "@/lib/channel-mention-extension";
import { createChannelSuggestion } from "@/lib/channel-suggestion";
import { useSlashCommands } from "@/lib/hooks/useSlashCommands";
import { createSlashSuggestion } from "@/lib/slash-suggestion";
import { SlashCommand } from "@/lib/slash-command-extension";
import { SlashCommandNode } from "@/lib/slash-command-node";
import { ReceiverChip, type Recipient } from "@/components/chat/ReceiverChip";
import { ReceiverList, type ReceiverListHandle } from "@/components/chat/ReceiverList";
import { ScheduleDialog } from "@/components/chat/ScheduleDialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { setPendingPrompt } from "@/lib/pending-prompt";
import { useScheduledMessages } from "@/lib/hooks/useScheduledMessages";
import { AGENTS } from "@/lib/constants";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/**
 * Set of predefined AI character-agent usernames (Elon Musk, Steve Jobs, etc.).
 * These appear in the "people" tab but their chat lives at `/chat/agent/{username}`,
 * not at a DM page.
 */
const CHARACTER_AGENT_USERNAMES = new Set(AGENTS.map((a) => a.username));

/** Menu items shown in the attach popup (same as MessageComposer). */
const ATTACH_MENU_ITEMS: {
  icon: string;
  label: string;
  shortcut?: string;
  hasSubmenu?: boolean;
}[] = [
  { icon: "canvases", label: "Canvas" },
  { icon: "bullet-list", label: "List" },
  { icon: "files", label: "Recent file", hasSubmenu: true },
  { icon: "code-block", label: "Text snippet", shortcut: "⌘⇧Enter" },
  { icon: "shortcut", label: "Workflow" },
  { icon: "content", label: "Upload from your computer", shortcut: "⌘O" },
];

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface NewMessageDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Callback to close the dialog. */
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * Command-palette-style "new message" dialog.
 *
 * Triggered by `Cmd+N` or the sidebar "new message" button.
 * Contains a "To" bar (which doubles as the search field) for recipient
 * selection and a simplified Tiptap editor (no formatting toolbar, no emoji
 * picker). The recipient popover floats below the To bar.
 *
 * After sending, navigates to the corresponding chat page.
 */
export function NewMessageDialog({ open, onClose }: NewMessageDialogProps) {
  const router = useRouter();
  const { user } = useUser();
  const { findOrCreateDM } = useDM();
  const { createSession } = useAgentSessions();
  const { scheduleMessage } = useScheduledMessages();

  /* ---- state ------------------------------------------------------- */

  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [receiverOpen, setReceiverOpen] = useState(true);
  const [toQuery, setToQuery] = useState("");
  const [hasContent, setHasContent] = useState(false);
  const [sending, setSending] = useState(false);
  const handleSendRef = useRef<(() => void) | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const toBarRef = useRef<HTMLDivElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);
  const receiverListRef = useRef<ReceiverListHandle>(null);
  const receiverWrapperRef = useRef<HTMLDivElement>(null);

  /* ---- mention / channel / slash suggestion setup ------------------- */

  const mentionItems = useMentionSuggestions();
  const mentionItemsRef = useRef(mentionItems);
  mentionItemsRef.current = mentionItems;
  const mentionOpenRef = useRef(false);

  /** Shared navigation handler for Cmd+Return in menus. */
  const navigateToItem = useMentionNavigation();

  const mentionSuggestion = useMemo(
    () =>
      createMentionSuggestion(() => mentionItemsRef.current, mentionOpenRef, {
        placement: "below",
        onOpen: navigateToItem,
      }),
    [navigateToItem]
  );

  /** Channel-only items for the # channel mention dropdown. */
  const channelItemsRef = useRef<typeof mentionItems>([]);
  channelItemsRef.current = mentionItems.filter((i) => i.category === "channel");
  const channelOpenRef = useRef(false);

  const channelSuggestion = useMemo(
    () =>
      createChannelSuggestion(() => channelItemsRef.current, channelOpenRef, {
        placement: "below",
        onOpen: navigateToItem,
      }),
    [navigateToItem]
  );

  /** Slash commands — show agent commands only when recipient is an agent. */
  const { items: allSlashItems, recentIds: slashRecentIds, recordRecent: slashRecordRecent } =
    useSlashCommands();

  const showAgentCommands = recipient?.type === "agent";
  const slashItems = useMemo(
    () =>
      showAgentCommands
        ? allSlashItems
        : allSlashItems.filter((i) => i.category === "app"),
    [allSlashItems, showAgentCommands]
  );
  const slashItemsRef = useRef(slashItems);
  slashItemsRef.current = slashItems;
  const slashRecentIdsRef = useRef(slashRecentIds);
  slashRecentIdsRef.current = slashRecentIds;
  const slashOpenRef = useRef(false);

  const slashSuggestion = useMemo(
    () =>
      createSlashSuggestion(
        () => slashItemsRef.current,
        () => slashRecentIdsRef.current,
        slashRecordRecent,
        slashOpenRef,
        { placement: "below" }
      ),
    [slashRecordRecent]
  );

  /* ---- Tiptap editor ----------------------------------------------- */

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        blockquote: false,
      }),
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        /**
         * Render mention text with category-aware prefix:
         * channels → `#name`, everything else → `@name`.
         */
        renderText({ node, suggestion }) {
          const id = (node.attrs.id as string) ?? "";
          const prefix = id.startsWith("channel:") ? "#" : (suggestion?.char ?? "@");
          return `${prefix}${node.attrs.label ?? node.attrs.id}`;
        },
        renderHTML({ node, suggestion }) {
          const id = (node.attrs.id as string) ?? "";
          const prefix = id.startsWith("channel:") ? "#" : (suggestion?.char ?? "@");
          return `${prefix}${node.attrs.label ?? node.attrs.id}`;
        },
        suggestion: mentionSuggestion,
      }),
      ChannelMention.configure({
        HTMLAttributes: { class: "channel-mention" },
        renderText({ node }) {
          return `#${node.attrs.label ?? node.attrs.id}`;
        },
        renderHTML({ node }) {
          return `#${node.attrs.label ?? node.attrs.id}`;
        },
        suggestion: channelSuggestion,
      }),
      SlashCommandNode,
      SlashCommand.configure({
        suggestion: slashSuggestion,
      }),
      Placeholder.configure({
        placeholder: "Write a message,  @ to mention, / for shortcuts",
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "tiptap-editor rich-text outline-none min-h-[22px] max-h-40 overflow-y-auto px-3 py-2 text-[15px] leading-[1.467] text-[var(--color-slack-text)]",
      },
      handleKeyDown(view, event) {
        if (event.key === "Enter" && !event.shiftKey) {
          if (mentionOpenRef.current || channelOpenRef.current || slashOpenRef.current) {
            return false;
          }
          const { $from } = view.state.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            if ($from.node(depth).type.name === "listItem") {
              return false;
            }
          }
          event.preventDefault();
          handleSendRef.current?.();
          return true;
        }
        return false;
      },
    },
    onUpdate({ editor: ed }) {
      setHasContent(ed.getText().trim().length > 0);
    },
  });

  /** Sync editable state. */
  useEffect(() => {
    if (editor) {
      editor.setEditable(!sending);
    }
  }, [editor, sending]);

  /* ---- send logic -------------------------------------------------- */

  /**
   * Send the message to the selected recipient and navigate to the chat.
   * Handles three recipient types: channel, agent, and people.
   */
  const handleSend = useCallback(async () => {
    if (!editor || !recipient || !user || sending) return;
    const text = editor.getText().trim();
    if (!text) return;

    const html = editor.getHTML();
    setSending(true);

    try {
      switch (recipient.type) {
        case "channel": {
          // Store the prompt so the channel page can send it via its own
          // handleSend() — this also triggers useAgentAutoReply for
          // AI-character auto-replies in the channel.
          setPendingPrompt(recipient.id, html);
          onClose();
          router.push(`/chat/channel/${encodeURIComponent(recipient.label)}`);
          break;
        }

        case "agent": {
          if (recipient.id === "__new_agent__") {
            // "Start a new agent" — create a fresh session (no greeting,
            // no auto-navigation). The prompt is stored in the pending-
            // prompt store so the session page can feed it through
            // sendMessage(), which inserts the message AND triggers the
            // AI response via streaming.
            const sessionName =
              text.length > 60 ? text.slice(0, 60) + "..." : text;
            const sessionId = await createSession(sessionName, {
              skipGreeting: true,
              skipNavigation: true,
            });
            if (sessionId) {
              setPendingPrompt(sessionId, html);
              onClose();
              router.push(`/chat/agent/session/${sessionId}`);
            }
          } else {
            // Existing agent session — store the prompt so the session
            // page can send it via sendMessage() (which triggers AI).
            setPendingPrompt(recipient.id, html);
            onClose();
            router.push(`/chat/agent/session/${recipient.id}`);
          }
          break;
        }

        case "people": {
          if (CHARACTER_AGENT_USERNAMES.has(recipient.label)) {
            // Character agent (Elon Musk, Steve Jobs, etc.) — their chat
            // lives at /chat/agent/{username}, not at a DM page. Store
            // the prompt keyed by "agent:{username}" so AgentPageClient
            // can consume it and send through useAgentChat.sendMessage()
            // (which triggers the AI reply).
            setPendingPrompt(`agent:${recipient.label}`, html);
            onClose();
            router.push(
              `/chat/agent/${encodeURIComponent(recipient.label)}`
            );
          } else {
            // Regular person — resolve to the existing (or new) DM
            // conversation, then store the prompt so the DM page can
            // send it via useMessages.sendMessage().
            const convId = await findOrCreateDM(recipient.id);
            if (convId) {
              setPendingPrompt(convId, html);
              onClose();
              router.push(`/chat/dm/${convId}`);
            }
          }
          break;
        }
      }
    } catch (err) {
      console.error("Failed to send new message:", err);
    } finally {
      setSending(false);
    }
  }, [editor, recipient, user, sending, onClose, router, createSession, findOrCreateDM]);

  /**
   * Schedule the current editor content to be sent at a future time.
   * Determines the correct recipient context and stores the scheduled message.
   */
  const handleSchedule = useCallback(
    async (sendAt: Date) => {
      if (!editor || !recipient || !user || sending) return;
      const text = editor.getText().trim();
      if (!text) return;

      const html = editor.getHTML();
      setSending(true);

      try {
        if (recipient.type === "agent" && recipient.id === "__new_agent__") {
          // Schedule for a new agent session — will be created at send time
          const sessionName =
            text.length > 60 ? text.slice(0, 60) + "..." : text;
          await scheduleMessage(
            html,
            sendAt,
            null,
            "new_agent",
            recipient.id,
            sessionName
          );
        } else {
          // For existing conversations, resolve conversation_id first
          let conversationId: string | null = null;
          let recipientLabel = recipient.label;

          switch (recipient.type) {
            case "channel":
              conversationId = recipient.id;
              recipientLabel = `#${recipient.label}`;
              break;
            case "agent":
              conversationId = recipient.id;
              break;
            case "people":
              if (CHARACTER_AGENT_USERNAMES.has(recipient.label)) {
                // Character agents don't have a direct conversation_id here
                conversationId = null;
              } else {
                conversationId = await findOrCreateDM(recipient.id);
              }
              break;
          }

          await scheduleMessage(
            html,
            sendAt,
            conversationId,
            recipient.type,
            recipient.id,
            recipientLabel
          );
        }

        editor.commands.clearContent();
        onClose();
      } catch (err) {
        console.error("Failed to schedule message:", err);
      } finally {
        setSending(false);
      }
    },
    [editor, recipient, user, sending, onClose, scheduleMessage, findOrCreateDM]
  );

  /**
   * Send the current message in incognito mode.
   * Creates a new agent session with "(incognito)" suffix in the name
   * and navigates to it. Only available for agent-type recipients.
   */
  const handleIncognitoSend = useCallback(
    async () => {
      if (!editor || !recipient || !user || sending) return;
      if (recipient.type !== "agent") return;

      const text = editor.getText().trim();
      if (!text) return;

      const html = editor.getHTML();
      setSending(true);

      try {
        const sessionName =
          (text.length > 60 ? text.slice(0, 60) + "..." : text) + " (incognito)";
        const sessionId = await createSession(sessionName, {
          skipGreeting: true,
          skipNavigation: true,
        });

        if (sessionId) {
          setPendingPrompt(sessionId, html);
          onClose();
          router.push(`/chat/agent/session/${sessionId}`);
        }
      } catch (err) {
        console.error("Failed to start incognito session:", err);
      } finally {
        setSending(false);
      }
    },
    [editor, recipient, user, sending, onClose, router, createSession]
  );

  // Keep ref in sync so handleKeyDown can call the latest handleSend
  handleSendRef.current = handleSend;

  /* ---- reset state when dialog opens/closes ------------------------ */

  useEffect(() => {
    if (open) {
      setRecipient(null);
      setReceiverOpen(true);
      setToQuery("");
      setHasContent(false);
      setSending(false);
      editor?.commands.clearContent();
      // Focus the To bar input on next tick
      requestAnimationFrame(() => {
        toInputRef.current?.focus();
      });
    }
  }, [open, editor]);

  /* ---- keyboard shortcuts inside the dialog ------------------------ */

  useEffect(() => {
    if (!open) return;

    const handler = (e: KeyboardEvent) => {
      // Escape — close receiver list first, then close dialog
      if (e.key === "Escape") {
        // Don't consume Escape if the mention/slash popup is open
        if (mentionOpenRef.current || channelOpenRef.current || slashOpenRef.current) return;
        e.preventDefault();
        if (receiverOpen) {
          setReceiverOpen(false);
          // Focus the editor after closing receiver
          requestAnimationFrame(() => editor?.commands.focus("end"));
        } else {
          onClose();
        }
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, receiverOpen, onClose, editor]);

  /* ---- click outside receiver list to dismiss it -------------------- */

  useEffect(() => {
    if (!open || !receiverOpen) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      // Ignore clicks inside the To bar or the receiver list popover
      if (toBarRef.current?.contains(target)) return;
      if (receiverWrapperRef.current?.contains(target)) return;

      setReceiverOpen(false);
      // Move focus to the editor so the user can start typing
      requestAnimationFrame(() => editor?.commands.focus("end"));
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, receiverOpen, editor]);

  /* ---- click outside to close -------------------------------------- */

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  /* ---- recipient selection ----------------------------------------- */

  /**
   * When a recipient is selected, close the receiver list and focus the editor.
   */
  const handleRecipientSelect = useCallback(
    (r: Recipient) => {
      setRecipient(r);
      setReceiverOpen(false);
      setToQuery("");
      // Focus the editor after a tick so React has time to render
      requestAnimationFrame(() => {
        editor?.commands.focus("end");
      });
    },
    [editor]
  );

  /**
   * Cmd+Enter — navigate directly to the selected recipient's chat
   * without composing a message first.
   */
  const handleOpenChat = useCallback(
    async (r: Recipient) => {
      try {
        switch (r.type) {
          case "channel": {
            onClose();
            router.push(`/chat/channel/${encodeURIComponent(r.label)}`);
            break;
          }
          case "agent": {
            if (r.id === "__new_agent__") {
              const sessionId = await createSession("New agent", {
                skipGreeting: false,
                skipNavigation: true,
              });
              if (sessionId) {
                onClose();
                router.push(`/chat/agent/session/${sessionId}`);
              }
            } else {
              onClose();
              router.push(`/chat/agent/session/${r.id}`);
            }
            break;
          }
          case "people": {
            const convId = await findOrCreateDM(r.id);
            if (convId) {
              onClose();
              router.push(`/chat/dm/${convId}`);
            }
            break;
          }
        }
      } catch (err) {
        console.error("Failed to open chat:", err);
      }
    },
    [onClose, router, createSession, findOrCreateDM]
  );

  /**
   * Handle keyboard events in the To bar input.
   * Delegates navigation keys to the ReceiverList when it's open.
   */
  const handleToInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!receiverOpen) return;
      // Delegate to the ReceiverList's imperative keyboard handler
      const handled = receiverListRef.current?.onKeyDown(e);
      if (handled) {
        // Event was consumed by the receiver list — don't propagate
        e.stopPropagation();
      }
    },
    [receiverOpen]
  );

  /**
   * Clear recipient and re-open the receiver list when Backspace is pressed
   * in the To bar input while the query is empty and a recipient is selected.
   */
  const handleToInputKeyDownCapture = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Backspace" && !toQuery && recipient) {
        e.preventDefault();
        setRecipient(null);
        setReceiverOpen(true);
      }
    },
    [toQuery, recipient]
  );

  /* ---- don't render when closed ------------------------------------ */

  if (!open) return null;

  const isActive = hasContent && !sending && !!recipient;

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 pt-[40vh]"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-[540px] -translate-y-1/2 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Message box */}
        <div className="relative flex flex-col rounded-lg border border-[rgba(29,28,29,0.13)] bg-white shadow-[0px_4px_24px_0px_rgba(0,0,0,0.15)]">
          {/* To bar — acts as the search field */}
          <div ref={toBarRef} className="relative z-20">
            <div className="flex min-h-[38px] items-center rounded-t-lg bg-[#f8f8f8] px-2 py-1">
              <div className="flex flex-1 items-center gap-2 min-w-0">
                <span className="shrink-0 text-[15px] leading-[1.467] text-[rgba(29,28,29,0.5)]">
                  To:
                </span>
                {recipient && (
                  <ReceiverChip
                    recipient={recipient}
                    active={receiverOpen}
                    onClick={() => {
                      setReceiverOpen((prev) => !prev);
                      requestAnimationFrame(() => toInputRef.current?.focus());
                    }}
                  />
                )}
                <input
                  ref={toInputRef}
                  type="text"
                  value={toQuery}
                  onChange={(e) => {
                    setToQuery(e.target.value);
                    if (!receiverOpen) setReceiverOpen(true);
                  }}
                  onFocus={() => {
                    if (!receiverOpen) setReceiverOpen(true);
                  }}
                  onKeyDown={handleToInputKeyDown}
                  onKeyDownCapture={handleToInputKeyDownCapture}
                  placeholder={recipient ? "" : "agent, people or channel"}
                  className={
                    recipient
                      ? "w-0 min-w-0 p-0 caret-transparent opacity-0 absolute"
                      : "min-w-[60px] flex-1 bg-transparent text-[15px] text-[#1d1c1d] placeholder:text-[rgba(29,28,29,0.5)] outline-none"
                  }
                />
              </div>
            </div>
          </div>

          {/* Receiver list — overlays below the To bar, on top of the editor area */}
          {receiverOpen && (
            <div ref={receiverWrapperRef} className="absolute left-2 top-[36px] z-30 w-[380px]">
              <ReceiverList
                ref={receiverListRef}
                items={mentionItems}
                query={toQuery}
                onSelect={handleRecipientSelect}
                onOpenChat={handleOpenChat}
                onClose={() => {
                  setReceiverOpen(false);
                  requestAnimationFrame(() => editor?.commands.focus("end"));
                }}
              />
            </div>
          )}

          {/* Editor area */}
          <div>
            <EditorContent editor={editor} />
          </div>

          {/* Bottom action bar — simplified (no formatting, no emoji) */}
          <div className="flex items-center justify-between rounded-b-lg pb-[2px] pl-[6px] pr-1">
            {/* Left actions */}
            <div className="flex items-center gap-0.5">
              <DialogAttachButton />
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-1 py-1 pl-1 pr-0.5">
              <div className="flex items-center gap-1 py-0.5">
                <button className="flex items-center justify-center rounded-[4px] p-[5px] hover:bg-[var(--color-slack-border-light)]">
                  <Image
                    src="/icons/audio-clip.svg"
                    alt="Audio clip"
                    width={18}
                    height={18}
                    className="opacity-70"
                  />
                </button>
              </div>

              {/* Send button */}
              <NewMessageSendButton
                isActive={isActive}
                onSend={handleSend}
                onSchedule={handleSchedule}
                onIncognito={handleIncognitoSend}
                showIncognito={recipient?.type === "agent" && recipient?.id === "__new_agent__"}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Attach button sub-component                                        */
/* ------------------------------------------------------------------ */

/**
 * Circular plus/close button that opens the attach menu.
 * When open the plus icon rotates 45° to form an X and the
 * background darkens. Reuses the same pattern as MessageComposer.
 */
function DialogAttachButton() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  /** Close when clicking anywhere outside the button + menu. */
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {/* Plus / Close toggle */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center justify-center rounded-full h-6 w-6 transition-colors duration-200 ${
          open
            ? "bg-[rgba(29,28,29,0.3)]"
            : "bg-[var(--color-slack-border-light)]"
        }`}
      >
        <Image
          src="/icons/plus.svg"
          alt={open ? "Close" : "Attach"}
          width={15}
          height={15}
          className={`opacity-70 transition-transform duration-200 ${
            open ? "rotate-45" : ""
          }`}
        />
      </button>

      {/* Attach menu */}
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-[calc(100vw-2rem)] max-w-[340px] overflow-hidden rounded-lg bg-white py-1 shadow-[0px_0px_0px_1px_rgba(29,28,29,0.13),0px_4px_12px_0px_rgba(0,0,0,0.1)]">
          {ATTACH_MENU_ITEMS.map((item) => (
            <button
              key={item.label}
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-[5px] text-left text-[15px] text-[#1D1C1D] hover:bg-[#ebebeb]"
            >
              <Image
                src={`/icons/${item.icon}.svg`}
                alt={item.label}
                width={20}
                height={20}
                className="shrink-0 opacity-70"
              />
              <span className="flex-1 truncate">{item.label}</span>
              {item.shortcut && (
                <span className="ml-auto shrink-0 text-[13px] text-[rgba(29,28,29,0.5)]">
                  {item.shortcut}
                </span>
              )}
              {item.hasSubmenu && (
                <Image
                  src="/icons/caret-right.svg"
                  alt="Submenu"
                  width={16}
                  height={16}
                  className="ml-auto shrink-0 opacity-50"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Send button sub-component                                          */
/* ------------------------------------------------------------------ */

/**
 * The split send button for the new message dialog.
 * Green when active (has content + recipient), gray when disabled.
 * The chevron opens a popover with "Schedule for later" and optionally
 * "Incognito mode" (when the recipient is an agent).
 */
function NewMessageSendButton({
  isActive,
  onSend,
  onSchedule,
  onIncognito,
  showIncognito = false,
}: {
  isActive: boolean;
  onSend: () => void;
  onSchedule: (sendAt: Date) => void;
  onIncognito: () => void;
  showIncognito?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <div className="relative flex h-7 w-[55px]">
          {/* Send button */}
          <button
            className={`flex items-center justify-center rounded-l-[4px] px-2 py-0.5 ${
              isActive ? "bg-[var(--color-slack-send-active)]" : ""
            }`}
            onClick={onSend}
            disabled={!isActive}
          >
            <Image
              src="/icons/send-fill.svg"
              alt="Send"
              width={16}
              height={16}
              className={isActive ? "brightness-0 invert" : "opacity-40"}
            />
          </button>

          {/* Divider */}
          <div
            className={`flex h-7 items-center ${
              isActive ? "bg-[var(--color-slack-send-active)]" : ""
            }`}
          >
            <div
              className={`h-5 w-px ${
                isActive ? "bg-white/50" : "bg-[rgba(29,28,29,0.06)]"
              }`}
            />
          </div>

          {/* More options chevron */}
          <PopoverTrigger asChild>
            <button
              className={`flex items-center justify-center rounded-r-[4px] px-1 py-0.5 ${
                isActive ? "bg-[var(--color-slack-send-active)]" : ""
              }`}
              disabled={!isActive}
            >
              <Image
                src="/icons/chevron-down.svg"
                alt="More"
                width={15}
                height={15}
                className={isActive ? "brightness-0 invert" : "opacity-40"}
              />
            </button>
          </PopoverTrigger>
        </div>

        <PopoverContent
          side="bottom"
          align="end"
          sideOffset={4}
          className="z-[200] w-[220px] p-1 shadow-lg"
        >
          {/* Schedule for later */}
          <button
            onClick={() => {
              setMenuOpen(false);
              setScheduleOpen(true);
            }}
            className="flex w-full items-center rounded-[4px] px-3 py-2 text-left text-[14px] text-[var(--color-slack-text)] hover:bg-[#f0f0f0] transition-colors"
          >
            Schedule for later
          </button>

          {/* Incognito mode — only for agent recipients */}
          {showIncognito && (
            <button
              onClick={() => {
                setMenuOpen(false);
                onIncognito();
              }}
              className="flex w-full items-center rounded-[4px] px-3 py-2 text-left text-[14px] text-[var(--color-slack-text)] hover:bg-[#f0f0f0] transition-colors"
            >
              Send incognito
            </button>
          )}
        </PopoverContent>
      </Popover>

      {/* Schedule dialog — highZ so it renders above the NewMessageDialog overlay */}
      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        onSchedule={onSchedule}
        highZ
      />
    </>
  );
}
