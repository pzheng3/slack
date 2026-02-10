# Slash Command Content

This directory contains markdown files that power the `/` slash command menu
in the message composer. Each `.md` file becomes an entry in the menu.

## Directory Structure

```
content/
  commands/       ← prepackaged prompts
  skills/         ← Anthropic-defined plug-and-play capabilities
```

## Frontmatter Format

Every markdown file **must** include YAML frontmatter with these fields:

```yaml
---
name: summarize                # unique slug (should match filename without .md)
label: /summarize              # display text shown in the menu
description: Summarize the current conversation into key points
icon: lightbulb                # optional — references /icons/{icon}.svg
---
```

The **body** below the frontmatter is the prompt or skill instructions that
the AI will use when the command is invoked.

### Fields

| Field         | Required | Description                                       |
| ------------- | -------- | ------------------------------------------------- |
| `name`        | Yes      | Unique identifier / slug                          |
| `label`       | Yes      | Display label in the menu (include leading `/`)   |
| `description` | Yes      | One-line description shown in the menu subtitle   |
| `icon`        | No       | Icon name from `/icons/*.svg` (default: `shortcut`) |

## Example Command

`content/commands/summarize.md`:

```markdown
---
name: summarize
label: /summarize
description: Summarize the current conversation into key points
icon: lightbulb
---

Read the conversation above and provide a concise summary with:
- Key decisions made
- Action items and owners
- Unresolved questions
```

## Example Skill

`content/skills/web-search.md`:

```markdown
---
name: web-search
label: /web-search
description: Search the web for real-time information
icon: search
---

You have the ability to search the web for up-to-date information.
When the user invokes this skill, use your web search capability to
find accurate, current answers to their question.
```
