# Chat history

Chalk saves Agent conversations inside each project at `.chalk/chats/<id>.json`.
Each chat has an ID, a title, creation and update times, Agent events, and an optional Claude Code session ID and model.
The title is the first user message with surrounding spaces removed.
Empty chats stay in memory until the first message.

The main process owns the active chat and its saved events.
It writes a temporary file, then renames the file into place.
Writes use a 250 ms debounce during a turn.
Chalk also saves at turn end, before a chat or project switch, and on quit.
Each chat keeps the latest 2,000 events.
Text fields keep at most 32,000 characters.
Image data URLs and long base64 strings become `[attachment omitted]`.
Chat files contain no image attachments.
Invalid or unreadable chat files do not appear in the menu.

Chalk opens the most recently updated chat at startup and after a project switch.
The chat title opens a menu with Today, Yesterday, Previous 7 days, and Older groups.
Groups use the local calendar date.
The active chat is highlighted.
Hover over a title to read the full stored title.
Escape, a click outside the menu, or a loss of focus closes the menu.
The arrow keys move between menu items.

**+ New** starts a fresh conversation.
The trash button deletes one chat after confirmation.
**Clear Agent History** removes the project's saved chat files after confirmation.
These actions remove Chalk's transcripts, not Claude Code's own session files.
Chat and project switching stay disabled during a turn.
Use Stop before switching.

When you continue a saved chat, Chalk passes its session ID to Claude Code.
If Claude Code cannot find that session, Chalk retries the message in a fresh session and shows a notice.
The saved messages remain visible.
Other agent errors keep their normal error message.

Run `npm run build` and `npm run e2e` to check persistence, restart recovery, session resume, project isolation, menu groups, and deletion.
The suite uses a local fake Claude executable through the real Agent SDK.
It does not contact a live model.
