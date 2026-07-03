/** Minimal executor binding shape for ExecutorPort (mirrors studio-contracts discriminated union). */
export type ExecutorBinding =
  | { type: "mcp_session"; executor_id: string; required_scopes?: string[] }
  | { type: "shell_spawn"; executor_id: string }
  | { type: "queue_poll"; executor_id: string; poll_interval_ms?: number }
  | { type: "remote_hub"; executor_id: string; remote_hub_id: string; remote_space_id?: string }
  | { type: "a2a"; executor_id: string; endpoint: string };
