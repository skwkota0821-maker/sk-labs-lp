import type { ContentClass } from './types';

export type StorageZone = 'general' | 'adult_private';

export interface StorageTarget {
  zone: StorageZone;
  bucket: string;
  keyPrefix: string;
  publicAccess: false;
}

export interface StorageRouterConfig {
  generalBucket: string;
  adultPrivateBucket: string;
}

/**
 * Storage routing is server-controlled. Never accept bucket/zone from clients.
 * Adult outputs must never fall back to the general bucket.
 */
export function resolveStorageTarget(
  contentClass: ContentClass,
  memberId: string,
  jobId: string,
  now: Date,
  config: StorageRouterConfig,
): StorageTarget {
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');

  if (contentClass === 'adult') {
    if (!config.adultPrivateBucket) {
      throw new Error('ADULT_STORAGE_NOT_CONFIGURED');
    }
    return {
      zone: 'adult_private',
      bucket: config.adultPrivateBucket,
      keyPrefix: `adult-private/${memberId}/${yyyy}/${mm}/${jobId}/`,
      publicAccess: false,
    };
  }

  if (!config.generalBucket) throw new Error('GENERAL_STORAGE_NOT_CONFIGURED');
  return {
    zone: 'general',
    bucket: config.generalBucket,
    keyPrefix: `general/${memberId}/${yyyy}/${mm}/${jobId}/`,
    publicAccess: false,
  };
}

export function assertStorageZone(
  contentClass: ContentClass,
  zone: StorageZone,
): void {
  if (contentClass === 'adult' && zone !== 'adult_private') {
    throw new Error('ADULT_STORAGE_ZONE_VIOLATION');
  }
  if (contentClass === 'general' && zone !== 'general') {
    throw new Error('GENERAL_STORAGE_ZONE_VIOLATION');
  }
}
