import { z } from 'zod'
import type { StyleSummary } from '../shared/styles'
import { directionRecipes, legacyRecipes, type LegacyStyle } from './styleRecipes'

export type PenDirection = 'Aerial Gravitas' | 'Anchored Ribbon Grid' | 'Artisan Editorial' | 'Blueprint Technical' | 'Centered Device Cascade' | 'Centered Serif List' | 'Cinematic Alternating' | 'Cinematic Device Column' | 'Color Block Stack' | 'Dark Centered Platform' | 'Editorial Landscape Stack' | 'Editorial Scientific' | 'Gradient Prompt Stack' | 'Illustrated Ribbon Stack' | 'Illustrated Warm' | 'Inline Friendly' | 'Modular Bento Showcase' | 'Monumental Editorial' | 'Narrative Illustrated' | 'Product Data Grid' | 'Product Demo' | 'Saturated Code Bridge' | 'Soft Bento' | 'Spatial Plus' | 'Split Inverse Showcase' | 'Zigzag Bold Split'

export interface FontRole {
  family: string
  fallback: 'serif' | 'sans-serif' | 'monospace' | 'cursive'
  weights: [number, ...number[]]
  italic: boolean
}
export interface TypeRoles { display: FontRole; body: FontRole; caption: FontRole; data: FontRole; detail: string }
interface SemanticPalette { canvas: string; surface: string; ink: string; muted: string; accent: string; onAccent: string; line: string }
export type Palette = SemanticPalette & ({ inverse: string; onInverse: string } | { inverse?: never; onInverse?: never })
export interface Radius { controlPx: number; panelPx: number; note: string }
export interface StyleVariant {
  id: string
  name: string
  ground: 'light' | 'dark'
  palette: Palette
  elevation: 'flat' | 'hairline' | 'soft' | 'lifted'
  type: TypeRoles
  radius: Radius
}
export interface ImageryMode { id: string; name: string; kind: 'photo' | 'illustration' | 'native-graphic' | 'product-ui'; guidance: string }
export interface DirectionRecipe {
  kind: 'direction'
  id: string
  name: string
  direction: PenDirection
  family: string
  uses: string[]
  summary: string
  composition: string
  mobile: string
  spacing: string
  density: string
  imagery: { note: string; modes: ImageryMode[] }
  avoid: string[]
  responsive: { displayPx: [number, number]; sectionPx: [number, number]; gutterPx: [number, number] }
  variants: [StyleVariant, StyleVariant]
}

type Recipe = { kind: 'legacy'; payload: LegacyStyle } | DirectionRecipe
const registry: Recipe[] = [...legacyRecipes, ...Object.values(directionRecipes)]
const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const index = new Map<string, Recipe>()
for (const recipe of registry) {
  const value = recipe.kind === 'legacy' ? recipe.payload : recipe
  for (const key of [value.id, value.name, ...(recipe.kind === 'direction' ? [recipe.direction] : [])]) {
    const normalized = slug(key)
    const previous = index.get(normalized)
    if (previous && previous !== recipe) throw new Error(`Style lookup collision: ${key}`)
    index.set(normalized, recipe)
  }
}

export const styleInputSchema = z.strictObject({ name: z.string().min(1).optional(), variant: z.string().min(1).optional(), imagery: z.string().min(1).optional() }, { error: issue => issue.code === 'unrecognized_keys' ? `Unknown keys: ${issue.keys.join(', ')}. Valid fields: name, variant, imagery.` : undefined })
export const styleChoiceSchema = z.object({ id: z.string().min(1), variant: z.string().min(1) }).strict()
export type StyleInput = z.infer<typeof styleInputSchema>

export function styleSummaries(): StyleSummary[] {
  return registry.map(recipe => recipe.kind === 'legacy'
    ? { id: recipe.payload.id, name: recipe.payload.name, uses: recipe.payload.uses, direction: null, family: 'Chalk originals', summary: recipe.payload.composition, variants: [{ id: 'default', name: 'Default' }], imagery: [] }
    : { id: recipe.id, name: recipe.name, uses: recipe.uses, direction: recipe.direction, family: recipe.family, summary: recipe.summary, variants: recipe.variants.map(({ id, name }) => ({ id, name })), imagery: recipe.imagery.modes.map(({ id, name }) => ({ id, name })) })
}

function legacyResult(style: LegacyStyle) {
  const fonts = [...new Set([style.typography.body, style.typography.display])]
  const family = fonts.map((font) => `family=${font.replaceAll(' ', '+')}:wght@400;500;600;700`).join('&')
  const fontLinks = `<link href="https://fonts.googleapis.com/css2?${family}&display=swap" rel="stylesheet">`
  const tokens = Object.entries(style.colors).map(([role, value]) => `  --color-${role === 'onAccent' ? 'on-accent' : role}: ${value};`)
  const theme = `<style type="text/tailwindcss">\n@theme {\n${tokens.join('\n')}\n  --font-sans: "${style.typography.body}", sans-serif;\n  --font-display: "${style.typography.display}", ${style.typography.displayFallback};\n}\n</style>`
  return { ...style, fontLinks, theme, usage: 'Place fontLinks and theme at the top of the fragment. Put font-sans on the root element so the style body font replaces the shell default. Use bg-canvas, bg-surface, text-ink, text-muted, bg-accent, text-on-accent, border-line, and font-display. Keep these semantic tokens on related screens; adapt them to the user’s brand.' }
}

