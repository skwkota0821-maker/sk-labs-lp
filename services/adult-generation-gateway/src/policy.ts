import type {
  GenerationRequest,
  MemberEntitlement,
  ModelRecord,
  PolicyDecision,
} from './types';

const deny = (
  reasonCode: PolicyDecision['reasonCode'],
  message: string,
): PolicyDecision => ({ allowed: false, reasonCode, message });

export function evaluateEntitlement(
  request: GenerationRequest,
  member: MemberEntitlement,
  model: ModelRecord,
): PolicyDecision {
  if (!member.accountActive) return deny('MEMBER_INACTIVE', 'Account is inactive.');
  if (!member.termsAccepted) return deny('TERMS_NOT_ACCEPTED', 'Terms acceptance is required.');
  if (model.approvalStatus !== 'approved') {
    return deny('MODEL_NOT_APPROVED', 'Model is not approved for production use.');
  }

  if (request.contentClass === 'adult') {
    if (!member.adultAccess) {
      return deny('ADULT_ACCESS_REQUIRED', 'Verified adult access is required.');
    }
    if (!model.adultUse) {
      return deny('MODEL_ADULT_USE_NOT_APPROVED', 'Model is not approved for adult use.');
    }
  }

  return { allowed: true, reasonCode: 'OK', message: 'Allowed.' };
}

/**
 * Content-safety classification is intentionally injected as a separate stage.
 * Do not implement safety using a simple keyword blocklist: prompts may be
 * multilingual, obfuscated, or image-conditioned. A production classifier must
 * return explicit reason codes and fail closed for adult jobs.
 */
export function enforceSafetyDecision(
  request: GenerationRequest,
  safety: PolicyDecision,
): PolicyDecision {
  if (!safety.allowed) return safety;
  if (request.contentClass === 'adult' && safety.reasonCode !== 'OK') {
    return deny('ILLEGAL_CONTENT', 'Adult job did not receive an explicit safe decision.');
  }
  return safety;
}
