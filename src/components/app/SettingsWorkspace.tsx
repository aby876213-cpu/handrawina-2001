import { useEffect, useState } from 'react';
import {
  Bell,
  Check,
  Lock,
  PhoneCall,
  RotateCcw,
  Save,
  ShieldCheck,
  User,
} from 'lucide-react';
import type { AccountProfile, AppSettings } from '../../types/handrawina';

type SettingsCategory = 'profile' | 'privacy' | 'calls' | 'notifications';

interface SettingsWorkspaceProps {
  account: AccountProfile;
  settings: AppSettings;
  onSaveSettings: (params: {
    displayName?: string;
    settings: Partial<AppSettings>;
  }) => Promise<{ ok: boolean; message: string }>;
  onResetSettings: () => Promise<void>;
  onOpenSecurityTab: () => void;
}

const CATEGORIES: {
  id: SettingsCategory;
  label: string;
  desc: string;
  icon: typeof User;
}[] = [
  {
    id: 'profile',
    label: 'Profil & Akun',
    desc: 'Nama tampilan, info status, dan identitas UUID.',
    icon: User,
  },
  {
    id: 'privacy',
    label: 'Privasi & E2EE',
    desc: 'Laporan dibaca, mengetik, dan pesan sementara.',
    icon: Lock,
  },
  {
    id: 'calls',
    label: 'Panggilan WebRTC',
    desc: 'Proteksi IP TURN, kualitas video, dan hemat data.',
    icon: PhoneCall,
  },
  {
    id: 'notifications',
    label: 'Notifikasi & Media',
    desc: 'Suara notifikasi, pratinjau pesan, dan unduh otomatis.',
    icon: Bell,
  },
];

