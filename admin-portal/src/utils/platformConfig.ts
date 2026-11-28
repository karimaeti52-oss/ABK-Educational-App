import type { BottomNavConfigItem, PlatformConfig, StaffSession, StorageProviderId } from '../types.ts';

export const PLATFORM_CONFIG_REQUIRED_BASE_KEYS = [
  'platformName',
  'homeHeadline',
  'primaryColorHex',
  'secondaryColorHex',
] as const;

export const PLATFORM_CONFIG_BRANDING_KEYS = [
  'platformName',
  'platformTagline',
  'homeHeadline',
  'welcomeTitle',
  'welcomeSubtitle',
  'logoUrl',
  'heroBannerUrl',
  'primaryColorHex',
  'secondaryColorHex',
  'accentColorHex',
  'bottomNavItems',
] as const;

export const PLATFORM_CONFIG_TOGGLE_KEYS = [
  'allowOfflinePdf',
  'showAnnouncements',
  'showContinueWatching',
  'maintenanceMode',
] as const;

export const PLATFORM_CONFIG_STORAGE_KEYS = [
  'r2WorkerBaseUrl',
  'maxVideoSizeMb',
  'maxPdfSizeMb',
  'maxImageSizeMb',
  'r2StorageLimitGb',
  'b2StorageLimitGb',
  'b2Enabled',
  'primaryStorageProvider',
  'totalStorageLimitGb',
] as const;

export const PLATFORM_CONFIG_ALLOWED_KEYS = new Set<string>([
  ...PLATFORM_CONFIG_BRANDING_KEYS,
  ...PLATFORM_CONFIG_TOGGLE_KEYS,
  ...PLATFORM_CONFIG_STORAGE_KEYS,
  'updatedBy',
  'updatedAt',
]);

const FORBIDDEN_SECRET_KEYS = new Set([
  'b2keyid',
  'b2applicationkey',
  'b2_key_id',
  'b2_application_key',
  'b2secret',
  'b2secretkey',
  'r2accesskeyid',
  'r2secretaccesskey',
  'r2_access_key_id',
  'r2_secret_access_key',
  'secretaccesskey',
  'accesskeyid',
  'applicationkey',
  'apisecret',
  'privatekey',
]);

export const DEFAULT_PLATFORM_BASE_FALLBACK = {
  platformName: 'مداد التعليمية',
  platformTagline: 'طريقك نحو التفوق',
  homeHeadline: 'ماذا تدرس اليوم؟',
  welcomeTitle: 'ابدأ رحلتك التعليمية اليوم',
  welcomeSubtitle: 'دروس مرئية، شروحات لعدة أساتذة، ملخصات واختبارات تفاعلية',
  primaryColorHex: '#142A43',
  secondaryColorHex: '#167D83',
  accentColorHex: '#C7A15A',
} as const;

export type PlatformConfigWriteScope = 'full' | 'branding' | 'general';

function clampInt(val: unknown, fallback: number, min: number, max: number): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function normalizeBoundedString(
  value: unknown,
  fallback: string,
  maxLen: number,
  allowEmpty: boolean
): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return allowEmpty ? '' : fallback;
  }
  return trimmed.slice(0, maxLen);
}

export function normalizeHexColor(value: unknown, fallback: string, allowEmpty = false): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed && allowEmpty) return '';
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  return fallback;
}

function normalizeStorageProvider(value: unknown, b2Enabled: boolean): StorageProviderId {
  if (value === 'b2' && b2Enabled) return 'b2';
  if (value === 'r2') return 'r2';
  return b2Enabled ? 'b2' : 'r2';
}

function sanitizeBottomNavItems(items: unknown): BottomNavConfigItem[] | undefined {
  if (!Array.isArray(items)) return undefined;
  return items.slice(0, 8).map((raw, index) => {
    const item = (raw && typeof raw === 'object' ? raw : {}) as Partial<BottomNavConfigItem>;
    return {
      route: typeof item.route === 'string' && item.route.trim() ? item.route.trim().slice(0, 40) : `tab_${index + 1}`,
      label: typeof item.label === 'string' && item.label.trim() ? item.label.trim().slice(0, 40) : 'قسم',
      iconKey: typeof item.iconKey === 'string' && item.iconKey.trim() ? item.iconKey.trim().slice(0, 40) : 'home',
      visible: item.visible !== false,
      sortOrder: clampInt(item.sortOrder, index + 1, 0, 100),
    };
  });
}

