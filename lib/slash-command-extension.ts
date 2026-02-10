import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import type { SuggestionOptions } from "@tiptap/suggestion";

/**
 * Custom Tiptap extension that provides a `/` slash command suggestion.
 *
 * Unlike the Mention extension which inserts a special node, this extension
 * replaces the typed `/query` text with the selected command label as plain
 * text. The selection callback is handled by the suggestion config passed
 * in as `suggestion`.
 *
 * @example
 * ```ts
 * import { SlashCommand } from "@/lib/slash-command-extension";
 *
 * const editor = useEditor({
 *   extensions: [
 *     SlashCommand.configure({ suggestion: mySlashSuggestion }),
 *   ],
 * });
 * ```
 */
export const SlashCommand = Extension.create<{
  suggestion: Omit<SuggestionOptions, "editor">;
}>({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        command: ({ editor, range, props }) => {
          // Replace the /query text with the selected command label
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent(props.label + " ")
            .run();
        },
      } as Omit<SuggestionOptions, "editor">,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
