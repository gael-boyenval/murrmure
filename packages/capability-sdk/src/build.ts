import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { computeBundleDigest } from "./digest.js";
import { stagePath } from "./paths.js";
import { copyUiStaticAssets, validateShellAssetReferences } from "./ui-assets.js";
import { validateCapabilityRoot } from "./validate.js";

const SDK_VERSION = "0.1.0";

const DEFAULT_SHELL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Capability</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./entry.js"></script>
</body>
</html>
`;

const DEFAULT_UI_ENTRY = `const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

function render(ctx) {
  root.innerHTML = \`<div style="font-family:system-ui;padding:16px">
    <h1>\${ctx?.packageId ?? "capability"}</h1>
    <p>Instance: \${ctx?.instanceId ?? "—"}</p>
  </div>\`;
}

window.addEventListener("message", (ev) => {
  if (ev.data?.type === "init") render(ev.data.ctx);
  if (ev.data?.type === "reload") window.location.reload();
});

export function mount(el, ctx) {
  render(ctx);
  return () => { el.innerHTML = ""; };
}
`;

const DEFAULT_SERVER_MOUNT = `export function mountRoutes(app, ctx) {
  app.get("/health", (c) => c.json({ ok: true, package: ctx.packageId, version: ctx.version }));
}
`;

export interface BuildOptions {
  outDir?: string;
}

export interface BuildResult {
  ok: boolean;
  stageDir: string;
  bundleDigest: string;
  errors?: Array<{ code: string; message: string }>;
}

function esbuildFailureErrors(error: unknown, code: string): Array<{ code: string; message: string }> {
  if (error && typeof error === "object" && "errors" in error) {
    const messages = (error as { errors: Array<{ text: string }> }).errors.map((entry) => entry.text);
    if (messages.length > 0) {
      return messages.map((message) => ({ code, message }));
    }
  }
  return [{ code, message: error instanceof Error ? error.message : String(error) }];
}

export async function buildCapabilityRoot(dir: string, opts?: BuildOptions): Promise<BuildResult> {
  const source = resolve(dir);
  const validation = validateCapabilityRoot(source);
  if (!validation.ok || !validation.manifest) {
    return {
      ok: false,
      stageDir: "",
      bundleDigest: "",
      errors: validation.errors,
    };
  }

  const manifest = validation.manifest;
  const stageDir = opts?.outDir ?? stagePath(manifest.id, manifest.version);
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });

  mkdirSync(join(stageDir, "contract"), { recursive: true });
  cpSync(join(source, "contract"), join(stageDir, "contract"), { recursive: true });

  mkdirSync(join(stageDir, "ui"), { recursive: true });
  mkdirSync(join(stageDir, "server"), { recursive: true });

  const uiSrc = join(source, "ui", "src", "mount.tsx");
  const uiSrcJs = join(source, "ui", "src", "mount.js");
  const uiEntryOut = join(stageDir, "ui", "entry.js");
  if (existsSync(uiSrc) || existsSync(uiSrcJs)) {
    try {
      const esbuild = await import("esbuild");
      await esbuild.build({
        entryPoints: [existsSync(uiSrc) ? uiSrc : uiSrcJs],
        absWorkingDir: source,
        bundle: true,
        format: "esm",
        outfile: uiEntryOut,
        platform: "browser",
        target: "es2022",
        jsx: "automatic",
        jsxImportSource: "react",
        loader: { ".css": "css" },
        logLevel: "warning",
      });
    } catch (error) {
      console.error("UI bundle failed:", error);
      return {
        ok: false,
        stageDir,
        bundleDigest: "",
        errors: esbuildFailureErrors(error, "UI_BUNDLE_FAILED"),
      };
    }
  } else {
    writeFileSync(uiEntryOut, DEFAULT_UI_ENTRY);
  }

  const shellHtmlSrc = join(source, manifest.ui.shell_html ?? "ui/shell.html");
  const stageUiDir = join(stageDir, "ui");
  copyUiStaticAssets(source, stageUiDir, manifest.ui.assets);
  writeFileSync(
    join(stageUiDir, "shell.html"),
    existsSync(shellHtmlSrc) ? readFileSync(shellHtmlSrc, "utf-8") : DEFAULT_SHELL_HTML,
  );

  const shellHtml = readFileSync(join(stageUiDir, "shell.html"), "utf-8");
  const assetErrors = validateShellAssetReferences(stageUiDir, shellHtml);
  if (assetErrors.length > 0) {
    return {
      ok: false,
      stageDir,
      bundleDigest: "",
      errors: assetErrors,
    };
  }

  const serverSrc = join(source, "server", "index.ts");
  const serverSrcJs = join(source, "server", "index.js");
  const serverOut = join(stageDir, "server", "mount.mjs");
  if (existsSync(serverSrc) || existsSync(serverSrcJs)) {
    try {
      const esbuild = await import("esbuild");
      await esbuild.build({
        entryPoints: [existsSync(serverSrc) ? serverSrc : serverSrcJs],
        bundle: true,
        format: "esm",
        outfile: serverOut,
        platform: "node",
        target: "node20",
        external: ["hono"],
        logLevel: "warning",
      });
    } catch (error) {
      console.error("Server bundle failed:", error);
      return {
        ok: false,
        stageDir,
        bundleDigest: "",
        errors: esbuildFailureErrors(error, "SERVER_BUNDLE_FAILED"),
      };
    }
  } else {
    writeFileSync(serverOut, DEFAULT_SERVER_MOUNT);
  }

  const resolvedManifest = {
    ...manifest,
    ui: { ...manifest.ui, entry: "ui/entry.js", shell_html: "ui/shell.html" },
    server: { mount_module: "server/mount.mjs" },
  };
  writeFileSync(join(stageDir, "manifest.json"), JSON.stringify(resolvedManifest, null, 2));

  const bundleDigest = await computeBundleDigest(stageDir);
  writeFileSync(join(stageDir, "bundle.digest"), bundleDigest + "\n");
  writeFileSync(
    join(stageDir, "build.meta.json"),
    JSON.stringify(
      {
        package_id: manifest.id,
        version: manifest.version,
        bundle_digest: bundleDigest,
        source_path: source,
        built_at: new Date().toISOString(),
        sdk_version: SDK_VERSION,
        ui_framework: "esbuild",
      },
      null,
      2,
    ),
  );

  const postValidation = validateCapabilityRoot(stageDir, { postBuild: true });
  if (!postValidation.ok) {
    return { ok: false, stageDir, bundleDigest, errors: postValidation.errors };
  }

  return { ok: true, stageDir, bundleDigest };
}
