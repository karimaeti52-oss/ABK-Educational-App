import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSanitizedPlatformConfigPayload,
  extractBrandingPlatformUpdates,
  extractGeneralToggleUpdates,
  formatPlatformSettingsSaveError,
  PLATFORM_CONFIG_ALLOWED_KEYS,
  payloadIncludesStorageSettings,
} from './platformConfig.ts';

test('buildSanitizedPlatformConfigPayload preserves primaryStorageProvider and strips unknown legacy keys', () => {
  const payload = buildSanitizedPlatformConfigPayload({
    config: {
      platformName: 'مداد التعليمية',
      homeHeadline: 'ماذا تدرس اليوم؟',
      primaryColorHex: '#142A43',
      secondaryColorHex: '#167D83',
      accentColorHex: '',
      r2WorkerBaseUrl: 'https://midad-worker.example.workers.dev///',
      maxVideoSizeMb: 200,
      maxPdfSizeMb: 100,
      maxImageSizeMb: 20,
      r2StorageLimitGb: 10,
      b2StorageLimitGb: 10,
      b2Enabled: false,
      primaryStorageProvider: 'r2',
      totalStorageLimitGb: 10,
      legacyUnknownExtraKey: 'should-be-stripped',
    },
    scope: 'full',
    updatedBy: 'uid_super_1',
    updatedAt: 'TIMESTAMP_SENTINEL',
  });

  assert.equal(payload.primaryStorageProvider, 'r2');
  assert.equal(payload.r2WorkerBaseUrl, 'https://midad-worker.example.workers.dev');
  assert.equal(payload.accentColorHex, '');
  assert.equal('legacyUnknownExtraKey' in payload, false);
  for (const key of Object.keys(payload)) {
    assert.equal(PLATFORM_CONFIG_ALLOWED_KEYS.has(key), true, `Unexpected key ${key}`);
  }
  assert.equal(payloadIncludesStorageSettings(payload), true);
});

test('branding and general scopes never emit storage keys so ADMIN cannot touch storage config', () => {
  const mixedConfig = {
    platformName: 'مداد التعليمية',
    homeHeadline: 'ماذا تدرس؟',
    primaryColorHex: '#142A43',
    secondaryColorHex: '#167D83',
    allowOfflinePdf: false,
    maintenanceMode: true,
    b2Enabled: true,
    r2WorkerBaseUrl: 'https://attacker.example.workers.dev',
    primaryStorageProvider: 'b2' as const,
  };

  const brandingPayload = buildSanitizedPlatformConfigPayload({
    config: extractBrandingPlatformUpdates(mixedConfig),
    scope: 'branding',
    updatedBy: 'uid_admin_1',
    updatedAt: 'TS',
  });
  assert.equal(payloadIncludesStorageSettings(brandingPayload), false);
  assert.equal('b2Enabled' in brandingPayload, false);

  const generalPayload = buildSanitizedPlatformConfigPayload({
    config: extractGeneralToggleUpdates(mixedConfig),
    scope: 'general',
    updatedBy: 'uid_admin_1',
    updatedAt: 'TS',
  });
  assert.equal(payloadIncludesStorageSettings(generalPayload), false);
  assert.equal(generalPayload.maintenanceMode, true);
  assert.equal('r2WorkerBaseUrl' in generalPayload, false);
});

test('buildSanitizedPlatformConfigPayload rejects any Backblaze B2 / R2 secret keys', () => {
  assert.throws(
    () =>
      buildSanitizedPlatformConfigPayload({
        config: {
          platformName: 'مداد التعليمية',
          homeHeadline: 'ماذا تدرس؟',
          primaryColorHex: '#142A43',
          secondaryColorHex: '#167D83',
          b2ApplicationKey: 'secret-value-never-allowed',
        },
        scope: 'full',
        updatedBy: 'uid_super_1',
        updatedAt: 'TS',
      }),
    /ممنوع حفظ مفاتيح Backblaze B2/
  );

  assert.throws(
    () =>
      buildSanitizedPlatformConfigPayload({
        config: {
          platformName: 'مداد التعليمية',
          homeHeadline: 'ماذا تدرس؟',
          primaryColorHex: '#142A43',
          secondaryColorHex: '#167D83',
          b2KeyId: 'key-id-never-allowed',
        },
        scope: 'full',
        updatedBy: 'uid_super_1',
        updatedAt: 'TS',
      }),
    /ممنوع حفظ مفاتيح Backblaze B2/
  );
});

test('formatPlatformSettingsSaveError diagnoses permission-denied clearly per staff role and warnings', () => {
  const permErr = Object.assign(new Error('Missing or insufficient permissions'), {
    code: 'permission-denied',
  });

  const nonSuperMsg = formatPlatformSettingsSaveError(permErr, { role: 'ADMIN', warnings: [] });
  assert.match(nonSuperMsg, /SUPER_ADMIN/);

  const warningMsg = formatPlatformSettingsSaveError(permErr, {
    role: 'SUPER_ADMIN',
    warnings: ['role has newline'],
  });
  assert.match(warningMsg, /مشكلة تنسيق في وثيقة admins/);

  const superMsg = formatPlatformSettingsSaveError(permErr, { role: 'SUPER_ADMIN', warnings: [] });
  assert.match(superMsg, /active=true/);
});
