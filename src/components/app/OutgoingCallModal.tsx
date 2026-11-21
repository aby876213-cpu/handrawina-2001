import { useEffect, useMemo, useState } from 'react';
import {
  Delete,
  PhoneOutgoing,
  Search,
  Shield,
  Users,
  Video,
  X,
} from 'lucide-react';
import type { Conversation } from '../../types/handrawina';
import { normalizeDialTarget } from '../../utils/settingsAndDialer';

export interface OutgoingCallLaunchParams {
  mode: 'audio' | 'video';
  protectIpViaTurn: boolean;
  conversation?: Conversation;
  customTargetName?: string;
  customTargetHandle?: string;
}

interface OutgoingCallModalProps {
  open: boolean;
  conversations: Conversation[];
  defaultTurnProtect: boolean;
  onClose: () => void;
  onLaunchOutgoingCall: (params: OutgoingCallLaunchParams) => void;
}

const DIALPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

export function OutgoingCallModal({
  open,
  conversations,
  defaultTurnProtect,
  onClose,
  onLaunchOutgoingCall,
}: OutgoingCallModalProps) {
  const [tab, setTab] = useState<'contacts' | 'dialpad'>('contacts');
  const [searchQuery, setSearchQuery] = useState('');
  const [dialInput, setDialInput] = useState('');
  const [dialError, setDialError] = useState<string | null>(null);
  const [protectTurn, setProtectTurn] = useState(defaultTurnProtect);

  useEffect(() => {
    if (open) {
      setProtectTurn(defaultTurnProtect);
      setDialError(null);
    }
  }, [open, defaultTurnProtect]);

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.handle.toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  if (!open) return null;

  const handleDialCustom = (mode: 'audio' | 'video') => {
    const parsed = normalizeDialTarget(dialInput);
    if (!parsed.valid) {
      setDialError(parsed.error ?? 'Tujuan panggilan tidak valid.');
      return;
    }
    setDialError(null);
    setDialInput('');
    onLaunchOutgoingCall({
      mode,
      protectIpViaTurn: protectTurn,
      customTargetName: parsed.displayName,
      customTargetHandle: parsed.isPhone
        ? `Panggilan Keluar E2EE · ${parsed.normalized}`
        : 'Panggilan Keluar E2EE · Direktori Handrawina',
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mulai Panggilan Keluar Terenkripsi"
      className="fixed inset-0 z-50 bg-slate-950/55 flex items-center justify-center p-4 overflow-y-auto"
      data-testid="outgoing-call-modal"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-lg w-full overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <PhoneOutgoing className="w-5 h-5 text-teal-800 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-base font-display font-bold text-slate-900 truncate">
                Panggilan Keluar Terenkripsi
              </h2>
              <p className="text-xs text-slate-600 truncate">
                Pilih kontak Handrawina atau masukkan nomor tujuan (DTLS-SRTP / SFrame).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup jendela panggilan keluar"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Segmented Mode Switch */}
          <div
            role="tablist"
            aria-label="Mode panggilan keluar"
            className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-md"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'contacts'}
              onClick={() => setTab('contacts')}
              className={`px-3 py-2 text-xs font-medium rounded transition-colors cursor-pointer ${
                tab === 'contacts'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kontak &amp; Grup
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'dialpad'}
              onClick={() => setTab('dialpad')}
              className={`px-3 py-2 text-xs font-medium rounded transition-colors cursor-pointer ${
                tab === 'dialpad'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Papan Tombol Nomor
            </button>
          </div>

          {/* TURN Privacy Protection Toggle */}
          <label className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-md cursor-pointer">
            <div className="flex items-center gap-2 min-w-0">
              <Shield className="w-4 h-4 text-teal-800 shrink-0" aria-hidden="true" />
              <span className="text-xs text-slate-800 font-medium">
                Rute via TURN Relay (Sembunyikan Alamat IP)
              </span>
            </div>
            <input
              type="checkbox"
              checked={protectTurn}
              onChange={(e) => setProtectTurn(e.target.checked)}
              className="w-4 h-4 accent-teal-700 cursor-pointer shrink-0"
            />
          </label>

          {tab === 'contacts' ? (
            <div className="space-y-3">
              <div className="relative">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <label htmlFor="outgoing-contact-search" className="sr-only">
                  Cari kontak untuk panggilan keluar
                </label>
                <input
                  id="outgoing-contact-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama kontak, nomor, atau grup..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
                />
              </div>

              <div className="max-h-[280px] overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-md">
                {filteredContacts.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    Tidak ada kontak yang cocok. Gunakan tab Papan Tombol Nomor untuk menghubungi nomor baru.
                  </div>
                ) : (
                  filteredContacts.map((conv) => (
                    <div
                      key={conv.id}
                      className="px-3.5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-md bg-slate-200 text-slate-800 font-display font-bold text-xs flex items-center justify-center shrink-0">
                          {conv.kind === 'group' ? (
                            <Users className="w-4 h-4 text-slate-700" aria-hidden="true" />
                          ) : (
                            conv.initials
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 truncate">
                            {conv.name}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">{conv.handle}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onLaunchOutgoingCall({
                              mode: 'audio',
                              protectIpViaTurn: protectTurn,
                              conversation: conv,
                            });
                            onClose();
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-md cursor-pointer"
                        >
                          <PhoneOutgoing className="w-3.5 h-3.5" aria-hidden="true" />
                          Suara
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onLaunchOutgoingCall({
                              mode: 'video',
                              protectIpViaTurn: protectTurn,
                              conversation: conv,
                            });
                            onClose();
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
                        >
                          <Video className="w-3.5 h-3.5" aria-hidden="true" />
                          Video
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label htmlFor="outgoing-dial-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Nomor Telepon (E.164 / 08...) atau Handle Handrawina
                </label>
                <div className="flex gap-2">
                  <input
                    id="outgoing-dial-input"
                    type="text"
                    value={dialInput}
                    onChange={(e) => {
                      setDialInput(e.target.value);
                      setDialError(null);
                    }}
                    placeholder="+62 812-3456-7890"
                    className="flex-1 min-w-0 px-3 py-2 text-base font-mono tracking-wider border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-teal-700"
                  />
                  <button
                    type="button"
                    onClick={() => setDialInput((prev) => prev.slice(0, -1))}
                    aria-label="Hapus satu digit"
                    className="px-3 py-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                  >
                    <Delete className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Tactile Numeric Dialpad */}
              <div className="grid grid-cols-3 gap-2">
                {DIALPAD_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setDialInput((prev) => `${prev}${key}`);
                      setDialError(null);
                    }}
                    className="py-2.5 text-base font-mono font-semibold text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors cursor-pointer"
                  >
                    {key}
                  </button>
                ))}
              </div>

              {dialError && (
                <p className="text-xs text-red-700 font-medium" data-testid="outgoing-dial-error">
                  {dialError}
                </p>
              )}

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleDialCustom('audio')}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-md cursor-pointer"
                >
                  <PhoneOutgoing className="w-4 h-4 text-teal-800" aria-hidden="true" />
                  Panggil Suara
                </button>
                <button
                  type="button"
                  onClick={() => handleDialCustom('video')}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
                >
                  <Video className="w-4 h-4" aria-hidden="true" />
                  Video Call Keluar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
