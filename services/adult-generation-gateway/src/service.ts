import type {
  CoreEntitlement,
  CoreEventInput,
  GenerationProvider,
  GenerationRequest,
  ModelRecord,
  PolicyDecision,
} from './types';
import { evaluateEntitlement, enforceSafetyDecision } from './policy';
import {
  assertStorageZone,
  resolveStorageTarget,
  type StorageRouterConfig,
  type StorageTarget,
} from './storage';

export interface GenerationRepository {
  createJob(input: {
    job_id: string;
    request: GenerationRequest;
    storage: StorageTarget;
    provider: string;
    policy_decision: PolicyDecision;
  }): Promise<void>;
  markRunning(job_id: string, provider_job_id: string): Promise<void>;
  markBlocked(job_id: string, reason_code: string, message: string): Promise<void>;
}

/** Core owns common Event/Audit. Gateway owns generation_jobs and local technical logs. */
export interface HarnessCoreClient {
  listEntitlements(member_id: string): Promise<CoreEntitlement[]>;
  recordServerEvent(event: CoreEventInput): Promise<void>;
}

export interface GenerationDependencies {
  provider: GenerationProvider;
  repository: GenerationRepository;
  core: HarnessCoreClient;
  storageConfig: StorageRouterConfig;
  now?: () => Date;
  createId?: () => string;
  loadModel(model_id: string): Promise<ModelRecord>;
  classifySafety(request: GenerationRequest): Promise<PolicyDecision>;
  buildWorkflow(request: GenerationRequest, model: ModelRecord): Promise<unknown>;
}

export interface SubmitGenerationResult {
  job_id: string;
  status: 'blocked' | 'running';
  storage_zone: StorageTarget['zone'];
  reason_code?: string;
}

const defaultCreateId = () => `gen_${crypto.randomUUID()}`;

export async function submitGeneration(
  request: GenerationRequest,
  deps: GenerationDependencies,
): Promise<SubmitGenerationResult> {
  const timestamp = (deps.now ?? (() => new Date()))();
  const entitlements = await deps.core.listEntitlements(request.member_id);
  const model = await deps.loadModel(request.model_id);
  const entitlement = evaluateEntitlement(request, entitlements, model, timestamp);
  const safety = entitlement.allowed
    ? enforceSafetyDecision(request, await deps.classifySafety(request))
    : entitlement;

  const job_id = (deps.createId ?? defaultCreateId)();
  const storage = resolveStorageTarget(
    request.content_class,
    request.member_id,
    job_id,
    timestamp,
    deps.storageConfig,
  );
  assertStorageZone(request.content_class, storage.zone);

  await deps.repository.createJob({
    job_id,
    request,
    storage,
    provider: deps.provider.name,
    policy_decision: safety,
  });

  if (!safety.allowed) {
    await deps.repository.markBlocked(job_id, safety.reason_code, safety.message);
    await deps.core.recordServerEvent({
      idempotency_key: `generation:${job_id}:blocked`,
      event_version: 1,
      member_id: request.member_id,
      event_name: 'generation.blocked',
      source: 'adult-generation-gateway',
      occurred_at: timestamp.toISOString(),
      correlation_id: job_id,
      payload: { job_id, reason_code: safety.reason_code, content_class: request.content_class },
    });
    return { job_id, status: 'blocked', storage_zone: storage.zone, reason_code: safety.reason_code };
  }

  const workflow = await deps.buildWorkflow(request, model);
  const submitted = await deps.provider.submit(workflow);
  await deps.repository.markRunning(job_id, submitted.provider_job_id);
  await deps.core.recordServerEvent({
    idempotency_key: `generation:${job_id}:started`,
    event_version: 1,
    member_id: request.member_id,
    event_name: 'generation.started',
    source: 'adult-generation-gateway',
    occurred_at: timestamp.toISOString(),
    correlation_id: job_id,
    payload: { job_id, model_id: request.model_id, workflow_id: request.workflow_id, content_class: request.content_class },
  });

  return { job_id, status: 'running', storage_zone: storage.zone };
}
