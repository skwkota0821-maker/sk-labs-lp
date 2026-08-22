import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { submitGeneration, type GenerationRepository } from '../src/service';
import type { GenerationProvider, GenerationRequest, PolicyDecision } from '../src/types';

const generalRequest: GenerationRequest = {
  memberId: 'member_test',
  modelId: 'model_general',
  workflowId: 'txt2img-basic',
  prompt: 'a watercolor blue bird in a quiet forest',
  width: 768,
  height: 768,
  contentClass: 'general',
};

function setup(safety: PolicyDecision = { allowed: true, reasonCode: 'OK', message: 'Allowed.' }) {
  const jobs: Array<Record<string, unknown>> = [];
  const repository: GenerationRepository = {
    async createJob(input) { jobs.push({ ...input, state: 'created' }); },
    async markRunning(jobId, providerJobId) { jobs.push({ jobId, providerJobId, state: 'running' }); },
    async markBlocked(jobId, reasonCode, message) { jobs.push({ jobId, reasonCode, message, state: 'blocked' }); },
  };
  const provider: GenerationProvider = {
    name: 'mock-comfyui',
    async submit() { return { providerJobId: 'prompt_001' }; },
    async getResult() { return {}; },
  };

  return {
    jobs,
    deps: {
      provider,
      repository,
      storageConfig: {
        generalBucket: 'sklabs-generation-general',
        adultPrivateBucket: 'sklabs-generation-adult-private',
      },
      createId: () => 'gen_test_001',
      now: () => new Date('2026-08-22T00:00:00Z'),
      async loadMember() {
        return { memberId: 'member_test', adultAccess: false, termsAccepted: true, accountActive: true };
      },
      async loadModel() {
        return {
          modelId: 'model_general', displayName: 'General Test', provider: 'local', modelType: 'checkpoint' as const,
          approvalStatus: 'approved' as const, commercialUse: true, adultUse: false,
          derivativesAllowed: false, redistributionAllowed: false,
        };
      },
      async classifySafety() { return safety; },
      async buildWorkflow() { return { node: 'mock' }; },
    },
  };
}

test('general image routes only to general storage and reaches provider', async () => {
  const { deps, jobs } = setup();
  const result = await submitGeneration(generalRequest, deps);
  assert.equal(result.status, 'running');
  assert.equal(result.storageZone, 'general');
  const created = jobs[0] as any;
  assert.equal(created.storage.bucket, 'sklabs-generation-general');
  assert.match(created.storage.keyPrefix, /^general\/member_test\/2026\/08\/gen_test_001\//);
});

test('adult request without adult access is blocked and cannot use general storage', async () => {
  const { deps, jobs } = setup();
  const result = await submitGeneration({ ...generalRequest, contentClass: 'adult' }, deps);
  assert.equal(result.status, 'blocked');
  assert.equal(result.storageZone, 'adult_private');
  assert.equal(result.reasonCode, 'ADULT_ACCESS_REQUIRED');
  const created = jobs[0] as any;
  assert.equal(created.storage.bucket, 'sklabs-generation-adult-private');
});

test('safety rejection blocks before provider execution', async () => {
  const { deps } = setup({ allowed: false, reasonCode: 'RIGHTS_UNVERIFIED', message: 'Rights not verified.' });
  let providerCalled = false;
  deps.provider.submit = async () => { providerCalled = true; return { providerJobId: 'should_not_run' }; };
  const result = await submitGeneration(generalRequest, deps);
  assert.equal(result.status, 'blocked');
  assert.equal(providerCalled, false);
});
