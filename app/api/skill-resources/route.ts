/**
 * GET /api/skill-resources?skill=<name>&path=<relative-path>
 *
 * On-demand resource loader for Agent Skills (agentskills.io).
 * Returns the content of a bundled resource file (references/, scripts/, assets/)
 * for a given skill. This supports the progressive disclosure pattern:
 * - Metadata loads at startup (~100 tokens per skill)
 * - SKILL.md body loads on activation
 * - Resources load only when needed (this endpoint)
 *
 * @example
 * GET /api/skill-resources?skill=code-reviewer&path=references/language-tips.md
 */
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/** Allowed resource subdirectories to prevent path traversal attacks. */
const ALLOWED_PREFIXES = ["references/", "scripts/", "assets/"];

/**
 * @param req - Incoming request with `skill` and `path` query parameters
 * @returns The resource file content as plain text, or an error response
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const skillName = searchParams.get("skill");
  const resourcePath = searchParams.get("path");

  if (!skillName || !resourcePath) {
    return NextResponse.json(
      { error: "Missing required query params: skill, path" },
      { status: 400 }
    );
  }

  // Validate resource path starts with an allowed prefix
  const isAllowed = ALLOWED_PREFIXES.some((prefix) =>
    resourcePath.startsWith(prefix)
  );
  if (!isAllowed) {
    return NextResponse.json(
      { error: "Resource path must start with references/, scripts/, or assets/" },
      { status: 400 }
    );
  }

  // Prevent path traversal
  if (resourcePath.includes("..") || resourcePath.includes("//")) {
    return NextResponse.json(
      { error: "Invalid resource path" },
      { status: 400 }
    );
  }

  const root = process.cwd();
  const filePath = path.join(root, "content", "skills", skillName, resourcePath);

  // Ensure the resolved path stays within the skills directory
  const skillsRoot = path.join(root, "content", "skills");
  if (!filePath.startsWith(skillsRoot)) {
    return NextResponse.json(
      { error: "Invalid resource path" },
      { status: 400 }
    );
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      { error: `Resource not found: ${skillName}/${resourcePath}` },
      { status: 404 }
    );
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to read resource" },
      { status: 500 }
    );
  }
}
