import type { Hono } from "hono";
import type { DaemonContext } from "./context.js";

type CapabilityMounter = (app: Hono, ctx: DaemonContext) => void;

const mounters: CapabilityMounter[] = [];

export function registerCapabilityMounter(fn: CapabilityMounter): void {
  mounters.push(fn);
}

export function mountCapabilities(app: Hono, ctx: DaemonContext): void {
  for (const mount of mounters) {
    mount(app, ctx);
  }
}
