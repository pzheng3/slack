import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Custom Tiptap Node that renders a selected slash command or skill
 * as a styled inline tag (similar to @mention chips).
 *
 * Attributes stored on each node:
 * - `id`       – unique item id (e.g. "command-summarize")
 * - `label`    – display text (e.g. "/summarize")
 * - `category` – "command" | "skill" | "app"
 * - `body`     – the prompt body / skill instructions from the markdown file
 *
 * Renders as:
 * ```html
 * <span data-type="slash-command" data-category="command" class="slash-command">/summarize</span>
 * ```
 */
export const SlashCommandNode = Node.create({
  name: "slashCommandNode",

  group: "inline",
  inline: true,

  /** Atomic — cursor cannot be placed inside the tag. */
  atom: true,

  /** Selectable so the user can delete it with backspace. */
  selectable: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-id"),
        renderHTML: (attrs) => ({ "data-id": attrs.id }),
      },
      label: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-label"),
        renderHTML: (attrs) => ({ "data-label": attrs.label }),
      },
      category: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-category"),
        renderHTML: (attrs) => ({ "data-category": attrs.category }),
      },
      body: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-body"),
        renderHTML: (attrs) => ({ "data-body": attrs.body }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="slash-command"]' }];
  },

  /**
   * Plain-text representation used by `editor.getText()`.
   * Without this, atomic nodes are invisible to getText() and the
   * composer thinks the input is empty (send button stays disabled).
   */
  renderText({ node }) {
    return node.attrs.label ?? "";
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(
        {
          "data-type": "slash-command",
          class: "slash-command",
        },
        HTMLAttributes
      ),
      node.attrs.label,
    ];
  },
});
