/**
 * Safe shell handler command resolution.
 *
 * Enforces the Tutorial v3 Part 5 handler command grammar:
 * - Each dynamic placeholder occupies one complete unquoted argument.
 * - Runtime shell-quotes each placeholder value exactly once.
 * - Author-added quotes (`'{{x}}'`, `"{{x}}"`), embedded forms (`--flag={{x}}`,
 *   `pre{{x}}post`), and unknown placeholders are rejected before spawn.
 * - A missing/null binding fails with `HANDLER_BINDING_VALUE_MISSING`; a
 *   schema-valid empty string remains one empty argument.
 *
 * The resolved script is executed as `/bin/sh -e -c "<script>"` (see
 * `shell-spawn.ts`). Multiline commands preserve their newlines.
 */

export class HandlerBindingError extends Error {
  constructor(
    public readonly code:
      | "HANDLER_BINDING_VALUE_MISSING"
      | "HANDLER_UNKNOWN_PLACEHOLDER"
      | "HANDLER_PLACEHOLDER_QUOTED"
      | "HANDLER_PLACEHOLDER_EMBEDDED",
    message: string,
  ) {
    super(message);
    this.name = "HandlerBindingError";
  }
}

/** Single-quoted string safe for /bin/sh -c. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

// Hyphens are included so step ids like `build.build-loop` resolve; a
// placeholder that contains a hyphen is recognized (and rejected as unknown
// when unbound) instead of silently passing through as a literal fragment.
const PLACEHOLDER_EXACT_RE = /^\{\{([\w.-]+)\}\}$/;
const CONTAINS_PLACEHOLDER_RE = /\{\{[\w.-]+\}\}/;

interface TokenSegment {
  /** true if this segment came from a quoted string (author quotes). */
  quoted: boolean;
  text: string;
}

interface Token {
  /** Whitespace/newlines preceding this token (preserved on emit). */
  sep: string;
  /** Original raw token text including any author quotes. */
  raw: string;
  segments: TokenSegment[];
}

/**
 * Quote-aware tokenizer. Whitespace and newlines separate tokens; single and
 * double quotes group characters into one segment. A backslash escapes the
 * next character outside quotes. Separators are preserved so authored
 * formatting (including newlines) can be re-emitted verbatim.
 */
export function tokenizeShellCommand(command: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let sep = "";
  let inSingle = false;
  let inDouble = false;
  let segments: TokenSegment[] = [];
  let current = "";
  let currentQuoted = false;
  let raw = "";

  const flushBare = () => {
    if (current !== "" && !currentQuoted) {
      segments.push({ quoted: false, text: current });
      current = "";
    }
  };
  const flushQuoted = () => {
    if (currentQuoted) {
      segments.push({ quoted: true, text: current });
      current = "";
      currentQuoted = false;
    }
  };
  const flushAll = () => {
    flushBare();
    flushQuoted();
  };
  const pushToken = () => {
    flushAll();
    if (segments.length > 0) {
      tokens.push({ sep, raw, segments });
    }
    segments = [];
    raw = "";
  };

  while (i < command.length) {
    const ch = command[i]!;
    if (inSingle) {
      if (ch === "'") {
        // Preserve the closing quote in `raw` so authored single-quoted
        // literals re-emit verbatim; it is a delimiter, not segment content.
        raw += ch;
        inSingle = false;
        i += 1;
        continue;
      }
      current += ch;
      raw += ch;
      i += 1;
      continue;
    }
    if (inDouble) {
      raw += ch;
      if (ch === '"' && command[i - 1] !== "\\") {
        inDouble = false;
        i += 1;
        continue;
      }
      current += ch;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      flushBare();
      currentQuoted = true;
      raw += ch;
      if (ch === "'") inSingle = true;
      else inDouble = true;
      i += 1;
      continue;
    }
    if (ch === "\\") {
      flushQuoted();
      current += command[i + 1] ?? "";
      raw += ch;
      raw += command[i + 1] ?? "";
      i += 2;
      continue;
    }
    if (/\s/.test(ch)) {
      if (segments.length > 0 || current !== "" || currentQuoted) {
        pushToken();
        sep = "";
      }
      sep += ch;
      i += 1;
      continue;
    }
    flushQuoted();
    current += ch;
    raw += ch;
    i += 1;
  }
  if (segments.length > 0 || current !== "" || currentQuoted) {
    pushToken();
  }
  return tokens;
}

