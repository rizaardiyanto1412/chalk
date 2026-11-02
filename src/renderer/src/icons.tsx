const PATHS = {
  canvas: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
  chevronDown: 'M6 9l6 6 6-6',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  reload: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  pointer: 'M4 4l7 17 2.5-7.5L21 11z',
  camera: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  send: 'M12 19V5M5 12l7-7 7 7',
  stop: 'M7 7h10v10H7z',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6L6 18M6 6l12 12',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  external: 'M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  plug: 'M12 22v-5M9 8V2M15 8V2M18 8v5a6 6 0 0 1-12 0V8z',
  frame: 'M22 6H2M22 18H2M6 2v20M18 2v20',
  image: 'M3 3h18v18H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z',
  tool: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
  folder: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  check: 'M20 6L9 17l-5-5',
  hand: 'M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-3a2 2 0 0 0-4 0',
  panel: 'M3 4h18v16H3zM9 4v16',
  panelRight: 'M3 4h18v16H3zM15 4v16',
  layers: 'M12 2l10 5-10 5L2 7zM2 12l10 5 10-5M2 17l10 5 10-5',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z',
  maximize: 'M8 3H3v5M21 8V3h-5M16 21h5v-5M3 16v5h5',
  minus: 'M5 12h14',
  fit: 'M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6',
  file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6',
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  upload: 'M12 15V3M7 8l5-5 5 5M5 21h14',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Provider marks from Simple Icons (CC0 paths; the marks are their owners' trademarks), filled rather than stroked. */
const BRANDS = {
  anthropic: 'M17.304 3.541h-3.672l6.696 16.918H24Zm-10.608 0L0 20.459h3.744l1.37-3.553h7.005l1.369 3.553h3.744L10.536 3.541Zm-.371 10.223L8.616 7.82l2.291 5.945Z'
} as const

export type BrandName = keyof typeof BRANDS

export function BrandMark({ brand, size = 12 }: { brand: BrandName; size?: number }) {
  return (
    <svg className="brand-mark-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={BRANDS[brand]} />
    </svg>
  )
}
