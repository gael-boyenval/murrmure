import type { IndexedResourceRow, RunPolicy, ResolvedRunPolicy } from "@murrmure/contracts";
import {
  RUN_POLICY_UNKNOWN_FLOW,
  RUN_POLICY_AMBIGUOUS_FLOW,
  RUN_POLICY_DUPLICATE,
} from "@murrmure/contracts";

/**
 * Space-owned run capacity — see `studio-specs/current/bridges/handlers.md`.
 *
 * `run_policies` in `handlers.yaml` carries authored `{ flow, max_concurrent_runs }`
 * entries. `flow` is a readable alias (the applied flow's `name`) resolved at
 * apply to canonical `{ origin_space_id, flow_id, flow_digest }`. Resolution
 * runs against the fully merged post-apply flow set (local + bound + preserved)
 * so a partial apply that references an already-applied flow still resolves.
 *
 * Failure modes (apply hard-fails, prior index preserved):
 * - `RUN_POLICY_UNKNOWN_FLOW`  — alias references no flow (unknown or stale).
 * - `RUN_POLICY_AMBIGUOUS_FLOW`— alias matches duplicate flow names.
 * - `RUN_POLICY_DUPLICATE`     — two entries target the same canonical flow.
 *
 * `max_concurrent_runs ≥ 1` is enforced by `RunPolicySchema`; an absent policy
 * means the flow is unlimited.
 */

/** Post-apply flow descriptor for run-policy alias resolution. */
export interface RunPolicyFlow {
  name: string;
  flow_id: string;
  digest: string;
  origin_space_id: string;
}

export type RunPolicyResolution =
  | { ok: true; value: ResolvedRunPolicy[] }
  | { ok: false; code: string; message: string; flow?: string };

/**
 * Resolve authored run policies to canonical form against the post-apply flow
 * set. Returns typed apply failures for unknown/ambiguous/stale/duplicate
 * aliases so the caller fails apply atomically and preserves the prior index.
 */
export function resolveRunPolicies(
  policies: RunPolicy[],
  flows: RunPolicyFlow[],
): RunPolicyResolution {
  const flowsByName = new Map<string, RunPolicyFlow[]>();
  for (const flow of flows) {
    const list = flowsByName.get(flow.name) ?? [];
    list.push(flow);
    flowsByName.set(flow.name, list);
  }

  const seenFlowIds = new Set<string>();
  const resolved: ResolvedRunPolicy[] = [];

  for (const policy of policies) {
    const matches = flowsByName.get(policy.flow);
    if (!matches || matches.length === 0) {
      return {
        ok: false,
        code: RUN_POLICY_UNKNOWN_FLOW,
        flow: policy.flow,
        message: `run_policies references unknown or stale flow alias '${policy.flow}'`,
      };
    }
    if (matches.length > 1) {
      return {
        ok: false,
        code: RUN_POLICY_AMBIGUOUS_FLOW,
        flow: policy.flow,
        message: `run_policies references ambiguous flow name '${policy.flow}' (duplicate flow names)`,
      };
    }
    const flow = matches[0]!;
    if (seenFlowIds.has(flow.flow_id)) {
      return {
        ok: false,
        code: RUN_POLICY_DUPLICATE,
        flow: policy.flow,
        message: `run_policies has duplicate entries for flow '${policy.flow}'`,
      };
    }
    seenFlowIds.add(flow.flow_id);
    resolved.push({
      flow: policy.flow,
      max_concurrent_runs: policy.max_concurrent_runs,
      origin_space_id: flow.origin_space_id,
      flow_id: flow.flow_id,
      flow_digest: flow.digest,
    });
  }

  return { ok: true, value: resolved };
}

/** Build index rows (`key` = `flow_id`, `digest` = `flow_digest`) for persistence. */
export function buildRunPolicyRows(policies: ResolvedRunPolicy[]): IndexedResourceRow[] {
  return policies.map((policy) => ({
    key: policy.flow_id,
    digest: policy.flow_digest,
    payload_json: JSON.stringify(policy),
  }));
}
