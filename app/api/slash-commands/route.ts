/**
 * GET /api/slash-commands
 *
 * Reads markdown files from `content/commands/` and `content/skills/`,
 * parses YAML frontmatter with gray-matter, and returns a JSON array
 * of SlashCommandItem objects for the slash command menu.
 */
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import type { SlashCommandItem } from "@/lib/types";

/** In-memory cache so we don't re-read the filesystem on every request in dev. */
let cache: { items: SlashCommandItem[]; mtime: number } | null = null;
const CACHE_TTL_MS = 5_000;

/**
 * Read all `.md` files from a directory and parse them into SlashCommandItems.
 * @param dir - Absolute path to the directory
 * @param category - The category to assign ("command" | "skill")
 * @returns Parsed slash command items
 */
function readMarkdownDir(
  dir: string,
  category: "command" | "skill"
): SlashCommandItem[] {
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  const items: SlashCommandItem[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, file), "utf-8");
      const { data, content } = matter(raw);

      const name = (data.name as string) || file.replace(/\.md$/, "");
      items.push({
        id: `${category}-${name}`,
        label: (data.label as string) || `/${name}`,
        description: (data.description as string) || "",
        icon: (data.icon as string) || null,
        avatar_url: null,
        category,
        body: content.trim(),
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Skip files that fail to parse
      console.warn(`Failed to parse ${category} file: ${file}`);
    }
  }

  return items;
}

/**
 * @returns JSON array of slash command items from content/commands and content/skills
 */
export async function GET() {
  const now = Date.now();

  // Return cached data if still fresh
  if (cache && now - cache.mtime < CACHE_TTL_MS) {
    return NextResponse.json(cache.items);
  }

  const root = process.cwd();
  const commandsDir = path.join(root, "content", "commands");
  const skillsDir = path.join(root, "content", "skills");

  const commands = readMarkdownDir(commandsDir, "command");
  const skills = readMarkdownDir(skillsDir, "skill");

  const items = [...commands, ...skills];

  cache = { items, mtime: now };

  return NextResponse.json(items);
}
