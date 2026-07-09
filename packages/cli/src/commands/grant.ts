import { defineCommand } from "citty";
import {
  grantListCommand,
  grantMintCommand,
  grantUseCommand,
  grantRevokeCommand,
  grantRotateCommand,
} from "./space/grant.js";

/** Top-level grant commands (alias of `mrmr space grant`). */
export const grantCommand = defineCommand({
  meta: { name: "grant", description: "Agent grant management (alias of space grant)" },
  subCommands: {
    list: grantListCommand,
    mint: grantMintCommand,
    use: grantUseCommand,
    revoke: grantRevokeCommand,
    rotate: grantRotateCommand,
  },
});
