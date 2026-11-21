import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Download,
  QrCode,
  RefreshCw,
  ScanLine,
  Smartphone,
  UserPlus,
  Video,
  X,
} from 'lucide-react';
import { encodeCode128B, parseHandrawinaJoinInput } from '../../utils/barcodeGenerator';

export type JoinBarcodeMode = 'invite' | 'pair' | 'call';

export interface MintedJoinToken {
  code: string;
  mode: JoinBarcodeMode;
  label: string;
  expiresInSec: number;
  advChallenge?: string;
  roomId?: string;
}

interface JoinBarcodeModalProps {
  open: boolean;
  initialMode?: JoinBarcodeMode;
  activeCallRoomCode?: string | null;
  onClose: () => void;
  onRedeemSuccess: (result: {
    mode: JoinBarcodeMode;
    message: string;
    conversationId?: string;
    callRoomCode?: string;
  }) => void;
}

export function BarcodeVisualCard({
  code,
  deepLinkUrl,
  caption,
}: {
  code: string;
  deepLinkUrl: string;
  caption: string;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  const linearBarcode = useMemo(() => encodeCode128B(code), [code]);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(deepLinkUrl, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [deepLinkUrl]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(deepLinkUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      setCopiedLink(false);
    }
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `handrawina-${code.toLowerCase()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-center">
        {/* 2D QR Code (ISO/IEC 18004) */}
        <div className="flex flex-col items-center bg-white border border-slate-200 rounded-md p-4">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`Kode QR Handrawina ${code}`}
              data-testid="handrawina-qr-image"
              className="w-[184px] h-[184px] object-contain"
            />
          ) : (
            <div className="w-[184px] h-[184px] flex items-center justify-center text-xs text-slate-500">
              Membuat QR Code...
            </div>
          )}
          <span className="text-[11px] font-mono text-slate-500 mt-2">
            QR Code 2D · ISO/IEC 18004
          </span>
        </div>

        {/* 1D Linear Barcode (Code-128B) + Action Buttons */}
        <div className="space-y-3">
          <div>
            <div className="text-xs font-medium text-slate-500">Kode Gabung Handrawina</div>
            <div
              className="text-lg font-mono font-bold tracking-wider text-slate-900 mt-0.5 tabular-nums"
              data-testid="join-barcode-code"
            >
              {code}
            </div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">{caption}</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-md p-3">
            <svg
              viewBox={`0 0 ${linearBarcode.totalWidth} 56`}
              className="w-full h-14 block"
              role="img"
              aria-label={`Barcode linear Code-128 ${linearBarcode.encodedText}`}
              data-testid="handrawina-linear-barcode"
            >
              <rect x="0" y="0" width={linearBarcode.totalWidth} height="56" fill="#FFFFFF" />
              {linearBarcode.bars.map((bar, idx) => (
                <rect
                  key={idx}
                  x={bar.x}
                  y="4"
                  width={bar.width}
                  height="48"
                  fill="#0F172A"
                />
              ))}
            </svg>
            <div className="text-center font-mono text-[11px] tracking-widest text-slate-700 mt-1">
              {linearBarcode.encodedText}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-md cursor-pointer"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                  Tautan Tersalin
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  Salin Tautan
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadQr}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-md cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Unduh QR
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function JoinBarcodeModal({
  open,
  initialMode = 'invite',
  activeCallRoomCode,
  onClose,
  onRedeemSuccess,
}: JoinBarcodeModalProps) {
  const [mode, setMode] = useState<JoinBarcodeMode>(initialMode);
  const [token, setToken] = useState<MintedJoinToken | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(120);

  // Redeem / scan form
  const [redeemInput, setRedeemInput] = useState('');
  const [joinDisplayName, setJoinDisplayName] = useState('');
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemFeedback, setRedeemFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setRedeemFeedback(null);
    }
  }, [open, initialMode]);

  const fetchToken = async (targetMode: JoinBarcodeMode) => {
    setLoadingToken(true);
    try {
      const res = await fetch('/api/join/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: targetMode,
          existingCallRoomCode: targetMode === 'call' ? activeCallRoomCode : undefined,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as MintedJoinToken;
        setToken(data);
        setSecondsLeft(data.expiresInSec);
      }
    } finally {
      setLoadingToken(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    fetchToken(mode);
  }, [open, mode, activeCallRoomCode]);

  useEffect(() => {
    if (!open || !token) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [open, token]);

  if (!open) return null;

  const queryParam = mode === 'call' ? 'call' : mode === 'pair' ? 'pair' : 'join';
  const deepLinkUrl = token
    ? `${window.location.origin}/?${queryParam}=${encodeURIComponent(token.code)}`
    : window.location.origin;

  const handleRedeem = async (rawCode: string) => {
    const parsed = parseHandrawinaJoinInput(rawCode);
    if (parsed.kind === 'invalid') {
      setRedeemFeedback({
        ok: false,
        text: 'Format kode tidak valid. Gunakan format HND-INV-..., HND-PAIR-..., HND-VID-... atau tautan QR Handrawina.',
      });
      return;
    }

    setRedeemBusy(true);
    setRedeemFeedback(null);
    try {
      const res = await fetch('/api/join/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: parsed.code,
          memberName: joinDisplayName.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        mode?: JoinBarcodeMode;
        message?: string;
        conversationId?: string;
        callRoomCode?: string;
      };
      if (!res.ok) {
        setRedeemFeedback({ ok: false, text: data.error ?? 'Kode barcode kedaluwarsa atau tidak dikenal.' });
        return;
      }

      const resolvedMode = data.mode ?? parsed.kind;
      const msg = data.message ?? 'Berhasil bergabung dengan Handrawina.';
      setRedeemFeedback({ ok: true, text: msg });
      setRedeemInput('');
      setJoinDisplayName('');
      onRedeemSuccess({
        mode: resolvedMode,
        message: msg,
        conversationId: data.conversationId,
        callRoomCode: data.callRoomCode,
      });
    } finally {
      setRedeemBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Barcode dan QR Code untuk Bergabung ke Handrawina"
      className="fixed inset-0 z-50 bg-slate-950/55 flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-2xl w-full overflow-hidden my-auto">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <QrCode className="w-5 h-5 text-teal-800 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-base font-display font-bold text-slate-900 truncate">
                Barcode &amp; QR Code Gabung Handrawina
              </h2>
              <p className="text-xs text-slate-600 truncate">
                Pindai QR 2D atau Barcode Code-128 untuk bergabung, menautkan perangkat, atau masuk Video Call.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup jendela barcode gabung"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Mode Tabs */}
          <div
            role="tablist"
            aria-label="Jenis barcode Handrawina"
            className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-md"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'invite'}
              onClick={() => setMode('invite')}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded transition-colors cursor-pointer ${
                mode === 'invite'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Gabung Aplikasi</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'pair'}
              onClick={() => setMode('pair')}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded transition-colors cursor-pointer ${
                mode === 'pair'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Tautkan Perangkat</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'call'}
              onClick={() => setMode('call')}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded transition-colors cursor-pointer ${
                mode === 'call'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Video className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Ruang Video Call</span>
            </button>
          </div>

          {/* Live QR + Linear Barcode Display */}
          {token ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>
                  {token.label}
                  {token.advChallenge ? ` · Challenge ${token.advChallenge}` : ''}
                </span>
                <div className="flex items-center gap-2 font-mono tabular-nums">
                  <span>Berlaku {secondsLeft} dtk</span>
                  <button
                    type="button"
                    disabled={loadingToken}
                    onClick={() => fetchToken(mode)}
                    className="inline-flex items-center gap-1 text-teal-800 hover:underline cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${loadingToken ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    Perbarui
                  </button>
                </div>
              </div>

              <BarcodeVisualCard
                code={token.code}
                deepLinkUrl={deepLinkUrl}
                caption={
                  mode === 'invite'
                    ? 'Pindai dengan kamera ponsel atau bagikan tautan untuk langsung bergabung ke ruang obrolan E2EE Handrawina.'
                    : mode === 'pair'
                    ? 'Pindai dari Ponsel Utama Handrawina untuk menandatangani kunci perangkat companion (ADV Signed Device List).'
                    : 'Pindai untuk bergabung langsung ke panggilan Video Call WebRTC terenkripsi SFrame/SRTP.'
                }
              />
            </div>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-xs text-slate-500">
              Menerbitkan token kriptografi dari server...
            </div>
          )}

          {/* Interactive Join / Scan Code Redemption */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleRedeem(redeemInput);
            }}
            className="pt-4 border-t border-slate-200 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                <ScanLine className="w-4 h-4 text-teal-800" aria-hidden="true" />
                Pindai / Gabung Menggunakan Kode Barcode
              </div>
              {token && (
                <button
                  type="button"
                  onClick={() => handleRedeem(token.code)}
                  disabled={redeemBusy}
                  className="text-xs font-medium text-teal-800 hover:underline cursor-pointer"
                >
                  Uji Pindai Kode Aktif ({token.code})
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label htmlFor="join-member-name" className="sr-only">
                  Nama Anda atau Perangkat
                </label>
                <input
                  id="join-member-name"
                  type="text"
                  value={joinDisplayName}
                  onChange={(e) => setJoinDisplayName(e.target.value)}
                  placeholder={mode === 'pair' ? 'Nama perangkat (opsional)' : 'Nama Anda (opsional)'}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                />
              </div>
              <div className="sm:col-span-2 flex gap-2">
                <label htmlFor="join-code-input" className="sr-only">
                  Kode Barcode atau Tautan QR Handrawina
                </label>
                <input
                  id="join-code-input"
                  type="text"
                  value={redeemInput}
                  onChange={(e) => setRedeemInput(e.target.value)}
                  placeholder="Tempel kode HND-INV-... / HND-PAIR-... / HND-VID-..."
                  className="flex-1 min-w-0 px-3 py-2 text-xs font-mono border border-slate-200 rounded-md"
                />
                <button
                  type="submit"
                  disabled={redeemBusy || !redeemInput.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-40 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Gabung
                </button>
              </div>
            </div>

            {redeemFeedback && (
              <div
                data-testid="join-redeem-feedback"
                className={`p-3 rounded-md text-xs border ${
                  redeemFeedback.ok
                    ? 'bg-teal-50 border-teal-200 text-teal-950'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                {redeemFeedback.text}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
