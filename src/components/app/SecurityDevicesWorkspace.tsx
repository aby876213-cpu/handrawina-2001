import { useState } from 'react';
import {
  Check,
  KeyRound,
  Laptop,
  Lock,
  Plus,
  QrCode,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Trash2,
} from 'lucide-react';
import type { JoinBarcodeMode } from './JoinBarcodeModal';
import type {
  AccountProfile,
  HsmBackupState,
  PairedDevice,
} from '../../types/handrawina';
import {
  decryptCloudBackup,
  encryptCloudBackup,
  generate64DigitRecoveryKey,
} from '../../crypto/e2eeEngine';

interface SecurityDevicesWorkspaceProps {
  account: AccountProfile;
  devices: PairedDevice[];
  backup: HsmBackupState;
  backupSnapshotJson: string;
  onPairDevice: (name: string, platform: PairedDevice['platform']) => Promise<void>;
  onRevokeDevice: (deviceId: string) => Promise<void>;
  onTogglePrimaryOnline: (online: boolean) => Promise<void>;
  onMigratePhone: (params: {
    newPhoneNumber: string;
    oldOtp: string;
    newOtp: string;
  }) => Promise<{ ok: boolean; message: string }>;
  onUploadBackup: (params: {
    verifierHash: string;
    encryptedBlob: { saltBase64: string; ivBase64: string; ciphertextBase64: string };
    protectionMode: 'password-opaque' | 'key-64digit';
  }) => Promise<void>;
  onRestoreBackup: (verifierHash: string) => Promise<{
    ok: boolean;
    encryptedBlob?: { saltBase64: string; ivBase64: string; ciphertextBase64: string };
    error?: string;
  }>;
  onOpenJoinBarcode: (mode: JoinBarcodeMode) => void;
}

