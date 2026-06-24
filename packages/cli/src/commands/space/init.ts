import * as p from "@clack/prompts";
import { defineCommand, type CommandDef } from "citty";
import { DEFAULT_HUB_URL } from "../../auth.js";
import { validateAndSaveLogin } from "../auth.js";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { hubFetch, mapHubDenial } from "../../lib/hub-request.js";
import { printErr } from "../../lib/output.js";
import { runGlobalScopePreflight } from "../../lib/preflight.js";
import { createSpaceOnHub } from "./commands.js";

const DEFAULT_SPACES = [
  { slug: "ui-sandbox", name: "UI Sandbox" },
  { slug: "ui-production", name: "UI Production" },
] as const;

const WORKER_SCOPES = [
  "space:read",
  "event:read",
  "state:transition",
  "event:emit",
  "blob:read",
  "blob:write",
];

async function confirmStep(message: string): Promise<boolean> {
  const answer = await p.confirm({ message, initialValue: true });
  if (p.isCancel(answer)) {
    p.cancel("Setup cancelled — partial progress saved");
    process.exit(0);
  }
  return Boolean(answer);
}

export const spaceInitCommand = defineCommand({
  meta: {
    name: "init",
    description: "Interactive first-run setup wizard (Requires: space:admin)",
  },
  args: globalArgs,
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    if (flags.json) {
      printErr("USAGE", "space init is interactive — omit --json");
    }

    p.intro("Murrmure space setup");

    // Step 1 — Connect
    if (await confirmStep("Step 1 — Connect hub URL and token?")) {
      const hubAnswer = await p.text({
        message: "Hub URL",
        placeholder: DEFAULT_HUB_URL,
        defaultValue: DEFAULT_HUB_URL,
      });
      if (p.isCancel(hubAnswer)) {
        p.cancel("Setup cancelled");
        process.exit(0);
      }
      const hubUrl = String(hubAnswer).trim() || DEFAULT_HUB_URL;

      const tokenAnswer = await p.password({
        message: "Bearer token (tok_…)",
        validate(value) {
          if (!value?.trim()) return "Token is required";
        },
      });
      if (p.isCancel(tokenAnswer)) {
        p.cancel("Setup cancelled");
        process.exit(0);
      }

      const login = await validateAndSaveLogin(hubUrl, String(tokenAnswer));
      if (!login.ok) {
        printErr(login.code, login.message);
      }
      p.log.success(`Connected as ${login.whoami.actor_id}`);
    } else {
      p.log.info("Skipped connect — using saved credentials or env");
    }

    const { auth } = await runGlobalScopePreflight(flags, "space:admin");

    const createdSpaceIds: string[] = [];

    // Step 2 — Create spaces
    if (await confirmStep("Step 2 — Create default spaces (ui-sandbox, ui-production)?")) {
      for (const defaults of DEFAULT_SPACES) {
        const useDefaults = await p.confirm({
          message: `Create ${defaults.slug} (${defaults.name})?`,
          initialValue: true,
        });
        if (p.isCancel(useDefaults)) {
          p.cancel("Setup cancelled — partial progress saved");
          process.exit(0);
        }
        if (!useDefaults) continue;

        const slugAnswer = await p.text({
          message: "Slug",
          defaultValue: defaults.slug,
        });
        if (p.isCancel(slugAnswer)) {
          p.cancel("Setup cancelled — partial progress saved");
          process.exit(0);
        }

        const nameAnswer = await p.text({
          message: "Name",
          defaultValue: defaults.name,
        });
        if (p.isCancel(nameAnswer)) {
          p.cancel("Setup cancelled — partial progress saved");
          process.exit(0);
        }

        const space = await createSpaceOnHub(auth, {
          slug: String(slugAnswer).trim() || defaults.slug,
          name: String(nameAnswer).trim() || defaults.name,
        });
        createdSpaceIds.push(space.space_id);
        p.log.success(`Created ${space.space_id}`);
      }
    } else {
      p.log.info("Skipped space creation");
    }

    const sandboxId = createdSpaceIds[0] ?? "spc_ui_sandbox";

    // Step 3 — Link workflow
    if (await confirmStep("Step 3 — Show flow init + push instructions?")) {
      p.note(
        [
          "Build and push a workflow from your machine:",
          "",
          "  mrmr flow init my-flow --dir ./workflows/my-flow",
          "  mrmr flow validate .",
          "  mrmr flow build .",
          `  mrmr flow push --space ${sandboxId}`,
          `  mrmr flow apply --space ${sandboxId} --install ins_…`,
        ].join("\n"),
        "Link workflow",
      );
    }

    // Step 4 — Validate & test
    if (await confirmStep("Step 4 — Show evolution validate/test commands?")) {
      p.note(
        [
          `  mrmr flow validate --space ${sandboxId} --install ins_…`,
          `  mrmr flow test --space ${sandboxId} --install ins_…`,
          `  mrmr flow promote --space ${sandboxId} --install ins_…`,
        ].join("\n"),
        "Validate & test",
      );
    }

    // Step 5 — Agent access
    if (await confirmStep("Step 5 — Mint a worker grant for agent access?")) {
      const targetSpace =
        createdSpaceIds[0] ??
        (await p.text({
          message: "Space id for worker grant",
          placeholder: sandboxId,
        }));
      if (p.isCancel(targetSpace)) {
        p.cancel("Setup cancelled — partial progress saved");
        process.exit(0);
      }
      const spaceId = String(targetSpace).trim() || sandboxId;

      const res = await hubFetch(auth, `/v1/spaces/${spaceId}/grants`, {
        method: "POST",
        json: {
          label: "Worker agent",
          harness: "cursor-local",
          scopes: WORKER_SCOPES,
          flow_acl: [],
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const denial = mapHubDenial(res.status, body);
        p.log.warn(`Grant mint failed: ${denial.message}`);
      } else {
        const token = typeof body.token === "string" ? body.token : undefined;
        if (token) {
          p.note(
            `Save this token now — it will not be shown again:\n\n  ${token}`,
            "One-time grant token",
          );
        } else {
          p.log.success("Grant minted");
        }
      }
    }

    // Step 6 — Invite team
    if (await confirmStep("Step 6 — Invite team members?")) {
      p.note(
        "Use Configure → Members in the browser, or run:\n\n  mrmr space member invite --space <spc_id> --email … --role editor",
        "Invite team",
      );
    }

    // Step 7 — Verify
    p.note(
      [
        `Hub: ${auth.hubUrl}`,
        "",
        "  mrmr doctor",
        "  mrmr whoami",
        `  mrmr runtime events --space ${sandboxId}`,
      ].join("\n"),
      "Verify setup",
    );

    p.outro("Setup complete");
  },
}) as CommandDef;
