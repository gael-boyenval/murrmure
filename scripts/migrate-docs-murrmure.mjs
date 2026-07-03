#!/usr/bin/env node
/**
 * Rebrand apps/docs user-facing content to Murrmure / flow vocabulary.
 * Run: node scripts/migrate-docs-murrmure.mjs
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DOCS_ROOT = join(process.cwd(), "apps/docs");

// Order matters — longer / more specific patterns first.
const REPLACEMENTS = [
  // URLs
  ["https://app.studio.dev/signup", "https://app.murrmure.dev/signup"],
  ["https://app.studio.dev", "https://app.murrmure.dev"],
  ["https://api.studio.dev", "https://api.murrmure.dev"],
  ["app.studio.dev/signup", "app.murrmure.dev/signup"],
  ["app.studio.dev", "app.murrmure.dev"],
  ["api.studio.dev", "api.murrmure.dev"],

  // File paths (links) — renamed guide/reference pages
  ["../guide/capabilities-tutorial", "../guide/flows-tutorial"],
  ["./capabilities-tutorial", "./flows-tutorial"],
  ["/guide/capabilities-tutorial", "/guide/flows-tutorial"],
  ["../guide/creating-capabilities", "../guide/creating-flows"],
  ["./creating-capabilities", "./creating-flows"],
  ["/guide/creating-capabilities", "/guide/creating-flows"],
  ["../guide/capability-evolution", "../guide/flow-evolution"],
  ["./capability-evolution", "./flow-evolution"],
  ["/guide/capability-evolution", "/guide/flow-evolution"],
  ["../guide/why-studio", "../guide/why-murrmure"],
  ["./why-studio", "./why-murrmure"],
  ["/guide/why-studio", "/guide/why-murrmure"],
  ["./capability-sdk", "./flow-dev-kit"],
  ["../reference/capability-sdk", "../reference/flow-dev-kit"],
  ["/reference/capability-sdk", "/reference/flow-dev-kit"],

  // Packages — specific before generic
  ["@studio/capability-dev-kit/react", "@murrmure/flow-dev-kit/react"],
  ["@studio/capability-dev-kit", "@murrmure/flow-dev-kit"],
  ["@studio/capability-sdk/host", "@murrmure/flow-dev-kit/host"],
  ["@studio/capability-sdk/server", "@murrmure/flow-dev-kit/server"],
  ["@studio/capability-sdk", "@murrmure/cli"],
  ["@studio/hub-mcp", "@murrmure/cli"],
  ["@studio/hub-cli", "@murrmure/cli"],
  ["@studio/cli", "@murrmure/cli"],
  ["@studio/skill", "@murrmure/skill"],
  ["@murrmure/hub-daemon", "@murrmure/hub-daemon"],
  ["@studio/hub", "@murrmure/hub"],
  ["@murrmure/shell-web", "@murrmure/shell-web"],
  ["@murrmure/docs", "@murrmure/docs"],

  // MCP config blocks
  ['"command": "studio-hub-mcp"', '"command": "murrmure",\n      "args": ["mcp"]'],
  ['"command": "murrmure-mcp"', '"command": "murrmure",\n      "args": ["mcp"]'],
  ['"studio-hub-mcp"', '"murrmure"'],
  ['"murrmure-mcp"', '"murrmure"'],
  ['"studio": {', '"murrmure": {'],
  ["npx @studio/hub-mcp", "npx @murrmure/cli mcp"],
  ["npm install -g @studio/hub-mcp", "npm install -g @murrmure/cli"],
  ["studio-hub-mcp", "murrmure"],

  // Env vars
  ["STUDIO_DEPLOY_TOKEN", "MURRMURE_DEPLOY_TOKEN"],
  ["STUDIO_HUB_TOKEN", "MURRMURE_HUB_TOKEN"],
  ["STUDIO_HUB_URL", "MURRMURE_HUB_URL"],
  ["STUDIO_SPACE_ID", "MURRMURE_SPACE_ID"],
  ["STUDIO_INSTALL_ID", "MURRMURE_INSTALL_ID"],
  ["STUDIO_TOKEN", "MURRMURE_TOKEN"],
  ["STUDIO_DATA_DIR", "MURRMURE_DATA_DIR"],

  // Paths & files
  ["~/.studio/capabilities/", "~/.murrmure/flows/"],
  ["~/.studio/hubs/", "~/.murrmure/hubs/"],
  ["~/.studio/", "~/.murrmure/"],
  ["capability.manifest.json", "flow.manifest.json"],
  ["studio.capability.yaml", "murrmure.flow.yaml"],
  ["/capabilities/", "/flows/"],
  ["capability:install", "flow:install"],

  // Commands
  ["studio-capability", "murrmure-flow"],
  ["studio capability", "mrmr flow"],
  ["studio skill", "mrmr skill"],
  ["studio login", "mrmr login"],
  ["studio whoami", "mrmr whoami"],
  ["studio health", "mrmr health"],
  ["studio-hub serve", "murrmure-hub serve"],
  ["npx studio ", "npx mrmr "],
  ["`studio`", "`mrmr`"],
  ['Binaries: `studio`, `murrmure-flow`', "Binaries: `murrmure`, `mrmr`"],
  ['Binaries: `studio`, `studio-capability`', "Binaries: `murrmure`, `mrmr`"],

  // Terminology — SDK/CDK
  ["Capability Developer Kit (CDK)", "Flow Dev Kit (FDK)"],
  ["Capability SDK CLI", "Flow Dev Kit CLI"],
  ["Capability SDK", "Flow Dev Kit"],
  ["capability-sdk", "flow-dev-kit"],
  ["(CDK)", "(FDK)"],
  [" CDK ", " FDK "],
  ["the CDK", "the FDK"],
  ["with the CDK", "with the FDK"],
  ["using the CDK", "using the FDK"],

  // Skill paths
  [".cursor/skills/studio-capability/", ".cursor/skills/murrmure-flow/"],
  ["studio-capability skill", "murrmure-flow skill"],
  ["`studio-capability`", "`murrmure-flow`"],

  // Product name (after package names to avoid double-replace)
  ["Why Studio", "Why Murrmure"],
  ["Studio Cloud", "Murrmure Cloud"],
  ["Studio ships", "Murrmure ships"],
  ["Studio platform", "Murrmure platform"],
  ["Agent Studio", "Murrmure"],
  ["Studio —", "Murrmure —"],
  ["Studio tools", "Murrmure tools"],
  ["call Studio", "call Murrmure"],
  ["use Studio", "use Murrmure"],
  ["Install Studio", "Install Murrmure"],
  ["Studio hub", "Murrmure hub"],
  ["Studio shell", "Murrmure shell"],
  ["Studio MCP", "Murrmure MCP"],
  ["Studio CLI", "Murrmure CLI"],
  ["Studio HTTP", "Murrmure HTTP"],
  ["Studio API", "Murrmure API"],
  ["Studio workspace", "Murrmure workspace"],
  ["Studio account", "Murrmure account"],
  ["Studio browser", "Murrmure browser"],
  ["Studio runtime", "Murrmure runtime"],
  ["Studio Configure", "Murrmure Configure"],
  ["Studio Runtime", "Murrmure Runtime"],
  ["Studio evolution", "Murrmure evolution"],
  ["Studio model", "Murrmure model"],
  ["Studio packages", "Murrmure packages"],
  ["Studio package", "Murrmure package"],
  ["Studio monorepo", "Murrmure monorepo"],
  ["Studio platform monorepo", "Murrmure platform monorepo"],
  ["Studio docs", "Murrmure docs"],
  ["Studio dev", "Murrmure dev"],
  ["Studio URL", "Murrmure URL"],
  ["studio_url", "murrmure_url"],
  ["studio.acme.com", "murrmure.acme.com"],
  ["studio.yourcompany.com", "murrmure.yourcompany.com"],
  ["/var/lib/studio/", "/var/lib/murrmure/"],
  ["murrmure.db", "murrmure.db"],

  // Capability → flow (product noun) — careful ordering
  ["custom capabilities from scratch", "custom flows from scratch"],
  ["custom capabilities", "custom flows"],
  ["user-created capability", "user-created flow"],
  ["User capabilities", "User flows"],
  ["user capabilities", "user flows"],
  ["No capabilities in", "No flows in"],
  ["Push a capability", "Push a flow"],
  ["Install capability", "Install flow"],
  ["Build capability", "Build flow"],
  ["Scaffold capability", "Scaffold flow"],
  ["creating capabilities", "creating flows"],
  ["Creating capabilities", "Creating flows"],
  ["Capabilities tutorial", "Flows tutorial"],
  ["capabilities tutorial", "flows tutorial"],
  ["Capability evolution", "Flow evolution"],
  ["capability evolution", "flow evolution"],
  ["Capability builders", "Flow builders"],
  ["capability builders", "flow builders"],
  ["Capability building", "Flow building"],
  ["capability-building", "flow-building"],
  ["capability repo", "flow repo"],
  ["capability repository", "flow repository"],
  ["capability package", "flow package"],
  ["capability packages", "flow packages"],
  ["capability project", "flow project"],
  ["capability code", "flow code"],
  ["capability contract", "flow contract"],
  ["capability contracts", "flow contracts"],
  ["capability tools", "flow tools"],
  ["capability tool", "flow tool"],
  ["capability worker", "flow worker"],
  ["capability workers", "flow workers"],
  ["capability bundle", "flow bundle"],
  ["capability bundles", "flow bundles"],
  ["capability installs", "flow installs"],
  ["capability install", "flow install"],
  ["capability canvas", "flow canvas"],
  ["capability UI", "flow UI"],
  ["capability server", "flow server"],
  ["capability route", "flow route"],
  ["capability routes", "flow routes"],
  ["capability API", "flow API"],
  ["capability MCP", "flow MCP"],
  ["capability access", "flow access"],
  ["capability ACL", "flow ACL"],
  ["Capability ACL", "Flow ACL"],
  ["capability change", "flow change"],
  ["capability development", "flow development"],
  ["capability author", "flow author"],
  ["capability author", "flow author"],
  ["author capabilities", "author flows"],
  ["author a capability", "author a flow"],
  ["Author a capability", "Author a flow"],
  ["authoring capabilities", "authoring flows"],
  ["authoring a capability", "authoring a flow"],
  ["build capabilities", "build flows"],
  ["Build capabilities", "Build flows"],
  ["push capabilities", "push flows"],
  ["run a capability", "run a flow"],
  ["run capability", "run flow"],
  ["What is a capability?", "What is a flow?"],
  ["What is a capability", "What is a flow"],
  ["a capability is", "a flow is"],
  ["A capability is", "A flow is"],
  ["the capability", "the flow"],
  ["The capability", "The flow"],
  ["your capability", "your flow"],
  ["Your capability", "Your flow"],
  ["my capability", "my flow"],
  ["each capability", "each flow"],
  ["Each capability", "Each flow"],
  ["one capability", "one flow"],
  ["One capability", "One flow"],
  ["new capability", "new flow"],
  ["New capability", "New flow"],
  ["live capability", "live flow"],
  ["custom capability", "custom flow"],
  ["orchestrator capability", "orchestrator flow"],
  ["preview-review capability", "preview-review flow"],
  ["orchestrator-capability", "orchestrator-flow"],
  ["scaffold-capability", "scaffold-flow"],
  ["build-orchestrator-capability", "build-orchestrator-flow"],
  ["Capabilities", "Flows"],
  ["capabilities", "flows"],
  ["Capability", "Flow"],
  ["capability", "flow"],
];

function transform(content) {
  let out = content;
  for (const [from, to] of REPLACEMENTS) {
    out = out.split(from).join(to);
  }
  return out;
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".vitepress/cache") continue;
      walk(path);
    } else if (name.endsWith(".md") || name === "config.ts") {
      const original = readFileSync(path, "utf8");
      const updated = transform(original);
      if (updated !== original) {
        writeFileSync(path, updated);
        console.log("updated:", path.replace(process.cwd() + "/", ""));
      }
    }
  }
}

walk(DOCS_ROOT);
console.log("done");
