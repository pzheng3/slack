/**
 * Utilities for cleaning up streaming content before display.
 *
 * During streaming, partial markdown syntax (e.g. incomplete links)
 * and unparsed citation markers are visible as raw text. These helpers
 * trim such artifacts so the UI only shows well-formed content.
 */

/**
 * Clean streaming content for display by removing artifacts that
 * flash as raw text before they can be properly parsed.
 *
 * 1. Trims any trailing incomplete markdown link `[text](url...`
 * 2. Strips OpenAI citation markers `【...】` that haven't been
 *    processed into chips yet (they're replaced once SOURCES arrive).
 * 3. Always strips a trailing incomplete marker like `【4†sour`.
 *
 * When `keepCompleteMarkers` is true, only trailing incomplete markers
 * are stripped while complete `【...】` markers are preserved. This is
 * used during streaming once source annotations start arriving so that
 * `inlineSourceChips` can replace them with styled chips.
 *
 * This should ONLY be used for the display copy during streaming,
 * never for the persisted content.
 *
 * @param content              - The raw streaming content so far
 * @param keepCompleteMarkers  - If true, preserve complete `【...】` markers
 * @returns Cleaned content safe for display
 */
export function cleanStreamingContent(
  content: string,
  keepCompleteMarkers = false
): string {
  // 1. Trim trailing incomplete markdown link:
  //    Matches patterns like:
  //      [text          - open bracket, no close
  //      [text]         - bracket pair, no parentheses
  //      [text](url     - incomplete URL
  let cleaned = content.replace(/\[[^\]]*(?:\](?:\([^)]*)?)?$/, "");

  // 2. Strip complete OpenAI web-search citation markers (【4†source】 style)
  //    unless keepCompleteMarkers is set (source annotations already arriving).
  if (!keepCompleteMarkers) {
    cleaned = cleaned.replace(/【[^】]*】/g, "");
  }

  // 3. Always strip a trailing incomplete marker like 【4†sour
  cleaned = cleaned.replace(/【[^】]*$/, "");

  return cleaned;
}
