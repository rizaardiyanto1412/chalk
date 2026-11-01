# Project tabs

Each tab is one project folder with its own canvas, chats, agent, and design run. You can switch tabs, open projects, and create new ones while an agent works. The agent keeps working in its own project in the background. A tab with a working agent shows a spinner instead of its file icon.

Agents never write into the tab you are viewing unless it is their own. Each in-app agent talks to Chalk through its tab's own MCP address. Frames from a background run publish into that run's project, and its progress goes into that project's chat. When you switch back, you see the result.

You cannot close a tab while its agent is working. Stop the agent first. Each tab still runs one agent turn or design run at a time.

Idle tabs reload from disk when you switch to them, so external edits to `chalk.json` and chat files appear. Tabs with a working agent stay in memory until the work ends. Undo history resets when an idle tab reloads, as before.

External agents connected through the Connect dialog use the visible tab. The built-in browser is shared by all tabs.
