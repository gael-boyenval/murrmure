import type { HubAuth } from "../auth.js";
import { hubFetch, mapHubDenial } from "../lib/hub-request.js";
import { readSpaceApplyBundle, readSpaceSlug, validateSpaceBundleCycles } from "../lib/space-directory.js";
import { defaultLinkHost, readSpaceLink, writeSpaceLink } from "../lib/space-link-file.js";
import { scaffoldMurrmureDir } from "../lib/space-scaffold.js";
import { runGlobalScopePreflight, runScopePreflight } from "../lib/preflight.js";
import { createSpaceOnHub } from "../commands/space/commands.js";
import { installMurrmureSkill } from "../skill/install.js";
import type { GlobalFlags } from "../lib/flags.js";

export class WizardHubError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint?: unknown,
  ) {
    super(message);
    this.name = "WizardHubError";
  }
}

async function parseHubResponse(res: Response): Promise<Record<string, unknown>> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const denial = mapHubDenial(res.status, body);
    throw new WizardHubError(denial.code, denial.message, "hint" in denial ? denial.hint : undefined);
  }
  return body;
}

export async function wizardSpaceInit(
  projectPath: string,
  options?: { withSkill?: boolean; withExamples?: boolean },
): Promise<{ created: string[]; skill_installed: boolean; skill_path?: string }> {
  const { created } = scaffoldMurrmureDir(projectPath, { withExamples: options?.withExamples });
  let skill_installed = false;
  let skill_path: string | undefined;
  if (options?.withSkill) {
    const result = installMurrmureSkill(projectPath);
    skill_installed = true;
    skill_path = result.path;
  }
  return { created, skill_installed, skill_path };
}

export async function wizardSpaceLink(
  flags: GlobalFlags,
  projectPath: string,
  options?: { spaceId?: string; create?: boolean },
): Promise<{ space_id: string; created: boolean }> {
  let spaceId = options?.spaceId ?? flags.space;
  let created = false;
  let auth: HubAuth;

  if (!spaceId && options?.create) {
    const preflight = await runGlobalScopePreflight(flags, "space:admin");
    auth = preflight.auth;
    const slug = readSpaceSlug(projectPath) ?? "my-space";
    const space = await createSpaceOnHub(auth, { slug, name: slug });
    spaceId = space.space_id;
    created = true;
    const linkPreflight = await runScopePreflight(flags, "space:write", spaceId);
    auth = linkPreflight.auth;
    spaceId = linkPreflight.spaceId;
  } else {
    if (!spaceId) {
      throw new WizardHubError(
        "USAGE",
        "Missing space id — pass --space or use --create to mint from murrmure/space.yaml",
      );
    }
    const preflight = await runScopePreflight(flags, "space:write", spaceId);
    auth = preflight.auth;
    spaceId = preflight.spaceId;
  }

  const host = defaultLinkHost();
  const res = await hubFetch(auth, `/v1/spaces/${spaceId}/link`, {
    method: "POST",
    json: { host, path: projectPath, primary: true },
  });
  await parseHubResponse(res);
  writeSpaceLink(projectPath, { space_id: spaceId, path: projectPath, host });
  return { space_id: spaceId, created };
}

export async function wizardSpaceApply(
  flags: GlobalFlags,
  projectPath: string,
  spaceId: string,
): Promise<Record<string, unknown>> {
  const bundle = readSpaceApplyBundle(projectPath);
  validateSpaceBundleCycles(bundle);
  const { auth } = await runScopePreflight(flags, "space:write", spaceId);
  const res = await hubFetch(auth, `/v1/spaces/${spaceId}/apply`, {
    method: "POST",
    json: { bundle },
  });
  return parseHubResponse(res);
}

export async function wizardSpaceStatus(
  flags: GlobalFlags,
  projectPath: string,
  spaceId?: string,
): Promise<{ space_id: string; counts: Record<string, number> }> {
  const link = readSpaceLink(projectPath);
  const resolvedSpaceId = spaceId ?? flags.space ?? link?.space_id;
  if (!resolvedSpaceId) {
    throw new WizardHubError("USAGE", "Missing space id — run link first or pass --space");
  }
  const { auth } = await runScopePreflight(flags, "space:read", resolvedSpaceId);
  const res = await hubFetch(auth, `/v1/spaces/${resolvedSpaceId}/index/status`);
  const body = await parseHubResponse(res);
  const counts = (body.counts as Record<string, number> | undefined) ?? {};
  return { space_id: resolvedSpaceId, counts };
}
