import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Lock,
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  PhoneIncoming,
  PhoneOff,
  PhoneOutgoing,
  QrCode,
  Shield,
  Users,
  Video,
  VideoOff,
} from 'lucide-react';
import type { CallRecord, Conversation } from '../../types/handrawina';
import { formatDuration } from '../../utils/handrawinaState';
import { parseHandrawinaJoinInput } from '../../utils/barcodeGenerator';
import { BarcodeVisualCard, type JoinBarcodeMode } from './JoinBarcodeModal';

export interface ActiveCallSession {
  roomCode: string;
  conversation: Conversation;
  mode: 'audio' | 'video';
  topology: CallRecord['topology'];
  participants: string[];
  protectIpViaTurn: boolean;
  direction?: 'outgoing' | 'incoming';
}

interface CallsWorkspaceProps {
  conversations: Conversation[];
  callRecords: CallRecord[];
  iceConfig: {
    stunUrls: string[];
    turnUrl: string;
    relayRegion: string;
  };
  defaultVideoQuality: '720p' | '480p' | '360p';
  activeCall: ActiveCallSession | null;
  onStartCall: (conversation: Conversation, mode: 'audio' | 'video') => void;
  onJoinCallByCode: (roomCode: string) => void;
  onEndCall: (durationSec: number) => Promise<void>;
  onToggleTurnProtect: () => void;
  onOpenJoinBarcode: (mode: JoinBarcodeMode) => void;
  onOpenOutgoingCallModal: () => void;
}

