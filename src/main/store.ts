import { EventEmitter } from 'node:events'
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { applyOp, emptyDoc, parseDoc, type Doc, type FrameId, type Op, type BrowserPick } from '../shared/model'

const DOC_FILE = 'chalk.json'
/** Projects saved before the app was renamed from Easel. Read once, then saved as chalk.json. */
const LEGACY_DOC_FILE = 'easel.json'

export class Store extends EventEmitter {
  doc: Doc = emptyDoc()
  dir = ''
  selection: FrameId[] = []
  browserPick: BrowserPick | null = null
  private saveTimer: NodeJS.Timeout | null = null
  private past: Doc[] = []
  private future: Doc[] = []

  open(dir: string): void {
    this.flush()
    mkdirSync(join(dir, 'assets'), { recursive: true })
    this.dir = dir
    try {
      const file = [DOC_FILE, LEGACY_DOC_FILE].map((f) => join(dir, f)).find((f) => existsSync(f)) ?? join(dir, DOC_FILE)
      this.doc = parseDoc(JSON.parse(readFileSync(file, 'utf8')))
    } catch {
      this.doc = emptyDoc()
    }
    this.selection = []
    this.past = []
    this.future = []
    this.emit('change', this.doc)
  }

  dispatch(op: Op): Doc {
    this.past = [...this.past.slice(-99), this.doc]
    this.future = []
    this.doc = applyOp(this.doc, op)
    if (op.type === 'delete') this.selection = this.selection.filter((id) => id !== op.id)
    this.emit('change', this.doc)
    this.scheduleSave()
    return this.doc
  }

  /** Step through history. Returns false when there is nothing to undo or redo. */
  travel(direction: 'undo' | 'redo'): boolean {
    const [from, to] = direction === 'undo' ? [this.past, this.future] : [this.future, this.past]
    const target = from.pop()
    if (!target) return false
    to.push(this.doc)
    this.doc = target
    this.emit('change', this.doc)
    this.scheduleSave()
    return true
  }

  assetPath(name: string): string {
    return join(this.dir, 'assets', name)
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flush(), 250)
  }

  /**
   * Write pending changes now, atomically. Synchronous on purpose: one writer at a time means an older
   * save can never land after a newer one. Called by the debounce, before switching projects, and on quit.
   */
  flush(): void {
    if (!this.saveTimer || !this.dir) return
    clearTimeout(this.saveTimer)
    this.saveTimer = null
    const file = join(this.dir, DOC_FILE)
    writeFileSync(`${file}.tmp`, JSON.stringify(this.doc, null, 2))
    renameSync(`${file}.tmp`, file)
  }
}
