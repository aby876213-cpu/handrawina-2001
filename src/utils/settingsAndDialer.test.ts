import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_APP_SETTINGS,
  mergeSettingsPatch,
  normalizeDialTarget,
} from './settingsAndDialer.ts';

test('normalizeDialTarget normalizes Indonesian local and E.164 phone numbers cleanly', () => {
  const local = normalizeDialTarget('0812-3456-7890');
  assert.equal(local.valid, true);
  assert.equal(local.isPhone, true);
  assert.equal(local.normalized, '+6281234567890');

  const intl = normalizeDialTarget('+62 811 9023 4410');
  assert.equal(intl.valid, true);
  assert.equal(intl.normalized, '+6281190234410');

  const tooShort = normalizeDialTarget('0812');
  assert.equal(tooShort.valid, false);
  assert.ok(tooShort.error);

  const handle = normalizeDialTarget('Nadia Kusuma');
  assert.equal(handle.valid, true);
  assert.equal(handle.isPhone, false);
  assert.equal(handle.displayName, 'Nadia Kusuma');
});

test('mergeSettingsPatch updates valid fields and ignores invalid enum values', () => {
  const updated = mergeSettingsPatch(DEFAULT_APP_SETTINGS, {
    aboutText: '  Sedang rapat arsitektur  ',
    alwaysRelayCallsTurn: true,
    readReceiptsEnabled: false,
    disappearingMessages: '7d',
    defaultVideoQuality: '480p',
  });

  assert.equal(updated.aboutText, 'Sedang rapat arsitektur');
  assert.equal(updated.alwaysRelayCallsTurn, true);
  assert.equal(updated.readReceiptsEnabled, false);
  assert.equal(updated.disappearingMessages, '7d');
  assert.equal(updated.defaultVideoQuality, '480p');

  // Invalid enum fallback must preserve previous valid state
  const safe = mergeSettingsPatch(updated, {
    disappearingMessages: 'invalid' as unknown as 'off',
    defaultVideoQuality: '4K' as unknown as '720p',
  });
  assert.equal(safe.disappearingMessages, '7d');
  assert.equal(safe.defaultVideoQuality, '480p');
});
