/**
 * Mobile-viewport screenshot check. Drives the locally installed Edge via
 * puppeteer-core against a running preview/dev server and captures the menu,
 * the in-game layout, and (portrait) a swipe-started round at phone sizes,
 * reporting any viewport overflow.
 *
 * Usage: node dev/mobile-shots.mjs <output-dir> [server-url]
 */
import puppeteer from 'puppeteer-core'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const OUT = process.argv[2] ?? '.'
const URL = process.argv[3] ?? 'http://localhost:4323/'

const VIEWPORTS = [
  { name: 'portrait-390', width: 390, height: 844 },
  { name: 'landscape-844', width: 844, height: 390 },
  { name: 'narrow-360', width: 360, height: 740 },
]

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true })

for (const vp of VIEWPORTS) {
  const page = await browser.newPage()
  await page.setViewport({
    width: vp.width,
    height: vp.height,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  })
  await page.goto(URL, { waitUntil: 'load' })
  await new Promise((r) => setTimeout(r, 800))

  await page.screenshot({ path: `${OUT}/m-${vp.name}-menu.png` })

  // Dismiss the menu via its RESUME control
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('#ui-root button, #ui-root a')]
    const resume = els.find((e) => (e.textContent || '').trim().toUpperCase().includes('RESUME'))
    if (resume) resume.click()
  })
  await new Promise((r) => setTimeout(r, 400))
  await page.screenshot({ path: `${OUT}/m-${vp.name}-game.png` })

  const metrics = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    scrollH: document.documentElement.scrollHeight,
    innerH: window.innerHeight,
    canvasCssW: document.querySelector('#game')?.clientWidth ?? -1,
    canvasCssH: document.querySelector('#game')?.clientHeight ?? -1,
  }))
  const overflowX = metrics.scrollW > metrics.innerW ? 'OVERFLOW-X!' : 'no h-overflow'
  const overflowY = metrics.scrollH > metrics.innerH ? 'OVERFLOW-Y!' : 'no v-overflow'
  console.log(
    `${vp.name}: ${overflowX}, ${overflowY}, canvas ${metrics.canvasCssW}x${metrics.canvasCssH} in ${metrics.innerW}x${metrics.innerH}`,
  )

  // On the portrait viewport, swipe down to start the round and capture gameplay
  if (vp.name === 'portrait-390') {
    try {
      const cx = Math.round(vp.width / 2)
      const cy = Math.round(vp.height / 2)
      await page.touchscreen.touchStart(cx, cy - 60)
      await page.touchscreen.touchMove(cx, cy + 60)
      await page.touchscreen.touchEnd()
      await new Promise((r) => setTimeout(r, 1200))
      await page.screenshot({ path: `${OUT}/m-${vp.name}-playing.png` })
      console.log(`${vp.name}: swipe-to-start captured`)
    } catch (err) {
      console.log(`${vp.name}: touch simulation unavailable (${err.message})`)
    }
  }

  await page.close()
}

await browser.close()
console.log('done')
