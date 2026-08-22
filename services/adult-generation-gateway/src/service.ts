import type {
  GenerationProvider,
  GenerationRequest,
  MemberEntitlement,
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
    jobId: string;
    request: GenerationRequest;
    storage: StorageTarget;
    provider: string;
    policyDecision: PolicyDecision;
  }): Promise<void>;
  markRunning(jobId: string, providerJobId: string): Promise<void>;
  markBlocked(jobId: string, reasonCode: string, message: string): Promise<void>;
}

export interface GenerationDependencies {
  provider: GenerationProvider;
  repository: GenerationRepository;
  storageConfig: StorageRouterConfig;
  now?: () => Date;
  createId?: () => string;
  loadMember(memberId: string): Promise<MemberEntitlement>;
  loadModel(modelId: string): Promise<ModelRecord>;
  classifySafety(request: GenerationRequest): Promise<PolicyDecision>;
  buildWorkflow(request: GenerationRequest, model: ModelRecord): Promise<unknown>;
}

export interface SubmitGenerationResult {
  jobId: string;
  status: 'queued' | 'blocked' | 'running';
  storageZone?: StorageTarget['zone'];
  reasonCode?: string;
}

const defaultCreateId = () => `gen_${crypto.randomUUID()}`;

export async function submitGeneration(
  request: GenerationRequest,
  deps: GenerationDependencies,
): Promise<SubmitGenerationResult> {
  const member = await deps.loadMember(request.memberId);
  const model = await deps.loadModel(request.modelId);
  const entitlement = evaluateEntitlement(request, member, model);
  const safety = entitlement.allowed
    ? enforceSafetyDecision(request, await deps.classifySafety(request))
    : entitlement;

  const jobId = (deps.createId ?? defaultCreateId)();
  const storage = resolveStorageTarget(
    request.contentClass,
    request.memberId,
    jobId,
    (deps.now ?? (() => new Date()))(),
    deps.storageConfig,
  );
  assertStorageZone(request.contentClass, storage.zone);

  await deps.repository.createJob({
    jobId,
    request,
    storage,
    provider: deps.provider.name,
    policyDecision: safety,
  });

  if (!safety.allowed) {
    await deps.repository.markBlocked(jobId, safety.reasonCode, safety.message);
    return { jobId, status: 'blocked', storageZone: storage.zone, reasonCode: safety.reasonCode };
  }

  const workflow = await deps.buildWorkflow(request, model);
  const submitted = await deps.provider.submit(workflow);
  await deps.repository.markRunning(jobId, submitted.providerJobId);

  return { jobId, status: 'running', storageZone: storage.zone };
}
