-- SK LABS Adult Generation Gateway MVP schema
-- 2026-08-22

CREATE TABLE IF NOT EXISTS model_registry (
  model_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_type TEXT NOT NULL CHECK (model_type IN ('checkpoint','lora','vae','controlnet','embedding')),
  version TEXT,
  license_name TEXT,
  license_url TEXT,
  commercial_use INTEGER NOT NULL DEFAULT 0 CHECK (commercial_use IN (0,1)),
  adult_use INTEGER NOT NULL DEFAULT 0 CHECK (adult_use IN (0,1)),
  derivatives_allowed INTEGER NOT NULL DEFAULT 0 CHECK (derivatives_allowed IN (0,1)),
  redistribution_allowed INTEGER NOT NULL DEFAULT 0 CHECK (redistribution_allowed IN (0,1)),
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected','suspended')),
  source_url TEXT,
  artifact_uri TEXT,
  sha256 TEXT,
  notes TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS generation_jobs (
  job_id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  seed INTEGER,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','policy_check','running','succeeded','failed','blocked','canceled')),
  content_class TEXT NOT NULL DEFAULT 'general' CHECK (content_class IN ('general','adult')),
  adult_access_verified INTEGER NOT NULL DEFAULT 0 CHECK (adult_access_verified IN (0,1)),
  policy_decision TEXT,
  provider TEXT,
  provider_job_id TEXT,
  output_uri TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (model_id) REFERENCES model_registry(model_id)
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_member_created
  ON generation_jobs(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status_created
  ON generation_jobs(status, created_at ASC);

CREATE TABLE IF NOT EXISTS generation_audit_log (
  audit_id TEXT PRIMARY KEY,
  job_id TEXT,
  member_id TEXT,
  event_name TEXT NOT NULL,
  decision TEXT,
  reason_code TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES generation_jobs(job_id)
);

CREATE INDEX IF NOT EXISTS idx_generation_audit_job
  ON generation_audit_log(job_id, created_at ASC);

CREATE TABLE IF NOT EXISTS generation_outputs (
  output_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  storage_uri TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/png',
  sha256 TEXT,
  width INTEGER,
  height INTEGER,
  moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending','approved','blocked','quarantined')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES generation_jobs(job_id)
);
