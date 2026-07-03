/**
 * Electrobun launcher loads `app/bun/index.js` (entry basename must be `index.ts`).
 * Always bootstrap here — this file is only used as the Electrobun entrypoint, but it
 * runs inside a Worker where `import.meta.main` is false (side-effect imports of
 * `main.ts` are also tree-shaken for the same reason).
 */
import { bootstrapDesktopApp } from "../main.js";

bootstrapDesktopApp();
