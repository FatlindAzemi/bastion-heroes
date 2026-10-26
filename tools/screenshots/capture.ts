/**
 * Portrait screenshot helper for the relaunch PR evidence (issues #113/#114).
 *
 * Captures the named screens list from `tools/screenshots/screens.ts` at both the phone
 * 390x844 and the tablet 834x1194 viewport into `docs/screenshots/` as
 * `m3b-<name>-<width>x<height>.png`. It talks to an already running preview or dev
 * server (default `http://localhost:4173`, the `vite preview` port), it never starts a
 * server of its own and it never touches the shared Playwright MCP browser.
 *
 * Usage:
 *   npm run build && npx vite preview --port 4173 --strictPort &
 *   npx tsx tools/screenshots/capture.ts [options]
 *
 * Options:
 *   --base-url=<url>   Server to capture from (default http://localhost:4173).
 *   --out=<dir>        Output directory (default docs/screenshots).
 *   --only=<names>     Comma-separated screen names to capture instead of the full list.
 *   --strict           Exit non-zero if any screen could not be captured.
 *
 * A screen that is not implemented yet is reported as `SKIPPED` and does not abort the
 * other captures, so the helper stays useful while the rebuilt UI lands screen by screen.
 */
import { mkdir } from 'node:fs/promises';

import { chromium, type BrowserContext, type Page } from '@playwright/test';

import { SCREENS, type ScreenDefinition } from './screens';

/** One target viewport: the portrait phone and the portrait tablet of spec 13.7. */
interface ViewportTarget {
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor: number;
  readonly isMobile: boolean;
  readonly hasTouch: boolean;
}

/** The two portrait captures the relaunch PRs need (issues #113/#114). */
const VIEWPORTS: readonly ViewportTarget[] = [
  { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { width: 834, height: 1194, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];

/** Parsed command-line options of one capture run. */
interface CaptureOptions {
  readonly baseUrl: string;
  readonly outDir: string;
  readonly only: readonly string[] | null;
  readonly strict: boolean;
}

/** Reads the helper's `--name=value` / `--flag` options. */
function parseArgs(argv: readonly string[]): CaptureOptions {
  let baseUrl = 'http://localhost:4173';
  let outDir = 'docs/screenshots';
  let only: readonly string[] | null = null;
  let strict = false;
  for (const argument of argv) {
    if (argument === '--strict') {
      strict = true;
    } else if (argument.startsWith('--base-url=')) {
      baseUrl = argument.slice('--base-url='.length).replace(/\/$/, '');
    } else if (argument.startsWith('--out=')) {
      outDir = argument.slice('--out='.length);
    } else if (argument.startsWith('--only=')) {
      only = argument
        .slice('--only='.length)
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name.length > 0);
    } else {
      throw new Error(`Unknown option "${argument}". See the header of capture.ts.`);
    }
  }
  return { baseUrl, outDir, only, strict };
}

/**
 * Stops the render loop once the screen is fully drawn. The `?tick=` debug URLs
 * fast-forward the sim before the first frame (spec 13.7) and the GLB/sprite assets load
 * asynchronously, so the freeze waits for `prepare` plus the screen's settle delay and
 * only then stops `requestAnimationFrame`. The screenshot is therefore stable and shows
 * the fully loaded, populated scene.
 */
async function freezeRenderLoop(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.requestAnimationFrame = (): number => 0;
  });
  await page.waitForTimeout(150);
}

/** Waits until the bundled fonts and the images of the screen have loaded. */
async function waitForAssets(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = Array.from(document.images);
    await Promise.all(
      images.map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              image.addEventListener('load', () => resolve(), { once: true });
              image.addEventListener('error', () => resolve(), { once: true });
            }),
      ),
    );
  });
}

/**
 * Polls until the element's box is fully inside the viewport. The wave banner slides in
 * from off-screen, so a screenshot taken at the first visible frame would catch it half
 * outside the screen.
 */
async function waitForElementInsideViewport(page: Page, selector: string): Promise<void> {
  const viewport = page.viewportSize();
  if (viewport === null) {
    return;
  }
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const box = await page.locator(selector).first().boundingBox();
    if (
      box !== null &&
      box.x >= 0 &&
      box.y >= 0 &&
      box.x + box.width <= viewport.width &&
      box.y + box.height <= viewport.height
    ) {
      return;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`"${selector}" did not slide fully into the viewport within 5 s.`);
}

/** Captures one screen definition at one viewport and returns its file path. */
async function captureScreen(
  context: BrowserContext,
  screen: ScreenDefinition,
  target: ViewportTarget,
  options: CaptureOptions,
): Promise<string> {
  const page = await context.newPage();
  try {
    page.setDefaultTimeout(15_000);
    if (screen.seed !== undefined) {
      await page.addInitScript((data) => {
        localStorage.setItem('bh_save', JSON.stringify(data));
      }, screen.seed);
    }
    await page.goto(options.baseUrl + screen.path);
    await screen.prepare(page);
    if (screen.instant === true && screen.centerSelector !== undefined) {
      await waitForElementInsideViewport(page, screen.centerSelector);
      await page.evaluate(() => {
        for (const animation of document.getAnimations()) {
          animation.pause();
        }
      });
    }
    if (screen.instant !== true) {
      await waitForAssets(page);
      if (screen.settleMs !== undefined) {
        await page.waitForTimeout(screen.settleMs);
      }
      if (screen.freezeFrame === true) {
        await freezeRenderLoop(page);
      }
    }
    const filePath = `${options.outDir}/m3b-${screen.name}-${target.width}x${target.height}.png`;
    // `scale: 'css'` writes the image at the CSS viewport size (390x844 and 834x1194,
    // matching the file name), like the screenshots committed for earlier milestones.
    await page.screenshot({
      path: filePath,
      animations: screen.allowAnimations === true ? 'allow' : 'disabled',
      scale: 'css',
    });
    return filePath;
  } finally {
    await page.close();
  }
}

/** Captures the selected screens at both portrait viewports and prints a summary. */
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const selected = SCREENS.filter(
    (screen) => options.only === null || options.only.includes(screen.name),
  );
  if (selected.length === 0) {
    throw new Error(`No known screen matches --only=${options.only?.join(',') ?? ''}.`);
  }
  await mkdir(options.outDir, { recursive: true });
  const browser = await chromium.launch();
  const captured: string[] = [];
  const skipped: string[] = [];
  try {
    for (const target of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: target.width, height: target.height },
        deviceScaleFactor: target.deviceScaleFactor,
        isMobile: target.isMobile,
        hasTouch: target.hasTouch,
      });
      try {
        for (const screen of selected) {
          try {
            captured.push(await captureScreen(context, screen, target, options));
          } catch (error) {
            const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
            console.log(`SKIPPED ${screen.name} at ${target.width}x${target.height}: ${message}`);
            skipped.push(`${screen.name}-${target.width}x${target.height}`);
          }
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`Captured ${captured.length} screenshot(s) into ${options.outDir}/:`);
  for (const filePath of captured) {
    console.log(`  ${filePath}`);
  }
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} screen(s): ${skipped.join(', ')}`);
    if (options.strict) {
      process.exitCode = 1;
    }
  }
}

await main();
