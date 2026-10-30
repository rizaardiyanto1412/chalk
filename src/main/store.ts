import { EventEmitter } from 'node:events'
import { promises as fs, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { applyOp, emptyDoc, parseDoc, type Doc, type FrameId, type Op, type BrowserPick } from '../shared/model'

const DOC_FILE = 'easel.json'

export class Store extends EventEmitter {
  doc: Doc = emptyDoc()
  dir = ''
  selection: FrameId[] = []
  browserPick: BrowserPick | null = null
  private saveTimer: NodeJS.Timeout | null = null

  open(dir: string): void {
    this.flush()
    mkdirSync(join(dir, 'assets'), { recursive: true })
    this.dir = dir
    try {
      this.doc = parseDoc(JSON.parse(readFileSync(join(dir, DOC_FILE), 'utf8')))
    } catch {
      this.doc = emptyDoc()
    }
    this.selection = []
    this.emit('change', this.doc)
  }

  dispatch(op: Op): Doc {
    this.doc = applyOp(this.doc, op)
    if (op.type === 'delete') this.selection = this.selection.filter((id) => id !== op.id)
    this.emit('change', this.doc)
    this.scheduleSave()
    return this.doc
  }

  assetPath(name: string): string {
    return join(this.dir, 'assets', name)
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => void this.save(), 250)
  }

  private async save(): Promise<void> {
    this.saveTimer = null
    const file = join(this.dir, DOC_FILE)
    const tmp = `${file}.tmp`
    await fs.writeFile(tmp, JSON.stringify(this.doc, null, 2))
    await fs.rename(tmp, file)
  }

  /** Write pending changes now. Called before switching projects and on quit. */
  flush(): void {
    if (!this.saveTimer || !this.dir) return
    clearTimeout(this.saveTimer)
    this.saveTimer = null
    const file = join(this.dir, DOC_FILE)
    writeFileSync(file, JSON.stringify(this.doc, null, 2))
  }
}
