import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { TutorialPart } from "./snapshots.js";
import { materializeTutorialSnapshot } from "./snapshots.js";

export interface TemporaryResource {
  root: string;
  cleanup: () => void;
}

function temporaryRoot(prefix: string): TemporaryResource {
  const root = mkdtempSync(join(tmpdir(), prefix));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

export interface TemporaryUserData extends TemporaryResource {
  home: string;
  userData: string;
  credentialStore: string;
  env: Readonly<Record<string, string>>;
}

export function createTemporaryUserData(
  prefix = "murrmure-tutorial-v3-user-",
): TemporaryUserData {
  const resource = temporaryRoot(prefix);
  const home = join(resource.root, "home");
  const userData = join(resource.root, "user-data");
  const credentialStore = join(resource.root, "credential-store");
  mkdirSync(join(home, ".murrmure"), { recursive: true });
  mkdirSync(userData, { recursive: true });
  mkdirSync(credentialStore, { recursive: true });
  return {
    ...resource,
    home,
    userData,
    credentialStore,
    env: Object.freeze({
      HOME: home,
      MURRMURE_USER_DATA_DIR: userData,
      MURRMURE_TEST_CREDENTIAL_STORE: credentialStore,
    }),
  };
}

export interface TemporaryTutorialSpace extends TemporaryResource {
  part: TutorialPart;
  spaceRoot: string;
  runRoot: string;
}

export function createTemporaryTutorialSpace(
  part: TutorialPart,
  prefix = `murrmure-tutorial-v3-part-${part}-`,
): TemporaryTutorialSpace {
  const resource = temporaryRoot(prefix);
  const spaceRoot = join(resource.root, "space");
  materializeTutorialSnapshot(part, spaceRoot);
  const runRoot = join(spaceRoot, ".mrmr", "dev", "runs");
  mkdirSync(runRoot, { recursive: true });
  return { ...resource, part, spaceRoot, runRoot };
}

export interface TemporaryGitRepository extends TemporaryResource {
  repository: string;
  git: (...args: string[]) => string;
}

export function createTemporaryGitRepository(
  prefix = "murrmure-tutorial-v3-git-",
): TemporaryGitRepository {
  const resource = temporaryRoot(prefix);
  const repository = join(resource.root, "repository");
  mkdirSync(repository, { recursive: true });
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: repository,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("init", "--quiet");
  git("config", "user.name", "Tutorial Fixture");
  git("config", "user.email", "tutorial-fixture@murrmure.invalid");
  writeFileSync(join(repository, "README.md"), "# Tutorial fixture\n", "utf8");
  git("add", "--", "README.md");
  git("commit", "--quiet", "-m", "chore: initialize tutorial fixture");
  return { ...resource, repository, git };
}

export interface TemporaryHub extends TemporaryResource {
  baseUrl: string;
  bootstrapToken: string;
  dataDir: string;
  productCounts: () => {
    spaces: number;
    contracts: number;
    installs: number;
    flows: number;
  };
  stop: () => Promise<void>;
}

export async function createTemporaryHub(
  prefix = "murrmure-tutorial-v3-hub-",
): Promise<TemporaryHub> {
  const resource = temporaryRoot(prefix);
  const dataDir = join(resource.root, "data");
  const bootstrapToken = "01JTUTORIALV3BOOTSTRAPTOKEN";
  const { startHubDaemon } = await import(
    "../../packages/hub-daemon/src/main.js"
  );
  const daemon = await startHubDaemon({
    databasePath: join(resource.root, "murrmure.db"),
    dataDir,
    defaultSpaceId: "",
    bootstrapToken,
    port: 0,
  });
  const address = daemon.server.address();
  const port = typeof address === "object" && address ? address.port : 8787;
  let stopped = false;
  const productCounts = () => {
    const count = (table: string): number =>
      Number((daemon.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
    return {
      spaces: count("spaces"),
      contracts: count("contract_refs"),
      installs: count("capability_installs"),
      flows: count("flow_index"),
    };
  };
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await daemon.shutdown();
    resource.cleanup();
  };
  return {
    ...resource,
    baseUrl: `http://127.0.0.1:${port}`,
    bootstrapToken,
    dataDir,
    productCounts,
    stop,
    cleanup: () => {
      void stop();
    },
  };
}

export interface FakeAgentAssignment {
  protocol: string;
  runId: string;
  stepId: string;
  prompt: string;
}

export interface FakeAgent extends TemporaryResource {
  assignments: string;
  record: (assignment: FakeAgentAssignment) => void;
  read: () => FakeAgentAssignment[];
  spawnRealMcpBridge: (
    command: string,
    args: readonly string[],
    env?: NodeJS.ProcessEnv,
  ) => ChildProcess;
}

export function createFakeAgent(
  prefix = "murrmure-tutorial-v3-agent-",
): FakeAgent {
  const resource = temporaryRoot(prefix);
  const assignments = join(resource.root, "assignments.jsonl");
  writeFileSync(assignments, "", "utf8");
  return {
    ...resource,
    assignments,
    record: (assignment) => {
      if (assignment.protocol !== "murrmure.agent/v1") {
        throw new Error(`Unsupported fake-agent protocol: ${assignment.protocol}`);
      }
      writeFileSync(assignments, `${JSON.stringify(assignment)}\n`, {
        encoding: "utf8",
        flag: "a",
      });
    },
    read: () => {
      const content = readFileSync(assignments, "utf8").trim();
      return content
        ? content.split("\n").map((line) => JSON.parse(line) as FakeAgentAssignment)
        : [];
    },
    spawnRealMcpBridge: (command, args, env) =>
      spawn(command, [...args], {
        env: { ...process.env, ...env },
        stdio: ["pipe", "pipe", "pipe"],
      }),
  };
}

export interface PackagedAppFixture {
  appPath: string;
  executablePath: string;
  exists: boolean;
  require: () => void;
}

export function packagedAppFixture(
  appPath = process.env.MURRMURE_PACKAGED_APP_PATH ??
    resolve("apps/desktop/release/mac/Murrmure.app"),
): PackagedAppFixture {
  const executablePath = join(
    appPath,
    "Contents",
    "MacOS",
    basename(appPath, ".app"),
  );
  const fixture = {
    appPath,
    executablePath,
    exists: existsSync(executablePath),
    require: () => {
      if (!existsSync(executablePath)) {
        throw new Error(
          `Packaged app missing at ${appPath}; build it or set MURRMURE_PACKAGED_APP_PATH`,
        );
      }
    },
  };
  return fixture;
}