async function computeOpaqueVerifier(secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(`Handrawina-OPAQUE-Verifier::${secret}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function SecurityDevicesWorkspace({
  account,
  devices,
  backup,
  backupSnapshotJson,
  onPairDevice,
  onRevokeDevice,
  onTogglePrimaryOnline,
  onMigratePhone,
  onUploadBackup,
  onRestoreBackup,
  onOpenJoinBarcode,
}: SecurityDevicesWorkspaceProps) {
  // Multi-Device Pairing Form
  const [deviceName, setDeviceName] = useState('');
  const [devicePlatform, setDevicePlatform] = useState<PairedDevice['platform']>('Desktop');
  const [deviceError, setDeviceError] = useState<string | null>(null);

  // Phone Number Migration Form
  const [newPhone, setNewPhone] = useState('');
  const [oldOtp, setOldOtp] = useState('482910');
  const [newOtp, setNewOtp] = useState('739104');
  const [migrationStatus, setMigrationStatus] = useState<{ ok: boolean; text: string } | null>(null);

  // HSM Cloud Backup State
  const [protectionMode, setProtectionMode] = useState<'password-opaque' | 'key-64digit'>(
    'password-opaque'
  );
  const [backupPassword, setBackupPassword] = useState('');
  const [recoveryKey64, setRecoveryKey64] = useState(() => generate64DigitRecoveryKey());
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [restoreInput, setRestoreInput] = useState('');
  const [restoreResult, setRestoreResult] = useState<{ ok: boolean; text: string } | null>(null);

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceName.trim()) {
      setDeviceError('Masukkan nama perangkat companion.');
      return;
    }
    setDeviceError(null);
    try {
      await onPairDevice(deviceName.trim(), devicePlatform);
      setDeviceName('');
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : 'Gagal menautkan perangkat.');
    }
  };

  const handleMigrateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await onMigratePhone({
      newPhoneNumber: newPhone,
      oldOtp,
      newOtp,
    });
    setMigrationStatus({ ok: res.ok, text: res.message });
    if (res.ok) setNewPhone('');
  };

  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    const secret = protectionMode === 'password-opaque' ? backupPassword.trim() : recoveryKey64;
    if (protectionMode === 'password-opaque' && secret.length < 6) {
      setBackupNotice('Kata sandi cadangan minimal 6 karakter.');
      return;
    }
    setBackupNotice(null);
    const encryptedBlob = await encryptCloudBackup(backupSnapshotJson, secret);
    const verifierHash = await computeOpaqueVerifier(secret);
    await onUploadBackup({ verifierHash, encryptedBlob, protectionMode });
    setBackupNotice(
      'Cadangan terenkripsi AES-256-GCM berhasil diunggah ke S3 & terdaftar di brankas HSM OPAQUE.'
    );
    setRestoreResult(null);
  };

  const handleTestRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreInput.trim()) {
      setRestoreResult({ ok: false, text: 'Masukkan kata sandi atau kunci 64-digit untuk uji pemulihan.' });
      return;
    }
    const verifierHash = await computeOpaqueVerifier(restoreInput.trim());
    const res = await onRestoreBackup(verifierHash);
    if (!res.ok || !res.encryptedBlob) {
      setRestoreResult({ ok: false, text: res.error ?? 'Gagal membuka brankas HSM.' });
      return;
    }
    try {
      const decryptedJson = await decryptCloudBackup(res.encryptedBlob, restoreInput.trim());
      const parsed = JSON.parse(decryptedJson) as { totalMessages?: number; totalConversations?: number };
      setRestoreResult({
        ok: true,
        text: `Dekripsi lokal sukses! ${parsed.totalConversations ?? 0} percakapan & ${parsed.totalMessages ?? 0} pesan dipulihkan secara utuh.`,
      });
    } catch {
      setRestoreResult({ ok: false, text: 'Gagal mendekripsi blob AES-256-GCM di perangkat.' });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 px-5 sm:px-8 py-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="pb-5 border-b border-slate-200">
          <h1 className="text-2xl font-display font-bold text-slate-900">
            Perangkat Tertaut, Migrasi Nomor &amp; HSM Cloud Backup
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Kelola arsitektur multi-device independen (ADV), migrasi nomor tanpa kehilangan data, serta cadangan cloud E2EE dengan perlindungan brute-force HSM.
          </p>
        </header>

        {/* SECTION 1: MULTI-DEVICE COMPANION MANAGER */}
        <section
          aria-label="Manajemen Multi-Device Independen"
          className="bg-white border border-slate-200 rounded-lg overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                1. Arsitektur Multi-Device Independen ({devices.length} / 5 Perangkat)
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Setiap perangkat memiliki kunci privat Signal sendiri bertanda tangan ADV. Ponsel utama dapat offline tanpa memutus sesi Web/Desktop.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onOpenJoinBarcode('pair')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                QR &amp; Barcode Pairing
              </button>
              <button
                type="button"
                onClick={() => onTogglePrimaryOnline(!account.primaryPhoneOnline)}
                className={`px-3.5 py-2 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  account.primaryPhoneOnline
                    ? 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                    : 'bg-teal-700 text-white border-teal-700 hover:bg-teal-800'
                }`}
              >
                {account.primaryPhoneOnline
                  ? 'Uji Ponsel Utama Offline'
                  : 'Aktifkan Kembali Ponsel Utama'}
              </button>
            </div>
          </div>

          <div className="p-5 space-y-5">
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
              {devices.map((dev) => (
                <div
                  key={dev.deviceId}
                  className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {dev.isPrimary ? (
                      <Smartphone className="w-4 h-4 text-teal-800 shrink-0" aria-hidden="true" />
                    ) : (
                      <Laptop className="w-4 h-4 text-slate-600 shrink-0" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{dev.name}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        {dev.platform} · {dev.advSignatureShort} · {dev.lastActive}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`text-xs font-medium ${
                        dev.online ? 'text-teal-800' : 'text-amber-800'
                      }`}
                    >
                      {dev.online ? 'Online' : 'Offline'}
                    </span>
                    {!dev.isPrimary && (
                      <button
                        type="button"
                        onClick={() => onRevokeDevice(dev.deviceId)}
                        aria-label={`Cabut perangkat ${dev.name}`}
                        className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddDevice} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div className="sm:col-span-2">
                <label htmlFor="pair-dev-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Tautkan Perangkat Companion Baru (QR ADV)
                </label>
                <input
                  id="pair-dev-name"
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="Mis. Handrawina Desktop (Linux ThinkPad)"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white text-slate-900"
                />
              </div>
              <div>
                <label htmlFor="pair-dev-platform" className="block text-xs font-medium text-slate-700 mb-1">
                  Platform
                </label>
                <select
                  id="pair-dev-platform"
                  value={devicePlatform}
                  onChange={(e) => setDevicePlatform(e.target.value as PairedDevice['platform'])}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white text-slate-900"
                >
                  <option value="Desktop">Desktop</option>
                  <option value="Web">Web Browser</option>
                  <option value="Android">Android Tablet</option>
                  <option value="iOS">iPadOS</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={devices.length >= 5}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-40 rounded-md h-[38px] cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Tautkan Perangkat
              </button>
            </form>
            {deviceError && <p className="text-xs text-red-700 font-medium">{deviceError}</p>}
          </div>
        </section>

        {/* SECTION 2: ZERO-LOSS PHONE NUMBER MIGRATION */}
        <section
          aria-label="Migrasi Nomor Telepon Tanpa Kehilangan Data"
          className="bg-white border border-slate-200 rounded-lg overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80">
            <h2 className="text-base font-semibold text-slate-900">
              2. Skema Migrasi / Ganti Nomor Telepon (Zero Data Loss)
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Identitas kriptografi dan seluruh keanggotaan grup ditambatkan pada UUID permanen, bukan nomor telepon.
            </p>
          </div>

          <div className="p-5 space-y-5">
            <dl
              className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-md text-xs"
              data-testid="account-identity-summary"
            >
              <div>
                <dt className="text-slate-500">Account UUID Permanen</dt>
                <dd className="font-mono text-slate-900 mt-1 break-all">{account.accountId}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Nomor Aktif &amp; HMAC Hash</dt>
                <dd className="font-mono text-teal-900 font-semibold mt-1">
                  {account.phoneNumber} · hash:{account.phoneHashShort}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Primary Identity Key</dt>
                <dd className="font-mono text-slate-900 mt-1">
                  {account.primaryIdentityPubShort} · Migrasi: {account.migratedCount}x
                </dd>
              </div>
            </dl>

            <form onSubmit={handleMigrateSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div className="sm:col-span-2">
                <label htmlFor="migrate-new-phone" className="block text-xs font-medium text-slate-700 mb-1">
                  Nomor Telepon Baru (Format E.164)
                </label>
                <input
                  id="migrate-new-phone"
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+62 815-9900-7711"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md text-slate-900"
                />
              </div>
              <div>
                <label htmlFor="migrate-old-otp" className="block text-xs font-medium text-slate-700 mb-1">
                  OTP Lama / OTP Baru
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    id="migrate-old-otp"
                    type="text"
                    maxLength={6}
                    value={oldOtp}
                    onChange={(e) => setOldOtp(e.target.value)}
                    aria-label="Kode OTP nomor lama"
                    className="w-full px-2 py-2 text-xs font-mono text-center border border-slate-200 rounded-md"
                  />
                  <input
                    type="text"
                    maxLength={6}
                    value={newOtp}
                    onChange={(e) => setNewOtp(e.target.value)}
                    aria-label="Kode OTP nomor baru"
                    className="w-full px-2 py-2 text-xs font-mono text-center border border-slate-200 rounded-md"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md h-[38px] cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                Migrasi Nomor
              </button>
            </form>

            {migrationStatus && (
              <div
                data-testid="migration-feedback"
                className={`p-3 rounded-md text-xs border ${
                  migrationStatus.ok
                    ? 'bg-teal-50 border-teal-200 text-teal-950'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                {migrationStatus.text}
              </div>
            )}
          </div>
        </section>

        {/* SECTION 3: E2EE CLOUD BACKUP (HSM KEY VAULT / OPAQUE) */}
        <section
          aria-label="Cloud Backup E2EE Berbasis HSM Key Vault"
          className="bg-white border border-slate-200 rounded-lg overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                3. Cloud Backup E2EE &amp; Brankas Kunci HSM (OPAQUE)
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Enkripsi AES-256-GCM dilakukan lokal sebelum diunggah ke S3. Klaster HSM menegakkan batas keras 5 percobaan kata sandi.
              </p>
            </div>
            <div className="text-xs font-mono tabular-nums text-slate-700" data-testid="hsm-status-summary">
              {backup.lockedWiped
                ? 'SLOT HSM DIMUSNAHKAN (5/5 GAGAL)'
                : backup.hasBackup
                ? `Cadangan Aktif · Percobaan Gagal: ${backup.failedAttempts}/${backup.maxAttempts}`
                : 'Belum Ada Cadangan'}
            </div>
          </div>

          <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Create / Upload E2EE Backup */}
            <form onSubmit={handleCreateBackup} className="space-y-4">
              <div className="text-xs font-semibold text-slate-900">
                Buat &amp; Unggah Cadangan Terenkripsi Baru
              </div>

              <div role="tablist" aria-label="Metode proteksi backup" className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-md">
                <button
                  type="button"
                  role="tab"
                  aria-selected={protectionMode === 'password-opaque'}
                  onClick={() => setProtectionMode('password-opaque')}
                  className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer ${
                    protectionMode === 'password-opaque'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  Kata Sandi (HSM OPAQUE)
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={protectionMode === 'key-64digit'}
                  onClick={() => setProtectionMode('key-64digit')}
                  className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer ${
                    protectionMode === 'key-64digit'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  Kunci 64-Digit Hex
                </button>
              </div>

              {protectionMode === 'password-opaque' ? (
                <div>
                  <label htmlFor="hsm-backup-pass" className="block text-xs font-medium text-slate-700 mb-1">
                    Kata Sandi Cadangan (Tidak Pernah Dikirim Mentah ke Server)
                  </label>
                  <input
                    id="hsm-backup-pass"
                    type="password"
                    value={backupPassword}
                    onChange={(e) => setBackupPassword(e.target.value)}
                    placeholder="Minimal 6 karakter..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">Kunci Pemulihan 256-bit (64 Digit)</span>
                    <button
                      type="button"
                      onClick={() => setRecoveryKey64(generate64DigitRecoveryKey())}
                      className="text-xs text-teal-800 hover:underline cursor-pointer"
                    >
                      Bangkitkan Ulang
                    </button>
                  </div>
                  <div className="p-3 bg-slate-950 text-teal-200 font-mono text-xs break-all rounded-md">
                    {recoveryKey64}
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                Enkripsi &amp; Unggah ke S3 Vault
              </button>

              {backupNotice && (
                <p className="text-xs text-teal-900 bg-teal-50 border border-teal-200 p-3 rounded-md">
                  {backupNotice}
                </p>
              )}
            </form>

            {/* Verify Restore & HSM Brute-Force Guard */}
            <form onSubmit={handleTestRestore} className="space-y-4 lg:border-l lg:border-slate-200 lg:pl-6">
              <div className="text-xs font-semibold text-slate-900">
                Uji Pemulihan &amp; Rate-Limit Perangkat Keras HSM
              </div>

              {backup.hasBackup && backup.ciphertextPreview ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-[11px] font-mono space-y-1">
                  <div className="text-slate-500">Objek S3: {backup.s3BlobKey}</div>
                  <div className="text-slate-800 break-all">
                    Ciphertext: {backup.ciphertextPreview}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600">
                  Buat cadangan di panel kiri terlebih dahulu untuk menguji dekripsi OPAQUE dan proteksi 5 percobaan HSM.
                </div>
              )}

              <div>
                <label htmlFor="hsm-restore-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Masukkan Kata Sandi / Kunci 64-Digit (Coba Salah untuk Uji HSM Guard)
                </label>
                <input
                  id="hsm-restore-input"
                  type="text"
                  value={restoreInput}
                  onChange={(e) => setRestoreInput(e.target.value)}
                  placeholder="Masukkan kata sandi cadangan..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                />
              </div>

              <button
                type="submit"
                disabled={!backup.hasBackup}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 disabled:opacity-40 rounded-md cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                Uji Autentikasi HSM &amp; Dekripsi
              </button>

              {restoreResult && (
                <div
                  data-testid="hsm-restore-feedback"
                  className={`p-3 rounded-md text-xs border flex items-start gap-2 ${
                    restoreResult.ok
                      ? 'bg-teal-50 border-teal-200 text-teal-950'
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}
                >
                  {restoreResult.ok ? (
                    <Check className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                  )}
                  <span>{restoreResult.text}</span>
                </div>
              )}
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