export function assertNoStorageSecretsInConfig(input: Record<string, unknown>): void {
  for (const [key, val] of Object.entries(input)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (FORBIDDEN_SECRET_KEYS.has(normalizedKey) && val !== undefined && val !== null && val !== '') {
      throw new Error(
        `ممنوع حفظ مفاتيح Backblaze B2 أو أسرار التخزين داخل Firestore (${key}). أضفها في Cloudflare Worker Secrets فقط.`
      );
    }
  }
}

export function extractBrandingPlatformUpdates(config: Partial<PlatformConfig>): Partial<PlatformConfig> {
  const out: Partial<PlatformConfig> = {};
  for (const key of PLATFORM_CONFIG_BRANDING_KEYS) {
    if (key in config && config[key] !== undefined) {
      (out as Record<string, unknown>)[key] = config[key];
    }
  }
  return out;
}

export function extractGeneralToggleUpdates(config: Partial<PlatformConfig>): Partial<PlatformConfig> {
  const out: Partial<PlatformConfig> = {};
  for (const key of PLATFORM_CONFIG_REQUIRED_BASE_KEYS) {
    if (key in config && config[key] !== undefined) {
      (out as Record<string, unknown>)[key] = config[key];
    }
  }
  for (const key of PLATFORM_CONFIG_TOGGLE_KEYS) {
    if (key in config && config[key] !== undefined) {
      (out as Record<string, unknown>)[key] = config[key];
    }
  }
  return out;
}

