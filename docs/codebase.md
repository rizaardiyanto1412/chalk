# Linked codebase

Link a project's source folder so Chalk's agent learns the real product before it designs. Use the **Add codebase** button under the chat, next to Variations. Each Chalk project remembers its own folder in `.chalk/codebase.json`.

The agent reads the folder with three read-only tools: `code_list`, `code_search`, and `code_read`. It cannot write files or run commands. It never sees `.env` files, keys, certificates, files named like secrets or credentials, dependencies, build output, or `.git`. Paths that leave the folder, including symbolic links, are refused. In a Git repository, `.gitignore` also applies.

**Learn the product** in the Codebase popover asks the agent to explore the code and save a product brief into the project's `DESIGN.md`. The brief sits between `chalk:product-brief` markers, and anything else you wrote in `DESIGN.md` stays. Later designs, and every parallel worker, read the brief instead of exploring again. Run **Learn again** after the product changes. If you design before a brief exists, the agent explores first and saves one. Parallel workers read only a few files each and cannot write the brief, so learn the product once before a parallel run.

Everything the agent reads is sent to the model, as with Claude Code. Link only folders you are comfortable sharing.
