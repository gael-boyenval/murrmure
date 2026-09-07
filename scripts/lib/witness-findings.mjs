/** Witness custom-adapter `--json` contract (doctrine slice 3.1). */

export function witnessArgv(argv = process.argv.slice(2)) {
  const pathIdx = argv.indexOf("--path");
  return {
    json: argv.includes("--json"),
    strict: argv.includes("--strict"),
    path: pathIdx >= 0 && argv[pathIdx + 1] ? argv[pathIdx + 1] : undefined,
  };
}

export function relFromRoot(repoRoot, absPath) {
  const norm = absPath.replace(/\\/g, "/");
  const root = repoRoot.replace(/\\/g, "/");
  return norm.startsWith(`${root}/`) ? norm.slice(root.length + 1) : norm;
}

export function pathMatches(file, pattern) {
  if (!pattern) return true;
  if (pattern.includes("*")) {
    const prefix = pattern.split("*")[0].replace(/\/$/, "");
    return file.startsWith(prefix);
  }
  return file.includes(pattern);
}

export function filterFindings(findings, pathPattern) {
  if (!pathPattern) return findings;
  return findings.filter((f) => pathMatches(f.file ?? "", pathPattern));
}

/** Write JSON findings to stdout; exit 1 if any error-severity finding. */
export function emitJsonFindings(findings) {
  const filtered = findings;
  process.stdout.write(`${JSON.stringify(filtered)}\n`);
  const failed = filtered.some((f) => f.severity === "error");
  process.exit(failed ? 1 : 0);
}