export interface ResolvedSafeShell {
  script: string;
  /** True when a `{{prompt}}` placeholder was present and stripped (delivered via stdin). */
  promptPlaceholderStripped: boolean;
}

export interface ResolveSafeShellOptions {
  /**
   * When true, a `{{prompt}}` complete-argument placeholder is removed from
   * the script (the caller delivers the prompt via stdin) instead of being
   * substituted into argv.
   */
  stripPrompt?: boolean;
  /** Prompt text; used only when `{{prompt}}` is substituted into argv. */
  promptText?: string;
}

/**
 * Resolve a handler `command` into a safe `/bin/sh -e -c` script.
 *
 * `bindings` is keyed by the full placeholder key (e.g. `murrmure.step.intake.
 * artifact.spec.path`, `space_root`, `instruction`). The reserved `prompt`
 * key is handled via `stripPrompt`/`promptText` and never looked up in
 * `bindings`. Throws `HandlerBindingError` on any grammar or binding
 * violation.
 */
export function resolveSafeShellCommand(
  command: string,
  bindings: Record<string, string | null | undefined>,
  options: ResolveSafeShellOptions = {},
): ResolvedSafeShell {
  const tokens = tokenizeShellCommand(command);
  let promptPlaceholderStripped = false;
  const parts: string[] = [];

  for (const token of tokens) {
    const placeholderInToken = token.segments.some((seg) =>
      CONTAINS_PLACEHOLDER_RE.test(seg.text),
    );
    if (!placeholderInToken) {
      parts.push(token.sep, token.raw);
      continue;
    }

    // The token contains at least one placeholder. The only valid form is a
    // single bare segment whose text is exactly `{{key}}`.
    if (token.segments.length === 1 && !token.segments[0]!.quoted) {
      const exact = PLACEHOLDER_EXACT_RE.exec(token.segments[0]!.text);
      if (exact) {
        const key = exact[1]!;
        const emission = substitutePlaceholder(key, bindings, options, () => {
          promptPlaceholderStripped = true;
        });
        // A stripped placeholder (prompt via stdin) is removed together with
        // its preceding separator so no dangling whitespace remains.
        if (emission === null) continue;
        parts.push(token.sep, emission);
        continue;
      }
    }
    // Otherwise it is either a quoted placeholder or an embedded placeholder.
    if (token.segments.length === 1 && token.segments[0]!.quoted) {
      throw new HandlerBindingError(
        "HANDLER_PLACEHOLDER_QUOTED",
        `Placeholder '${token.segments[0]!.text}' must not be quoted; remove the surrounding quotes`,
      );
    }
    throw new HandlerBindingError(
      "HANDLER_PLACEHOLDER_EMBEDDED",
      `Placeholder in token '${token.raw}' must occupy one complete argument`,
    );
  }

  const script = promptPlaceholderStripped
    ? parts.join("").replace(/^\s+|\s+$/g, "")
    : parts.join("");
  return { script, promptPlaceholderStripped };
}

function substitutePlaceholder(
  key: string,
  bindings: Record<string, string | null | undefined>,
  options: ResolveSafeShellOptions,
  markPromptStripped: () => void,
): string | null {
  if (key === "prompt") {
    if (options.stripPrompt) {
      markPromptStripped();
      return null;
    }
    return shellQuote(options.promptText ?? "");
  }
  if (!(key in bindings)) {
    throw new HandlerBindingError(
      "HANDLER_UNKNOWN_PLACEHOLDER",
      `Unknown placeholder '{{${key}}}' has no binding`,
    );
  }
  const value = bindings[key];
  if (value === null || value === undefined) {
    throw new HandlerBindingError(
      "HANDLER_BINDING_VALUE_MISSING",
      `Binding '{{${key}}}' is missing or null`,
    );
  }
  return shellQuote(value);
}