const shadows = { flat: 'none', hairline: '0 0 0 1px var(--color-line)', soft: '0 8px 24px #00000012', lifted: '0 20px 48px #00000026' }
const responsiveValue = ([mobile, desktop]: [number, number]) => `clamp(${mobile}px, calc(${mobile}px + ${desktop - mobile} * (100vw - 390px) / 1050), ${desktop}px)`

export function loadStyle({ name, variant, imagery }: StyleInput & { name: string }) {
  const recipe = index.get(slug(name))
  if (!recipe) throw new Error(`Unknown style "${name}". Valid styles: ${styleSummaries().map(s => s.id).join(', ')}.`)
  if (recipe.kind === 'legacy') {
    if (variant && variant !== 'default') throw new Error('Valid variants: default.')
    if (imagery) throw new Error('No imagery choices for this style. Omit imagery.')
    return { ...legacyResult(recipe.payload), direction: null, family: 'Chalk originals', summary: recipe.payload.composition, variants: [{ id: 'default', name: 'Default' }], imageryModes: [], resolved: { id: recipe.payload.id, variant: 'default', imagery: null } }
  }
  const selected = variant ? recipe.variants.find(v => v.id === variant) : recipe.variants[0]
  if (!selected) throw new Error(`Valid variants for ${recipe.id}: ${recipe.variants.map(v => v.id).join(', ')}.`)
  const mode = imagery ? recipe.imagery.modes.find(m => m.id === imagery) : recipe.imagery.modes[0]
  if (imagery && !mode) throw new Error(`Valid imagery for ${recipe.id}: ${recipe.imagery.modes.map(m => m.id).join(', ') || 'none; omit imagery'}.`)
  const roles = selected.type
  const families = new Map<string, { weights: Set<number>; italic: boolean }>()
  for (const font of [roles.body, roles.display, roles.caption, roles.data]) {
    const found = families.get(font.family) ?? { weights: new Set<number>(), italic: false }
    font.weights.forEach(w => found.weights.add(w))
    found.italic ||= font.italic
    families.set(font.family, found)
  }
  const queries = [...families].map(([family, { weights, italic }]) => {
    const sorted = [...weights].sort((a, b) => a - b)
    return `family=${family.replaceAll(' ', '+')}:${italic ? 'ital,wght@' + [0, 1].flatMap(i => sorted.map(w => `${i},${w}`)).join(';') : 'wght@' + sorted.join(';')}`
  })
  const fontLinks = `<link href="https://fonts.googleapis.com/css2?${queries.join('&')}&display=swap" rel="stylesheet">`
  const tokens = {
    ...Object.fromEntries(Object.entries(selected.palette).map(([key, value]) => [`color-${key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}`, value])),
    'font-sans': `"${roles.body.family}", ${roles.body.fallback}`,
    'font-display': `"${roles.display.family}", ${roles.display.fallback}`,
    'font-caption': `"${roles.caption.family}", ${roles.caption.fallback}`,
    'font-mono': `"${roles.data.family}", ${roles.data.fallback}`,
    'radius-control': `${selected.radius.controlPx}px`, 'radius-panel': `${selected.radius.panelPx}px`,
    'shadow-raised': shadows[selected.elevation], 'text-display': responsiveValue(recipe.responsive.displayPx),
    'spacing-section': responsiveValue(recipe.responsive.sectionPx), 'spacing-gutter': responsiveValue(recipe.responsive.gutterPx)
  }
  const theme = `<style type="text/tailwindcss">\n@theme {\n${Object.entries(tokens).map(([key, value]) => `  --${key}: ${value};`).join('\n')}\n}\n</style>`
  return {
    id: recipe.id, name: recipe.name, uses: recipe.uses, direction: recipe.direction, family: recipe.family, summary: recipe.summary,
    composition: recipe.composition, mobile: recipe.mobile,
    typography: { body: roles.body.family, display: roles.display.family, displayFallback: roles.display.fallback, caption: roles.caption.family, data: roles.data.family, detail: roles.detail },
    type: roles, colors: selected.palette, spacing: recipe.spacing, radius: selected.radius.note, radii: selected.radius,
    density: recipe.density, imagery: mode ? `${recipe.imagery.note} ${mode.guidance}` : recipe.imagery.note, avoid: recipe.avoid,
    responsive: recipe.responsive, elevation: selected.elevation, tokens, fontLinks, theme,
    variants: recipe.variants.map(({ id, name }) => ({ id, name })), imageryModes: recipe.imagery.modes,
    resolved: { id: recipe.id, variant: selected.id, imagery: mode?.id ?? null },
    usage: 'Place fontLinks and theme before the fragment. Apply font-sans to the root to replace the frame shell font. Use bg-canvas, bg-surface, text-ink, text-muted, bg-accent, text-on-accent, border-line, font-display, text-display, font-caption, font-mono, rounded-control, rounded-panel, shadow-raised, py-section and px-gutter. Keep the composition and mobile reading order; references and brand take priority.'
  }
}
type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T
export type ResolvedStyle = Immutable<ReturnType<typeof loadStyle>>

export function resolveStyle(input: StyleInput = {}) {
  if (input.name) return loadStyle({ ...input, name: input.name })
  if (input.variant || input.imagery) throw new Error('name is required with variant or imagery. Choose a valid style: ' + styleSummaries().map(s => s.id).join(', '))
  return { styles: styleSummaries(), next: 'Load one by id, Chalk name or exact direction. Optional variant and imagery use only its listed choices. User instructions, selected references and brand rules take priority.' }
}
