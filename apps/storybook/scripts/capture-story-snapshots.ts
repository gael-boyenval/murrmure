import { createServer, type Server } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createReadStream, existsSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORYBOOK_APP_DIR = resolve(__dirname, "..");
const REPO_ROOT = resolve(STORYBOOK_APP_DIR, "../..");
const STATIC_DIR = resolve(STORYBOOK_APP_DIR, "storybook-static");
const INDEX_PATH = join(STATIC_DIR, "index.json");
const PORT = Number(process.env.STORYBOOK_SNAPSHOT_PORT ?? 6011);
const BASE_URL = `http://127.0.0.1:${PORT}`;

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

interface StoryIndexEntry {
  id: string;
  name: string;
  title: string;
  importPath: string;
  type: "story" | "docs";
  tags?: string[];
}

interface StoryIndex {
  entries: Record<string, StoryIndexEntry>;
}

/** Stories that render overlays (Dialog, Sheet, ViewDrawer) — must be open before screenshot. */
interface OverlayPrep {
  /** Click this trigger button if the overlay is not already open. */
  triggerLabel?: string;
  /** Wait until a dialog/sheet portal is visible. */
  requireOpen?: boolean;
}

const OVERLAY_STORY_PREP: Record<string, OverlayPrep> = {
  "shell-ui-dialog--default": { triggerLabel: "Open dialog", requireOpen: true },
  "shell-ui-sheet--right": { triggerLabel: "Open sheet", requireOpen: true },
  "shell-ui-sheet--left": { triggerLabel: "Open left sheet", requireOpen: true },
  "shell-web-viewdrawer--review-params": { requireOpen: true },
  "shell-web-viewdrawer--review-params-submitting": { requireOpen: true },
  "shell-web-viewdrawer--fallback-form": { requireOpen: true },
  "shell-web-viewdrawer--fallback-form-with-schema": { requireOpen: true },
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function snapshotDirForStoryFile(storyFilePath: string): string {
  return storyFilePath.replace(/\.stories\.(tsx|ts|jsx|js|mjs)$/, ".stories.snapshots");
}

function resolveStoryFile(importPath: string): string {
  return resolve(STORYBOOK_APP_DIR, importPath);
}

function contentType(path: string): string {
  return MIME[extname(path)] ?? "application/octet-stream";
}

async function startStaticServer(): Promise<Server> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", BASE_URL);
      let filePath = join(STATIC_DIR, decodeURIComponent(url.pathname));

      if (url.pathname.endsWith("/")) {
        filePath = join(filePath, "index.html");
      }

      if (!filePath.startsWith(STATIC_DIR)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      res.writeHead(200, { "Content-Type": contentType(filePath) });
      createReadStream(filePath).pipe(res);
    });

    server.on("error", reject);
    server.listen(PORT, "127.0.0.1", () => resolvePromise(server));
  });
}

async function waitForStoryReady(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  try {
    await page.waitForFunction(
      () => {
        const root = document.querySelector("#storybook-root, #root, [data-testid='storybook-root']");
        if (root && root.childElementCount > 0) return true;
        const bodyText = document.body?.innerText?.trim();
        return Boolean(bodyText && bodyText.length > 0);
      },
      undefined,
      { timeout: 10_000 },
    );
  } catch {
    // Some stories (dialogs, lazy routes) render outside the root node.
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(150);
}

async function isOverlayOpen(page: Page): Promise<boolean> {
  const dialog = page.locator('[role="dialog"][data-state="open"]');
  if (await dialog.count()) return true;
  return (await page.locator('[role="dialog"]').count()) > 0;
}

async function prepareOverlayStory(page: Page, entry: StoryIndexEntry): Promise<void> {
  const prep = OVERLAY_STORY_PREP[entry.id];
  if (!prep) return;

  if (!(await isOverlayOpen(page)) && prep.triggerLabel) {
    const trigger = page.getByRole("button", { name: prep.triggerLabel, exact: true });
    if (await trigger.count()) {
      await trigger.click();
    }
  }

  if (prep.requireOpen) {
    await page.waitForSelector('[role="dialog"]', { timeout: 5_000 });
    await page.waitForTimeout(250);
  }
}

async function captureStory(page: Page, entry: StoryIndexEntry, outputPath: string): Promise<void> {
  const url = `${BASE_URL}/iframe.html?id=${encodeURIComponent(entry.id)}&viewMode=story`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForStoryReady(page);
  await prepareOverlayStory(page, entry);

  const body = page.locator("body");
  const box = await body.boundingBox();
  const viewport = box && box.width > 0 && box.height > 0
    ? { width: Math.ceil(Math.min(Math.max(box.width + 32, 320), 1920)), height: Math.ceil(Math.min(Math.max(box.height + 32, 240), 1080)) }
    : { width: 1280, height: 720 };

  await page.setViewportSize(viewport);
  await page.waitForTimeout(100);

  await mkdir(dirname(outputPath), { recursive: true });
  await page.screenshot({ path: outputPath, fullPage: true });
}

async function main(): Promise<void> {
  if (!existsSync(INDEX_PATH)) {
    throw new Error(`Missing ${INDEX_PATH}. Run "storybook build" first.`);
  }

  const index = JSON.parse(await readFile(INDEX_PATH, "utf8")) as StoryIndex;
  const stories = Object.values(index.entries).filter((entry) => entry.type === "story");

  if (stories.length === 0) {
    throw new Error("No stories found in Storybook index.");
  }

  const server = await startStaticServer();
  const browser: Browser = await chromium.launch();
  const page = await browser.newPage();

  const manifest: Array<{ id: string; storyFile: string; snapshot: string }> = [];
  const failures: Array<{ id: string; error: string }> = [];
  let captured = 0;

  try {
    for (const entry of stories) {
      const storyFile = resolveStoryFile(entry.importPath);
      const snapshotDir = snapshotDirForStoryFile(storyFile);
      const fileName = `${slugify(entry.name || entry.id)}.png`;
      const outputPath = join(snapshotDir, fileName);

      try {
        await captureStory(page, entry, outputPath);
        manifest.push({ id: entry.id, storyFile, snapshot: outputPath });
        captured += 1;
        process.stdout.write(`Captured ${entry.title} / ${entry.name}\n`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ id: entry.id, error: message });
        process.stderr.write(`Failed ${entry.title} / ${entry.name}: ${message}\n`);
      }
    }
  } finally {
    await browser.close();
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => (error ? rejectClose(error) : resolveClose()));
    });
  }

  const appManifestPath = join(STORYBOOK_APP_DIR, "snapshots-manifest.json");
  const manifestBody = JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      count: captured,
      failures,
      snapshots: manifest.map((item) => ({
        ...item,
        storyFile: item.storyFile.replace(`${REPO_ROOT}/`, ""),
        snapshot: item.snapshot.replace(`${REPO_ROOT}/`, ""),
      })),
    },
    null,
    2,
  );

  await writeFile(appManifestPath, manifestBody);
  process.stdout.write(`\nSaved ${captured} snapshots`);
  if (failures.length > 0) {
    process.stdout.write(` (${failures.length} failed)`);
  }
  process.stdout.write(`.\nManifest: ${appManifestPath}\n`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
