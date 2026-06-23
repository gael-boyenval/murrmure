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
}

export function ensureBootstrapToken(db: Database.Database, token: string, actorId: string, spaceId: string): void {
  const existing = db.prepare("SELECT token_id FROM tokens WHERE token_id = ?").get(token);
  if (existing) return;

  const scopes = JSON.stringify([
    "space:admin",
    "space:read",
    "space:enter",
    "state:transition",
    "event:read",
    "event:emit",
    "flow:install",
    "trigger:register",
    "blob:read",
    "blob:write",
    "federation:emit",
  ]);

  db.prepare(
    `INSERT INTO tokens (token_id, actor_id, space_id, scopes_json, status, created_at)
     VALUES (?, ?, ?, ?, 'active', ?)`,
  ).run(token, actorId, spaceId, scopes, new Date().toISOString());
}
