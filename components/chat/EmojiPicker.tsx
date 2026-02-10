"use client";

import { useEffect, useRef } from "react";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";

/**
 * Emoji data returned by emoji-mart when an emoji is selected.
 */
interface EmojiMartEmoji {
  /** The native Unicode emoji character */
  native: string;
  /** Short-code identifier, e.g. "+1" */
  id: string;
}

interface EmojiPickerProps {
  /** Called when the user selects an emoji */
  onEmojiSelect: (emoji: string) => void;
}

/**
 * Slack-style emoji picker using emoji-mart, themed to match the app design.
 * Renders native OS emojis with category tabs, search, frequently-used
 * tracking, and a skin-tone selector in the footer.
 *
 * @param onEmojiSelect - Callback receiving the native emoji character string
 */
export function EmojiPicker({ onEmojiSelect }: EmojiPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * Handle emoji selection from the picker.
   * Extracts the native character and forwards it to the parent.
   */
  const handleSelect = (emoji: EmojiMartEmoji) => {
    onEmojiSelect(emoji.native);
  };

  /**
   * Focus the search input when the picker mounts so the user
   * can immediately start typing to search.
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      const input = containerRef.current?.querySelector(
        "input[type='search'], input[placeholder]"
      ) as HTMLInputElement | null;
      input?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div ref={containerRef} className="emoji-picker-container">
      <Picker
        data={data}
        onEmojiSelect={handleSelect}
        theme="light"
        set="native"
        skinTonePosition="footer"
        previewPosition="none"
        navPosition="top"
        perLine={9}
        emojiSize={24}
        emojiButtonSize={36}
        maxFrequentRows={1}
        autoFocus
      />
    </div>
  );
}