export function buildSanitizedPlatformConfigPayload({
  config,
  scope = 'full',
  updatedBy,
  updatedAt,
}: {
  config: Partial<PlatformConfig> & Record<string, unknown>;
  scope?: PlatformConfigWriteScope;
  updatedBy: string;
  updatedAt: unknown;
}): Record<string, unknown> {
  assertNoStorageSecretsInConfig(config);

  const cleanUid = normalizeBoundedString(updatedBy, 'admin', 128, false);
  const payload: Record<string, unknown> = {
    platformName: normalizeBoundedString(
      config.platformName,
      DEFAULT_PLATFORM_BASE_FALLBACK.platformName,
      60,
      false
    ),
    homeHeadline: normalizeBoundedString(
      config.homeHeadline,
      DEFAULT_PLATFORM_BASE_FALLBACK.homeHeadline,
      100,
      false
    ),
    primaryColorHex: normalizeHexColor(
      config.primaryColorHex,
      DEFAULT_PLATFORM_BASE_FALLBACK.primaryColorHex
    ),
    secondaryColorHex: normalizeHexColor(
      config.secondaryColorHex,
      DEFAULT_PLATFORM_BASE_FALLBACK.secondaryColorHex
    ),
    updatedBy: cleanUid,
    updatedAt,
  };

  if (scope === 'full' || scope === 'branding') {
    payload.platformTagline = normalizeBoundedString(
      config.platformTagline,
      DEFAULT_PLATFORM_BASE_FALLBACK.platformTagline,
      100,
      true
    );
    payload.welcomeTitle = normalizeBoundedString(
      config.welcomeTitle,
      DEFAULT_PLATFORM_BASE_FALLBACK.welcomeTitle,
      140,
      true
    );
    payload.welcomeSubtitle = normalizeBoundedString(
      config.welcomeSubtitle,
      DEFAULT_PLATFORM_BASE_FALLBACK.welcomeSubtitle,
      300,
      true
    );
    if (config.logoUrl !== undefined && config.logoUrl !== null) {
      payload.logoUrl = normalizeBoundedString(config.logoUrl, '', 1000, true);
    }
    if (config.heroBannerUrl !== undefined && config.heroBannerUrl !== null) {
      payload.heroBannerUrl = normalizeBoundedString(config.heroBannerUrl, '', 1000, true);
    }
    if (config.accentColorHex !== undefined) {
      payload.accentColorHex =
        config.accentColorHex === null
          ? null
          : normalizeHexColor(config.accentColorHex, DEFAULT_PLATFORM_BASE_FALLBACK.accentColorHex, true);
    }
    const navItems = sanitizeBottomNavItems(config.bottomNavItems);
    if (navItems) {
      payload.bottomNavItems = navItems;
    }
  }

  if (scope === 'full' || scope === 'general') {
    if (config.allowOfflinePdf !== undefined) {
      payload.allowOfflinePdf = Boolean(config.allowOfflinePdf);
    }
    if (config.showAnnouncements !== undefined) {
      payload.showAnnouncements = Boolean(config.showAnnouncements);
    }
    if (config.showContinueWatching !== undefined) {
      payload.showContinueWatching = Boolean(config.showContinueWatching);
    }
    if (config.maintenanceMode !== undefined) {
      payload.maintenanceMode = Boolean(config.maintenanceMode);
    }
  }

  if (scope === 'full') {
    if (config.r2WorkerBaseUrl !== undefined && config.r2WorkerBaseUrl !== null) {
      payload.r2WorkerBaseUrl = String(config.r2WorkerBaseUrl)
        .trim()
        .replace(/\/+$/g, '')
        .slice(0, 1000);
    }
    if (config.maxVideoSizeMb !== undefined) {
      payload.maxVideoSizeMb = clampInt(config.maxVideoSizeMb, 200, 1, 2048);
    }
    if (config.maxPdfSizeMb !== undefined) {
      payload.maxPdfSizeMb = clampInt(config.maxPdfSizeMb, 100, 1, 1024);
    }
    if (config.maxImageSizeMb !== undefined) {
      payload.maxImageSizeMb = clampInt(config.maxImageSizeMb, 20, 1, 256);
    }
    const safeB2Enabled = config.b2Enabled === true;
    const safeR2Limit = clampInt(config.r2StorageLimitGb, 10, 1, 500);
    const safeB2Limit = clampInt(config.b2StorageLimitGb, 10, 0, 500);
    if (config.r2StorageLimitGb !== undefined) {
      payload.r2StorageLimitGb = safeR2Limit;
    }
    if (config.b2StorageLimitGb !== undefined) {
      payload.b2StorageLimitGb = safeB2Limit;
    }
    if (config.b2Enabled !== undefined) {
      payload.b2Enabled = safeB2Enabled;
    }
    if (config.primaryStorageProvider !== undefined || config.b2Enabled !== undefined) {
      payload.primaryStorageProvider = normalizeStorageProvider(config.primaryStorageProvider, safeB2Enabled);
    }
    if (config.totalStorageLimitGb !== undefined) {
      payload.totalStorageLimitGb = clampInt(
        config.totalStorageLimitGb,
        safeB2Enabled ? safeR2Limit + safeB2Limit : safeR2Limit,
        1,
        1000
      );
    }
  }

  return payload;
}

export function payloadIncludesStorageSettings(payload: Record<string, unknown>): boolean {
  return PLATFORM_CONFIG_STORAGE_KEYS.some((key) => key in payload);
}

export function formatPlatformSettingsSaveError(
  err: unknown,
  staff?: Pick<StaffSession, 'role' | 'warnings'> | null
): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const msg = err instanceof Error ? err.message : String(err || '');
  const isPermissionDenied =
    /permission-denied|permission_denied|Missing or insufficient permissions/i.test(`${code} ${msg}`);

  if (!isPermissionDenied) {
    return msg || 'فشل حفظ إعدادات المنصة';
  }

  if (staff && staff.role !== 'SUPER_ADMIN') {
    return 'رفضت قواعد Firestore التعديل: تغيير إعدادات التخزين (Backblaze B2 / Cloudflare R2) مقتصر على المدير العام النشط (SUPER_ADMIN) فقط.';
  }

  if (staff?.warnings && staff.warnings.length > 0) {
    return 'رفضت قواعد Firestore حفظ الإعدادات (permission-denied) بسبب مشكلة تنسيق في وثيقة admins/{uid}. نظّف حقل role أو أعد التحقق من الصلاحية ثم أعد المحاولة.';
  }

  return 'رفضت قواعد Firestore حفظ إعدادات المنصة (permission-denied). تأكد من أن حسابك نشط بدور SUPER_ADMIN في وثيقة admins/{uid} (active=true) وأن توكن Firebase محدّث، ثم أعد المحاولة.';
}
