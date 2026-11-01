import { clipboard, ClipboardItem } from 'electron'
import { randomUUID } from 'node:crypto'
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { z } from 'zod'
import { FRAME_GAP, nextSlot, type Frame, type FrameCommand, type FrameId } from '../shared/model'
import { arrangementOps, cloneFrames, frameBounds, FRAME_PRESETS } from '../shared/frameGeometry'
import type { Store } from './store'

const MIME = 'application/x-chalk-frames'
const OS_MIME = `electron application/osclipboard;format="${MIME}"`
export const frameIdSchema = z.custom<FrameId>((value) => typeof value === 'string' && value.length > 0)
const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create'), preset: z.enum(['desktop', 'mobile']) }),
  z.object({ type: z.literal('duplicate') }),
  z.object({ type: z.literal('copy') }),
  z.object({ type: z.literal('cut') }),
  z.object({ type: z.literal('selectAll') }),
  z.object({ type: z.literal('delete') }),
  z.object({ type: z.literal('paste'), anchor: z.object({ x: z.number().finite(), y: z.number().finite() }) }),
  z.object({
    type: z.literal('arrange'), ids: z.array(frameIdSchema), projectEpoch: z.number().int(),
    operation: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('translate'), dx: z.number().finite(), dy: z.number().finite() }),
      z.object({ kind: z.literal('geometry'), field: z.enum(['x', 'y', 'width', 'height']), value: z.number().finite() }),
      z.object({ kind: z.literal('align'), alignment: z.enum(['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom']) }),
      z.object({ kind: z.literal('distribute'), axis: z.enum(['x', 'y']) }),
      z.object({ kind: z.literal('stack'), direction: z.enum(['front', 'back', 'forward', 'backward']) })
    ])
  })
])

export function safeAssetName(name: string): boolean {
  return !!name && name !== '.' && name !== '..' && basename(name) === name && !/[\\/\0]/.test(name)
}

function assetFolder(dir: string): string {
  const folder = join(realpathSync(dir), 'assets')
  const stat = lstatSync(folder)
  if (stat.isSymbolicLink() || !stat.isDirectory() || realpathSync(folder) !== folder) {
    throw new Error('Assets must be a project folder, not a symbolic link.')
  }
  return folder
}

function readAsset(folder: string, name: string): Buffer {
  if (!safeAssetName(name)) throw new Error('Unsafe image asset path. Add the image again.')
  let fd: number
  try {
    fd = openSync(join(folder, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch {
    throw new Error(`Image asset ${name} is missing or unsafe. Add the image again.`)
  }
  try {
    if (!fstatSync(fd).isFile()) throw new Error(`Image asset ${name} must be a regular file.`)
    return readFileSync(fd)
  } finally {
    closeSync(fd)
  }
}

interface FrameSnapshot {
  token: string
  frames: Frame[]
  assets: Map<string, Buffer>
}

export class FrameCommands {
  /** Shared by every project tab, so frames copied in one tab paste into another. */
  private static snapshot: FrameSnapshot | null = null
  private pending: Promise<void> = Promise.resolve()

  constructor(private store: Store, private select: (ids: FrameId[], focus?: boolean) => void) {}

  run(raw: unknown): Promise<void> {
    const command: FrameCommand = commandSchema.parse(raw)
    const { store } = this
    const epoch = store.projectEpoch
    const task = this.pending.then(async () => {
      const checkProject = () => {
        if (store.projectEpoch !== epoch) throw new Error('The project changed. Run the frame command again.')
      }
      checkProject()
      const doc = store.doc
      const dir = store.dir
      const frames = doc.frames.filter((f) => store.selection.includes(f.id)).map((f) => ({ ...f }))
      let captured: FrameSnapshot | null = null
      if ((command.type === 'copy' || command.type === 'cut') && frames.length) {
        const images = frames.filter((f) => f.kind === 'image')
        const assets = new Map<string, Buffer>()
        if (images.length) {
          const folder = assetFolder(dir)
          for (const f of images) if (!assets.has(f.asset)) assets.set(f.asset, readAsset(folder, f.asset))
        }
        captured = { token: randomUUID(), frames, assets }
      }
      const newId = () => frameIdSchema.parse(randomUUID())
      const add = (copies: Frame[], focus = false) => {
        checkProject()
        store.dispatch(copies.map((frame) => ({ type: 'add', frame })))
        this.select(copies.map((f) => f.id), focus)
      }
      switch (command.type) {
        case 'arrange':
          if (command.projectEpoch !== store.projectEpoch || command.ids.some((id) => !doc.frames.some((f) => f.id === id))) return
          store.dispatch(arrangementOps(doc.frames, command.ids, command.operation))
          return
        case 'delete':
          checkProject()
          store.dispatch(frames.map((f) => ({ type: 'delete', id: f.id })))
          this.select([])
          return
        case 'selectAll':
          checkProject()
          this.select(store.doc.frames.map((f) => f.id))
          return
        case 'create':
          checkProject()
          add([{ ...FRAME_PRESETS[command.preset], ...nextSlot(store.doc), id: newId(), kind: 'html', html: '', updatedAt: Date.now() }], true)
          return
        case 'duplicate': {
          if (!frames.length) return
          checkProject()
          add(cloneFrames(frames, newId, frameBounds(frames).width + FRAME_GAP, 0, Date.now()))
          return
        }
        case 'copy':
        case 'cut': {
          if (!captured) return
          await clipboard.write([new ClipboardItem({ [MIME]: captured.token, 'text/plain': frames.map((f) => f.name).join('\n') })])
          FrameCommands.snapshot = captured
          if (command.type === 'cut') {
            checkProject()
            if (store.doc !== doc) throw new Error('Frames changed during Cut. They were copied but have not been deleted.')
            store.dispatch(frames.map((f) => ({ type: 'delete', id: f.id })))
            this.select([])
          }
          return
        }
        case 'paste': {
          const snapshot = FrameCommands.snapshot
          if (!snapshot) return
          const items = await clipboard.read()
          const item = items.find((entry) => entry.types.includes(MIME) || entry.types.includes(OS_MIME))
          if (!item) return
          const format = item.types.includes(MIME) ? MIME : OS_MIME
          if (await (await item.getType(format)).text() !== snapshot.token) return
          checkProject()
          const bounds = frameBounds(snapshot.frames)
          const copies = cloneFrames(snapshot.frames, newId, Math.round(command.anchor.x - bounds.width / 2) - bounds.x, Math.round(command.anchor.y - bounds.height / 2) - bounds.y, Date.now())
          const assets = new Map<string, string>()
          for (const frame of copies) {
            if (frame.kind !== 'image') continue
            let asset = assets.get(frame.asset)
            if (!asset) {
              const bytes = snapshot.assets.get(frame.asset)
              if (!bytes) throw new Error('The clipboard image snapshot is missing. Copy the frames again.')
              asset = `${randomUUID()}.png`
              writeFileSync(join(assetFolder(dir), asset), bytes, { flag: 'wx' })
              assets.set(frame.asset, asset)
            }
            frame.asset = asset
          }
          add(copies)
        }
      }
    })
    this.pending = task.catch(() => {})
    return task
  }
}
