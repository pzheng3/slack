---
name: action-items
label: /action-items
description: Extract action items and next steps from the conversation
icon: shortcut
---

Scan the conversation above and extract every action item, task, or commitment mentioned. For each item, provide:

- **What**: A clear, one-line description of the task
- **Who**: The person responsible (if mentioned or implied)
- **When**: Any deadline or timeframe mentioned (or "No deadline specified")
- **Priority**: High / Medium / Low (infer from context and urgency cues)

Format the output as a numbered list sorted by priority. If no action items are found, say so and suggest what the team might want to follow up on.
