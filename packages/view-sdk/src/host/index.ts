/**
 * Legacy v1 mount runtime — demoted in Murrmure v2.
 *
 * Flow worker pools and mount registries belong to a retired install path.
 * Custom views use `@murrmure/view-sdk` + space `.mrmr/views/` manifests instead.
 *
 * @deprecated Use space directory views and view-sdk host protocol. See packages/view-sdk/README.md
 */
export const LEGACY_MOUNT_RUNTIME = "deprecated" as const;
