import type { DirectionRecipe, FontRole, Palette, PenDirection, TypeRoles } from './styles'

export interface LegacyStyle {
  id: string
  name: string
  uses: string[]
  composition: string
  typography: { body: string; display: string; displayFallback: 'serif' | 'sans-serif'; detail: string }
  colors: { canvas: string; surface: string; ink: string; muted: string; accent: string; onAccent: string; line: string }
  spacing: string
  radius: string
  density: string
  imagery: string
  avoid: string[]
}

const legacyStyles: LegacyStyle[] = [
  {
    id: 'studio-ledger', name: 'Studio Ledger', uses: ['Project tools', 'Professional services', 'Focused web apps'],
    composition: 'A quiet navigation rail beside a broad working area. Give the active task most of the width. Use aligned text rows and restrained dividers instead of a wall of equal cards.',
    typography: { body: 'Inter', display: 'Manrope', displayFallback: 'sans-serif', detail: 'Manrope semibold titles at 28–40px; Inter 14px interface text with tabular numbers. Keep labels sentence case.' },
    colors: { canvas: '#F5F6F8', surface: '#FFFFFF', ink: '#18212E', muted: '#596575', accent: '#2458D3', onAccent: '#FFFFFF', line: '#DCE1E8' },
    spacing: '4, 8, 12, 16, 24, 32, 48px. Keep related controls within 8px; separate working groups by 32px.',
    radius: '8px controls, 12px major panels.', density: 'Balanced, with compact supporting navigation and a spacious primary task.',
    imagery: 'Use actual product content, document thumbnails, and small user portraits. Data and working state provide the visual interest.',
    avoid: ['Decorative dashboard metrics without a purpose', 'A card around every label', 'Competing primary buttons']
  },
  {
    id: 'field-notes', name: 'Field Notes', uses: ['Editorial sites', 'Hospitality', 'Independent brands'],
    composition: 'An asymmetric editorial grid with a narrow annotation column and a generous main story. Alternate a large photograph with typographic sections and fine rules.',
    typography: { body: 'DM Sans', display: 'Lora', displayFallback: 'serif', detail: 'Lora headlines at 48–72px with natural line breaks; DM Sans 16–18px body. Use short uppercase annotations sparingly.' },
    colors: { canvas: '#F5F1E8', surface: '#FFFCF6', ink: '#292D25', muted: '#62675B', accent: '#446344', onAccent: '#FFFFFF', line: '#D8D4C7' },
    spacing: '8, 16, 24, 40, 64, 96px. Large spaces belong between stories; captions stay near their images.',
    radius: '2px controls and photographs; preserve the printed-page character.', density: 'Airy stories with concise, closely grouped annotations.',
    imagery: 'Natural-light photography with visible material texture and a deliberate crop. Use a real supplied or verified image URL; reserve a clear text region.',
    avoid: ['Faux paper textures behind body copy', 'Centering every section', 'A repeated three-card feature grid']
  },
  {
    id: 'night-signal', name: 'Night Signal', uses: ['Developer products', 'Technical landing pages', 'Monitoring tools'],
    composition: 'A strong left reading axis, one large working demonstration, and a narrow band of operational evidence. Use darkness to group content; use the accent to identify the current action.',
    typography: { body: 'Inter', display: 'Space Grotesk', displayFallback: 'sans-serif', detail: 'Space Grotesk headlines at 40–64px. Inter 14–16px body. Use the system monospace stack only for real code, identifiers, and readings.' },
    colors: { canvas: '#101419', surface: '#191F27', ink: '#EEF3F8', muted: '#A5B2C2', accent: '#A9E55E', onAccent: '#142008', line: '#343F4D' },
    spacing: '4, 8, 12, 16, 24, 40, 64, 96px. Keep code aligned and distinguish section spacing from line spacing.',
    radius: '6px controls, 10px demonstrations.', density: 'Dense real demonstrations inside a spacious overall composition.',
    imagery: 'Use legible code, real command output, or an authentic product view. Show one complete useful task instead of an abstract glowing object.',
    avoid: ['Low-contrast gray text', 'Neon glows on every border', 'Fake code and meaningless log streams']
  },
  {
    id: 'gallery-commerce', name: 'Gallery Commerce', uses: ['Product collections', 'Furniture', 'Fashion and retail'],
    composition: 'Let a large product photograph establish the first view. Put the purchase details on a clear adjacent axis. Use a measured gallery rhythm with visible product names and prices.',
    typography: { body: 'DM Sans', display: 'Bodoni Moda', displayFallback: 'serif', detail: 'Bodoni Moda headlines at 48–72px; DM Sans 14–16px details and controls. Keep product names concise and prices easy to scan.' },
    colors: { canvas: '#FAF8F4', surface: '#FFFFFF', ink: '#26211E', muted: '#70665E', accent: '#8F3E2C', onAccent: '#FFFFFF', line: '#DED6CE' },
    spacing: '8, 16, 24, 32, 48, 80px. Product detail groups stay close; gallery images receive generous outer space.',
    radius: '0px images and gallery panels; 4px controls.', density: 'Image-led, with compact factual purchase information.',
    imagery: 'Use consistent product photography with honest proportions and crops. Include material or scale detail only when it helps someone choose.',
    avoid: ['Decorative price badges', 'Text over a busy product image', 'Different photo treatments in one collection']
  },
  {
    id: 'civic-grid', name: 'Civic Grid', uses: ['Analytics', 'Operations dashboards', 'Public information'],
    composition: 'Use a single dominant table, map, or chart. A compact summary strip introduces it, and filters remain attached to the data they affect. Align numeric columns and share a baseline.',
    typography: { body: 'Public Sans', display: 'Public Sans', displayFallback: 'sans-serif', detail: 'Public Sans 14px data rows, 12px supporting labels, and 24–32px section titles. Use tabular numbers and readable units.' },
    colors: { canvas: '#EDF2F3', surface: '#FFFFFF', ink: '#162E36', muted: '#536971', accent: '#006A78', onAccent: '#FFFFFF', line: '#CAD8DC' },
    spacing: '4, 8, 12, 16, 24, 32px. Use 40–48px rows for dense desktop tables and preserve aligned column gutters.',
    radius: '4px controls and 6px grouped panels.', density: 'Compact, with strong grouping and room around filters.',
    imagery: 'Prefer honest charts with units, scales, date ranges, and meaningful labels. Photos rarely help an operational screen.',
    avoid: ['A separate card per statistic', 'Unlabelled charts', 'Using red and green as the only status cues']
  },
  {
    id: 'playroom', name: 'Playroom', uses: ['Creative learning', 'Community products', 'Friendly consumer apps'],
    composition: 'Use a generous type-led introduction, one expressive activity area, and a simple next action. Allow one playful offset or shape, while text and controls stay aligned.',
    typography: { body: 'Nunito Sans', display: 'Bricolage Grotesque', displayFallback: 'sans-serif', detail: 'Bricolage Grotesque bold headlines at 40–64px; Nunito Sans 16px body. Keep headings short so their shapes stay deliberate.' },
    colors: { canvas: '#FFF8EB', surface: '#FFFFFF', ink: '#292536', muted: '#655C74', accent: '#9D3431', onAccent: '#FFFFFF', line: '#E4D6C5' },
    spacing: '8, 12, 16, 24, 32, 48, 72px. Leave room around the primary activity; group instructional text tightly.',
    radius: '12px controls and 24px activity panels. Use the same family across screens.', density: 'Comfortable, with large controls and short instructions.',
    imagery: 'Use supplied illustrations or real participant work when available. A small set of simple geometric accents is enough without custom artwork.',
    avoid: ['Childish decoration on every component', 'Emoji used as navigation icons', 'Low-contrast pastel labels']
  }
]


export const legacyRecipes = legacyStyles.map(payload => ({ kind: 'legacy' as const, payload }))

