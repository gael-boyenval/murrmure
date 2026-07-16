/**
 * Electrobun launcher loads `app/bun/index.js` (entry basename must be `index.ts`).
 * Always bootstrap here — this file runs inside a Worker where `import.meta.main` is false.
 */
import { reportStartupFailure } from "../errors.js";
import { bootstrapDesktopApp } from "../main.js";

void bootstrapDesktopApp().catch(async (error) => {
  await reportStartupFailure("Unable to start Murrmure desktop.", { cause: error });
  process.exit(1);
});
