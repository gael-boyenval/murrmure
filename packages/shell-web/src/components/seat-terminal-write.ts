/** Must match `PERSISTENT_PTY_*` in `@murrmure/executors` persistent spawn. */
export const MEETING_PTY_COLS = 120;
export const MEETING_PTY_ROWS = 40;

/** RIS — clear the emulator before replacing a mismatched snapshot. */
export const TERM_RESET = "\x1bc";

export function nextPtyWrite(
  alreadyWritten: string,
  text: string,
): { reset: boolean; chunk: string } {
  if (text.startsWith(alreadyWritten)) {
    return { reset: false, chunk: text.slice(alreadyWritten.length) };
  }
  return { reset: true, chunk: text };
}
