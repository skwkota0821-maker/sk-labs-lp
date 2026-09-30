export type ContentClass = 'general' | 'adult';
export type ModelApproval = 'pending' | 'approved' | 'rejected' | 'suspended';
export type JobStatus =
  | 'queued'
  | 'policy_check'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'canceled';

/** Harness Core v0.2 Entitlement response contract. */
export interface CoreEntitlement {
  entitlement_id: string;
  member_id: string;
  product_id: string | null;
  entitlement_key: string;
  status: 'active' | 'revoked' | 'expired';
  source: string;
  source_reference: string | null;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  metadata_json?: string | null;
  created_at: string;
  updated_at: string;
}

/** Harness Core v0.2 /v1/events/server input contract. */
export interface CoreEventInput {
  event_id?: string;
  idempotency_key: string;
  event_version?: number;
  member_id: string | null;
  event_name: string;
  source: string;
  occurred_at: string;
  correlation_id?: string | null;
  payload?: Record<string, unknown>;
}

export interface ModelRecord {
  model_id: string;
  display_name: string;
  provider: string;
  model_type: 'checkpoint' | 'lora' | 'vae' | 'controlnet' | 'embedding';
  approval_status: ModelApproval;
  commercial_use: boolean;
  adult_use: boolean;
  derivatives_allowed: boolean;
  redistribution_allowed: boolean;
  artifact_uri?: string;
  sha256?: string;
}

/** Public/API boundary follows Harness Core snake_case naming. */
export interface GenerationRequest {
  member_id: string;
  model_id: string;
  workflow_id: string;
  prompt: string;
  negative_prompt?: string;
  width: number;
  height: number;
  seed?: number;
  content_class: ContentClass;
}

export interface PolicyDecision {
  allowed: boolean;
  reason_code:
    | 'OK'
    | 'ADULT_ACCESS_REQUIRED'
    | 'MODEL_NOT_APPROVED'
    | 'MODEL_ADULT_USE_NOT_APPROVED'
    | 'MINOR_SEXUAL_CONTENT'
    | 'NONCONSENSUAL_INTIMATE_CONTENT'
    | 'REAL_PERSON_SEXUAL_DEEPFAKE'
    | 'ILLEGAL_CONTENT'
    | 'RIGHTS_UNVERIFIED';
  message: string;
}

export interface ProviderSubmitResult {
  provider_job_id: string;
  raw?: unknown;
}

export interface GenerationProvider {
  readonly name: string;
  submit(workflow: unknown): Promise<ProviderSubmitResult>;
  getResult(provider_job_id: string): Promise<unknown>;
  cancel?(provider_job_id: string): Promise<void>;
}
