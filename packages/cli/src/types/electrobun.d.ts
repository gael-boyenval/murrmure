// Ambient declaration for the Web Worker `self` global referenced by the
// `electrobun` dependency. electrobun ships TypeScript *source* (`.ts`, not
// `.d.ts`), so the repo-wide `skipLibCheck` does not suppress its type-checking,
// and it is pulled transitively into this package's compilation via a type-only
// import through `apps/desktop/src/menus.ts`. The CLI itself never runs in a
// worker context; this declaration only satisfies type-checking of that
// transitive dependency source. `MessageEvent` is already provided by
// `@types/node` web globals, so only `self` needs declaring.
declare const self: {
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  postMessage(message: unknown): void;
};
