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

export interface MemberEntitlement {
  memberId: string;
  adultAccess: boolean;
  termsAccepted: boolean;
  accountActive: boolean;
}

export interface ModelRecord {
  modelId: string;
  displayName: string;
  provider: string;
  modelType: 'checkpoint' | 'lora' | 'vae' | 'controlnet' | 'embedding';
  approvalStatus: ModelApproval;
  commercialUse: boolean;
  adultUse: boolean;
  derivativesAllowed: boolean;
  redistributionAllowed: boolean;
  artifactUri?: string;
  sha256?: string;
}

export interface GenerationRequest {
  memberId: string;
  modelId: string;
  workflowId: string;
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed?: number;
  contentClass: ContentClass;
}

export interface PolicyDecision {
  allowed: boolean;
  reasonCode:
    | 'OK'
    | 'MEMBER_INACTIVE'
    | 'TERMS_NOT_ACCEPTED'
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
  providerJobId: string;
  raw?: unknown;
}

export interface GenerationProvider {
  readonly name: string;
  submit(workflow: unknown): Promise<ProviderSubmitResult>;
  getResult(providerJobId: string): Promise<unknown>;
  cancel?(providerJobId: string): Promise<void>;
}
