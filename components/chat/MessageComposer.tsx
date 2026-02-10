"use client";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "next/image";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { useMentionSuggestions } from "@/lib/hooks/useMentionSuggestions";
import { createMentionSuggestion } from "@/lib/mention-suggestion";

interface MessageComposerProps {
  /** Called when the user sends a message (content is HTML) */
  onSend: (content: string) => void | Promise<void>;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Whether sending is currently in progress */
  disabled?: boolean;
  /** Whether to auto-focus the editor on mount so the user can type immediately */
  autoFocus?: boolean;
}

/**
 * Slack-style message composer with a rich-text Tiptap editor.
 * Includes a toggleable formatting toolbar, text editor, and action buttons.
 * Format buttons apply real styling (bold, italic, etc.) to the editor content.
 */
export function MessageComposer({
  onSend,
  placeholder = "Write a message,  @ to mention, / for shortcuts",
  disabled = false,
  autoFocus = false,
}: MessageComposerProps) {
  const [showToolbar, setShowToolbar] = useState(true);
  const [hasContent, setHasContent] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const handleSendRef = useRef<(() => void) | null>(null);

  /** All mentionable items (people, agents, channels, apps) for the @mention dropdown. */
  const mentionItems = useMentionSuggestions();
  const mentionItemsRef = useRef(mentionItems);
  mentionItemsRef.current = mentionItems;

  /** Tracks whether the @mention popup is currently visible. */
  const mentionOpenRef = useRef(false);

  /** Stable suggestion config — uses a ref so the item list stays fresh. */
  const mentionSuggestion = useMemo(
    () => createMentionSuggestion(() => mentionItemsRef.current, mentionOpenRef),
    []
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
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        suggestion: mentionSuggestion,
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
          // If the @mention suggestion popup is open, let it handle Enter
          if (mentionOpenRef.current) {
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
    }
  }, [editor, disabled]);

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

  return (
    <div className="bg-white px-5 pb-6">
      <div className="flex flex-col rounded-lg border border-[var(--color-slack-border)] bg-white transition-[border-color,box-shadow] duration-200 focus-within:border-[rgba(29,28,29,0.3)] focus-within:shadow-[0px_1px_3px_0px_rgba(0,0,0,0.08)]">
        {/* Formatting toolbar — toggled by the formatting button */}
        {showToolbar && editor && <FormattingToolbar editor={editor} />}

        {/* Rich-text editor area */}
        <EditorContent editor={editor} />

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
              <ToolButton icon="video-clip" size={18} />
              <ToolButton icon="audio-clip" size={18} />
            </div>

            {/* Send button */}
            <SendButton
              hasContent={hasContent}
              disabled={disabled}
              onSend={handleSend}
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
  /**
   * Handle the link button — toggles link on/off.
   * If the selection is already a link, remove it.
   * Otherwise prompt for a URL and apply it.
   */
  const handleLink = () => {
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt("Enter URL:");
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  return (
    <div className="flex items-start rounded-t-lg bg-[var(--color-slack-toolbar-bg)] p-1">
      <div className="flex items-center gap-1 py-px">
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
          active={editor.isActive("link")}
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
        <div className="absolute bottom-full left-0 z-50 mb-2 w-[340px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
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
      className="flex w-full items-center gap-3 px-4 py-[7px] text-left text-[15px] text-[#1D1C1D] hover:bg-[#F0EDFC]"
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
 */
function SendButton({
  hasContent,
  disabled,
  onSend,
}: {
  hasContent: boolean;
  disabled: boolean;
  onSend: () => void;
}) {
  const isActive = hasContent && !disabled;

  return (
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
    </div>
  );
}
