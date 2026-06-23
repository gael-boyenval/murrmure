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
      name: "kernel-no-studio",
      severity: "error",
      from: { path: "^packages/runtime-kernel/" },
      to: { path: "^packages/studio-" },
    },
    {
      name: "studio-contracts-leaf",
      severity: "error",
      from: { path: "^packages/studio-contracts/" },
      to: { path: "^packages/(runtime-|studio-hub-)" },
    },
    {
      name: "hub-core-no-sqlite",
      severity: "error",
      from: { path: "^packages/studio-hub-core/" },
      to: { path: "better-sqlite3" },
    },
    {
      name: "shell-no-kernel",
      severity: "error",
      from: { path: "^packages/shell-web/" },
      to: { path: "^packages/(runtime-|studio-hub-core)" },
    },
    {
      name: "hub-client-leaf",
      severity: "error",
      from: { path: "^packages/studio-hub-client/" },
      to: { path: "^packages/studio-hub-", pathNot: "^packages/studio-hub-client/" },
    },
  ],
};
