# Connect an agent

Chalk serves its design tools over MCP at `http://127.0.0.1:<port>/mcp`. The port is 7801 unless another app already uses it. The **Connect agent** dialog adds this address to your coding agent.

## Connect from the dialog

1. Click **Connect agent** in the title bar.
2. Select your agent in the list.
3. Click **Add to** and the agent name.
4. If the agent is open, start a new session so that it loads Chalk.
5. Select a frame in Chalk. Copy one of the example prompts into your agent.

The dialog opens on the agent that you selected last time.

## Read the status

- **Connected** means that the agent's config points to the current address.
- **Connected to an old address** means that the config points to another port. Click **Update**.
- **Not connected** means that the config has no usable `chalk` entry.
- **Not installed** means that Chalk did not find the agent. The manual steps still work.
- **Cannot add automatically** means that Chalk cannot read the config. The dialog shows the reason. Use the manual steps.

The status reads only the config file. It does not check that the agent has loaded the server.

## What each agent's button does

| Agent | One-click method | Config that Chalk reads |
|---|---|---|
| Claude Code | Runs `claude mcp add --scope user --transport http chalk <url>`. **Update** runs `claude mcp remove --scope user chalk` first. | `~/.claude.json` |
| Codex | Runs `codex mcp add chalk --url <url>` if the installed `codex` supports `--url`. **Update** runs `codex mcp remove chalk` first. Without that support, Chalk adds `[mcp_servers.chalk]` to the file itself. | `~/.codex/config.toml` |
| Cursor | Sets `mcpServers.chalk` to `{ "url": "<url>" }`. Chalk creates the file if it is missing. | `~/.cursor/mcp.json` |
| VS Code (GitHub Copilot) | Runs `code --add-mcp '{"name":"chalk","type":"http","url":"<url>"}'`. Without the `code` command, Chalk opens a `vscode:mcp/install` link. Click **Install** in VS Code. | The user `mcp.json` (`servers.chalk`), then `~/.copilot/mcp-config.json` (`mcpServers.chalk`) |
| OpenCode | Sets `mcp.chalk` to `{ "type": "remote", "url": "<url>", "enabled": true }`. | `~/.config/opencode/opencode.jsonc` if it exists, otherwise `opencode.json` |
| Other agents | None. Copy the URL or the JSON snippet. | None |

## How Chalk changes config files

- Chalk parses a file before it changes it. If the file is not valid JSON or TOML, Chalk leaves it unchanged and shows the reason.
- Chalk changes only the `chalk` entry. It keeps every other key and server.
- In `config.toml`, Chalk changes only the `[mcp_servers.chalk]` table. Comments and other tables stay byte for byte.
- Chalk does not rewrite a JSON file that has comments or trailing commas, because it cannot keep them. Add the entry by hand.
- Before each change, Chalk copies the file to `<file>.chalk-backup-<time>-<id>` in the same folder. It also does this before the `claude`, `codex`, or `code` command changes the file.
- Chalk writes a temporary file and renames it over the config. A crash cannot leave a half-written config. If the config is a symbolic link, Chalk writes to the file that the link points to.
- If the config already has the current address, Chalk does nothing. It makes no backup and runs no command.
- Chalk runs one connection at a time.

## Set up an agent by hand

Click **Or, install manually** in the dialog. It shows the command or snippet with the current address. Each snippet has a **Copy** button.

For Claude Code, run this once:

```sh
claude mcp add --scope user --transport http chalk http://127.0.0.1:7801/mcp
```

## Test the connection code

`npm run test:connect` runs the connection code against temporary home folders and fake `claude`, `codex`, and `code` commands. `npm run e2e` opens the dialog in the real app.

When `CHALK_PROJECT_DIR` is set, as in the e2e run, Chalk uses a home folder inside the test profile. It finds only the commands in `CHALK_CONNECT_BIN`. It never reads or changes your real agent configs.

The command formats come from `claude mcp add --help` and `codex mcp add --help`. The file formats follow the [Codex MCP guide](https://learn.chatgpt.com/docs/extend/mcp), the [Cursor MCP guide](https://cursor.com/docs/mcp), the [VS Code MCP guide](https://code.visualstudio.com/docs/agent-customization/mcp-servers), and the OpenCode "MCP servers" page.
