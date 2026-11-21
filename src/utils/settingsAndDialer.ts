import type { AppSettings } from '../types/handrawina';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  aboutText: 'Tersedia · Enkripsi Signal Protocol E2EE Aktif',
  readReceiptsEnabled: true,
  typingIndicatorsEnabled: true,
  disappearingMessages: 'off',
  screenLockEnabled: false,
  alwaysRelayCallsTurn: false,
  lowDataCalls: false,
  defaultVideoQuality: '720p',
  soundNotifications: true,
  messagePreview: true,
  autoDownloadMedia: true,
};

export interface NormalizedDialTarget {
  valid: boolean;
  normalized: string;
  displayName: string;
  isPhone: boolean;
  error?: string;
}

/**
 * Validates and normalizes an outgoing call dial target (either phone number or Handrawina handle).
 */
export function normalizeDialTarget(rawInput: string): NormalizedDialTarget {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      valid: false,
      normalized: '',
      displayName: '',
      isPhone: false,
      error: 'Masukkan nomor telepon tujuan atau pilih kontak terlebih dahulu.',
    };
  }

  // Detect phone-like input (digits, +, spaces, hyphens, parentheses)
  const phoneLike = /^[+\d][\d\s\-()]+$/.test(trimmed);
  if (phoneLike) {
    const compact = trimmed.replace(/[\s\-()]/g, '');
    const digitsOnly = compact.replace(/^\+/, '');
    if (digitsOnly.length < 6 || digitsOnly.length > 16) {
      return {
        valid: false,
        normalized: compact,
        displayName: trimmed,
        isPhone: true,
        error: 'Nomor telepon harus terdiri dari 6 hingga 16 digit.',
      };
    }

    // Normalize Indonesian local 08... to +62 8...
    const e164 = compact.startsWith('0')
      ? `+62${compact.slice(1)}`
      : compact.startsWith('+')
      ? compact
      : `+${compact}`;

    return {
      valid: true,
      normalized: e164,
      displayName: e164,
      isPhone: true,
    };
  }

  if (trimmed.length < 2) {
    return {
      valid: false,
      normalized: trimmed,
      displayName: trimmed,
      isPhone: false,
      error: 'Nama atau handle tujuan minimal 2 karakter.',
    };
  }

  return {
    valid: true,
    normalized: trimmed,
    displayName: trimmed,
    isPhone: false,
  };
}

const VALID_DISAPPEARING = new Set<AppSettings['disappearingMessages']>(['off', '24h', '7d', '90d']);
const VALID_VIDEO_QUALITY = new Set<AppSettings['defaultVideoQuality']>(['720p', '480p', '360p']);

/**
 * Pure validator & merger for Handrawina application settings patches.
 */
export function mergeSettingsPatch(
  current: AppSettings,
  patch: Partial<AppSettings>
): AppSettings {
  const next: AppSettings = { ...current };

  if (typeof patch.aboutText === 'string') {
    const cleanAbout = patch.aboutText.trim().slice(0, 140);
    next.aboutText = cleanAbout || DEFAULT_APP_SETTINGS.aboutText;
  }
  if (typeof patch.readReceiptsEnabled === 'boolean') {
    next.readReceiptsEnabled = patch.readReceiptsEnabled;
  }
  if (typeof patch.typingIndicatorsEnabled === 'boolean') {
    next.typingIndicatorsEnabled = patch.typingIndicatorsEnabled;
  }
  if (patch.disappearingMessages && VALID_DISAPPEARING.has(patch.disappearingMessages)) {
    next.disappearingMessages = patch.disappearingMessages;
  }
  if (typeof patch.screenLockEnabled === 'boolean') {
    next.screenLockEnabled = patch.screenLockEnabled;
  }
  if (typeof patch.alwaysRelayCallsTurn === 'boolean') {
    next.alwaysRelayCallsTurn = patch.alwaysRelayCallsTurn;
  }
  if (typeof patch.lowDataCalls === 'boolean') {
    next.lowDataCalls = patch.lowDataCalls;
  }
  if (patch.defaultVideoQuality && VALID_VIDEO_QUALITY.has(patch.defaultVideoQuality)) {
    next.defaultVideoQuality = patch.defaultVideoQuality;
  }
  if (typeof patch.soundNotifications === 'boolean') {
    next.soundNotifications = patch.soundNotifications;
  }
  if (typeof patch.messagePreview === 'boolean') {
    next.messagePreview = patch.messagePreview;
  }
  if (typeof patch.autoDownloadMedia === 'boolean') {
    next.autoDownloadMedia = patch.autoDownloadMedia;
  }

  return next;
}
