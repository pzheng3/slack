/**
 * Small pill-shaped badge showing the number of unread messages.
 * Matches the Figma design: 18px tall, rounded-full, bold 12px text,
 * using the Slack badge color tokens.
 *
 * Returns null when count is 0 or negative (nothing to show).
 *
 * @param {{ count: number }} props
 */
export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span
      className="
        flex h-[18px] shrink-0 items-center justify-center
        rounded-full bg-[var(--color-slack-badge-bg)] px-[6px]
        text-[12px] font-bold leading-[18px]
        text-[var(--color-slack-badge-text)]
      "
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
