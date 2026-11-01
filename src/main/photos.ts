export type PhotoOrientation = 'landscape' | 'portrait' | 'square'

export interface Photo {
  n: number
  url: string
  thumb: string
  width: number
  height: number
  description: string
  credit: string
  license: string
  source: string
}

export interface PhotoKeys {
  unsplash?: string
  pexels?: string
}

const USER_AGENT = 'Chalk/0.1 (https://github.com/rizaardiyanto1412/chalk)'
const TIMEOUT_MS = 15000

async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`)
  return res.json()
}

/** Unsplash asks apps to report each photo they actually use. Keyed by image URL, filled by searches. */
const unsplashDownloads = new Map<string, string>()

async function unsplash(key: string, query: string, orientation: PhotoOrientation | undefined, count: number): Promise<Omit<Photo, 'n'>[]> {
  const q = new URLSearchParams({ query, per_page: String(count), content_filter: 'high', ...(orientation ? { orientation: orientation === 'square' ? 'squarish' : orientation } : {}) })
  const data = await getJson(`https://api.unsplash.com/search/photos?${q}`, { authorization: `Client-ID ${key}`, 'accept-version': 'v1' })
  return (data.results ?? []).map((p: any) => {
    const url = `${p.urls.raw}&w=1600&q=80&fm=jpg&fit=crop`
    unsplashDownloads.set(p.urls.raw.split('?')[0], p.links.download_location)
    return { url, thumb: p.urls.small, width: p.width, height: p.height, description: p.alt_description ?? p.description ?? '', credit: `Photo by ${p.user.name} on Unsplash`, license: 'Unsplash License', source: p.links.html }
  })
}

async function pexels(key: string, query: string, orientation: PhotoOrientation | undefined, count: number): Promise<Omit<Photo, 'n'>[]> {
  const q = new URLSearchParams({ query, per_page: String(count), ...(orientation ? { orientation } : {}) })
  const data = await getJson(`https://api.pexels.com/v1/search?${q}`, { authorization: key })
  return (data.photos ?? []).map((p: any) => ({
    url: p.src.large2x, thumb: p.src.medium, width: p.width, height: p.height, description: p.alt ?? '',
    credit: `Photo by ${p.photographer} on Pexels`, license: 'Pexels License', source: p.url
  }))
}

const SCAN_TITLE = /\b(volume|page|plate|map|diagram|chart|logo|coat of arms|scan|manuscript|newspaper)\b/i
/** Old scans and archival prints dominate Commons results; keep photos taken this century or undated. */
function takenYear(ii: any): 'old' | 'recent' | 'unknown' {
  const year = Number(stripTags(ii.extmetadata?.DateTimeOriginal?.value ?? '').match(/\b(1[89]|20)\d\d\b/)?.[0])
  return !year ? 'unknown' : year < 2000 ? 'old' : 'recent'
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

async function wikimedia(query: string, orientation: PhotoOrientation | undefined, count: number): Promise<Omit<Photo, 'n'>[]> {
  const q = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrsearch: `${query} -museum -antique -ancient -archaeological -manuscript -engraving -illustration filetype:bitmap`, gsrnamespace: '6', gsrlimit: '40',
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1600'
  })
  const data = await getJson(`https://commons.wikimedia.org/w/api.php?${q}`)
  const pages = Object.values<any>(data.query?.pages ?? {}).sort((a, b) => a.index - b.index)
  const fits = (w: number, h: number) => (orientation === 'landscape' ? w / h > 1.15 : orientation === 'portrait' ? h / w > 1.15 : orientation === 'square' ? Math.abs(w / h - 1) < 0.25 : w / h > 0.5 && w / h < 2.4)
  return pages
    .map((p) => ({ p, ii: p.imageinfo?.[0] }))
    .filter(({ p, ii }) => ii && ii.mime === 'image/jpeg' && ii.width >= 1200 && fits(ii.width, ii.height) && !SCAN_TITLE.test(p.title) && takenYear(ii) !== 'old')
    .slice(0, count)
    .map(({ p, ii }) => {
      const m = ii.extmetadata ?? {}
      const artist = stripTags(m.Artist?.value ?? 'Unknown author')
      const license = stripTags(m.LicenseShortName?.value ?? 'see source')
      return {
        url: ii.thumburl ?? ii.url, thumb: ii.thumburl ?? ii.url, width: ii.width, height: ii.height,
        description: stripTags(m.ImageDescription?.value ?? p.title.replace(/^File:|\.\w+$/g, '')).slice(0, 160),
        credit: `${artist}, Wikimedia Commons`, license, source: ii.descriptionurl
      }
    })
}

export interface PhotoSearch {
  provider: 'unsplash' | 'pexels' | 'wikimedia'
  photos: Photo[]
}

/** Search the best configured source; Wikimedia Commons needs no key and is the fallback. */
export async function searchPhotos(keys: PhotoKeys, query: string, orientation: PhotoOrientation | undefined, count: number): Promise<PhotoSearch> {
  const numbered = (list: Omit<Photo, 'n'>[]) => list.map((p, i) => ({ n: i + 1, ...p }))
  if (keys.unsplash) return { provider: 'unsplash', photos: numbered(await unsplash(keys.unsplash, query, orientation, count)) }
  if (keys.pexels) return { provider: 'pexels', photos: numbered(await pexels(keys.pexels, query, orientation, count)) }
  return { provider: 'wikimedia', photos: numbered(await wikimedia(query, orientation, count)) }
}

/** Report Unsplash photos that a frame now uses, once each, as the Unsplash API guidelines require. */
export function notePhotoUse(keys: PhotoKeys, html: string): void {
  if (!keys.unsplash || unsplashDownloads.size === 0) return
  for (const [base, download] of unsplashDownloads) {
    if (!html.includes(base)) continue
    unsplashDownloads.delete(base)
    void fetch(download, { headers: { authorization: `Client-ID ${keys.unsplash}`, 'user-agent': USER_AGENT } }).catch(() => {})
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** A numbered grid of candidates so the agent can choose photos by looking at them. */
export function contactSheet(photos: Photo[]): string {
  const cells = photos
    .map((p) => `<figure style="margin:0;position:relative"><img src="${esc(p.thumb)}" style="display:block;width:100%;height:220px;object-fit:cover;background:#ddd"><figcaption style="position:absolute;left:8px;top:8px;background:#111;color:#fff;font:700 18px/1 Inter,sans-serif;padding:6px 9px;border-radius:6px">${p.n}</figcaption></figure>`)
    .join('')
  return `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px;background:#fff">${cells}</div>`
}
