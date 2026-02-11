import Mention from "@tiptap/extension-mention";

/**
 * A separate Mention extension instance for `#channel` mentions.
 *
 * Tiptap does not allow two instances of the same extension, so we
 * extend `Mention` with a unique `name`. This lets us register both
 * `@` (people/agents/channels/apps) and `#` (channels only) triggers
 * without conflict.
 *
 * Renders with `class="channel-mention"` so channel chips can be
 * styled distinctly from `@` mention chips.
 */
export const ChannelMention = Mention.extend({
  name: "channelMention",
});
