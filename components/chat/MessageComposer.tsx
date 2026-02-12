"use client";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDM } from "@/lib/hooks/useDM";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { ScheduleDialog } from "@/components/chat/ScheduleDialog";
import { useMentionSuggestions } from "@/lib/hooks/useMentionSuggestions";
import { useMentionNavigation } from "@/lib/hooks/useMentionNavigation";
import { createMentionSuggestion } from "@/lib/mention-suggestion";
import { ChannelMention } from "@/lib/channel-mention-extension";
import { createChannelSuggestion } from "@/lib/channel-suggestion";
import { useSlashCommands } from "@/lib/hooks/useSlashCommands";
import { createSlashSuggestion } from "@/lib/slash-suggestion";
import { SlashCommand } from "@/lib/slash-command-extension";
import { SlashCommandNode } from "@/lib/slash-command-node";

interface MessageComposerProps {
  /** Called when the user sends a message (content is HTML) */
  onSend: (content: string) => void | Promise<void>;
  /**
   * Called when the user schedules a message via the chevron menu.
   * Receives the HTML content and the chosen send time.
   * If not provided, the "Schedule for later" option is hidden.
   */
  onSchedule?: (content: string, sendAt: Date) => void | Promise<void>;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Whether sending is currently in progress */
  disabled?: boolean;
  /** Whether to auto-focus the editor on mount so the user can type immediately */
  autoFocus?: boolean;
  /** Whether the formatting toolbar is visible by default (default: true) */
  defaultShowToolbar?: boolean;
  /**
   * Whether to show commands and skills in the `/` menu.
   * When false, only app actions are shown (for channels and DMs).
   * Defaults to false.
   */
  showAgentCommands?: boolean;
  /**
   * Whether to hide the video-clip button in the action bar.
   * Useful for agent chats where video clips are not applicable.
   * Defaults to false.
   */
  hideVideoButton?: boolean;
  /** Optional className for the outer wrapper (e.g. to override background) */
  wrapperClassName?: string;
}

/**
 * Slack-style message composer with a rich-text Tiptap editor.
 * Includes a toggleable formatting toolbar, text editor, and action buttons.
 * Format buttons apply real styling (bold, italic, etc.) to the editor content.
 */