export function CallsWorkspace({
  conversations,
  callRecords,
  iceConfig,
  defaultVideoQuality,
  activeCall,
  onStartCall,
  onJoinCallByCode,
  onEndCall,
  onToggleTurnProtect,
  onOpenJoinBarcode,
  onOpenOutgoingCallModal,
}: CallsWorkspaceProps) {
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [showRoomBarcode, setShowRoomBarcode] = useState(false);

  // Real browser camera/screen media state
  const [hasLiveVideoTrack, setHasLiveVideoTrack] = useState(false);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Join call room by code form
  const [joinRoomInput, setJoinRoomInput] = useState('');
  const [joinRoomError, setJoinRoomError] = useState<string | null>(null);

  const stopAllMediaStreams = () => {
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setHasLiveVideoTrack(false);
    setScreenSharing(false);
  };

  // Manage call timer and real WebRTC getUserMedia capture
  useEffect(() => {
    if (!activeCall) {
      stopAllMediaStreams();
      setElapsedSec(0);
      setMuted(false);
      setCameraOn(true);
      setMediaNotice(null);
      setShowRoomBarcode(false);
      return;
    }

    let cancelled = false;
    const isVideoMode = activeCall.mode === 'video';
    setCameraOn(isVideoMode);
    setMediaNotice(null);

    const timer = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);

    async function initLocalMedia() {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) {
          setHasLiveVideoTrack(false);
          setMediaNotice(
            isVideoMode
              ? 'Kamera virtual aktif (API kamera browser tidak tersedia pada lingkungan ini).'
              : null
          );
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: isVideoMode
            ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
            : false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        cameraStreamRef.current = stream;
        const hasVideo = stream.getVideoTracks().length > 0;
        setHasLiveVideoTrack(hasVideo);
        if (localVideoRef.current && hasVideo) {
          localVideoRef.current.srcObject = stream;
        }
      } catch {
        if (!cancelled) {
          setHasLiveVideoTrack(false);
          setMediaNotice(
            isVideoMode
              ? 'Kamera fisik tidak terdeteksi atau izin ditolak — mode avatar terenkripsi aktif.'
              : 'Mikrofon fisik tidak terdeteksi — simulasi audio Opus E2EE aktif.'
          );
        }
      }
    }

    initLocalMedia();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      stopAllMediaStreams();
    };
  }, [activeCall?.roomCode, activeCall?.mode]);

  // Attach active stream to <video> element whenever cameraOn / screenSharing flips
  useEffect(() => {
    const activeStream = screenSharing ? screenStreamRef.current : cameraStreamRef.current;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = cameraOn || screenSharing ? activeStream : null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !muted;
      });
      cameraStreamRef.current.getVideoTracks().forEach((t) => {
        t.enabled = cameraOn;
      });
    }
  }, [muted, cameraOn, screenSharing, hasLiveVideoTrack]);

  const handleToggleScreenShare = async () => {
    if (screenSharing) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setScreenSharing(false);
      setMediaNotice(null);
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setMediaNotice('Berbagi layar tidak didukung di browser ini.');
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = displayStream;
      setScreenSharing(true);
      setMediaNotice('Berbagi layar aktif dengan enkripsi SFrame E2EE.');
      const [track] = displayStream.getVideoTracks();
      if (track) {
        track.onended = () => {
          screenStreamRef.current = null;
          setScreenSharing(false);
          setMediaNotice(null);
        };
      }
    } catch {
      setMediaNotice('Berbagi layar dibatalkan oleh pengguna.');
    }
  };

  const handleJoinRoomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseHandrawinaJoinInput(joinRoomInput);
    if (parsed.kind === 'call') {
      setJoinRoomError(null);
      setJoinRoomInput('');
      onJoinCallByCode(parsed.code);
      return;
    }
    setJoinRoomError('Masukkan kode ruang Video Call valid (contoh: HND-VID-8F2A10) atau tautan QR.');
  };

  const activeCallDeepLink = activeCall
    ? `${window.location.origin}/?call=${encodeURIComponent(activeCall.roomCode)}`
    : window.location.origin;

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 px-5 sm:px-8 py-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="pb-5 border-b border-slate-200 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-slate-900">
              Panggilan Suara &amp; Video Call WebRTC
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Video Call HD real-time (kamera, mikrofon, berbagi layar) dengan P2P DTLS-SRTP/TURN serta konferensi grup SFU + SFrame E2EE.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenOutgoingCallModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
            >
              <PhoneOutgoing className="w-3.5 h-3.5" aria-hidden="true" />
              Panggilan Keluar
            </button>
            <button
              type="button"
              onClick={() => onOpenJoinBarcode('call')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
              Barcode Video Call
            </button>
            <div className="text-xs font-mono text-slate-600 hidden sm:block">
              Relay: {iceConfig.relayRegion}
            </div>
          </div>
        </header>

        {/* Active WebRTC Video/Voice Call Stage */}
        {activeCall && (
          <section
            aria-label="Panggung panggilan WebRTC aktif"
            data-testid="active-call-stage"
            className="bg-slate-950 text-white rounded-lg border border-slate-800 overflow-hidden"
          >
            <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-sm font-semibold">{activeCall.conversation.name}</span>
                  <span
                    className="text-xs font-mono text-teal-300"
                    data-testid="active-call-room-code"
                  >
                    Ruang {activeCall.roomCode}
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-400 mt-0.5 tabular-nums">
                  {activeCall.direction === 'incoming' ? 'Panggilan Masuk' : 'Panggilan Keluar'} ·{' '}
                  {activeCall.topology} · {formatDuration(elapsedSec)} ·{' '}
                  {activeCall.mode === 'video'
                    ? `Video Call ${defaultVideoQuality} Simulcast`
                    : 'Audio Opus 32kbps'}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowRoomBarcode((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                    showRoomBarcode
                      ? 'bg-teal-700 border-teal-600 text-white'
                      : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                  {showRoomBarcode ? 'Tutup Barcode Ruang' : 'Undang via Barcode'}
                </button>
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300">
                  <Lock className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" />
                  <span>SFrame / SRTP E2EE</span>
                </div>
              </div>
            </div>

            {mediaNotice && (
              <div className="px-5 py-2 bg-slate-900/90 border-b border-slate-800 text-xs text-slate-300 flex items-center gap-2">
                <Camera className="w-3.5 h-3.5 text-teal-400 shrink-0" aria-hidden="true" />
                <span>{mediaNotice}</span>
              </div>
            )}

            {/* Video / Participant Grid */}
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {activeCall.participants.map((name, idx) => {
                const isLocal = idx === 0;
                const showLiveVideoElement =
                  isLocal && ((hasLiveVideoTrack && cameraOn) || screenSharing);

                return (
                  <div
                    key={`${name}-${idx}`}
                    className="relative aspect-video bg-slate-900 border border-slate-800 rounded-md overflow-hidden flex flex-col justify-between p-3.5"
                  >
                    {showLiveVideoElement && (
                      <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}

                    <div className="relative z-10 flex items-center justify-between text-[11px] font-mono text-slate-300">
                      <span className="bg-slate-950/70 px-1.5 py-0.5 rounded">
                        {isLocal ? (screenSharing ? 'Layar Anda' : 'Anda (Lokal)') : 'Peserta E2EE'}
                      </span>
                      <span className="bg-slate-950/70 px-1.5 py-0.5 rounded">
                        {isLocal && muted ? 'Mute' : 'Opus Aktif'}
                      </span>
                    </div>

                    {!showLiveVideoElement && (
                      <div className="relative z-10 flex items-center justify-center my-1">
                        <div className="w-12 h-12 rounded-lg bg-teal-800 text-white font-display font-bold flex items-center justify-center text-sm">
                          {name
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((w) => w[0])
                            .join('')}
                        </div>
                      </div>
                    )}

                    <div className="relative z-10 flex items-center justify-between text-xs">
                      <span className="font-medium truncate bg-slate-950/70 px-1.5 py-0.5 rounded">
                        {name}
                      </span>
                      <span className="text-[11px] font-mono text-teal-300 bg-slate-950/70 px-1.5 py-0.5 rounded">
                        {isLocal && screenSharing
                          ? 'Layar HD'
                          : isLocal && !cameraOn
                          ? 'Kamera Mati'
                          : activeCall.mode === 'video'
                          ? '720p'
                          : 'Audio'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Inline Scannable QR + Barcode Invite Panel for the Active Video Call */}
            {showRoomBarcode && (
              <div className="px-6 pb-6 text-slate-900" data-testid="call-inline-barcode">
                <BarcodeVisualCard
                  code={activeCall.roomCode}
                  deepLinkUrl={activeCallDeepLink}
                  caption="Bagikan atau pindai QR Code / Barcode Code-128 ini agar rekan dapat langsung masuk ke ruang Video Call WebRTC terenkripsi."
                />
              </div>
            )}

            {/* Call Control Bar */}
            <div className="px-5 py-4 border-t border-slate-800 bg-slate-900/70 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={onToggleTurnProtect}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                  activeCall.protectIpViaTurn
                    ? 'bg-teal-900/60 border-teal-600 text-teal-200'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Shield className="w-3.5 h-3.5" aria-hidden="true" />
                {activeCall.protectIpViaTurn
                  ? 'Proteksi IP TURN Aktif'
                  : 'Aktifkan Proteksi IP (TURN)'}
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                    muted
                      ? 'bg-amber-600 border-amber-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700'
                  }`}
                >
                  {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {muted ? 'Suara Dibisukan' : 'Bisukan'}
                </button>

                <button
                  type="button"
                  onClick={() => setCameraOn((c) => !c)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                    !cameraOn
                      ? 'bg-slate-700 border-slate-600 text-slate-200'
                      : 'bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700'
                  }`}
                >
                  {cameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                  {cameraOn ? 'Matikan Kamera' : 'Nyalakan Kamera'}
                </button>

                <button
                  type="button"
                  onClick={handleToggleScreenShare}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                    screenSharing
                      ? 'bg-teal-700 border-teal-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700'
                  }`}
                >
                  <MonitorUp className="w-4 h-4" aria-hidden="true" />
                  {screenSharing ? 'Hentikan Layar' : 'Bagikan Layar'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    stopAllMediaStreams();
                    onEndCall(Math.max(1, elapsedSec));
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                >
                  <PhoneOff className="w-4 h-4" aria-hidden="true" />
                  Akhiri Panggilan
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Join Video Call Room by Barcode / Room Code */}
        <section
          aria-label="Gabung ruang video call dengan kode"
          className="bg-white border border-slate-200 rounded-lg p-5"
        >
          <form onSubmit={handleJoinRoomSubmit} className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 min-w-0">
              <label htmlFor="join-video-room-input" className="block text-xs font-semibold text-slate-900 mb-1">
                Gabung Ruang Video Call via Kode Barcode
              </label>
              <input
                id="join-video-room-input"
                type="text"
                value={joinRoomInput}
                onChange={(e) => {
                  setJoinRoomInput(e.target.value);
                  setJoinRoomError(null);
                }}
                placeholder="Masukkan kode HND-VID-... atau tempel tautan undangan Video Call"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md bg-slate-50 focus:bg-white focus:outline-none focus:border-teal-700 text-slate-900"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md h-[38px] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Video className="w-3.5 h-3.5" aria-hidden="true" />
              Masuk Video Call
            </button>
          </form>
          {joinRoomError && (
            <p className="text-xs text-red-700 font-medium mt-2">{joinRoomError}</p>
          )}
        </section>

        {/* Quick Start Encrypted Calls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/80">
              <h2 className="text-sm font-semibold text-slate-900">
                Mulai Panggilan &amp; Video Call Terenkripsi
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {conv.name}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {conv.kind === 'group'
                        ? `Konferensi Grup SFU + SFrame · ${conv.participantCount.toLocaleString('id-ID')} anggota`
                        : 'Panggilan 1-on-1 P2P DTLS-SRTP / TURN'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onStartCall(conv, 'audio')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer"
                    >
                      <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                      Suara
                    </button>
                    <button
                      type="button"
                      onClick={() => onStartCall(conv, 'video')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
                    >
                      <Video className="w-3.5 h-3.5" aria-hidden="true" />
                      Video Call
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ICE / STUN / TURN Infrastructure Panel */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Konfigurasi ICE, STUN &amp; TURN Anycast
            </h2>
            <dl className="space-y-3 text-xs">
              <div>
                <dt className="text-slate-500">Server STUN Primer</dt>
                <dd className="font-mono text-slate-900 mt-0.5 break-all">{iceConfig.stunUrls[0]}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Relay TURN (TLS/5349)</dt>
                <dd className="font-mono text-slate-900 mt-0.5 break-all">{iceConfig.turnUrl}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Enkripsi Media Grup</dt>
                <dd className="text-slate-800 mt-0.5 leading-relaxed">
                  SFU hanya melihat header RTP untuk pemilihan layer Simulcast. Payload frame audio/video tetap terenkripsi <strong>SFrame E2EE</strong>.
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Call History Table */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/80">
            <h2 className="text-sm font-semibold text-slate-900">Riwayat Panggilan Terenkripsi</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-3 px-4 font-medium">Lawan Bicara / Grup</th>
                  <th className="py-3 px-4 font-medium">Arah</th>
                  <th className="py-3 px-4 font-medium">Mode</th>
                  <th className="py-3 px-4 font-medium">Topologi WebRTC</th>
                  <th className="py-3 px-4 font-medium">Waktu</th>
                  <th className="py-3 px-4 font-medium text-right">Durasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {callRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-medium text-slate-900 flex items-center gap-2">
                      {rec.participants.length > 2 ? (
                        <Users className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                      ) : (
                        <Phone className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                      )}
                      <span>{rec.peerName}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      <span className="inline-flex items-center gap-1">
                        {rec.direction === 'outgoing' ? (
                          <PhoneOutgoing className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                        ) : (
                          <PhoneIncoming className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                        )}
                        {rec.direction === 'outgoing' ? 'Keluar' : 'Masuk'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {rec.mode === 'video' ? 'Video HD' : 'Suara Opus'}
                    </td>
                    <td className="py-3 px-4 font-mono text-teal-900">{rec.topology}</td>
                    <td className="py-3 px-4 text-slate-600">{rec.startedAt}</td>
                    <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-800">
                      {formatDuration(rec.durationSec)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