const font = (family: string, fallback: FontRole['fallback'] = 'sans-serif', weights: FontRole['weights'] = [400, 600, 700], italic = false): FontRole => ({ family, fallback, weights, italic })
const light = (canvas: string, accent: string): Palette => ({ canvas, surface: '#FFFFFF', ink: '#18212B', muted: '#505965', accent, onAccent: '#FFFFFF', line: '#C8CFD5', inverse: '#18212B', onInverse: '#FFFFFF' })
const dark = (canvas: string, accent: string): Palette => ({ canvas, surface: '#222C38', ink: '#F6F8FC', muted: '#B8C5D4', accent, onAccent: '#111923', line: '#586778', inverse: '#F6F8FC', onInverse: '#18212B' })
function type(display: FontRole, body: FontRole, detail: string, caption = body): TypeRoles {
  return { display, body, caption, data: font('IBM Plex Mono', 'monospace', [400, 500]), detail }
}

export const directionRecipes = {
  'Aerial Gravitas': {
    kind: 'direction', id: 'terrain-register', name: 'Terrain Register', direction: 'Aerial Gravitas', family: 'Field studies',
    uses: ['Site surveys', 'Landscape archives', 'Expedition reports'], summary: 'An overhead stage with a precise coordinate ledger.',
    composition: 'Give the survey stage two thirds of the working width and place the coordinate ledger against its right edge. Keep the scale bar inside the stage and the reading key outside its crop. Put the location title above both regions; a thin closing rule connects the site facts without turning them into cards.',
    mobile: 'Place the complete survey stage before its ledger. Keep the coordinate pairs on one line and move the scale key below the map. Crop the surroundings rather than the surveyed subject.',
    spacing: 'Use a 4/8/12/16/24px control scale. Separate desktop survey sections by 88px and mobile sections by 40px. Keep each legend within 8px of its mark.', density: 'Compact coordinate rows next to one spacious survey field.',
    imagery: { note: 'Keep measured information separate from scenery. Use supplied or verified overhead photos only, or draw an original contour study with a scale key.', modes: [
      { id: 'survey-lines', name: 'Survey lines', kind: 'native-graphic', guidance: 'Draw contour lines with labelled sample points and a distance scale. Do not imply that invented coordinates are surveyed data.' },
      { id: 'overhead-photo', name: 'Overhead photo', kind: 'photo', guidance: 'Use a supplied overhead photograph and a separate legend. If none exists, show an explicit site-photo placeholder.' }
    ] },
    avoid: ['A floating legend that obscures the surveyed area', 'Coordinates used as meaningless decoration', 'A gallery of equally sized terrain cards'],
    responsive: { displayPx: [40, 80], sectionPx: [40, 88], gutterPx: [20, 56] },
    variants: [
      { id: 'survey', name: 'Survey', ground: 'light', palette: light('#EFF3F5', '#963E28'), elevation: 'hairline', type: type(font('Archivo Black', 'sans-serif', [400]), font('Source Sans 3'), 'Use a heavy site title, regular 16px notes and tabular coordinate labels.', font('Source Serif 4', 'serif', [400], true)), radius: { controlPx: 2, panelPx: 0, note: '2px controls and square survey plates.' } },
      { id: 'atlas', name: 'Atlas', ground: 'dark', palette: dark('#131E2A', '#FFC39E'), elevation: 'flat', type: type(font('Archivo Black', 'sans-serif', [400]), font('Source Sans 3'), 'Keep the site title bold and use serif annotations for the contour-only study.', font('Literata', 'serif', [400], true)), radius: { controlPx: 0, panelPx: 0, note: 'Square controls and flat, square contour plates.' } }
    ]
  },
  "Anchored Ribbon Grid": {
    "kind": "direction",
    "id": "current-index",
    "name": "Current Index",
    "direction": "Anchored Ribbon Grid",
    "family": "Graphic systems",
    "uses": ["Studio launches", "Research indexes", "Event programs"],
    "summary": "Keep one continuous band in the masthead, then let the lower two-to-one grid carry the actual information.",
    "composition": "Keep one continuous band in the masthead, then let the lower two-to-one grid carry the actual information. Offset the smaller column by one text baseline. The band marks the opening rather than enclosing every module.",
    "mobile": "Collapse the lower grid into reading order. Crop the band at the masthead edge and leave controls outside its curve.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 80px on desktop and 36px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within a spacious primary task.",
    "imagery": {
      "note": "Original CSS band stays behind content. One mobile column, band cropped away from actions. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": [
        {"id": "ribbon-band", "name": "Ribbon band", "kind": "native-graphic", "guidance": "Original CSS band stays behind content. One mobile column, band cropped away from actions. Use supplied media or an explicit labelled placeholder; author any diagram from basic shapes."}
      ]
    },
    "avoid": ["A ribbon behind each information tile", "A band crossing the primary action", "Equal columns that erase the anchored rhythm"],
    "responsive": {
      "displayPx": [40, 76],
      "sectionPx": [36, 80],
      "gutterPx": [20, 64]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Current",
        "ground": "light",
        "palette": {"canvas": "#F7F9FD", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#2449B8", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "soft",
        "type": {
          "display": {"family": "Sora", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "DM Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "DM Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 6, "panelPx": 16, "note": "6px controls and 16px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Outline",
        "ground": "light",
        "palette": {"canvas": "#EEF2F8", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#253D7A", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "flat",
        "type": {
          "display": {"family": "Barlow Condensed", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "DM Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "DM Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 0, "panelPx": 0, "note": "0px controls and panels. Outline band, condensed headings, sharper modules."}
      }
    ]
  },
  "Artisan Editorial": {
    "kind": "direction",
    "id": "workshop-journal",
    "name": "Workshop Journal",
    "direction": "Artisan Editorial",
    "family": "Field studies",
    "uses": ["Maker profiles", "Material journals", "Workshop archives"],
    "summary": "Open with a close material plate and a slim maker note beside it.",
    "composition": "Open with a close material plate and a slim maker note beside it. Follow with a long reading column and a process plate that has its own numbered caption. Let rules join the documentary parts without boxing the prose.",
    "mobile": "Place the maker note after the opening plate. Move every caption directly under its image and retain the process order.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 96px on desktop and 44px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within an open documentary reading rhythm.",
    "imagery": {
      "note": "User-owned making photos or original line diagrams. Caption moves directly below its plate. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": [
        {"id": "line-study", "name": "Line study", "kind": "native-graphic", "guidance": "User-owned making photos or original line diagrams. Caption moves directly below its plate. Use supplied media or an explicit labelled placeholder; author any diagram from basic shapes."}
      ]
    },
    "avoid": ["A process photograph divorced from its caption", "Tiny maker notes beside unreadably wide prose", "A shop-card grid replacing the making narrative"],
    "responsive": {
      "displayPx": [44, 84],
      "sectionPx": [44, 96],
      "gutterPx": [24, 72]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Material",
        "ground": "light",
        "palette": {"canvas": "#F6F2E9", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#27523C", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "soft",
        "type": {
          "display": {"family": "Literata", "fallback": "serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Work Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Work Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 2, "panelPx": 2, "note": "2px controls and 2px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Process",
        "ground": "light",
        "palette": {"canvas": "#F0F1EB", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#464C7E", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "flat",
        "type": {
          "display": {"family": "Lora", "fallback": "serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Work Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Work Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 0, "panelPx": 0, "note": "0px controls and panels. Upright serif, monochrome process diagram, tighter paragraph rhythm."}
      }
    ]
  },
  "Blueprint Technical": {
    "kind": "direction",
    "id": "assembly-sheet",
    "name": "Assembly Sheet",
    "direction": "Blueprint Technical",
    "family": "Technical systems",
    "uses": ["Hardware documentation", "Assembly instructions", "Engineering briefs"],
    "summary": "Make the central assembly drawing the largest object.",
    "composition": "Make the central assembly drawing the largest object. Number the leaders clockwise and align the matching properties in a right-hand column. Keep units beside dimensions and use a small revision strip beneath the drawing.",
    "mobile": "Keep the diagram in its own labelled horizontal scroll area. Stack the keyed properties below it so leader labels remain readable.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 56px on desktop and 28px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within a spacious primary task.",
    "imagery": {
      "note": "Authored schematic with meaningful dimensions. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": [
        {"id": "schematic", "name": "Dimension drawing", "kind": "native-graphic", "guidance": "Authored schematic with meaningful dimensions. Use supplied media or an explicit labelled placeholder; author any diagram from basic shapes."}
      ]
    },
    "avoid": ["Leader lines crossing their own labels", "Dimensions without units", "A reduced desktop drawing forced into the mobile width"],
    "responsive": {
      "displayPx": [36, 64],
      "sectionPx": [28, 56],
      "gutterPx": [16, 40]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Cyanotype",
        "ground": "dark",
        "palette": {"canvas": "#102236", "surface": "#222C38", "ink": "#F6F8FC", "muted": "#B8C5D4", "accent": "#F2C56B", "onAccent": "#111923", "line": "#586778", "inverse": "#F6F8FC", "onInverse": "#18212B"},
        "elevation": "hairline",
        "type": {
          "display": {"family": "IBM Plex Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "IBM Plex Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "IBM Plex Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 0, "panelPx": 0, "note": "0px controls and 0px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Vellum",
        "ground": "light",
        "palette": {"canvas": "#F0F5F0", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#8F3D2D", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "flat",
        "type": {
          "display": {"family": "IBM Plex Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "IBM Plex Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "IBM Plex Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 0, "panelPx": 0, "note": "Square drawing fields and dimension labels on flat white vellum without raised depth."}
      }
    ]
  },
  "Centered Device Cascade": {
    "kind": "direction",
    "id": "screen-relay",
    "name": "Screen Relay",
    "direction": "Centered Device Cascade",
    "family": "Product stories",
    "uses": ["Software introductions", "Product releases", "Workspace tours"],
    "summary": "Place a centered statement above a three-surface cascade.",
    "composition": "Place a centered statement above a three-surface cascade. Step the two supporting surfaces downward and reserve the widest, frontmost surface for the selected task. Show a usable action inside that surface rather than three screenshots of equal weight.",
    "mobile": "Remove overlap and perspective. Show the active task first and place the two related screens below it in document order.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 104px on desktop and 48px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within a spacious primary task.",
    "imagery": {
      "note": "Actual product captures in original simple frames. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": [
        {"id": "product-screens", "name": "Product screens", "kind": "product-ui", "guidance": "Actual product captures in original simple frames. Use supplied media or an explicit labelled placeholder; author any diagram from basic shapes."}
      ]
    },
    "avoid": ["Tilted actionable controls", "Three equally prominent screens", "A cascade that hides the active task"],
    "responsive": {
      "displayPx": [40, 76],
      "sectionPx": [48, 104],
      "gutterPx": [20, 64]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Cascade",
        "ground": "light",
        "palette": {"canvas": "#F7F8FC", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#2453B8", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "soft",
        "type": {
          "display": {"family": "Outfit", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Inter", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Inter", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 10, "panelPx": 24, "note": "10px controls and 24px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Documents",
        "ground": "dark",
        "palette": {"canvas": "#171D25", "surface": "#222C38", "ink": "#F6F8FC", "muted": "#B8C5D4", "accent": "#B8E5CF", "onAccent": "#111923", "line": "#586778", "inverse": "#F6F8FC", "onInverse": "#18212B"},
        "elevation": "flat",
        "type": {
          "display": {"family": "Barlow Condensed", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Inter", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Inter", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 8, "panelPx": 18, "note": "8px controls and 18px document frames without perspective shadows."}
      }
    ]
  },
  "Centered Serif List": {
    "kind": "direction",
    "id": "folio-directory",
    "name": "Folio Directory",
    "direction": "Centered Serif List",
    "family": "Editorial systems",
    "uses": ["Program directories", "Reading lists", "Collection catalogs"],
    "summary": "Center a short serif introduction, then change to full-width numbered entries.",
    "composition": "Center a short serif introduction, then change to full-width numbered entries. Give each entry one shared baseline for its title, description and action. Use long rules to show sequence rather than separate cards.",
    "mobile": "Wrap the entry details under their own title before the action. Keep the entry number attached to the title and preserve a generous touch target.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 72px on desktop and 32px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within an open documentary reading rhythm.",
    "imagery": {
      "note": "Small optional collection crops. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": [
        {"id": "collection-crop", "name": "Collection crop", "kind": "photo", "guidance": "Small optional collection crops. Use supplied media or an explicit labelled placeholder; author any diagram from basic shapes."}
      ]
    },
    "avoid": ["Centered long entry descriptions", "Actions detached from their numbered entry", "Decorative cards around every list row"],
    "responsive": {
      "displayPx": [40, 72],
      "sectionPx": [32, 72],
      "gutterPx": [24, 80]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Folio",
        "ground": "light",
        "palette": {"canvas": "#FAF8F5", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#723B66", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "hairline",
        "type": {
          "display": {"family": "Libre Baskerville", "fallback": "serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Public Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Public Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 2, "panelPx": 0, "note": "2px controls and 0px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Ruled",
        "ground": "dark",
        "palette": {"canvas": "#2C1D30", "surface": "#222C38", "ink": "#F6F8FC", "muted": "#B8C5D4", "accent": "#E8C5AC", "onAccent": "#111923", "line": "#586778", "inverse": "#F6F8FC", "onInverse": "#18212B"},
        "elevation": "flat",
        "type": {
          "display": {"family": "Libre Baskerville", "fallback": "serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Public Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Public Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 2, "panelPx": 0, "note": "2px actions with square ruled entries and tighter list spacing."}
      }
    ]
  },
  "Cinematic Alternating": {
    "kind": "direction",
    "id": "scene-sequence",
    "name": "Scene Sequence",
    "direction": "Cinematic Alternating",
    "family": "Photo essays",
    "uses": ["Film journals", "Travel stories", "Documentary releases"],
    "summary": "Begin with a wide establishing scene.",
    "composition": "Begin with a wide establishing scene. Follow it with an unequal story pair, then reverse the emphasis once after a short evidence interval. Keep the narrative captions outside the images so the scene can remain visually dense.",
    "mobile": "Read each scene before its associated text. Remove alternating offsets and keep the evidence interval in its original story position.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 112px on desktop and 48px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within an open documentary reading rhythm.",
    "imagery": {
      "note": "User photos with an independent text field. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": [
        {"id": "scene-photo", "name": "Scene photo", "kind": "photo", "guidance": "User photos with an independent text field. Use supplied media or an explicit labelled placeholder; author any diagram from basic shapes."}
      ]
    },
    "avoid": ["Text over the brightest scene detail", "Alternation without a narrative change", "A sequence of identical image cards"],
    "responsive": {
      "displayPx": [48, 104],
      "sectionPx": [48, 112],
      "gutterPx": [24, 64]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Night reel",
        "ground": "dark",
        "palette": {"canvas": "#12171E", "surface": "#222C38", "ink": "#F6F8FC", "muted": "#B8C5D4", "accent": "#FFA18F", "onAccent": "#111923", "line": "#586778", "inverse": "#F6F8FC", "onInverse": "#18212B"},
        "elevation": "soft",
        "type": {
          "display": {"family": "Oswald", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Source Sans 3", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Source Sans 3", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 4, "panelPx": 8, "note": "4px controls and 8px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Documentary",
        "ground": "light",
        "palette": {"canvas": "#ECEFE8", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#36583E", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "flat",
        "type": {
          "display": {"family": "Lora", "fallback": "serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Source Sans 3", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Source Sans 3", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 0, "panelPx": 0, "note": "0px controls and panels. Documentary monochrome, serif pull quotes, hard image edges."}
      }
    ]
  },
  "Cinematic Device Column": {
    "kind": "direction",
    "id": "portrait-console",
    "name": "Portrait Console",
    "direction": "Cinematic Device Column",
    "family": "Product stories",
    "uses": ["Mobile product tours", "Field tools", "Device applications"],
    "summary": "Anchor the page with one tall selected interface inside an environmental stage.",
    "composition": "Anchor the page with one tall selected interface inside an environmental stage. Hold the supporting text to a single nearby column and keep the working controls readable at their natural scale. The environment frames the task rather than becoming its background texture.",
    "mobile": "Detach the environmental plate from the interface. Place the device in the main column with enough width for actual task labels.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 96px on desktop and 40px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within a spacious primary task.",
    "imagery": {
      "note": "Product view over a separately cropped scene. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": [
        {"id": "environment", "name": "Environment and interface", "kind": "native-graphic", "guidance": "Product view over a separately cropped scene. Use supplied media or an explicit labelled placeholder; author any diagram from basic shapes."}
      ]
    },
    "avoid": ["An environment crop covering interface controls", "Multiple competing device mockups", "Mobile screens shrunk to decorative thumbnails"],
    "responsive": {
      "displayPx": [40, 80],
      "sectionPx": [40, 96],
      "gutterPx": [20, 64]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Midnight",
        "ground": "dark",
        "palette": {"canvas": "#102535", "surface": "#222C38", "ink": "#F6F8FC", "muted": "#B8C5D4", "accent": "#81DBE6", "onAccent": "#111923", "line": "#586778", "inverse": "#F6F8FC", "onInverse": "#18212B"},
        "elevation": "soft",
        "type": {
          "display": {"family": "Barlow Condensed", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Lato", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Lato", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 6, "panelPx": 20, "note": "6px controls and 20px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Daylight",
        "ground": "light",
        "palette": {"canvas": "#EDF2F3", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#8D4E13", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "soft",
        "type": {
          "display": {"family": "Manrope", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Lato", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Lato", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 6, "panelPx": 16, "note": "6px controls and 16px device corners with shallow depth."}
      }
    ]
  },
  "Color Block Stack": {
    "kind": "direction",
    "id": "signal-press",
    "name": "Signal Press",
    "direction": "Color Block Stack",
    "family": "Graphic systems",
    "uses": ["Campaign pages", "Public announcements", "Creative programs"],
    "summary": "Use three solid bands with deliberately unequal heights.",
    "composition": "Use three solid bands with deliberately unequal heights. The first states the proposition, the second contains visible proof and the last holds the action. Align all reading text to one gutter while a single diagram interrupts the middle band.",
    "mobile": "Keep the bands in proposition, proof and action order. Remove sideways labels and keep the same reading gutter through all three.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 64px on desktop and 32px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within a spacious primary task.",
    "imagery": {
      "note": "Type and one original geometric diagram. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": []
    },
    "avoid": ["Three equal-height bands", "Rotated mobile instructions", "Proof that repeats the headline without adding evidence"],
    "responsive": {
      "displayPx": [44, 96],
      "sectionPx": [32, 64],
      "gutterPx": [16, 48]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Signal",
        "ground": "light",
        "palette": {"canvas": "#F9F9F6", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#2449B8", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#2449B8", "onInverse": "#FFFFFF"},
        "elevation": "flat",
        "type": {
          "display": {"family": "League Spartan", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "DM Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "DM Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 4, "panelPx": 0, "note": "4px controls and 0px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Earth",
        "ground": "light",
        "palette": {"canvas": "#F8EEE5", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#9C4430", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#9C4430", "onInverse": "#FFFFFF"},
        "elevation": "flat",
        "type": {
          "display": {"family": "Lora", "fallback": "serif", "weights": [400, 700], "italic": false},
          "body": {"family": "DM Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "DM Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 4, "panelPx": 4, "note": "4px controls and panels. Rust/white bands, serif emphasis, smaller headline scale."}
      }
    ]
  },
  "Dark Centered Platform": {
    "kind": "direction",
    "id": "control-orbit",
    "name": "Control Orbit",
    "direction": "Dark Centered Platform",
    "family": "Technical systems",
    "uses": ["Control centers", "Developer workspaces", "Monitoring tasks"],
    "summary": "Put a single live task in the center of the page with a compact mode rail directly above it.",
    "composition": "Put a single live task in the center of the page with a compact mode rail directly above it. Evidence sits below the task at lower contrast, with labels that identify what was measured. Keep the accent attached to the selected action.",
    "mobile": "Retain a short horizontal mode row and let the task use the full content width. Put the evidence beneath it instead of adding a miniature sidebar.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 80px on desktop and 36px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within a spacious primary task.",
    "imagery": {
      "note": "Real instrument or workspace content. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": [
        {"id": "workspace", "name": "Live workspace", "kind": "product-ui", "guidance": "Real instrument or workspace content. Use supplied media or an explicit labelled placeholder; author any diagram from basic shapes."}
      ]
    },
    "avoid": ["A halo around every panel", "Modes separated from the task they change", "Decorative metrics replacing operational evidence"],
    "responsive": {
      "displayPx": [40, 72],
      "sectionPx": [36, 80],
      "gutterPx": [16, 48]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Instrument",
        "ground": "dark",
        "palette": {"canvas": "#131A20", "surface": "#222C38", "ink": "#F6F8FC", "muted": "#B8C5D4", "accent": "#A9E0CA", "onAccent": "#111923", "line": "#586778", "inverse": "#F6F8FC", "onInverse": "#18212B"},
        "elevation": "soft",
        "type": {
          "display": {"family": "Chakra Petch", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Inter", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Inter", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 6, "panelPx": 12, "note": "6px controls and 12px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Humanist",
        "ground": "dark",
        "palette": {"canvas": "#1C2140", "surface": "#222C38", "ink": "#F6F8FC", "muted": "#B8C5D4", "accent": "#E4BA8F", "onAccent": "#111923", "line": "#586778", "inverse": "#F6F8FC", "onInverse": "#18212B"},
        "elevation": "hairline",
        "type": {
          "display": {"family": "Nunito Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Inter", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Inter", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 8, "panelPx": 12, "note": "8px controls and 12px working panels with crisp border depth."}
      }
    ]
  },
  "Editorial Landscape Stack": {
    "kind": "direction",
    "id": "horizon-log",
    "name": "Horizon Log",
    "direction": "Editorial Landscape Stack",
    "family": "Photo essays",
    "uses": ["Site observations", "Landscape journals", "Architecture studies"],
    "summary": "Alternate broad landscape plates with location metadata and a narrow observation column.",
    "composition": "Alternate broad landscape plates with location metadata and a narrow observation column. Give each plate a site code and capture date. Keep the reading columns narrower than the images so the page has a deliberate expansion and contraction.",
    "mobile": "Pair each site label, plate and observation before the next site begins. Let plates span the content width while captions stay close.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 120px on desktop and 56px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within an open documentary reading rhythm.",
    "imagery": {
      "note": "Supplied site photography with deliberate focal crop. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": [
        {"id": "landscape", "name": "Landscape plate", "kind": "photo", "guidance": "Supplied site photography with deliberate focal crop. Use supplied media or an explicit labelled placeholder; author any diagram from basic shapes."}
      ]
    },
    "avoid": ["Location notes stranded between two plates", "Body text stretched across the landscape width", "Unrelated stock scenes in a site series"],
    "responsive": {
      "displayPx": [44, 88],
      "sectionPx": [56, 120],
      "gutterPx": [24, 80]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Landscape",
        "ground": "light",
        "palette": {"canvas": "#FAF7F0", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#8D4E13", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "hairline",
        "type": {
          "display": {"family": "Cormorant Garamond", "fallback": "serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Karla", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Karla", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 2, "panelPx": 0, "note": "2px controls and 0px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Monochrome",
        "ground": "light",
        "palette": {"canvas": "#EDECE7", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#333C43", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "flat",
        "type": {
          "display": {"family": "Work Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Karla", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Karla", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 0, "panelPx": 0, "note": "Square image plates and narrow ruled captions."}
      }
    ]
  },
  "Editorial Scientific": {
    "kind": "direction",
    "id": "specimen-review",
    "name": "Specimen Review",
    "direction": "Editorial Scientific",
    "family": "Field studies",
    "uses": ["Research summaries", "Collection studies", "Laboratory reports"],
    "summary": "Place one specimen beside a short evidence note and a scale key.",
    "composition": "Place one specimen beside a short evidence note and a scale key. Follow it with numbered observations that refer back to visible marks. Keep the figure and the argument connected through identifiers, not a surrounding statistics dashboard.",
    "mobile": "Show the specimen, then its scale and figure legend, then the observation list. Do not force the evidence into a narrow side rail.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 84px on desktop and 40px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within an open documentary reading rhythm.",
    "imagery": {
      "note": "Original measured diagram or user specimen image. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": [
        {"id": "measurement", "name": "Measured study", "kind": "native-graphic", "guidance": "Original measured diagram or user specimen image. Use supplied media or an explicit labelled placeholder; author any diagram from basic shapes."}
      ]
    },
    "avoid": ["Statistics cards surrounding the specimen", "A scale key with no units", "Observations that do not identify a visible feature"],
    "responsive": {
      "displayPx": [36, 64],
      "sectionPx": [40, 84],
      "gutterPx": [20, 56]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Specimen",
        "ground": "light",
        "palette": {"canvas": "#F2F6F8", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#126567", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "soft",
        "type": {
          "display": {"family": "Space Grotesk", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Source Serif 4", "fallback": "serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Source Serif 4", "fallback": "serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 4, "panelPx": 8, "note": "4px controls and 8px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Line study",
        "ground": "light",
        "palette": {"canvas": "#F3F4EA", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#3C6352", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "flat",
        "type": {
          "display": {"family": "Space Grotesk", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Source Serif 4", "fallback": "serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Source Serif 4", "fallback": "serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 0, "panelPx": 4, "note": "Square labels and 4px specimen panels on flat paper."}
      }
    ]
  },
  "Gradient Prompt Stack": {
    "kind": "direction",
    "id": "query-workbench",
    "name": "Query Workbench",
    "direction": "Gradient Prompt Stack",
    "family": "Product stories",
    "uses": ["Writing tools", "Search assistants", "Content workspaces"],
    "summary": "Expose input, response and editable result as one task sequence.",
    "composition": "Expose input, response and editable result as one task sequence. Keep the input action adjacent to its field and show the resulting text as actual editable content. Restrict atmospheric gradients to the outer surround so the reading layers remain opaque.",
    "mobile": "Keep the field and submit action together. Stack the response and editable result beneath it without changing the task order.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 72px on desktop and 32px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within a spacious primary task.",
    "imagery": {
      "note": "Useful result previews, no decorative stock objects. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": [
        {"id": "result-ui", "name": "Editable result", "kind": "product-ui", "guidance": "Useful result previews, no decorative stock objects. Use supplied media or an explicit labelled placeholder; author any diagram from basic shapes."}
      ]
    },
    "avoid": ["Gradient behind long response text", "A submit button detached from its field", "A decorative result that cannot be edited"],
    "responsive": {
      "displayPx": [36, 64],
      "sectionPx": [32, 72],
      "gutterPx": [16, 48]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Atmosphere",
        "ground": "light",
        "palette": {"canvas": "#F9F7FF", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#6243AB", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "soft",
        "type": {
          "display": {"family": "Syne", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Manrope", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Manrope", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 8, "panelPx": 16, "note": "8px controls and 16px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Quiet result",
        "ground": "dark",
        "palette": {"canvas": "#242137", "surface": "#222C38", "ink": "#F6F8FC", "muted": "#B8C5D4", "accent": "#CCB7F1", "onAccent": "#111923", "line": "#586778", "inverse": "#F6F8FC", "onInverse": "#18212B"},
        "elevation": "hairline",
        "type": {
          "display": {"family": "Lora", "fallback": "serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Manrope", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Manrope", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 6, "panelPx": 12, "note": "6px controls and 12px response groups with low outlined depth."}
      }
    ]
  },
  "Illustrated Ribbon Stack": {
    "kind": "direction",
    "id": "story-path",
    "name": "Story Path",
    "direction": "Illustrated Ribbon Stack",
    "family": "Illustrated stories",
    "uses": ["Learning journeys", "Cultural programs", "Story collections"],
    "summary": "Connect three story islands with one drawn route.",
    "composition": "Connect three story islands with one drawn route. Let the path pass through empty space while each island has a clear heading and local action. Change the island widths with the amount of content instead of repeating identical cards.",
    "mobile": "Reduce the route to a narrow side marker. Preserve island order and give the text a straight reading edge.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 100px on desktop and 48px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within a spacious primary task.",
    "imagery": {
      "note": "Original simple diagrams or supplied illustrations. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": [
        {"id": "drawn-route", "name": "Drawn route", "kind": "native-graphic", "guidance": "Original simple diagrams or supplied illustrations. Use supplied media or an explicit labelled placeholder; author any diagram from basic shapes."}
      ]
    },
    "avoid": ["A route passing through body copy", "Identical islands regardless of story length", "A mobile path that pushes actions offscreen"],
    "responsive": {
      "displayPx": [40, 72],
      "sectionPx": [48, 100],
      "gutterPx": [20, 64]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Drawn route",
        "ground": "light",
        "palette": {"canvas": "#F5F8EB", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#315B30", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "soft",
        "type": {
          "display": {"family": "Bricolage Grotesque", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Nunito Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Nunito Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 10, "panelPx": 20, "note": "10px controls and 20px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Dashed route",
        "ground": "light",
        "palette": {"canvas": "#F4EFE7", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#73375F", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "hairline",
        "type": {
          "display": {"family": "Bricolage Grotesque", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Nunito Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Nunito Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 8, "panelPx": 0, "note": "8px local actions and square media windows along the dashed route."}
      }
    ]
  },
  "Illustrated Warm": {
    "kind": "direction",
    "id": "neighborhood-table",
    "name": "Neighborhood Table",
    "direction": "Illustrated Warm",
    "family": "Illustrated stories",
    "uses": ["Community programs", "Local activities", "Member welcomes"],
    "summary": "Start with a broad welcome and a shared activity panel that gives people something concrete to do.",
    "composition": "Start with a broad welcome and a shared activity panel that gives people something concrete to do. Place small character-led stories below the activity. Use the figures as participants in the content rather than decoration behind every heading.",
    "mobile": "Stack the shared activity before the supporting stories. Keep each figure with its own introduction and use large local actions.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 88px on desktop and 44px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within a spacious primary task.",
    "imagery": {
      "note": "Supplied community artwork or independently drawn simple scenes. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": [
        {"id": "community-scene", "name": "Community scene", "kind": "native-graphic", "guidance": "Supplied community artwork or independently drawn simple scenes. Use supplied media or an explicit labelled placeholder; author any diagram from basic shapes."}
      ]
    },
    "avoid": ["Characters covering instructions", "A welcome with no shared activity", "Pastel labels without readable foreground contrast"],
    "responsive": {
      "displayPx": [36, 64],
      "sectionPx": [44, 88],
      "gutterPx": [24, 64]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Gathering",
        "ground": "light",
        "palette": {"canvas": "#FFF7EC", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#993C2F", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "soft",
        "type": {
          "display": {"family": "Fraunces", "fallback": "serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Open Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Open Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 12, "panelPx": 24, "note": "12px controls and 24px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Geometric",
        "ground": "light",
        "palette": {"canvas": "#EFF4E8", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#82414A", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "flat",
        "type": {
          "display": {"family": "Manrope", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Open Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Open Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 8, "panelPx": 16, "note": "8px actions and 16px shared activity panels in a flatter geometric treatment."}
      }
    ]
  },
  "Inline Friendly": {
    "kind": "direction",
    "id": "margin-greeting",
    "name": "Margin Greeting",
    "direction": "Inline Friendly",
    "family": "Editorial systems",
    "uses": ["Personal introductions", "Team welcomes", "Portfolio notes"],
    "summary": "Write the opening as one oversized sentence with a short handwritten insert that remains part of its line.",
    "composition": "Write the opening as one oversized sentence with a short handwritten insert that remains part of its line. Follow it with open inline fact groups and one factual portrait note. Keep the rest of the type quiet so the inserted phrase has a reason to exist.",
    "mobile": "Let the inserted phrase wrap as normal text. Place the portrait note beneath the sentence and keep the facts in reading order.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 76px on desktop and 36px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within an open documentary reading rhythm.",
    "imagery": {
      "note": "Small user portrait beside a factual note. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": [
        {"id": "portrait-note", "name": "Portrait note", "kind": "photo", "guidance": "Small user portrait beside a factual note. Use supplied media or an explicit labelled placeholder; author any diagram from basic shapes."}
      ]
    },
    "avoid": ["An absolutely positioned handwritten image", "A handwriting font used for body text", "Facts enclosed in unrelated cards"],
    "responsive": {
      "displayPx": [44, 88],
      "sectionPx": [36, 76],
      "gutterPx": [24, 72]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Greeting",
        "ground": "light",
        "palette": {"canvas": "#F8FBF7", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#27523C", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "soft",
        "type": {
          "display": {"family": "Manrope", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "DM Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Caveat", "fallback": "cursive", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep handwriting to a short inline phrase."
        },
        "radius": {"controlPx": 10, "panelPx": 16, "note": "10px controls and 16px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Underlined",
        "ground": "light",
        "palette": {"canvas": "#F6F0E7", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#274F40", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "flat",
        "type": {
          "display": {"family": "Lora", "fallback": "serif", "weights": [400, 700], "italic": false},
          "body": {"family": "DM Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Caveat", "fallback": "cursive", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep handwriting to a short inline phrase."
        },
        "radius": {"controlPx": 8, "panelPx": 8, "note": "8px controls and portrait notes with a quiet underline gesture."}
      }
    ]
  },
  "Modular Bento Showcase": {
    "kind": "direction",
    "id": "module-exhibit",
    "name": "Module Exhibit",
    "direction": "Modular Bento Showcase",
    "family": "Product stories",
    "uses": ["Product collections", "Tool showcases", "Feature overviews"],
    "summary": "Build an asymmetric exhibit with a wide working tile, a tall explanation and two compact evidence tiles.",
    "composition": "Build an asymmetric exhibit with a wide working tile, a tall explanation and two compact evidence tiles. Give each tile a different content role. Place the working tile first in the document so mobile readers reach the useful task before the explanation.",
    "mobile": "Stack the working tile, explanation and evidence in that order. Remove fixed row spans and retain each tile heading.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 48px on desktop and 28px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within a spacious primary task.",
    "imagery": {
      "note": "Actual product crops, each with a distinct role. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": [
        {"id": "product-crops", "name": "Product crops", "kind": "product-ui", "guidance": "Actual product crops, each with a distinct role. Use supplied media or an explicit labelled placeholder; author any diagram from basic shapes."}
      ]
    },
    "avoid": ["Four equal feature cards", "CSS reordering that contradicts reading order", "Product crops without a distinct explanatory purpose"],
    "responsive": {
      "displayPx": [40, 72],
      "sectionPx": [28, 48],
      "gutterPx": [16, 40]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Exhibit",
        "ground": "dark",
        "palette": {"canvas": "#191D24", "surface": "#222C38", "ink": "#F6F8FC", "muted": "#B8C5D4", "accent": "#F2B78E", "onAccent": "#111923", "line": "#586778", "inverse": "#F6F8FC", "onInverse": "#18212B"},
        "elevation": "soft",
        "type": {
          "display": {"family": "Urbanist", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Work Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Work Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 8, "panelPx": 14, "note": "8px controls and 14px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Outline",
        "ground": "light",
        "palette": {"canvas": "#F4F2ED", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#2F4F9C", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "hairline",
        "type": {
          "display": {"family": "Lora", "fallback": "serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Work Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Work Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 6, "panelPx": 10, "note": "6px controls and 10px outlined exhibit cells with flat media."}
      }
    ]
  },
  "Monumental Editorial": {
    "kind": "direction",
    "id": "large-type-review",
    "name": "Large Type Review",
    "direction": "Monumental Editorial",
    "family": "Editorial systems",
    "uses": ["Architecture reviews", "Culture essays", "Exhibition announcements"],
    "summary": "Set one complete giant headline beside an architectural plate.",
    "composition": "Set one complete giant headline beside an architectural plate. Let a thick rule introduce the narrower reading column underneath. Preserve complete words and visible line endings rather than clipping type to manufacture scale.",
    "mobile": "Scale the entire title to fit the reading width. Put the architectural plate below the title and keep the prose under its closing rule.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 128px on desktop and 56px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within an open documentary reading rhythm.",
    "imagery": {
      "note": "Supplied architectural image with no text on its busy detail. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": [
        {"id": "architecture", "name": "Architectural plate", "kind": "photo", "guidance": "Supplied architectural image with no text on its busy detail. Use supplied media or an explicit labelled placeholder; author any diagram from basic shapes."}
      ]
    },
    "avoid": ["Cropped headline words", "Body text at monumental display scale", "A busy photo used as a text background"],
    "responsive": {
      "displayPx": [56, 144],
      "sectionPx": [56, 128],
      "gutterPx": [16, 48]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Monument",
        "ground": "light",
        "palette": {"canvas": "#FAF9F5", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#A33522", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "hairline",
        "type": {
          "display": {"family": "Anton", "fallback": "sans-serif", "weights": [400], "italic": false},
          "body": {"family": "Source Serif 4", "fallback": "serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Source Serif 4", "fallback": "serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 0, "panelPx": 0, "note": "0px controls and 0px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Masthead",
        "ground": "dark",
        "palette": {"canvas": "#1B1918", "surface": "#222C38", "ink": "#F6F8FC", "muted": "#B8C5D4", "accent": "#E6CB8F", "onAccent": "#111923", "line": "#586778", "inverse": "#F6F8FC", "onInverse": "#18212B"},
        "elevation": "flat",
        "type": {
          "display": {"family": "Bodoni Moda", "fallback": "serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Source Serif 4", "fallback": "serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Source Serif 4", "fallback": "serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 4, "panelPx": 4, "note": "4px controls and panels. High-contrast serif masthead, wider prose, image caption rail."}
      }
    ]
  },
  "Narrative Illustrated": {
    "kind": "direction",
    "id": "chapter-garden",
    "name": "Chapter Garden",
    "direction": "Narrative Illustrated",
    "family": "Illustrated stories",
    "uses": ["Guided stories", "Reading experiences", "Learning chapters"],
    "summary": "Open with one illustrated scene, then expose chapter markers and short passages along a progress route.",
    "composition": "Open with one illustrated scene, then expose chapter markers and short passages along a progress route. Connect each chapter number to an actual passage. Let the route show the current reading position without competing with the scene.",
    "mobile": "Crop the scene around its subject. Keep chapter labels visible above their passages and reduce the progress route to one side of the text.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 108px on desktop and 48px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within a spacious primary task.",
    "imagery": {
      "note": "Original scene shapes or licensed user illustration. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": [
        {"id": "scene-shapes", "name": "Scene shapes", "kind": "native-graphic", "guidance": "Original scene shapes or licensed user illustration. Use supplied media or an explicit labelled placeholder; author any diagram from basic shapes."}
      ]
    },
    "avoid": ["Progress markers with no matching chapter", "A scene repeated behind every paragraph", "Chapter names hidden on small screens"],
    "responsive": {
      "displayPx": [40, 80],
      "sectionPx": [48, 108],
      "gutterPx": [20, 64]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Garden",
        "ground": "light",
        "palette": {"canvas": "#F2EDF8", "surface": "#FFFFFF", "ink": "#30213B", "muted": "#655570", "accent": "#803356", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "soft",
        "type": {
          "display": {"family": "Alegreya", "fallback": "serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Nunito Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Nunito Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 8, "panelPx": 18, "note": "8px controls and 18px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Woodcut",
        "ground": "light",
        "palette": {"canvas": "#F8F2E5", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#25615C", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "hairline",
        "type": {
          "display": {"family": "Alegreya", "fallback": "serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Nunito Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Nunito Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 4, "panelPx": 4, "note": "4px actions and rectangular chapter plates with fine woodcut-like borders."}
      }
    ]
  },
  "Product Data Grid": {
    "kind": "direction",
    "id": "object-specification",
    "name": "Object Specification",
    "direction": "Product Data Grid",
    "family": "Technical systems",
    "uses": ["Product specifications", "Equipment catalogs", "Material comparisons"],
    "summary": "Give the product stage one side and align the specification labels, values and units on the other.",
    "composition": "Give the product stage one side and align the specification labels, values and units on the other. Put comparison rows below the core facts with one shared value baseline. Include a dimension sketch only when it explains a real measurement.",
    "mobile": "Keep the product first. Turn comparison columns into labelled records with their units intact and place the dimension key beside its value.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 60px on desktop and 28px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within a spacious primary task.",
    "imagery": {
      "note": "Honest user product stills and a dimension sketch. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": [
        {"id": "dimension-study", "name": "Dimension study", "kind": "native-graphic", "guidance": "Honest user product stills and a dimension sketch. Use supplied media or an explicit labelled placeholder; author any diagram from basic shapes."}
      ]
    },
    "avoid": ["Units only in column headers lost on mobile", "Decorative badges in specification rows", "A distorted product crop"],
    "responsive": {
      "displayPx": [36, 72],
      "sectionPx": [28, 60],
      "gutterPx": [16, 40]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Object",
        "ground": "light",
        "palette": {"canvas": "#F5F4F0", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#8C4A0E", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "hairline",
        "type": {
          "display": {"family": "Roboto Condensed", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "IBM Plex Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "IBM Plex Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 0, "panelPx": 0, "note": "0px controls and 0px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Measurement",
        "ground": "dark",
        "palette": {"canvas": "#192128", "surface": "#222C38", "ink": "#F6F8FC", "muted": "#B8C5D4", "accent": "#EBC36E", "onAccent": "#111923", "line": "#586778", "inverse": "#F6F8FC", "onInverse": "#18212B"},
        "elevation": "flat",
        "type": {
          "display": {"family": "Roboto Condensed", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "IBM Plex Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "IBM Plex Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 4, "panelPx": 4, "note": "4px controls and panels. Dark measurement board, mono captions, outlined product stage."}
      }
    ]
  },
  "Product Demo": {
    "kind": "direction",
    "id": "task-theater",
    "name": "Task Theater",
    "direction": "Product Demo",
    "family": "Product stories",
    "uses": ["Workflow demonstrations", "Task automation", "Editor tours"],
    "summary": "Arrange the input, active demonstration and result around one selected state.",
    "composition": "Arrange the input, active demonstration and result around one selected state. Show a concrete before value and its resulting output. Make the active demonstration wider than the input and result so the user sees the work rather than a marketing diagram.",
    "mobile": "Follow input, demonstration and result in document order. Put each action beside the state it changes and remove floating controls.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 80px on desktop and 40px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within a spacious primary task.",
    "imagery": {
      "note": "Real editable product-like content and visible outcome. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": []
    },
    "avoid": ["A result unrelated to the demonstrated input", "Three equally weighted marketing panels", "Floating controls without a selected state"],
    "responsive": {
      "displayPx": [36, 64],
      "sectionPx": [40, 80],
      "gutterPx": [20, 56]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Demonstration",
        "ground": "light",
        "palette": {"canvas": "#F3F6FC", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#3544A0", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "soft",
        "type": {
          "display": {"family": "Red Hat Display", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Inter", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Inter", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 8, "panelPx": 18, "note": "8px controls and 18px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Stepped",
        "ground": "dark",
        "palette": {"canvas": "#141C30", "surface": "#222C38", "ink": "#F6F8FC", "muted": "#B8C5D4", "accent": "#FFB6A7", "onAccent": "#111923", "line": "#586778", "inverse": "#F6F8FC", "onInverse": "#18212B"},
        "elevation": "hairline",
        "type": {
          "display": {"family": "Barlow Condensed", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Inter", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Inter", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 4, "panelPx": 8, "note": "4px controls and 8px demonstration panels with stepped outlines."}
      }
    ]
  },
  "Saturated Code Bridge": {
    "kind": "direction",
    "id": "code-crossing",
    "name": "Code Crossing",
    "direction": "Saturated Code Bridge",
    "family": "Technical systems",
    "uses": ["Developer introductions", "API examples", "Code learning"],
    "summary": "Carry the saturated introduction into a contrasting code rail, then show its rendered result with a short execution ledger.",
    "composition": "Carry the saturated introduction into a contrasting code rail, then show its rendered result with a short execution ledger. Keep the example small enough to read and make the result visibly correspond to it. The rail bridges explanation and output rather than serving as background code wallpaper.",
    "mobile": "Allow horizontal scrolling only inside the code panel. Stack the result and execution ledger after the complete example.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 68px on desktop and 32px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within a spacious primary task.",
    "imagery": {
      "note": "Small meaningful code sample and original pixel diagram. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": [
        {"id": "pixel-result", "name": "Pixel result", "kind": "native-graphic", "guidance": "Small meaningful code sample and original pixel diagram. Use supplied media or an explicit labelled placeholder; author any diagram from basic shapes."}
      ]
    },
    "avoid": ["Unrelated code and rendered output", "Page-wide code overflow", "Meaningless log streams used as decoration"],
    "responsive": {
      "displayPx": [36, 72],
      "sectionPx": [32, 68],
      "gutterPx": [16, 40]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Crossing",
        "ground": "dark",
        "palette": {"canvas": "#1C349A", "surface": "#222C38", "ink": "#F6F8FC", "muted": "#B8C5D4", "accent": "#D4EB7A", "onAccent": "#111923", "line": "#586778", "inverse": "#F6F8FC", "onInverse": "#18212B"},
        "elevation": "soft",
        "type": {
          "display": {"family": "Space Grotesk", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Public Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Public Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 4, "panelPx": 8, "note": "4px controls and 8px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Line code",
        "ground": "light",
        "palette": {"canvas": "#FBF5EF", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#9D3B2D", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "flat",
        "type": {
          "display": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "body": {"family": "Public Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Public Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 0, "panelPx": 0, "note": "0px controls and panels. Red/white field, mono headings, line diagram instead of pixel art."}
      }
    ]
  },
  "Soft Bento": {
    "kind": "direction",
    "id": "cushion-desk",
    "name": "Cushion Desk",
    "direction": "Soft Bento",
    "family": "Product stories",
    "uses": ["Personal workspaces", "Planning tools", "Care applications"],
    "summary": "Give one large task tile a soft outer group and place short supporting tiles beside it.",
    "composition": "Give one large task tile a soft outer group and place short supporting tiles beside it. Use nested grouping only for related task controls. Keep internal padding generous while making the next action visibly stronger than supporting records.",
    "mobile": "Ungroup the nested tiles into a vertical task flow. Put the large task first and remove empty spacer cells.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 40px on desktop and 24px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within a spacious primary task.",
    "imagery": {
      "note": "Useful records, small user thumbnails, optional simple shapes. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": []
    },
    "avoid": ["Deeply nested empty cards", "Support tiles louder than the primary task", "Mobile spacer cells left from the desktop grid"],
    "responsive": {
      "displayPx": [32, 56],
      "sectionPx": [24, 40],
      "gutterPx": [20, 40]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Cushion",
        "ground": "light",
        "palette": {"canvas": "#F0F6F6", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#17636B", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "soft",
        "type": {
          "display": {"family": "Nunito Sans", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Lato", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Lato", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 14, "panelPx": 28, "note": "14px controls and 28px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Open desk",
        "ground": "light",
        "palette": {"canvas": "#EFF0F2", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#3E4959", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "flat",
        "type": {
          "display": {"family": "Manrope", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Lato", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Lato", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 10, "panelPx": 18, "note": "10px controls and 18px nested groups with reduced radii and no shadows."}
      }
    ]
  },
  "Spatial Plus": {
    "kind": "direction",
    "id": "crosspoint-atlas",
    "name": "Crosspoint Atlas",
    "direction": "Spatial Plus",
    "family": "Editorial systems",
    "uses": ["Creative indexes", "Place archives", "Portfolio collections"],
    "summary": "Use sparse cross markers to locate a large index, one focal portrait and a fine coordinate strip.",
    "composition": "Use sparse cross markers to locate a large index, one focal portrait and a fine coordinate strip. Tie the portrait to a visible index entry. Let the empty field separate these landmarks rather than filling it with more marks.",
    "mobile": "Remove nonessential crosses. Place the coordinates after the title and the focal plate after its index entry.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 116px on desktop and 52px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within an open documentary reading rhythm.",
    "imagery": {
      "note": "Supplied portrait or site crop, anchored to an actual index entry. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": [
        {"id": "index-portrait", "name": "Index portrait", "kind": "photo", "guidance": "Supplied portrait or site crop, anchored to an actual index entry. Use supplied media or an explicit labelled placeholder; author any diagram from basic shapes."}
      ]
    },
    "avoid": ["Crosses used as a repeating wallpaper", "A portrait without an index entry", "Coordinates colliding with the title"],
    "responsive": {
      "displayPx": [40, 96],
      "sectionPx": [52, 116],
      "gutterPx": [24, 88]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Crosspoint",
        "ground": "light",
        "palette": {"canvas": "#FAFAF8", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#A3322A", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "soft",
        "type": {
          "display": {"family": "Unbounded", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Archivo", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Archivo", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 2, "panelPx": 20, "note": "2px controls and 20px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Corner ticks",
        "ground": "light",
        "palette": {"canvas": "#F0F2F4", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#334D64", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "hairline",
        "type": {
          "display": {"family": "Barlow Condensed", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Archivo", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Archivo", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 2, "panelPx": 12, "note": "2px controls and 12px focal plates with corner ticks and a fine edge."}
      }
    ]
  },
  "Split Inverse Showcase": {
    "kind": "direction",
    "id": "reverse-stage",
    "name": "Reverse Stage",
    "direction": "Split Inverse Showcase",
    "family": "Product stories",
    "uses": ["Workspace launches", "Service demonstrations", "Interface showcases"],
    "summary": "Join an unequal statement region and working region at one clean seam.",
    "composition": "Join an unequal statement region and working region at one clean seam. Give each side its own foreground pair and align the action row across the seam. Reserve inversion for those two regions instead of alternating it in every small component.",
    "mobile": "Stack statement before work. Preserve each region foreground pair and place its action alongside the matching content.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 92px on desktop and 44px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within a spacious primary task.",
    "imagery": {
      "note": "Functional product panel, no decorative image requirement. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": []
    },
    "avoid": ["Checkerboard inversions inside each region", "A seam through the primary action label", "Foreground colors inherited across inverse regions"],
    "responsive": {
      "displayPx": [40, 80],
      "sectionPx": [44, 92],
      "gutterPx": [20, 56]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Statement",
        "ground": "light",
        "palette": {"canvas": "#F7F8FC", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#2449B8", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "soft",
        "type": {
          "display": {"family": "Archivo Black", "fallback": "sans-serif", "weights": [400], "italic": false},
          "body": {"family": "Manrope", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Manrope", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 8, "panelPx": 16, "note": "8px controls and 16px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Reverse",
        "ground": "dark",
        "palette": {"canvas": "#152238", "surface": "#222C38", "ink": "#F6F8FC", "muted": "#B8C5D4", "accent": "#A9C6FF", "onAccent": "#111923", "line": "#586778", "inverse": "#F6F8FC", "onInverse": "#18212B"},
        "elevation": "hairline",
        "type": {
          "display": {"family": "Lora", "fallback": "serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Manrope", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Manrope", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 4, "panelPx": 8, "note": "4px outlined controls and 8px working panels across the inverse seam."}
      }
    ]
  },
  "Zigzag Bold Split": {
    "kind": "direction",
    "id": "switchback-stories",
    "name": "Switchback Stories",
    "direction": "Zigzag Bold Split",
    "family": "Photo essays",
    "uses": ["Sport stories", "Travel campaigns", "Project case studies"],
    "summary": "Use two unequal image and text pairs that reverse their emphasis once.",
    "composition": "Use two unequal image and text pairs that reverse their emphasis once. End with an unsplit proof strip carrying specific facts. Change crops to serve the story, while the text retains a shared gutter and a consistent action position.",
    "mobile": "Use title, image and detail order within each story. Remove zigzag offsets and keep the closing proof strip intact.",
    "spacing": "Use the 4/8/12/16/24px control scale. Separate sections by 104px on desktop and 48px on mobile; captions stay within 8px of their content.",
    "density": "Compact factual groups within an open documentary reading rhythm.",
    "imagery": {
      "note": "User-owned action photos with varying crops. Never invent an external media URL. Use the native graphic mode or label the missing media honestly.",
      "modes": [
        {"id": "action-photo", "name": "Action photo", "kind": "photo", "guidance": "User-owned action photos with varying crops. Use supplied media or an explicit labelled placeholder; author any diagram from basic shapes."}
      ]
    },
    "avoid": ["Equal half splits repeated for every story", "Mobile visual reordering that breaks title-image-detail order", "An extra zigzag in the closing proof strip"],
    "responsive": {
      "displayPx": [48, 112],
      "sectionPx": [48, 104],
      "gutterPx": [20, 64]
    },
    "variants": [
      {
        "id": "primary",
        "name": "Switchback",
        "ground": "light",
        "palette": {"canvas": "#F8F5FA", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#693D95", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "soft",
        "type": {
          "display": {"family": "Bebas Neue", "fallback": "sans-serif", "weights": [400], "italic": false},
          "body": {"family": "Source Sans 3", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Source Sans 3", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 4, "panelPx": 6, "note": "4px controls and 6px panels. Keep this edge family through related screens."}
      },
      {
        "id": "alternate",
        "name": "Documentary",
        "ground": "light",
        "palette": {"canvas": "#F8F2E8", "surface": "#FFFFFF", "ink": "#18212B", "muted": "#505965", "accent": "#8A3C2B", "onAccent": "#FFFFFF", "line": "#C8CFD5", "inverse": "#18212B", "onInverse": "#FFFFFF"},
        "elevation": "flat",
        "type": {
          "display": {"family": "Manrope", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "body": {"family": "Source Sans 3", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "caption": {"family": "Source Sans 3", "fallback": "sans-serif", "weights": [400, 700], "italic": false},
          "data": {"family": "IBM Plex Mono", "fallback": "monospace", "weights": [400, 700], "italic": false},
          "detail": "Set display text at the responsive display size with a compact line height. Use 16px regular body text, 12px captions and aligned tabular measurements. Keep supporting labels close to the content they identify."
        },
        "radius": {"controlPx": 0, "panelPx": 0, "note": "0px controls and panels. Documentary crops, broad sans display, wider gutters and square images."}
      }
    ]
  }
} satisfies Record<PenDirection, DirectionRecipe>
