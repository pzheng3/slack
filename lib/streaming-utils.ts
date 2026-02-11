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
 *
 * This should ONLY be used for the display copy during streaming,
 * never for the persisted content.
 *
 * @param content - The raw streaming content so far
 * @returns Cleaned content safe for display
 */
export function cleanStreamingContent(content: string): string {
  // 1. Trim trailing incomplete markdown link:
  //    Matches patterns like:
  //      [text          — open bracket, no close
  //      [text]         — bracket pair, no parentheses
  //      [text](url     — incomplete URL
  let cleaned = content.replace(/\[[^\]]*(?:\](?:\([^)]*)?)?$/, "");

  // 2. Strip OpenAI web-search citation markers (【4†source】 style)
  //    These show as raw text until the SOURCES metadata arrives.
  cleaned = cleaned.replace(/【[^】]*】/g, "");
  // Also strip a trailing incomplete marker like 【4†sour
  cleaned = cleaned.replace(/【[^】]*$/, "");

  return cleaned;
}
