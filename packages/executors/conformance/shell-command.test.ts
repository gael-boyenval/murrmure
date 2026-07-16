import { describe, expect, test } from "vitest";
import {
  HandlerBindingError,
  resolveSafeShellCommand,
  shellQuote,
  tokenizeShellCommand,
} from "../src/shell-command.js";

describe("shell-command shellQuote", () => {
  test("wraps a plain value in single quotes", () => {
    expect(shellQuote("hello")).toBe("'hello'");
  });

  test("escapes embedded single quotes", () => {
    expect(shellQuote("it's")).toBe(`'it'"'"'s'`);
  });

  test("leaves shell metacharacters as literal data", () => {
    expect(shellQuote("$(whoami); `rm -rf /` & | > $HOME")).toBe(
      `'$(whoami); \`rm -rf /\` & | > $HOME'`,
    );
  });
});

describe("shell-command grammar", () => {
  const resolve = (command: string, bindings: Record<string, string | null | undefined> = {}) =>
    resolveSafeShellCommand(command, bindings).script;

  test("substitutes a complete-argument placeholder with one quoted arg", () => {
    expect(resolve("cp {{src}} out.txt", { src: "/a b/spec.md" })).toBe(
      "cp '/a b/spec.md' out.txt",
    );
  });

  test("keeps apostrophes and spaces literal inside one argument", () => {
    expect(shellQuote("/Gael's/dir/spec.md")).toBe(`'/Gael'"'"'s/dir/spec.md'`);
    expect(resolve("cp {{src}} out.txt", { src: "/Gael's/dir/spec.md" })).toBe(
      `cp '/Gael'"'"'s/dir/spec.md' out.txt`,
    );
  });

  test("keeps shell metacharacters literal as data", () => {
    const evil = "$(rm -rf /);`whoami`>$HOME";
    expect(resolve("echo {{x}}", { x: evil })).toBe(`echo '${evil}'`);
  });

  test("keeps a leading dash literal (not a flag)", () => {
    expect(resolve("echo {{x}}", { x: "--rm-rf" })).toBe("echo '--rm-rf'");
  });

  test("keeps newlines and unicode literal as data", () => {
    expect(resolve("echo {{x}}", { x: "line1\nline2\némoïjî" })).toBe(
      "echo 'line1\nline2\némoïjî'",
    );
  });

  test("schema-valid empty string remains one empty argument", () => {
    expect(resolve("echo {{x}}", { x: "" })).toBe("echo ''");
  });

  test("preserves multiline command structure", () => {
    const script = resolve(
      "mkdir -p specs/current\ncp {{src}} specs/current/spec.md",
      { src: "/run/intake/spec.md" },
    );
    expect(script).toBe(
      "mkdir -p specs/current\ncp '/run/intake/spec.md' specs/current/spec.md",
    );
  });

  test("preserves author-quoted literal tokens", () => {
    expect(resolve('cp "my file" {{dst}}', { dst: "/out" })).toBe(`cp "my file" '/out'`);
  });

  test("preserves author-quoted single-quoted literals verbatim", () => {
    expect(resolve("cp 'my file' {{dst}}", { dst: "/out" })).toBe(`cp 'my file' '/out'`);
  });

  test("preserves a single-quoted format string before a placeholder", () => {
    expect(resolve("printf '%s' {{x}}", { x: "hello" })).toBe(`printf '%s' 'hello'`);
  });

  test("recognizes a hyphenated placeholder and substitutes it", () => {
    expect(
      resolve("cp {{murrmure.step.build.build-loop.artifact.spec.path}} out.md", {
        "murrmure.step.build.build-loop.artifact.spec.path": "/run/inputs/spec/spec.md",
      }),
    ).toBe("cp '/run/inputs/spec/spec.md' out.md");
  });

  test("rejects an unknown hyphenated placeholder", () => {
    expect(() => resolve("echo {{unknown-key}}", {})).toThrow(HandlerBindingError);
  });

  test("rejects author-added single quotes around a placeholder", () => {
    expect(() => resolve("cp '{{src}}' out", { src: "/a" })).toThrow(HandlerBindingError);
  });

  test("rejects author-added double quotes around a placeholder", () => {
    expect(() => resolve('cp "{{src}}" out', { src: "/a" })).toThrow(HandlerBindingError);
  });

  test("rejects embedded --flag={{value}} form", () => {
    expect(() => resolve("tool --src={{src}}", { src: "/a" })).toThrow(HandlerBindingError);
  });

  test("rejects prefix/suffix embedded placeholder", () => {
    expect(() => resolve("echo pre{{x}}post", { x: "v" })).toThrow(HandlerBindingError);
  });

  test("rejects two adjacent placeholders in one argument", () => {
    expect(() => resolve("echo {{a}}{{b}}", { a: "1", b: "2" })).toThrow(HandlerBindingError);
  });

  test("rejects unknown placeholder", () => {
    expect(() => resolve("echo {{nope}}", {})).toThrow(HandlerBindingError);
  });

  test("rejects missing/null binding before spawn", () => {
    expect(() => resolve("echo {{x}}", { x: null })).toThrow(HandlerBindingError);
    expect(() => resolve("echo {{x}}", { x: undefined })).toThrow(HandlerBindingError);
  });

  test("distinguishes missing key from empty string", () => {
    expect(() => resolve("echo {{x}}", {})).toThrow(HandlerBindingError);
    expect(resolve("echo {{x}}", { x: "" })).toBe("echo ''");
  });

  test("resolves dotted murrmure artifact path placeholder", () => {
    expect(
      resolve("cp {{murrmure.step.intake.artifact.spec.path}} specs/current/spec.md", {
        "murrmure.step.intake.artifact.spec.path": "/run/inputs/spec/spec.md",
      }),
    ).toBe("cp '/run/inputs/spec/spec.md' specs/current/spec.md");
  });
});

describe("shell-command prompt placeholder", () => {
  test("strips {{prompt}} when stripPrompt is set", () => {
    const r = resolveSafeShellCommand("cursor agent -p --force {{prompt}}", {}, {
      stripPrompt: true,
      promptText: "do the thing",
    });
    expect(r.script).toBe("cursor agent -p --force");
    expect(r.promptPlaceholderStripped).toBe(true);
  });

  test("substitutes {{prompt}} into argv when not stripped", () => {
    const r = resolveSafeShellCommand("cursor agent -p --force {{prompt}}", {}, {
      stripPrompt: false,
      promptText: "do the thing",
    });
    expect(r.script).toBe("cursor agent -p --force 'do the thing'");
    expect(r.promptPlaceholderStripped).toBe(false);
  });

  test("rejects quoted {{prompt}}", () => {
    expect(() =>
      resolveSafeShellCommand("cursor agent -p --force '{{prompt}}'", {}, { stripPrompt: true }),
    ).toThrow(HandlerBindingError);
  });
});

describe("shell-command tokenizer", () => {
  test("splits on spaces and newlines", () => {
    const tokens = tokenizeShellCommand("a b\nc d");
    expect(tokens.map((t) => t.raw)).toEqual(["a", "b", "c", "d"]);
    expect(tokens[2]!.sep).toBe("\n");
  });

  test("groups quoted strings into one token", () => {
    const tokens = tokenizeShellCommand('cp "my file" out');
    expect(tokens.map((t) => t.raw)).toEqual(["cp", '"my file"', "out"]);
  });
});
