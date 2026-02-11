/**
 * GET /api/slash-commands
 *
 * Reads markdown files from `content/commands/` and skill directories from
 * `content/skills/`, parses YAML frontmatter with gray-matter, and returns
 * a JSON array of SlashCommandItem objects for the slash command menu.
 *
 * Skills follow the Agent Skills specification (agentskills.io):
 * - Each skill is a directory containing a required SKILL.md
 * - Optional subdirectories: references/, scripts/, assets/
 * - Progressive disclosure: only metadata loaded initially; body and
 *   resources loaded on activation / on-demand.
 */
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import type { SlashCommandItem, SkillResource } from "@/lib/types";

/** In-memory cache so we don't re-read the filesystem on every request in dev. */
let cache: { items: SlashCommandItem[]; mtime: number } | null = null;
const CACHE_TTL_MS = 5_000;

/** Resource directory names recognised by the Agent Skills spec. */
const RESOURCE_DIRS: { dir: string; type: SkillResource["type"] }[] = [
  { dir: "references", type: "reference" },
  { dir: "scripts", type: "script" },
  { dir: "assets", type: "asset" },
];

/**
 * Read all `.md` files from a flat directory and parse them into SlashCommandItems.
 * Used for the simpler `content/commands/` format.
 *
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
        resources: [],
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
 * Scan a skill directory for bundled resources (references/, scripts/, assets/).
 *
 * @param skillDir - Absolute path to the skill directory
 * @returns Array of SkillResource descriptors
 */
function discoverResources(skillDir: string): SkillResource[] {
  const resources: SkillResource[] = [];

  for (const { dir, type } of RESOURCE_DIRS) {
    const absDir = path.join(skillDir, dir);
    if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) continue;

    const files = fs.readdirSync(absDir);
    for (const file of files) {
      const filePath = path.join(absDir, file);
      if (!fs.statSync(filePath).isFile()) continue;
      resources.push({
        name: file,
        path: `${dir}/${file}`,
        type,
      });
    }
  }

  return resources;
}

/**
 * Read skill directories following the Agent Skills spec (agentskills.io).
 * Each subdirectory of `skillsRoot` that contains a SKILL.md is treated as a skill.
 *
 * @param skillsRoot - Absolute path to the skills root directory (e.g. content/skills/)
 * @returns Parsed slash command items for skills
 */
function readSkillDirs(skillsRoot: string): SlashCommandItem[] {
  if (!fs.existsSync(skillsRoot)) return [];

  const entries = fs.readdirSync(skillsRoot, { withFileTypes: true });
  const items: SlashCommandItem[] = [];

  for (const entry of entries) {
    // Skip non-directories (legacy flat .md files are handled by readMarkdownDir)
    if (!entry.isDirectory()) continue;

    const skillDir = path.join(skillsRoot, entry.name);
    const skillMdPath = path.join(skillDir, "SKILL.md");

    if (!fs.existsSync(skillMdPath)) {
      console.warn(`Skill directory missing SKILL.md: ${entry.name}`);
      continue;
    }

    try {
      const raw = fs.readFileSync(skillMdPath, "utf-8");
      const { data, content } = matter(raw);

      const name = (data.name as string) || entry.name;
      const meta = (data.metadata as Record<string, string>) || {};

      items.push({
        id: `skill-${name}`,
        label: (meta.label as string) || `/${name}`,
        description: (data.description as string) || "",
        icon: (meta.icon as string) || null,
        avatar_url: null,
        category: "skill",
        body: content.trim(),
        resources: discoverResources(skillDir),
        timestamp: new Date().toISOString(),
      });
    } catch {
      console.warn(`Failed to parse skill: ${entry.name}`);
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
  const skills = readSkillDirs(skillsDir);

  const items = [...commands, ...skills];

  cache = { items, mtime: now };

  return NextResponse.json(items);
}
