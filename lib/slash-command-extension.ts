import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import type { SuggestionOptions } from "@tiptap/suggestion";

/**
 * Custom Tiptap extension that provides a `/` slash command suggestion.
 *
 * When the user selects an item from the `/` menu, this extension inserts
 * a `slashCommandNode` (an atomic inline node styled as a tag/chip) into
 * the editor, followed by a trailing space so the user can keep typing.
 *
 * Requires the `SlashCommandNode` node extension to be registered alongside
 * this extension so the editor knows how to render the inserted node.
 *
 * @example
 * ```ts
 * import { SlashCommand } from "@/lib/slash-command-extension";
 * import { SlashCommandNode } from "@/lib/slash-command-node";
 *
 * const editor = useEditor({
 *   extensions: [
 *     SlashCommandNode,
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
          // Replace the /query text with a styled slash command node + trailing space
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([
              {
                type: "slashCommandNode",
                attrs: {
                  id: props.id,
                  label: props.label,
                  category: props.category ?? null,
                  body: props.body ?? "",
                },
              },
              { type: "text", text: " " },
            ])
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