export function MessageComposer({
  onSend,
  onSchedule,
  placeholder = "Write a message,  @ to mention, / for shortcuts",
  disabled = false,
  autoFocus = false,
  defaultShowToolbar = true,
  showAgentCommands = false,
  hideVideoButton = false,
  wrapperClassName,
}: MessageComposerProps) {
  const router = useRouter();
  const { findOrCreateDM } = useDM();
  const [showToolbar, setShowToolbar] = useState(defaultShowToolbar);
  const [hasContent, setHasContent] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const handleSendRef = useRef<(() => void) | null>(null);

  /** All mentionable items (people, agents, channels, apps) for the @mention dropdown. */
  const mentionItems = useMentionSuggestions();
  const mentionItemsRef = useRef(mentionItems);
  mentionItemsRef.current = mentionItems;

  /** Tracks whether the @mention popup is currently visible. */
  const mentionOpenRef = useRef(false);

  /** Shared navigation handler for Cmd+Return in mention/channel menus. */
  const navigateToItem = useMentionNavigation();

  /** Stable suggestion config — uses a ref so the item list stays fresh. */
  const mentionSuggestion = useMemo(
    () => createMentionSuggestion(() => mentionItemsRef.current, mentionOpenRef, { onOpen: navigateToItem }),
    [navigateToItem]
  );

  /** Channel-only items for the # channel mention dropdown. */
  const channelItemsRef = useRef<typeof mentionItems>([]);
  channelItemsRef.current = mentionItems.filter((i) => i.category === "channel");

  /** Tracks whether the #channel popup is currently visible. */
  const channelOpenRef = useRef(false);

  /** Stable # channel suggestion config. */
  const channelSuggestion = useMemo(
    () => createChannelSuggestion(() => channelItemsRef.current, channelOpenRef, { onOpen: navigateToItem }),
    [navigateToItem]
  );

  /** All slash command items (commands, skills, apps) for the / menu. */
  const { items: allSlashItems, recentIds: slashRecentIds, recordRecent: slashRecordRecent } = useSlashCommands();
  // In channels and DMs, only show app actions; commands/skills are agent-only.
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

  /** Tracks whether the / slash command popup is currently visible. */
  const slashOpenRef = useRef(false);

  /** Stable slash suggestion config — uses refs so data stays fresh. */
  const slashSuggestion = useMemo(
    () =>
      createSlashSuggestion(
        () => slashItemsRef.current,
        () => slashRecentIdsRef.current,
        slashRecordRecent,
        slashOpenRef
      ),
    [slashRecordRecent]
  );

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        blockquote: false,
      }),
      Link.configure({
        openOnClick: true,
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
      Placeholder.configure({ placeholder }),
    ],
    editorProps: {
      attributes: {
        class:
          "tiptap-editor rich-text outline-none min-h-[22px] max-h-40 overflow-y-auto px-3 py-2 text-[15px] leading-[1.467] text-[var(--color-slack-text)]",
      },
      handleKeyDown(view, event) {
        if (event.key === "Enter" && !event.shiftKey) {
          // If any suggestion popup is open, let it handle Enter
          if (mentionOpenRef.current || channelOpenRef.current || slashOpenRef.current) {
            return false;
          }

          // Inside a list, let Tiptap handle Enter (adds a new list item)
          const { $from } = view.state.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            if ($from.node(depth).type.name === "listItem") {
              return false;
            }
          }
          // Otherwise send the message
          event.preventDefault();
          handleSendRef.current?.();
          return true;
        }
        return false;
      },
    },
    onUpdate({ editor }) {
      setHasContent(editor.getText().trim().length > 0);
    },
  });

  /** Sync editable state with disabled prop */
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
      // When the editor becomes editable and autoFocus was requested,
      // focus it — handles the case where autofocus fired while disabled.
      if (!disabled && autoFocus) {
        requestAnimationFrame(() => editor.commands.focus("end"));
      }
    }
  }, [editor, disabled, autoFocus]);

  /**
   * Send the current editor content as HTML and clear the editor.
   */
  const handleSend = () => {
    if (!editor || disabled) return;
    const text = editor.getText().trim();
    // #region agent log
    fetch("http://127.0.0.1:7247/ingest/10852203-67bc-4ede-9b0a-c6f770a8c961", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "MessageComposer.tsx:handleSend",
        message: "handleSend called",
        data: { textLength: text.length, disabled, willSend: !!(text && !disabled) },
        timestamp: Date.now(),
        hypothesisId: "H5",
      }),
    }).catch(() => {});
    // #endregion
    if (!text) return;

    const html = editor.getHTML();
    onSend(html);
    editor.commands.clearContent();
    setHasContent(false);
  };

  /**
   * Schedule the current editor content to be sent at a future time.
   * Grabs the HTML, calls the onSchedule prop, and clears the editor.
   */
  const handleSchedule = (sendAt: Date) => {
    if (!editor || disabled || !onSchedule) return;
    const text = editor.getText().trim();
    if (!text) return;

    const html = editor.getHTML();
    onSchedule(html, sendAt);
    editor.commands.clearContent();
    setHasContent(false);
  };

  // Keep ref in sync so handleKeyDown can call the latest handleSend
  handleSendRef.current = handleSend;

  /**
   * Insert a native emoji character into the Tiptap editor at the current
   * cursor position, then close the emoji popover and refocus the editor.
   */
  const insertEmoji = useCallback(
    (emoji: string) => {
      if (!editor) return;
      editor.chain().focus().insertContent(emoji).run();
      setEmojiOpen(false);
    },
    [editor]
  );

  /**
   * Handle clicks on @mention and #channel chips inside the editor.
   * Parses the `data-id` attribute (format `category:entityId`) and
   * navigates to the corresponding chat session.
   */
  const handleEditorClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      const target = (e.target as HTMLElement).closest?.(
        "[data-type='mention'], [data-type='channelMention']"
      ) as HTMLElement | null;
      if (!target) return;

      const raw = target.getAttribute("data-id");
      if (!raw) return;

      const colonIdx = raw.indexOf(":");
      if (colonIdx === -1) return;

      e.preventDefault();
      e.stopPropagation();

      const category = raw.slice(0, colonIdx);
      const entityId = raw.slice(colonIdx + 1);

      switch (category) {
        case "channel": {
          const label = target.textContent?.replace(/^[#@]/, "") ?? "";
          router.push(`/chat/channel/${encodeURIComponent(label)}`);
          break;
        }
        case "agent":
          router.push(`/chat/agent/session/${entityId}`);
          break;
        case "people": {
          const convId = await findOrCreateDM(entityId);
          if (convId) router.push(`/chat/dm/${convId}`);
          break;
        }
        default:
          break;
      }
    },
    [router, findOrCreateDM]
  );

  return (
    <div className={wrapperClassName ?? "bg-white px-5 pb-6"}>
      <div className="flex flex-col rounded-lg border border-[var(--color-slack-border)] bg-white transition-[border-color,box-shadow] duration-200 focus-within:border-[rgba(29,28,29,0.3)] focus-within:shadow-[0px_1px_3px_0px_rgba(0,0,0,0.08)]">
        {/* Formatting toolbar — toggled by the formatting button */}
        {showToolbar && editor && <FormattingToolbar editor={editor} />}

        {/* Rich-text editor area — click handler for @mention navigation */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <div onClick={handleEditorClick}>
          <EditorContent editor={editor} />
        </div>

        {/* Bottom action bar */}
        <div className="flex items-center justify-between rounded-b-lg pb-[2px] pl-[6px] pr-1">
          {/* Left actions */}
          <div className="flex items-center gap-0.5">
            <AttachButton />
            <div className="flex items-center gap-1 py-0.5">
              <ToolButton
                icon="formatting"
                size={18}
                withUnderline={showToolbar}
                onClick={() => setShowToolbar((prev) => !prev)}
                active={showToolbar}
              />
              <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                <PopoverTrigger asChild>
                  <ToolButton icon="emoji-1" size={18} />
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="start"
                  sideOffset={8}
                  className="w-auto border-none p-0 shadow-xl"
                >
                  <EmojiPicker onEmojiSelect={insertEmoji} />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1 py-1 pl-1 pr-0.5">
            <div className="flex items-center gap-1 py-0.5">
              {!hideVideoButton && <ToolButton icon="video-clip" size={18} />}
              <ToolButton icon="audio-clip" size={18} />
            </div>

            {/* Send button */}
            <SendButton
              hasContent={hasContent}
              disabled={disabled}
              onSend={handleSend}
              onSchedule={onSchedule ? handleSchedule : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Formatting toolbar wired to Tiptap editor commands.
 * Each button toggles real rich-text styling on the editor content.
 * Active states reflect the current selection's formatting.
 * @param editor - The Tiptap editor instance
 */
function FormattingToolbar({ editor }: { editor: Editor }) {
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const linkUrlInputRef = useRef<HTMLInputElement>(null);

  /**
   * Saved editor selection range so we can restore it after the user
   * interacts with the dialog (which moves focus away from the editor).
   */
  const savedSelectionRef = useRef<{ from: number; to: number } | null>(null);

  /**
   * Handle the link button — toggles link on/off.
   * If the selection is already a link, remove it.
   * Otherwise open the Add link dialog, preserving the current selection.
   */
  const handleLink = () => {
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    // Save selection before focus moves to the dialog
    const { from, to } = editor.state.selection;
    savedSelectionRef.current = { from, to };

    // Pre-populate text field with selected text (if any)
    const selectedText = from !== to ? editor.state.doc.textBetween(from, to) : "";
    setLinkText(selectedText);
    setLinkUrl("");
    setShowLinkDialog(true);
  };

  /**
   * Apply the link using the dialog inputs.
   * If text was originally selected, replace it with the new text + link.
   * If no text was selected, insert new linked text at the cursor.
   */
  const applyLink = () => {
    let url = linkUrl.trim();
    if (!url) return;

    // Auto-prepend https:// if the user omitted the protocol
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }

    const text = linkText.trim() || url;
    const sel = savedSelectionRef.current;
    const hasSelection = sel && sel.from !== sel.to;

    if (hasSelection) {
      // Replace the selected text with the (possibly edited) text + link
      editor
        .chain()
        .focus()
        .setTextSelection(sel)
        .deleteSelection()
        .insertContent(`<a href="${url}">${text}</a>`)
        .run();
    } else {
      // No text was selected — insert the text as a link at the cursor
      editor
        .chain()
        .focus()
        .insertContent(`<a href="${url}">${text}</a>`)
        .run();
    }

    setShowLinkDialog(false);
    setLinkUrl("");
    setLinkText("");
  };

  /** Close the dialog without applying and refocus the editor. */
  const cancelLink = () => {
    setShowLinkDialog(false);
    setLinkUrl("");
    setLinkText("");
    editor.commands.focus();
  };

  return (
    <div className="flex flex-col rounded-t-lg bg-[var(--color-slack-toolbar-bg)]">
      <div className="flex items-center gap-1 p-1 py-px">
        <FormatButton
          icon="bold"
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
        />
        <FormatButton
          icon="italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
        />
        <FormatButton
          icon="strikethrough"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
        />
        <ToolbarDivider />
        <FormatButton
          icon="link"
          onClick={handleLink}
          active={editor.isActive("link") || showLinkDialog}
        />
        <ToolbarDivider />
        <FormatButton
          icon="number-list"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
        />
        <FormatButton
          icon="bullet-list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
        />
        <ToolbarDivider />
        <FormatButton
          icon="code"
          onClick={() => editor.chain().focus().toggleCode().run()}
          active={editor.isActive("code")}
        />
        <FormatButton
          icon="code-block"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive("codeBlock")}
        />
      </div>

      {/* Add link dialog */}
      <Dialog open={showLinkDialog} onOpenChange={(open) => {
        if (!open) cancelLink();
      }}>
        <DialogContent className="sm:max-w-[425px] gap-5">
          <DialogHeader>
            <DialogTitle className="text-[18px] font-bold text-[var(--color-slack-text)]">
              Add link
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* Text field */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="link-text"
                className="text-[15px] font-semibold text-[var(--color-slack-text)]"
              >
                Text
              </label>
              <input
                id="link-text"
                type="text"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="Display text"
                className="rounded-[8px] border border-[rgba(29,28,29,0.3)] bg-white px-3 py-[9px] text-[15px] text-[var(--color-slack-text)] placeholder:text-[rgba(29,28,29,0.4)] outline-none focus:border-[rgba(29,28,29,0.5)] focus:shadow-[0_0_0_3px_rgba(18,100,163,0.2)]"
              />
            </div>

            {/* Link field */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="link-url"
                className="text-[15px] font-semibold text-[var(--color-slack-text)]"
              >
                Link
              </label>
              <input
                ref={linkUrlInputRef}
                id="link-url"
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyLink();
                  }
                }}
                placeholder="Enter a URL"
                autoFocus
                className="rounded-[8px] border border-[rgba(29,28,29,0.3)] bg-white px-3 py-[9px] text-[15px] text-[var(--color-slack-text)] placeholder:text-[rgba(29,28,29,0.4)] outline-none focus:border-[rgba(29,28,29,0.5)] focus:shadow-[0_0_0_3px_rgba(18,100,163,0.2)]"
              />
            </div>
          </div>

          <DialogFooter className="flex-row justify-end gap-2 pt-1">
            <button
              onClick={cancelLink}
              className="rounded-[8px] border border-[rgba(29,28,29,0.3)] bg-white px-4 py-[7px] text-[15px] font-medium text-[var(--color-slack-text)] hover:bg-[#f8f8f8] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={applyLink}
              disabled={!linkUrl.trim()}
              className="rounded-[8px] bg-[rgba(29,28,29,0.08)] px-4 py-[7px] text-[15px] font-medium text-[var(--color-slack-text)] transition-colors enabled:bg-[var(--color-slack-send-active)] enabled:text-white enabled:hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * A single formatting toolbar button with active-state highlighting.
 * @param icon - Icon filename (without path/extension)
 * @param onClick - Click handler to toggle formatting
 * @param active - Whether this format is currently active at the cursor
 */
function FormatButton({
  icon,
  onClick,
  active = false,
}: {
  icon: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      className={`flex items-center justify-center rounded-[4px] p-[5px] hover:bg-[var(--color-slack-border-light)] ${
        active ? "bg-[var(--color-slack-border-light)]" : ""
      }`}
      onClick={onClick}
    >
      <Image src={`/icons/${icon}.svg`} alt={icon} width={18} height={18} />
    </button>
  );
}

/**
 * Vertical divider used in the formatting toolbar.
 */
function ToolbarDivider() {
  return (
    <div className="flex items-start px-1 py-0.5">
      <div className="h-5 w-px bg-[var(--color-slack-border)]" />
    </div>
  );
}

/** Menu items shown in the attach popup. */
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

/**
 * Circular plus/close button that opens the attach menu.
 * When open the plus icon rotates 45° to form an X and the
 * background darkens. Clicking outside the menu dismisses it.
 */
function AttachButton() {
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
            <AttachMenuItem
              key={item.label}
              icon={item.icon}
              label={item.label}
              shortcut={item.shortcut}
              hasSubmenu={item.hasSubmenu}
              onSelect={() => setOpen(false)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A single row inside the attach popup menu.
 */
function AttachMenuItem({
  icon,
  label,
  shortcut,
  hasSubmenu = false,
  onSelect,
}: {
  icon: string;
  label: string;
  shortcut?: string;
  hasSubmenu?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="flex w-full items-center gap-2 px-4 py-[5px] text-left text-[15px] text-[#1D1C1D] hover:bg-[#ebebeb]"
    >
      <Image
        src={`/icons/${icon}.svg`}
        alt={label}
        width={20}
        height={20}
        className="shrink-0 opacity-70"
      />
      <span className="flex-1 truncate">{label}</span>
      {shortcut && (
        <span className="ml-auto shrink-0 text-[13px] text-[rgba(29,28,29,0.5)]">
          {shortcut}
        </span>
      )}
      {hasSubmenu && (
        <Image
          src="/icons/caret-right.svg"
          alt="Submenu"
          width={16}
          height={16}
          className="ml-auto shrink-0 opacity-50"
        />
      )}
    </button>
  );
}

/**
 * A tool button in the bottom action bar.
 * Uses forwardRef so it can be used with Radix PopoverTrigger asChild.
 * @param icon - Icon filename (without path/extension)
 * @param size - Icon size in px (default 18)
 * @param circular - Render as circular button
 * @param withUnderline - Show underline accent below icon
 * @param onClick - Optional click handler
 * @param active - Whether the button is in an active/toggled state
 */
const ToolButton = forwardRef<
  HTMLButtonElement,
  {
    icon: string;
    size?: number;
    circular?: boolean;
    withUnderline?: boolean;
    onClick?: () => void;
    active?: boolean;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function ToolButton(
  {
    icon,
    size = 18,
    circular = false,
    withUnderline = false,
    onClick,
    active = false,
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      className={`flex flex-col items-center justify-center p-[5px] ${
        circular
          ? "rounded-full bg-[var(--color-slack-border-light)] h-6 w-6"
          : `rounded-[4px] ${active ? "" : "hover:bg-[var(--color-slack-border-light)]"}`
      }`}
      onClick={onClick}
      {...rest}
    >
      <Image
        src={`/icons/${icon}.svg`}
        alt={icon}
        width={size}
        height={size}
        className="opacity-70"
      />
      {withUnderline && (
        <div className="mt-[-1px] h-px w-[18px] rounded-[1px] bg-[rgba(29,28,29,0.7)]" />
      )}
    </button>
  );
});

/**
 * The split send button — green when active, gray when disabled.
 * Has a send icon and a chevron-down for the menu.
 * The chevron opens a popover with a "Schedule for later" option.
 */
function SendButton({
  hasContent,
  disabled,
  onSend,
  onSchedule,
}: {
  hasContent: boolean;
  disabled: boolean;
  onSend: () => void;
  onSchedule?: (sendAt: Date) => void;
}) {
  const isActive = hasContent && !disabled;
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
          side="top"
          align="end"
          sideOffset={4}
          className="w-[220px] p-1 shadow-lg"
        >
          {onSchedule && (
            <button
              onClick={() => {
                setMenuOpen(false);
                setScheduleOpen(true);
              }}
              className="flex w-full items-center rounded-[4px] px-3 py-2 text-left text-[14px] text-[var(--color-slack-text)] hover:bg-[#f0f0f0] transition-colors"
            >
              Schedule for later
            </button>
          )}
        </PopoverContent>
      </Popover>

      {/* Schedule dialog */}
      {onSchedule && (
        <ScheduleDialog
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          onSchedule={onSchedule}
        />
      )}
    </>
  );
}
