import type Database from "better-sqlite3";

export function migrateStudio(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS studio_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS spaces (
      space_id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      parent_space_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS instances (
      instance_id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL REFERENCES spaces(space_id),
      contract_ref_id TEXT NOT NULL,
      state TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_instances_space ON instances(space_id);

    CREATE TABLE IF NOT EXISTS contract_refs (
      contract_ref_id TEXT PRIMARY KEY,
      capability_id TEXT NOT NULL,
      semver TEXT NOT NULL,
      digest TEXT NOT NULL,
      contract_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tokens (
      token_id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      space_id TEXT NOT NULL,
      scopes_json TEXT NOT NULL,
      harness_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tokens_actor ON tokens(actor_id, space_id);

    CREATE TABLE IF NOT EXISTS grants (
      grant_id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      scopes_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      last_activity_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_grants_space ON grants(space_id, status);

    CREATE TABLE IF NOT EXISTS members (
      space_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      role TEXT NOT NULL,
      PRIMARY KEY (space_id, actor_id)
    );

    CREATE TABLE IF NOT EXISTS space_seq_counters (
      space_id TEXT PRIMARY KEY,
      next_seq INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS instance_seq_counters (
      instance_id TEXT PRIMARY KEY,
      next_seq INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS federation_hubs (
      hub_id TEXT PRIMARY KEY,
      endpoint TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      routing_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS federation_outbound (
      outbound_id TEXT PRIMARY KEY,
      target_hub_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      sent_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_federation_outbound_pending ON federation_outbound(status);

    CREATE TABLE IF NOT EXISTS federation_ingress_dedup (
      source_hub_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      ingested_at TEXT NOT NULL,
      PRIMARY KEY (source_hub_id, event_id)
    );

    CREATE TABLE IF NOT EXISTS queries (
      query_id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      asker_actor_id TEXT NOT NULL,
      schema_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      ask_payload_json TEXT,
      answer_payload_json TEXT,
      created_at TEXT NOT NULL,
      answered_at TEXT
    );

    CREATE TABLE IF NOT EXISTS triggers (
      trigger_id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      instance_id TEXT,
      spec_json TEXT NOT NULL,
      cron TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blobs (
      blob_id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      media_type TEXT NOT NULL,
      digest TEXT NOT NULL,
      path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS capability_installs (
      install_id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      package_id TEXT NOT NULL,
      version TEXT NOT NULL,
      contract_ref_id TEXT NOT NULL,
      evolution_state TEXT NOT NULL DEFAULT 'draft',
      config_json TEXT NOT NULL DEFAULT '{}',
      gate_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_capability_installs_space ON capability_installs(space_id);

    CREATE TABLE IF NOT EXISTS trigger_deliveries (
      delivery_id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      trigger_id TEXT NOT NULL,
      source_event_id TEXT,
      outcome TEXT NOT NULL,
      dedup_reason TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trigger_deliveries_space ON trigger_deliveries(space_id, created_at);

    CREATE TABLE IF NOT EXISTS space_actions (
      space_id TEXT NOT NULL,
      name TEXT NOT NULL,
      digest TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (space_id, name)
    );

    CREATE TABLE IF NOT EXISTS space_executors (
      space_id TEXT NOT NULL,
      name TEXT NOT NULL,
      digest TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (space_id, name)
    );

    CREATE TABLE IF NOT EXISTS space_hooks (
      space_id TEXT NOT NULL,
      name TEXT NOT NULL,
      digest TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (space_id, name)
    );

    CREATE TABLE IF NOT EXISTS space_events (
      space_id TEXT NOT NULL,
      name TEXT NOT NULL,
      digest TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (space_id, name)
    );

    CREATE TABLE IF NOT EXISTS space_views (
      space_id TEXT NOT NULL,
      name TEXT NOT NULL,
      digest TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (space_id, name)
    );

    CREATE TABLE IF NOT EXISTS flow_index (
      origin_space_id TEXT NOT NULL,
      flow_id TEXT NOT NULL,
      digest TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (origin_space_id, flow_id)
    );
    CREATE INDEX IF NOT EXISTS idx_flow_index_origin ON flow_index(origin_space_id);

    CREATE TABLE IF NOT EXISTS artifacts (
      transfer_id TEXT PRIMARY KEY,
      source_space_id TEXT NOT NULL,
      name TEXT NOT NULL,
      digest TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      hold INTEGER NOT NULL DEFAULT 0,
      authorized_readers_json TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_artifacts_digest ON artifacts(source_space_id, digest);
    CREATE INDEX IF NOT EXISTS idx_artifacts_expires ON artifacts(expires_at);

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subject TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_by_json TEXT NOT NULL,
      spaces_touched_json TEXT NOT NULL DEFAULT '[]',
      actor_id TEXT NOT NULL,
      cancel_requested_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(session_id),
      space_id TEXT,
      flow_id TEXT,
      flow_digest TEXT,
      lifecycle TEXT NOT NULL DEFAULT 'working',
      exec_context_json TEXT NOT NULL DEFAULT '{}',
      reference_run_ids_json TEXT NOT NULL DEFAULT '[]',
      instance_id TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_runs_session ON runs(session_id);
    CREATE INDEX IF NOT EXISTS idx_runs_instance ON runs(instance_id);

    CREATE TABLE IF NOT EXISTS run_step_memo (
      run_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      status TEXT NOT NULL,
      idempotency_key TEXT,
      result_hash TEXT,
      started_at TEXT,
      completed_at TEXT,
      error_code TEXT,
      PRIMARY KEY (run_id, step_id)
    );
    CREATE INDEX IF NOT EXISTS idx_run_step_memo_run ON run_step_memo(run_id);
    CREATE INDEX IF NOT EXISTS idx_run_step_memo_idem ON run_step_memo(idempotency_key);

    CREATE TABLE IF NOT EXISTS gates (
      gate_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      space_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      assignees_json TEXT,
      resolve_mode TEXT NOT NULL DEFAULT 'any_one',
      expires_at TEXT,
      form_json TEXT,
      payload_ref TEXT,
      action_name TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      resolved_by TEXT,
      decision TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_gates_run ON gates(run_id, status);
    CREATE INDEX IF NOT EXISTS idx_gates_session ON gates(session_id, status);

    CREATE TABLE IF NOT EXISTS notifications (
      notification_id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      gate_id TEXT,
      run_id TEXT,
      session_id TEXT,
      space_id TEXT NOT NULL,
      space_hidden INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      summary TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      dismissed_at TEXT,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_actor ON notifications(actor_id, status);

    CREATE TABLE IF NOT EXISTS user_prefs (
      actor_id TEXT PRIMARY KEY,
      landing_space_id TEXT,
      landing_suggest_shown INTEGER NOT NULL DEFAULT 0,
      notify_email INTEGER NOT NULL DEFAULT 1,
      notify_desktop INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS journal_index (
      entry_id TEXT PRIMARY KEY,
      seq INTEGER NOT NULL,
      space_id TEXT NOT NULL,
      type TEXT NOT NULL,
      subject TEXT,
      session_id TEXT,
      run_id TEXT,
      actor_id TEXT,
      time TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_journal_index_time ON journal_index(time);
    CREATE INDEX IF NOT EXISTS idx_journal_index_session ON journal_index(session_id, time);
    CREATE INDEX IF NOT EXISTS idx_journal_index_type ON journal_index(type, time);
  `);

  const spaceCols = db.prepare("PRAGMA table_info(spaces)").all() as Array<{ name: string }>;
  const colNames = new Set(spaceCols.map((c) => c.name));
  if (!colNames.has("name")) {
    db.exec(`ALTER TABLE spaces ADD COLUMN name TEXT`);
    db.exec(`ALTER TABLE spaces ADD COLUMN install_policy TEXT NOT NULL DEFAULT 'human_only'`);
    db.exec(`ALTER TABLE spaces ADD COLUMN preview_policy TEXT NOT NULL DEFAULT 'same_origin_only'`);
    db.exec(`ALTER TABLE spaces ADD COLUMN description TEXT`);
  }

  const grantCols = db.prepare("PRAGMA table_info(grants)").all() as Array<{ name: string }>;
  const grantColNames = new Set(grantCols.map((c) => c.name));
  if (!grantColNames.has("label")) {
    db.exec(`ALTER TABLE grants ADD COLUMN label TEXT`);
    db.exec(`ALTER TABLE grants ADD COLUMN harness TEXT`);
    db.exec(`ALTER TABLE grants ADD COLUMN flow_acl_json TEXT`);
    db.exec(`ALTER TABLE grants ADD COLUMN expires_at TEXT`);
  }
  if (!grantColNames.has("capabilities_json")) {
    db.exec(`ALTER TABLE grants ADD COLUMN capabilities_json TEXT`);
  }
  if (!grantColNames.has("token_id")) {
    db.exec(`ALTER TABLE grants ADD COLUMN token_id TEXT`);
  }

  const memberCols = db.prepare("PRAGMA table_info(members)").all() as Array<{ name: string }>;
  const memberColNames = new Set(memberCols.map((c) => c.name));
  if (!memberColNames.has("member_id")) {
    db.exec(`ALTER TABLE members ADD COLUMN member_id TEXT`);
    db.exec(`ALTER TABLE members ADD COLUMN email TEXT`);
    db.exec(`ALTER TABLE members ADD COLUMN created_at TEXT`);
  }

  const tokenCols = db.prepare("PRAGMA table_info(tokens)").all() as Array<{ name: string }>;
  const tokenColNames = new Set(tokenCols.map((c) => c.name));
  if (!tokenColNames.has("flow_acl_json")) {
    db.exec(`ALTER TABLE tokens ADD COLUMN flow_acl_json TEXT`);
  }
  if (!tokenColNames.has("capabilities_json")) {
    db.exec(`ALTER TABLE tokens ADD COLUMN capabilities_json TEXT`);
  }

  if (!colNames.has("query_policy_json")) {
    db.exec(`ALTER TABLE spaces ADD COLUMN query_policy_json TEXT`);
  }

  const deliveryCols = db.prepare("PRAGMA table_info(trigger_deliveries)").all() as Array<{ name: string }>;
  const deliveryColNames = new Set(deliveryCols.map((c) => c.name));
  if (!deliveryColNames.has("fingerprint")) {
    db.exec(`ALTER TABLE trigger_deliveries ADD COLUMN fingerprint TEXT`);
  }

  const capCols = db.prepare("PRAGMA table_info(capability_installs)").all() as Array<{ name: string }>;
  const capColNames = new Set(capCols.map((c) => c.name));
  if (!capColNames.has("bundle_digest")) {
    db.exec(`ALTER TABLE capability_installs ADD COLUMN bundle_digest TEXT`);
    db.exec(`ALTER TABLE capability_installs ADD COLUMN source_metadata_json TEXT`);
    db.exec(`ALTER TABLE capability_installs ADD COLUMN routes_prefix TEXT`);
    db.exec(`ALTER TABLE capability_installs ADD COLUMN canvas_route TEXT`);
  }
  if (!capColNames.has("source_digest")) {
    db.exec(`ALTER TABLE capability_installs ADD COLUMN source_digest TEXT`);
  }

  if (!colNames.has("bindings_json")) {
    db.exec(`ALTER TABLE spaces ADD COLUMN bindings_json TEXT`);
  }

  migrateFlowIndexCompositeKey(db);

  const prefsCols = db.prepare("PRAGMA table_info(user_prefs)").all() as Array<{ name: string }>;
  const prefsColNames = new Set(prefsCols.map((c) => c.name));
  if (!prefsColNames.has("notify_email")) {
    db.exec(`ALTER TABLE user_prefs ADD COLUMN notify_email INTEGER NOT NULL DEFAULT 1`);
    db.exec(`ALTER TABLE user_prefs ADD COLUMN notify_desktop INTEGER NOT NULL DEFAULT 1`);
  }

  const notificationCols = db.prepare("PRAGMA table_info(notifications)").all() as Array<{ name: string }>;
  const notificationColNames = new Set(notificationCols.map((c) => c.name));
  if (!notificationColNames.has("step_id")) {
    db.exec(`ALTER TABLE notifications ADD COLUMN step_id TEXT`);
  }
}

function migrateFlowIndexCompositeKey(db: Database.Database): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'flow_index'")
    .get() as { sql?: string } | undefined;
  if (!row?.sql) return;
  if (row.sql.includes("PRIMARY KEY (origin_space_id, flow_id)")) return;
  if (!row.sql.includes("flow_id TEXT PRIMARY KEY")) return;

  db.exec(`
    CREATE TABLE flow_index_migrated (
      origin_space_id TEXT NOT NULL,
      flow_id TEXT NOT NULL,
      digest TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (origin_space_id, flow_id)
    );
    INSERT INTO flow_index_migrated (origin_space_id, flow_id, digest, payload_json)
      SELECT origin_space_id, flow_id, digest, payload_json FROM flow_index;
    DROP TABLE flow_index;
    ALTER TABLE flow_index_migrated RENAME TO flow_index;
    CREATE INDEX IF NOT EXISTS idx_flow_index_origin ON flow_index(origin_space_id);
  `);
}

export function ensureBootstrapToken(db: Database.Database, token: string, actorId: string, spaceId: string): void {
  const existing = db.prepare("SELECT token_id FROM tokens WHERE token_id = ?").get(token);
  if (existing) return;

  const capabilities = [
    "hub:admin",
    "space:read",
    "space:write",
    "space:enter",
    "flow:read",
    "flow:run",
    "action:invoke",
    "gate:resolve",
    "journal:read",
  ];
  const scopes = JSON.stringify(capabilities);
  const capabilitiesJson = JSON.stringify(capabilities);

  db.prepare(
    `INSERT INTO tokens (token_id, actor_id, space_id, scopes_json, capabilities_json, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?)`,
  ).run(token, actorId, spaceId, scopes, capabilitiesJson, new Date().toISOString());
}
