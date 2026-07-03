/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  options: {
    exclude: { path: "node_modules" },
  },
  forbidden: [
    {
      name: "kernel-no-persistence",
      severity: "error",
      from: { path: "^packages/runtime-kernel/src/" },
      to: { path: "^packages/runtime-persistence/" },
    },
    {
      name: "contracts-no-kernel",
      severity: "error",
      from: { path: "^packages/runtime-contracts/src/" },
      to: { path: "^packages/runtime-(kernel|persistence)/" },
    },
    {
      name: "persistence-no-domain",
      severity: "error",
      from: { path: "^packages/runtime-persistence/src/" },
      to: { path: "^packages/runtime-kernel/src/" },
    },
    {
      name: "adapter-http-no-persistence",
      severity: "error",
      from: { path: "^packages/runtime-adapter-http/src/" },
      to: { path: "^packages/runtime-persistence/" },
    },
    {
      name: "kernel-no-murrmure-domain",
      severity: "error",
      from: { path: "^packages/runtime-kernel/" },
      to: { path: "^packages/(contracts|hub-|executors)" },
    },
    {
      name: "contracts-leaf",
      severity: "error",
      from: { path: "^packages/contracts/" },
      to: { path: "^packages/(runtime-|hub-|executors)" },
    },
    {
      name: "hub-core-no-persistence",
      severity: "error",
      from: { path: "^packages/hub-core/src/" },
      to: { path: "^packages/hub-persistence/" },
    },
    {
      name: "hub-core-no-fs",
      severity: "error",
      from: { path: "^packages/hub-core/src/" },
      to: { path: "^node:fs" },
    },
    {
      name: "hub-core-no-hono",
      severity: "error",
      from: { path: "^packages/hub-core/src/" },
      to: { path: "^hono" },
    },
    {
      name: "hub-core-no-sqlite",
      severity: "error",
      from: { path: "^packages/hub-core/" },
      to: { path: "better-sqlite3" },
    },
    {
      name: "shell-client-leaf",
      severity: "error",
      from: { path: "^packages/shell-client/" },
      to: { path: "^packages/", pathNot: "^packages/(shell-client|contracts)/" },
    },
    {
      name: "shell-ui-no-hub",
      severity: "error",
      from: { path: "^packages/shell-ui/" },
      to: { path: "^packages/(contracts|hub-|executors|runtime-)" },
    },
    {
      name: "view-sdk-leaf",
      severity: "error",
      from: { path: "^packages/view-sdk/" },
      to: { path: "^packages/", pathNot: "^packages/(view-sdk|contracts)/" },
    },
    {
      name: "shell-no-kernel",
      severity: "error",
      from: { path: "^packages/shell-web/" },
      to: { path: "^packages/(runtime-|hub-core)" },
    },
  ],
};
