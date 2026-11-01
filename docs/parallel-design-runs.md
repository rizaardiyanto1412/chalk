# Variations and parallel agents

The Chat composer has two controls. **Variations** produces 2–6 alternatives along a Layout or Style axis. Layout keeps one visual identity and changes composition. Style keeps the requested content and changes visual direction within the user's brand and references.

**Parallel agents** sets the maximum number of active Claude queries from 1 to 6. Planning and integration count toward this limit. Six variations with two agents run at most two queries at once. More tasks increase total work and cost even when concurrency stays low.

With variations off and one agent, Chalk uses its ordinary chat path and saved Claude session. With several agents, **Side by Side** makes complete alternatives. **Split Work** assigns complementary sections or groups of screens to workers. When variations are also enabled, their count sets the number of final alternatives.

For one page, main joins sections in planned order and an integrator checks the seams. Main checks that every section marker survives exactly once in order. If integration fails, Chalk keeps the assembled page and labels it `not integrated`. If a section fails, completed sections appear as partial frames. A complete alternative that fails publishes no drafts.

Results are new frames. Selected originals remain references, and each worker has private drafts. While a run is active, each worker's drafts appear on the canvas as read-only frames with a dashed outline in that worker's colour, and each worker has its own named cursor. The cursor moves to the part of the draft the worker last changed and sweeps the draft when the worker reviews it. Drafts are not in the document: you cannot select or edit them, and Undo ignores them. A completed frame publishes where its draft stood, unless something now occupies that space. You can keep moving and adding frames during a run. Each published batch is one Undo step. A run never changes a frame after publishing it.

The run card shows queued, running, completed, failed and canceled tasks. **Stop** cancels queued tasks and revokes active worker access immediately. Chalk stays busy until active queries and tools finish cleanup. Frames already published remain on the canvas. Unfinished drafts disappear and are never saved.

Every managed Send captures the visible HTTP(S) page as a reference, including a logged-in page. The selected settings stay active until you change them.

Each worker can browse public pages in an isolated temporary browser. Its cookies and snapshot references are separate from other workers and the visible browser. Authenticated references come from a read-only capture of the visible page at Send. Workers cannot publish browser captures, create local assets, export files or write the clipboard. Use ordinary mode when those actions are needed.

Runs use the local Claude CLI through the Agent SDK. The CLI must support structured JSON-schema output. Invalid plans fail before workers start. Plans support up to 12 screens per alternative and six complementary units. Oversized plans fail instead of truncating screens.

Saved chats retain readable progress notices and structured run metadata. Runs preserve the ordinary session, and the next ordinary turn receives a bounded note listing published frames. Older Chalk builds can read the notices but drop run metadata when they re-save a chat.

Worker capabilities prevent cross-worker and original-frame edits through scoped MCP tools. They do not protect against arbitrary local processes running as the same macOS user. The existing MCP endpoint remains available to the user's connected agents.

These mechanics do not guarantee distinct visual results or seamless integration. Those depend on the model's output. Synthetic tests verify process concurrency, ownership, cleanup, persistence and rendering, rather than design quality.

Selected local reference assets have a combined 40 MB limit per run. Reused local reference assets are embedded into published HTML to preserve the captured bytes. Large assets reused across alternatives increase document size. Remote images and fonts remain external resources.
