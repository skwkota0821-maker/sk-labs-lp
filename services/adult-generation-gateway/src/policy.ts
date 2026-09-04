import type {
  CoreEntitlement,
  GenerationRequest,
  ModelRecord,
  PolicyDecision,
} from './types';

const ADULT_ACCESS_ENTITLEMENT = 'adult_access';

const deny = (
  reason_code: PolicyDecision['reason_code'],
  message: string,
): PolicyDecision => ({ allowed: false, reason_code, message });

function hasActiveEntitlement(
  entitlements: CoreEntitlement[],
  member_id: string,
  entitlement_key: string,
  now: Date,
): boolean {
  return entitlements.some((entitlement) =>
    entitlement.member_id === member_id &&
    entitlement.entitlement_key === entitlement_key &&
    entitlement.status === 'active' &&
    entitlement.revoked_at === null &&
    (entitlement.expires_at === null || new Date(entitlement.expires_at).getTime() > now.getTime())
  );
}

export function evaluateEntitlement(
  request: GenerationRequest,
  entitlements: CoreEntitlement[],
  model: ModelRecord,
  now = new Date(),
): PolicyDecision {
  if (model.approval_status !== 'approved') {
    return deny('MODEL_NOT_APPROVED', 'Model is not approved for production use.');
  }

  if (request.content_class === 'adult') {
    if (!hasActiveEntitlement(entitlements, request.member_id, ADULT_ACCESS_ENTITLEMENT, now)) {
      return deny('ADULT_ACCESS_REQUIRED', 'Harness Core adult_access entitlement is required.');
    }
    if (!model.adult_use) {
      return deny('MODEL_ADULT_USE_NOT_APPROVED', 'Model is not approved for adult use.');
    }
  }

  return { allowed: true, reason_code: 'OK', message: 'Allowed.' };
}

/**
 * Content-safety classification remains a Gateway responsibility.
 * Harness Core owns identity/entitlement/event/audit contracts, not model safety.
 */
export function enforceSafetyDecision(
  request: GenerationRequest,
  safety: PolicyDecision,
): PolicyDecision {
  if (!safety.allowed) return safety;
  if (request.content_class === 'adult' && safety.reason_code !== 'OK') {
    return deny('ILLEGAL_CONTENT', 'Adult job did not receive an explicit safe decision.');
  }
  return safety;
}
