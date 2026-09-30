import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { submitGeneration, type GenerationRepository } from '../src/service';
import type { CoreEntitlement, GenerationProvider, GenerationRequest, PolicyDecision } from '../src/types';

const generalRequest: GenerationRequest = {
  member_id: 'mem_test',
  model_id: 'model_general',
  workflow_id: 'txt2img-basic',
  prompt: 'a watercolor blue bird in a quiet forest',
  width: 768,
  height: 768,
  content_class: 'general',
};

const adultEntitlement: CoreEntitlement = {
  entitlement_id: 'ent_adult', member_id: 'mem_test', product_id: null,
  entitlement_key: 'adult_access', status: 'active', source: 'test', source_reference: 'test',
  granted_at: '2026-08-01T00:00:00Z', expires_at: null, revoked_at: null, revoked_reason: null,
  created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
};

function setup(safety: PolicyDecision = { allowed: true, reason_code: 'OK', message: 'Allowed.' }) {
  const jobs: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  let entitlements: CoreEntitlement[] = [];
  const repository: GenerationRepository = {
    async createJob(input) { jobs.push({ ...input, state: 'created' }); },
    async markRunning(job_id, provider_job_id) { jobs.push({ job_id, provider_job_id, state: 'running' }); },
    async markBlocked(job_id, reason_code, message) { jobs.push({ job_id, reason_code, message, state: 'blocked' }); },
  };
  const provider: GenerationProvider = {
    name: 'mock-comfyui',
    async submit() { return { provider_job_id: 'prompt_001' }; },
    async getResult() { return {}; },
  };

  const deps = {
    provider, repository,
    core: {
      async listEntitlements() { return entitlements; },
      async recordServerEvent(event: Record<string, unknown>) { events.push(event); },
    },
    storageConfig: {
      generalBucket: 'sklabs-generation-general',
      adultPrivateBucket: 'sklabs-generation-adult-private',
    },
    createId: () => 'gen_test_001',
    now: () => new Date('2026-08-22T00:00:00Z'),
    async loadModel() {
      return {
        model_id: 'model_general', display_name: 'General Test', provider: 'local', model_type: 'checkpoint' as const,
        approval_status: 'approved' as const, commercial_use: true, adult_use: false,
        derivatives_allowed: false, redistribution_allowed: false,
      };
    },
    async classifySafety() { return safety; },
    async buildWorkflow() { return { node: 'mock' }; },
  };

  return { jobs, events, deps, setEntitlements(value: CoreEntitlement[]) { entitlements = value; } };
}

test('general job uses Core member_id naming, general storage, and emits Core server event', async () => {
  const { deps, jobs, events } = setup();
  const result = await submitGeneration(generalRequest, deps);
  assert.equal(result.status, 'running');
  assert.equal(result.storage_zone, 'general');
  const created = jobs[0] as any;
  assert.equal(created.storage.bucket, 'sklabs-generation-general');
  assert.match(created.storage.keyPrefix, /^general\/mem_test\/2026\/08\/gen_test_001\//);
  assert.equal(events[0].event_name, 'generation.started');
  assert.equal(events[0].member_id, 'mem_test');
});

test('adult request without Core adult_access entitlement is blocked in adult_private', async () => {
  const { deps, jobs, events } = setup();
  const result = await submitGeneration({ ...generalRequest, content_class: 'adult' }, deps);
  assert.equal(result.status, 'blocked');
  assert.equal(result.storage_zone, 'adult_private');
  assert.equal(result.reason_code, 'ADULT_ACCESS_REQUIRED');
  const created = jobs[0] as any;
  assert.equal(created.storage.bucket, 'sklabs-generation-adult-private');
  assert.equal(events[0].event_name, 'generation.blocked');
});

test('Core adult_access is recognized but model adult approval remains Gateway responsibility', async () => {
  const { deps, setEntitlements } = setup();
  setEntitlements([adultEntitlement]);
  const result = await submitGeneration({ ...generalRequest, content_class: 'adult' }, deps);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason_code, 'MODEL_ADULT_USE_NOT_APPROVED');
});

test('safety rejection blocks before provider execution', async () => {
  const { deps } = setup({ allowed: false, reason_code: 'RIGHTS_UNVERIFIED', message: 'Rights not verified.' });
  let providerCalled = false;
  deps.provider.submit = async () => { providerCalled = true; return { provider_job_id: 'should_not_run' }; };
  const result = await submitGeneration(generalRequest, deps);
  assert.equal(result.status, 'blocked');
  assert.equal(providerCalled, false);
});
