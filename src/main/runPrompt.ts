import type { JobSpec, Plan, RunSettings } from '../shared/run'
import { contextBlock, type TurnContext } from './agent'
import type { ReferenceSet } from './worker'
import type { ResolvedStyle } from './styles'

export const PLANNER_SYSTEM = `Plan a Chalk design run. Return only the requested structured output.
A direction is one complete output, a page or the entire requested screen set. Never omit requested screens. More than 12 screens is an error, not permission to truncate.
For Split Work, divide a page into 1–6 complementary ordered sections with no duplicated content. Assign screens in units of 1–2 named screens, covering each screen exactly once. For other modes use one whole-request unit.
Set contract.identity to request only when the user's request explicitly supplies visual identity, references when frozen references or DESIGN.md supply it, or catalog when you choose a catalog style.
Layout variations share one visual identity and change composition. Style variations preserve content and scope while changing visual direction. If brand, DESIGN.md or references fix identity, omit catalog style and vary within the brand using distinct titled visual briefs. Otherwise choose canonical catalog ID and variant pairs. Layout directions use the same choice. Style directions use distinct pairs.
User style, DESIGN.md, selected references, then catalog choices determine identity in that order. Keep the existing font and CSS expressiveness. No browser or tools are available to this planner.`
export const WORKER_RULES = `You are an isolated Chalk design worker. You can read frozen references and modify only your own in-memory drafts. Main publishes new frames when your job succeeds. Never try to edit the user canvas, originals or other jobs. No local file, shell, export or clipboard tools exist.
Follow the assigned scope exactly. A complete job creates exactly one draft per assigned screen, or one page. A section creates one body fragment, without html/head/body/doctype or script. Style blocks and expressive Tailwind are allowed; report global styles for integration. Integrators edit only their one seeded draft. Keep every data-chalk-part marker exactly once in order and scope or inline global styles. Draft styleBlocks flags the number of style blocks that need attention.
Call get_design_guidelines and use screenshot_frame for selected references. Reuse chosen-style font links, theme and semantic tokens. Read each draft revision before update_frame. Review the image and layout diagnostics and check visible arithmetic before finishing.
Your browser is private and has no logged-in cookies. Use get_reference_page for the admission capture of the user's browser. Snapshot refs belong only to your private browser and navigation. Local and Chalk URLs are blocked. Never claim an unavailable authenticated page was inspected.`
export function plannerPrompt(settings: RunSettings, text: string, turn: TurnContext, refs: ReferenceSet, catalog: unknown): string {
  return `[chalk-planner]\n${contextBlock(turn)}\nSettings: ${JSON.stringify(settings)}\nCatalog: ${JSON.stringify(catalog)}\nFrozen DESIGN.md: ${refs.designNotes}\nFrozen visible page: ${JSON.stringify(refs.page ? { url: refs.page.url, tree: refs.page.tree, styles: refs.page.styles } : null)}\nRequest: ${text}`
}
export function workerPrompt(job: JobSpec, plan: Plan, refs: ReferenceSet, text: string, style: ResolvedStyle | null): string {
  const turn: TurnContext = { selectedFrames: [...refs.frames], selectedElements: [...refs.selectedElements], browserPick: refs.browserPick, browserUrl: refs.page?.url ?? '', style }
  return `[chalk-worker]\n${contextBlock(turn)}\n<job>${JSON.stringify(job)}</job>\n<plan>${JSON.stringify(plan)}</plan>\nFrozen DESIGN.md: ${refs.designNotes}\n${job.role === 'integrate' ? 'Edit the seeded merged draft only. Do not create or delete drafts. Keep all section markers in order.' : `Create exactly ${job.maxDrafts} draft(s)`}${job.unit?.screens ? ` for ${job.unit.screens.join(', ')}` : plan.kind === 'screens' ? ` for ${plan.screens.join(', ')}` : ''}.\n${job.role === 'section' ? `Build only ${job.unit?.title}. Do not build sibling sections: ${job.siblings.join(', ')}.` : ''}\nRequest: ${text}`
}
