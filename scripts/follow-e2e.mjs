import assert from 'node:assert/strict'
import { join } from 'node:path'

const camera = (win) => win.locator('.world').evaluate((el) => el.style.transform)
const settle = (win) => win.waitForTimeout(400)

/** The canvas follows agent work until the user moves it, then holds still and offers to follow again. */
export async function checkFollow({ win, client, call, json, check, artifacts }) {
  await check('agent work stops moving the canvas once the user scrolls it, and Follow agent resumes it', async () => {
    const a = json(await call(client, 'create_frame', { name: 'Follow fixture A', width: 600, height: 400, x: 0, y: 0, html: '<div class="p-8">A</div>' })).created.id
    const b = json(await call(client, 'create_frame', { name: 'Follow fixture B', width: 600, height: 400, x: 9000, y: 6000, html: '<div class="p-8">B</div>' })).created.id
    try {
      await settle(win)
      const pill = win.locator('.follow-agent')
      if (await pill.isVisible()) await pill.click()
      await call(client, 'get_frame', { id: a })
      await settle(win)
      const onA = await camera(win)
      await call(client, 'get_frame', { id: b })
      await settle(win)
      const onB = await camera(win)
      assert.notEqual(onB, onA, 'the agent moves the camera while the user has not touched the canvas')
      assert.equal(await pill.count(), 0)

      const box = await win.locator('.canvas').boundingBox()
      await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await win.mouse.wheel(0, 240)
      await settle(win)
      const mine = await camera(win)
      assert.notEqual(mine, onB)

      await call(client, 'get_frame', { id: a })
      await call(client, 'screenshot_frame', { id: a })
      await settle(win)
      assert.equal(await camera(win), mine, 'agent work leaves the user camera alone')
      await pill.waitFor({ state: 'visible' })
      await win.screenshot({ path: join(artifacts, 'follow-paused.png') })

      await pill.click()
      await settle(win)
      assert.notEqual(await camera(win), mine, 'Follow agent jumps to the latest agent frame')
      assert.equal(await pill.count(), 0)
      const back = await camera(win)
      await call(client, 'get_frame', { id: b })
      await settle(win)
      assert.notEqual(await camera(win), back, 'following resumes for later agent work')
    } finally {
      await call(client, 'delete_frame', { id: a })
      await call(client, 'delete_frame', { id: b })
    }
  })
}