export function SettingsWorkspace({
  account,
  settings,
  onSaveSettings,
  onResetSettings,
  onOpenSecurityTab,
}: SettingsWorkspaceProps) {
  const [category, setCategory] = useState<SettingsCategory>('profile');
  const [displayName, setDisplayName] = useState(account.displayName);
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setDisplayName(account.displayName);
    setDraft(settings);
  }, [account.displayName, settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await onSaveSettings({
        displayName: displayName.trim() || account.displayName,
        settings: draft,
      });
      setFeedback({ ok: res.ok, text: res.message });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await onResetSettings();
      setFeedback({ ok: true, text: 'Seluruh pengaturan telah dikembalikan ke konfigurasi bawaan.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 px-5 sm:px-8 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="pb-5 border-b border-slate-200 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-slate-900">
              Pengaturan Handrawina
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Atur profil akun, kontrol privasi E2EE, preferensi panggilan keluar WebRTC, dan notifikasi perangkat.
            </p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-md cursor-pointer whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Reset Bawaan
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Category Navigation */}
          <nav
            aria-label="Kategori pengaturan"
            className="lg:col-span-4 bg-white border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden"
          >
            {CATEGORIES.map((item) => {
              const Icon = item.icon;
              const active = category === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCategory(item.id)}
                  className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors cursor-pointer ${
                    active ? 'bg-teal-50/80 text-teal-900' : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 mt-0.5 shrink-0 ${
                      active ? 'text-teal-800' : 'text-slate-500'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{item.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{item.desc}</div>
                  </div>
                </button>
              );
            })}
          </nav>

          {/* Right Settings Form */}
          <form
            onSubmit={handleSave}
            className="lg:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden"
          >
            <div className="p-6 space-y-6">
              {category === 'profile' && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Profil &amp; Identitas Akun</h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Perubahan nama tampilan akan langsung tersinkron ke sesi obrolan dan panggilan aktif Anda.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="settings-display-name" className="block text-xs font-medium text-slate-700 mb-1">
                        Nama Tampilan Handrawina
                      </label>
                      <input
                        id="settings-display-name"
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-teal-700"
                      />
                    </div>

                    <div>
                      <label htmlFor="settings-about-text" className="block text-xs font-medium text-slate-700 mb-1">
                        Info / Status Profil
                      </label>
                      <input
                        id="settings-about-text"
                        type="text"
                        maxLength={140}
                        value={draft.aboutText}
                        onChange={(e) => setDraft({ ...draft, aboutText: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-teal-700"
                      />
                    </div>

                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-md text-xs">
                      <div>
                        <dt className="text-slate-500">Nomor Telepon Terdaftar</dt>
                        <dd className="font-mono font-semibold text-slate-900 mt-1">
                          {account.phoneNumber}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Account UUID Permanen</dt>
                        <dd className="font-mono text-slate-800 mt-1 break-all">
                          {account.accountId}
                        </dd>
                      </div>
                    </dl>

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <span className="text-xs text-slate-600">
                        Ingin mengganti nomor telepon atau menautkan perangkat companion?
                      </span>
                      <button
                        type="button"
                        onClick={onOpenSecurityTab}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 hover:underline whitespace-nowrap cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                        Buka Keamanan &amp; Perangkat
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {category === 'privacy' && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Privasi &amp; Enkripsi E2EE</h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Kendalikan telemetri kehadiran real-time dan retensi pesan sementara pada percakapan baru.
                    </p>
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                    <label className="p-4 flex items-center justify-between gap-4 cursor-pointer">
                      <div>
                        <div className="text-sm font-medium text-slate-900">Laporan Dibaca (Centang Biru)</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Jika dimatikan, klien tidak mengirim sinyal receipt:read saat Anda membuka obrolan.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={draft.readReceiptsEnabled}
                        onChange={(e) => setDraft({ ...draft, readReceiptsEnabled: e.target.checked })}
                        className="w-4 h-4 accent-teal-700 cursor-pointer shrink-0"
                      />
                    </label>

                    <label className="p-4 flex items-center justify-between gap-4 cursor-pointer">
                      <div>
                        <div className="text-sm font-medium text-slate-900">Indikator Sedang Mengetik</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Tampilkan status mengetik secara real-time melalui jalur WebSocket ke lawan bicara.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={draft.typingIndicatorsEnabled}
                        onChange={(e) =>
                          setDraft({ ...draft, typingIndicatorsEnabled: e.target.checked })
                        }
                        className="w-4 h-4 accent-teal-700 cursor-pointer shrink-0"
                      />
                    </label>

                    <label className="p-4 flex items-center justify-between gap-4 cursor-pointer">
                      <div>
                        <div className="text-sm font-medium text-slate-900">Kunci Layar Otomatis</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Wajibkan autentikasi ulang sesi saat jendela Handrawina Web tidak aktif selama 15 menit.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={draft.screenLockEnabled}
                        onChange={(e) => setDraft({ ...draft, screenLockEnabled: e.target.checked })}
                        className="w-4 h-4 accent-teal-700 cursor-pointer shrink-0"
                      />
                    </label>
                  </div>

                  <div>
                    <label
                      htmlFor="settings-disappearing-select"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Timer Pesan Sementara Default
                    </label>
                    <select
                      id="settings-disappearing-select"
                      value={draft.disappearingMessages}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          disappearingMessages: e.target.value as AppSettings['disappearingMessages'],
                        })
                      }
                      className="w-full sm:w-64 px-3 py-2 text-sm border border-slate-200 rounded-md bg-white text-slate-900"
                    >
                      <option value="off">Mati (Simpan Permanen di Perangkat)</option>
                      <option value="24h">24 Jam</option>
                      <option value="7d">7 Hari</option>
                      <option value="90d">90 Hari</option>
                    </select>
                  </div>
                </div>
              )}

              {category === 'calls' && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      Panggilan Keluar &amp; Jaringan WebRTC
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Pengaturan ini otomatis diterapkan saat Anda memulai Panggilan Keluar suara maupun Video Call.
                    </p>
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                    <label className="p-4 flex items-center justify-between gap-4 cursor-pointer">
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          Selalu Lindungi Alamat IP via TURN Relay
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Mengarahkan seluruh panggilan keluar melalui server TURN TLS/5349 agar alamat IP asli tidak terlihat lawan bicara.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={draft.alwaysRelayCallsTurn}
                        onChange={(e) =>
                          setDraft({ ...draft, alwaysRelayCallsTurn: e.target.checked })
                        }
                        className="w-4 h-4 accent-teal-700 cursor-pointer shrink-0"
                      />
                    </label>

                    <label className="p-4 flex items-center justify-between gap-4 cursor-pointer">
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          Mode Hemat Data Panggilan
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Menurunkan bitrate audio Opus ke 16 kbps dan membatasi simulcast video untuk jaringan seluler lambat.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={draft.lowDataCalls}
                        onChange={(e) => setDraft({ ...draft, lowDataCalls: e.target.checked })}
                        className="w-4 h-4 accent-teal-700 cursor-pointer shrink-0"
                      />
                    </label>
                  </div>

                  <div>
                    <label
                      htmlFor="settings-video-quality"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Resolusi Default Video Call
                    </label>
                    <select
                      id="settings-video-quality"
                      value={draft.defaultVideoQuality}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          defaultVideoQuality: e.target.value as AppSettings['defaultVideoQuality'],
                        })
                      }
                      className="w-full sm:w-64 px-3 py-2 text-sm border border-slate-200 rounded-md bg-white text-slate-900"
                    >
                      <option value="720p">HD 720p (Simulcast Rekomendasi)</option>
                      <option value="480p">Standar 480p (Seimbang)</option>
                      <option value="360p">Hemat 360p (Bandwidth Rendah)</option>
                    </select>
                  </div>
                </div>
              )}

              {category === 'notifications' && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Notifikasi &amp; Media</h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Kelola peringatan pesan masuk dan perilaku pengunduhan lampiran terenkripsi AES-256-GCM.
                    </p>
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                    <label className="p-4 flex items-center justify-between gap-4 cursor-pointer">
                      <div>
                        <div className="text-sm font-medium text-slate-900">Suara Notifikasi Pesan &amp; Panggilan</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Putar nada lembut saat pesan E2EE baru atau panggilan masuk diterima.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={draft.soundNotifications}
                        onChange={(e) =>
                          setDraft({ ...draft, soundNotifications: e.target.checked })
                        }
                        className="w-4 h-4 accent-teal-700 cursor-pointer shrink-0"
                      />
                    </label>

                    <label className="p-4 flex items-center justify-between gap-4 cursor-pointer">
                      <div>
                        <div className="text-sm font-medium text-slate-900">Tampilkan Pratinjau Isi Pesan</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Menampilkan potongan teks hasil dekripsi lokal pada notifikasi desktop.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={draft.messagePreview}
                        onChange={(e) => setDraft({ ...draft, messagePreview: e.target.checked })}
                        className="w-4 h-4 accent-teal-700 cursor-pointer shrink-0"
                      />
                    </label>

                    <label className="p-4 flex items-center justify-between gap-4 cursor-pointer">
                      <div>
                        <div className="text-sm font-medium text-slate-900">Unduh Otomatis Media Terenkripsi</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Otomatis mengambil dan mendekripsi foto serta pesan suara Opus saat terhubung Wi-Fi.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={draft.autoDownloadMedia}
                        onChange={(e) =>
                          setDraft({ ...draft, autoDownloadMedia: e.target.checked })
                        }
                        className="w-4 h-4 accent-teal-700 cursor-pointer shrink-0"
                      />
                    </label>
                  </div>
                </div>
              )}

              {feedback && (
                <div
                  data-testid="settings-saved-feedback"
                  className={`p-3 rounded-md text-xs border flex items-center gap-2 ${
                    feedback.ok
                      ? 'bg-teal-50 border-teal-200 text-teal-950'
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}
                >
                  <Check className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
                  <span>{feedback.text}</span>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-md cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
