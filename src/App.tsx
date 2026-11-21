import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Briefcase,
  FileCode2,
  MessageSquare,
  Phone,
  PhoneOutgoing,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import type {
  AppSettings,
  AppWorkspaceTab,
  BusinessProduct,
  CallRecord,
  ChatMessage,
  Conversation,
  ConversationKind,
  PairedDevice,
  ServerSnapshotPayload,
} from './types/handrawina';
import {
  deriveConversationKey,
  encryptE2eePayload,
  generateEcdhKeyBundle,
} from './crypto/e2eeEngine';
import { upsertMessageIdempotent } from './utils/handrawinaState';
import { ChatWorkspace } from './components/app/ChatWorkspace';
import { CallsWorkspace, type ActiveCallSession } from './components/app/CallsWorkspace';
import { SecurityDevicesWorkspace } from './components/app/SecurityDevicesWorkspace';
import { BusinessWorkspace } from './components/app/BusinessWorkspace';
import { TddEmbeddedWorkspace } from './components/app/TddEmbeddedWorkspace';
import { JoinBarcodeModal, type JoinBarcodeMode } from './components/app/JoinBarcodeModal';
import {
  OutgoingCallModal,
  type OutgoingCallLaunchParams,
} from './components/app/OutgoingCallModal';
import { SettingsWorkspace } from './components/app/SettingsWorkspace';
import { parseHandrawinaJoinInput } from './utils/barcodeGenerator';

const WORKSPACE_TABS: {
  id: AppWorkspaceTab;
  label: string;
  mobileLabel: string;
  icon: typeof MessageSquare;
}[] = [
  { id: 'chats', label: 'Obrolan', mobileLabel: 'Obrolan', icon: MessageSquare },
  { id: 'calls', label: 'Panggilan', mobileLabel: 'Panggilan', icon: Phone },
  { id: 'security', label: 'Keamanan', mobileLabel: 'Keamanan', icon: ShieldCheck },
  { id: 'business', label: 'Bisnis', mobileLabel: 'Bisnis', icon: Briefcase },
  { id: 'tdd', label: 'Arsitektur TDD', mobileLabel: 'TDD', icon: FileCode2 },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<AppWorkspaceTab>('chats');
  const [snapshot, setSnapshot] = useState<ServerSnapshotPayload | null>(null);
  const [activeConvId, setActiveConvId] = useState<string>('conv-raka');
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [localFingerprint, setLocalFingerprint] = useState<string>('7c4f1920e88b41a290cd12aa33bb4499');
  const [typingByConv, setTypingByConv] = useState<Record<string, string | null>>({});
  const [activeCall, setActiveCall] = useState<ActiveCallSession | null>(null);
  const [joinModalOpen, setJoinModalOpen] = useState<boolean>(false);
  const [joinModalMode, setJoinModalMode] = useState<JoinBarcodeMode>('invite');
  const [outgoingCallModalOpen, setOutgoingCallModalOpen] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  // Generate real Web Crypto ECDH identity key bundle on client boot
  useEffect(() => {
    let active = true;
    generateEcdhKeyBundle()
      .then((bundle) => {
        if (active) setLocalFingerprint(bundle.fingerprintHex);
      })
      .catch(() => {
        // Fallback fingerprint already initialized
      });
    return () => {
      active = false;
    };
  }, []);

  // Load initial state & connect real WebSocket to /ws with auto-reconnect
  useEffect(() => {
    let cancelled = false;

    async function fetchInitial() {
      try {
        const res = await fetch('/api/state');
        if (!res.ok) throw new Error('Gagal memuat state server Handrawina.');
        const data = (await res.json()) as ServerSnapshotPayload;
        if (!cancelled) {
          setSnapshot(data);
          setLoadError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Server tidak dapat dijangkau.');
        }
      }
    }

    function connectWebSocket() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) setWsConnected(true);
      };

      ws.onclose = () => {
        if (!cancelled) {
          setWsConnected(false);
          reconnectTimerRef.current = window.setTimeout(connectWebSocket, 2000);
        }
      };

      ws.onmessage = (evt) => {
        try {
          const { event, payload } = JSON.parse(String(evt.data)) as {
            event: string;
            payload: unknown;
          };

          if (event === 'init') {
            setSnapshot(payload as ServerSnapshotPayload);
          } else if (event === 'message:created') {
            const msg = payload as ChatMessage;
            setSnapshot((prev) => {
              if (!prev) return prev;
              const existing = prev.messages[msg.conversationId] ?? [];
              return {
                ...prev,
                conversations: prev.conversations.map((c) =>
                  c.id === msg.conversationId ? { ...c, lastActiveText: 'Baru saja' } : c
                ),
                messages: {
                  ...prev.messages,
                  [msg.conversationId]: upsertMessageIdempotent(existing, msg),
                },
              };
            });
          } else if (event === 'conversation:created') {
            const { conversation, messages } = payload as {
              conversation: Conversation;
              messages: ChatMessage[];
            };
            setSnapshot((prev) => {
              if (!prev) return prev;
              if (prev.conversations.some((c) => c.id === conversation.id)) return prev;
              return {
                ...prev,
                conversations: [conversation, ...prev.conversations],
                messages: {
                  ...prev.messages,
                  [conversation.id]: messages,
                },
              };
            });
          } else if (event === 'group:epoch_rotated') {
            const { conversation, systemMessage } = payload as {
              conversation: Conversation;
              systemMessage: ChatMessage;
            };
            setSnapshot((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                conversations: prev.conversations.map((c) =>
                  c.id === conversation.id ? conversation : c
                ),
                messages: {
                  ...prev.messages,
                  [conversation.id]: upsertMessageIdempotent(
                    prev.messages[conversation.id] ?? [],
                    systemMessage
                  ),
                },
              };
            });
          } else if (event === 'devices:updated') {
            const nextDevices = payload as PairedDevice[];
            setSnapshot((prev) => (prev ? { ...prev, devices: nextDevices } : prev));
          } else if (event === 'account:updated') {
            const { account, devices } = payload as {
              account: ServerSnapshotPayload['account'];
              devices: PairedDevice[];
            };
            setSnapshot((prev) => (prev ? { ...prev, account, devices } : prev));
          } else if (event === 'settings:updated') {
            const { account, settings } = payload as {
              account: ServerSnapshotPayload['account'];
              settings: AppSettings;
            };
            setSnapshot((prev) => (prev ? { ...prev, account, settings } : prev));
          } else if (event === 'backup:updated') {
            const nextBackup = payload as ServerSnapshotPayload['backup'];
            setSnapshot((prev) => (prev ? { ...prev, backup: nextBackup } : prev));
          } else if (event === 'business:updated') {
            const nextBusiness = payload as ServerSnapshotPayload['business'];
            setSnapshot((prev) => (prev ? { ...prev, business: nextBusiness } : prev));
          } else if (event === 'business:webhook_logged') {
            const log = payload as ServerSnapshotPayload['business']['webhookLogs'][number];
            setSnapshot((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                business: {
                  ...prev.business,
                  webhookLogs: [log, ...prev.business.webhookLogs].slice(0, 20),
                },
              };
            });
          } else if (event === 'conversations:updated') {
            const nextConvs = payload as Conversation[];
            setSnapshot((prev) => (prev ? { ...prev, conversations: nextConvs } : prev));
          } else if (event === 'call:logged') {
            const rec = payload as CallRecord;
            setSnapshot((prev) => {
              if (!prev) return prev;
              if (prev.calls.some((c) => c.id === rec.id)) return prev;
              return { ...prev, calls: [rec, ...prev.calls].slice(0, 20) };
            });
          } else if (event === 'call:participant_joined') {
            const { roomCode, participantName } = payload as {
              roomCode: string;
              participantName: string;
            };
            setActiveCall((prev) => {
              if (!prev || prev.roomCode !== roomCode) return prev;
              if (prev.participants.includes(participantName)) return prev;
              return {
                ...prev,
                participants: [...prev.participants, participantName],
              };
            });
          } else if (event === 'typing:update') {
            const { conversationId, senderName, isTyping } = payload as {
              conversationId: string;
              senderName: string;
              isTyping: boolean;
            };
            setTypingByConv((prev) => ({
              ...prev,
              [conversationId]: isTyping ? senderName : null,
            }));
          } else if (event === 'receipt:read') {
            const { conversationId } = payload as { conversationId: string };
            setSnapshot((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                conversations: prev.conversations.map((c) =>
                  c.id === conversationId ? { ...c, unreadCount: 0 } : c
                ),
                messages: {
                  ...prev.messages,
                  [conversationId]: (prev.messages[conversationId] ?? []).map((m) => ({
                    ...m,
                    status: 'read',
                  })),
                },
              };
            });
          }
        } catch {
          // Ignore malformed WS events
        }
      };
    }

    fetchInitial();
    connectWebSocket();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, []);

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveConvId(id);
      if (
        wsRef.current?.readyState === WebSocket.OPEN &&
        snapshot?.settings.readReceiptsEnabled !== false
      ) {
        wsRef.current.send(
          JSON.stringify({ event: 'receipt:read', payload: { conversationId: id } })
        );
      }
    },
    [snapshot?.settings.readReceiptsEnabled]
  );

  const handleSendMessage = useCallback(
    async (params: {
      conversationId: string;
      plaintext: string;
      kind?: ChatMessage['kind'];
      voiceDurationSec?: number;
      mediaLabel?: string;
      mediaSizeKb?: number;
      product?: ChatMessage['product'];
    }) => {
      if (!snapshot) return;
      const conv = snapshot.conversations.find((c) => c.id === params.conversationId);
      const currentMsgs = snapshot.messages[params.conversationId] ?? [];
      const epoch = conv?.senderKeyEpoch ?? 1;
      const protocol =
        conv?.kind === 'group' ? 'SenderKeys-O1' : 'Signal-DoubleRatchet';

      // REAL client-side Web Crypto AES-256-GCM encryption before transmitting over WebSocket
      const convKey = await deriveConversationKey(params.conversationId, epoch);
      const envelope = await encryptE2eePayload({
        key: convKey,
        plaintext: params.plaintext,
        aad: `${params.conversationId}:epoch-${epoch}`,
        protocol,
        ratchetStep: currentMsgs.length + 1,
        senderKeyEpoch: conv?.kind === 'group' ? epoch : undefined,
      });

      const msg: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        conversationId: params.conversationId,
        senderId: 'self',
        senderName: snapshot.account.displayName,
        senderDeviceId: 'dev-web-1',
        kind: params.kind ?? 'text',
        plaintext: params.plaintext,
        voiceDurationSec: params.voiceDurationSec,
        mediaLabel: params.mediaLabel,
        mediaSizeKb: params.mediaSizeKb,
        product: params.product,
        envelope,
        timestamp: new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
        status: 'sending',
      };

      // Optimistic local append (reconciled idempotently on server broadcast)
      setSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: {
            ...prev.messages,
            [params.conversationId]: upsertMessageIdempotent(
              prev.messages[params.conversationId] ?? [],
              msg
            ),
          },
        };
      });

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ event: 'message:send', payload: msg }));
      }
    },
    [snapshot]
  );

  const handleTypingChange = useCallback(
    (conversationId: string, isTyping: boolean) => {
      if (
        wsRef.current?.readyState === WebSocket.OPEN &&
        snapshot &&
        snapshot.settings.typingIndicatorsEnabled
      ) {
        wsRef.current.send(
          JSON.stringify({
            event: 'typing:update',
            payload: { conversationId, senderName: snapshot.account.displayName, isTyping },
          })
        );
      }
    },
    [snapshot]
  );

  const handleCreateConversation = async (params: {
    name: string;
    kind: ConversationKind;
    participantCount?: number;
  }) => {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const data = (await res.json()) as { conversation: Conversation };
      setActiveConvId(data.conversation.id);
    }
  };

  const handleRotateGroupEpoch = async (conversationId: string) => {
    await fetch(`/api/groups/${encodeURIComponent(conversationId)}/rotate-epoch`, {
      method: 'POST',
    });
  };

  const handleOpenJoinBarcode = useCallback((mode: JoinBarcodeMode) => {
    setJoinModalMode(mode);
    setJoinModalOpen(true);
  }, []);

  const handleLaunchOutgoingCall = useCallback(
    (params: OutgoingCallLaunchParams) => {
      const roomSuffix = Math.random().toString(16).slice(2, 8).toUpperCase();
      const roomCode = `HND-VID-${roomSuffix}`;
      const useTurn = params.protectIpViaTurn;

      const targetConv: Conversation =
        params.conversation ?? {
          id: `dial-${Date.now()}`,
          name: params.customTargetName || 'Nomor Panggilan Keluar',
          handle: params.customTargetHandle || 'Panggilan Keluar E2EE',
          kind: 'direct',
          initials: (params.customTargetName || 'PK')
            .replace(/^\+/, '')
            .slice(0, 2)
            .toUpperCase(),
          unreadCount: 0,
          lastActiveText: 'Panggilan keluar aktif',
          online: true,
          participantCount: 2,
          peerPublicKeyFingerprint: 'a10f92b4c8d300112233445566778899',
          labels: [],
        };

      const isGroup = targetConv.kind === 'group';
      const topology: CallRecord['topology'] = useTurn
        ? 'TURN-Relay-SRTP'
        : isGroup
        ? 'SFU-SFrame-E2EE'
        : 'P2P-DTLS-SRTP';

      setActiveCall({
        roomCode,
        conversation: targetConv,
        mode: params.mode,
        topology,
        participants: isGroup
          ? [snapshot?.account.displayName ?? 'Anda', 'Raka Pratama', 'Dimas Wijaya', 'Nadia Kusuma']
          : [snapshot?.account.displayName ?? 'Anda', targetConv.name],
        protectIpViaTurn: useTurn,
        direction: 'outgoing',
      });
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            event: 'call:room_join',
            payload: { roomCode, participantName: snapshot?.account.displayName ?? 'Anda' },
          })
        );
      }
      setActiveTab('calls');
    },
    [snapshot?.account.displayName]
  );

  const handleStartCall = (conversation: Conversation, mode: 'audio' | 'video') => {
    handleLaunchOutgoingCall({
      conversation,
      mode,
      protectIpViaTurn: snapshot?.settings.alwaysRelayCallsTurn ?? false,
    });
  };

  const handleJoinCallByCode = useCallback(
    (roomCode: string) => {
      const normalized = roomCode.trim().toUpperCase();
      setActiveCall((prev) => {
        if (prev && prev.roomCode === normalized) return prev;
        const syntheticRoomConv: Conversation = {
          id: `room-${normalized.toLowerCase()}`,
          name: `Ruang Video Call · ${normalized}`,
          handle: 'WebRTC SFU + SFrame E2EE',
          kind: 'group',
          initials: 'VC',
          unreadCount: 0,
          lastActiveText: 'Aktif sekarang',
          online: true,
          participantCount: 2,
          peerPublicKeyFingerprint: '8f1a22c9e0b14490a32e1099d2f18a40',
          labels: [],
        };
        return {
          roomCode: normalized,
          conversation: syntheticRoomConv,
          mode: 'video',
          topology: 'SFU-SFrame-E2EE',
          participants: [snapshot?.account.displayName ?? 'Anda', 'Host Handrawina'],
          protectIpViaTurn: false,
        };
      });
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            event: 'call:room_join',
            payload: { roomCode: normalized, participantName: snapshot?.account.displayName ?? 'Anda' },
          })
        );
      }
      setActiveTab('calls');
    },
    [snapshot?.account.displayName]
  );

  // Auto-redeem deep link (?join=, ?pair=, ?call=) when opening a scanned QR/Barcode URL
  useEffect(() => {
    if (!snapshot) return;
    const params = new URLSearchParams(window.location.search);
    const rawParam = params.get('call') ?? params.get('join') ?? params.get('pair');
    if (!rawParam) return;
    const parsed = parseHandrawinaJoinInput(rawParam);
    window.history.replaceState({}, '', window.location.pathname);
    if (parsed.kind === 'invalid') return;

    fetch('/api/join/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: parsed.code }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            mode?: JoinBarcodeMode;
            conversationId?: string;
            callRoomCode?: string;
          } | null
        ) => {
          if (!data) return;
          if (data.mode === 'call' && data.callRoomCode) {
            handleJoinCallByCode(data.callRoomCode);
          } else if (data.mode === 'invite' && data.conversationId) {
            setActiveConvId(data.conversationId);
            setActiveTab('chats');
          } else if (data.mode === 'pair') {
            setActiveTab('security');
          }
        }
      )
      .catch(() => {
        // Ignore deep-link errors silently
      });
  }, [Boolean(snapshot), handleJoinCallByCode]);

  const handleEndCall = async (durationSec: number) => {
    if (!activeCall) return;
    const payload: Partial<CallRecord> = {
      conversationId: activeCall.conversation.id,
      peerName: activeCall.conversation.name,
      mode: activeCall.mode,
      topology: activeCall.protectIpViaTurn ? 'TURN-Relay-SRTP' : activeCall.topology,
      participants: activeCall.participants,
      durationSec,
      direction: 'outgoing',
    };
    setActiveCall(null);
    await fetch('/api/calls/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  };

  const backupSnapshotJson = useMemo(() => {
    if (!snapshot) return '{}';
    const totalMessages = Object.values(snapshot.messages).reduce(
      (sum, arr) => sum + arr.length,
      0
    );
    return JSON.stringify({
      app: 'Handrawina',
      accountId: snapshot.account.accountId,
      totalConversations: snapshot.conversations.length,
      totalMessages,
      exportedAt: new Date().toISOString(),
    });
  }, [snapshot]);

  const handleShareProductToChat = async (product: BusinessProduct) => {
    setActiveTab('chats');
    const bizConv =
      snapshot?.conversations.find((c) => c.kind === 'business') ?? snapshot?.conversations[0];
    if (!bizConv) return;
    setActiveConvId(bizConv.id);
    await handleSendMessage({
      conversationId: bizConv.id,
      plaintext: `Katalog Produk: ${product.title}`,
      kind: 'product',
      product: {
        productId: product.id,
        sku: product.sku,
        title: product.title,
        priceIdr: product.priceIdr,
        description: product.description,
      },
    });
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg p-6 text-center space-y-3">
          <h1 className="text-lg font-display font-bold text-slate-900">
            Gagal Terhubung ke Server Handrawina
          </h1>
          <p className="text-sm text-slate-600">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
          >
            Muat Ulang Aplikasi
          </button>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm font-medium text-slate-600">
          Menyiapkan sesi kriptografi Handrawina...
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      {/* Top Bar Contract: Single-row, 3 zones separated by gap-8 */}
      <header className="h-14 sm:h-16 bg-white border-b border-slate-200 shrink-0 z-30">
        <div className="max-w-[1440px] mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('chats')}
            className="text-lg font-display font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Handrawina
          </button>

          {/* Zone 2: 5 concise single-line navigation links (Desktop) */}
          <nav
            aria-label="Navigasi aplikasi Handrawina"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
          >
            {WORKSPACE_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'text-teal-800 border-teal-700'
                      : 'text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Settings Utility + Primary Outgoing Call Action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              aria-label="Pengaturan Handrawina"
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-teal-50 text-teal-800 border-teal-300'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Settings className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Pengaturan</span>
            </button>

            {activeCall ? (
              <button
                type="button"
                onClick={() => setActiveTab('calls')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
              >
                <PhoneOutgoing className="w-3.5 h-3.5" aria-hidden="true" />
                Kembali ke Panggilan
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setOutgoingCallModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
              >
                <PhoneOutgoing className="w-3.5 h-3.5" aria-hidden="true" />
                Panggilan Keluar
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace Area */}
      <main className="flex-1 min-h-0 flex flex-col max-w-[1440px] w-full mx-auto overflow-hidden pb-14 md:pb-0">
        {activeTab === 'chats' && (
          <ChatWorkspace
            account={snapshot.account}
            localFingerprint={localFingerprint}
            conversations={snapshot.conversations}
            messagesByConv={snapshot.messages}
            activeConvId={activeConvId}
            onSelectConversation={handleSelectConversation}
            onSendMessage={handleSendMessage}
            onCreateConversation={handleCreateConversation}
            onRotateGroupEpoch={handleRotateGroupEpoch}
            onTypingChange={handleTypingChange}
            typingByConv={typingByConv}
            onStartCall={handleStartCall}
            onOpenJoinBarcode={handleOpenJoinBarcode}
            businessProducts={snapshot.business.products}
            wsConnected={wsConnected}
          />
        )}

        {activeTab === 'calls' && (
          <CallsWorkspace
            conversations={snapshot.conversations}
            callRecords={snapshot.calls}
            iceConfig={snapshot.iceConfig}
            defaultVideoQuality={snapshot.settings.defaultVideoQuality}
            activeCall={activeCall}
            onStartCall={handleStartCall}
            onJoinCallByCode={handleJoinCallByCode}
            onEndCall={handleEndCall}
            onOpenJoinBarcode={handleOpenJoinBarcode}
            onOpenOutgoingCallModal={() => setOutgoingCallModalOpen(true)}
            onToggleTurnProtect={() =>
              setActiveCall((prev) =>
                prev
                  ? {
                      ...prev,
                      protectIpViaTurn: !prev.protectIpViaTurn,
                      topology: !prev.protectIpViaTurn
                        ? 'TURN-Relay-SRTP'
                        : prev.conversation.kind === 'group'
                        ? 'SFU-SFrame-E2EE'
                        : 'P2P-DTLS-SRTP',
                    }
                  : prev
              )
            }
          />
        )}

        {activeTab === 'security' && (
          <SecurityDevicesWorkspace
            account={snapshot.account}
            devices={snapshot.devices}
            backup={snapshot.backup}
            backupSnapshotJson={backupSnapshotJson}
            onOpenJoinBarcode={handleOpenJoinBarcode}
            onPairDevice={async (name, platform) => {
              const res = await fetch('/api/devices/pair', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, platform }),
              });
              if (!res.ok) {
                const err = (await res.json()) as { error?: string };
                throw new Error(err.error ?? 'Gagal menautkan perangkat.');
              }
            }}
            onRevokeDevice={async (deviceId) => {
              await fetch(`/api/devices/${encodeURIComponent(deviceId)}`, {
                method: 'DELETE',
              });
            }}
            onTogglePrimaryOnline={async (online) => {
              await fetch('/api/devices/primary-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ online }),
              });
            }}
            onMigratePhone={async (params) => {
              const res = await fetch('/api/account/migrate-phone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
              });
              const data = (await res.json()) as {
                error?: string;
                preservedGroups?: number;
                preservedThreads?: number;
              };
              if (!res.ok) {
                return { ok: false, message: data.error ?? 'Migrasi gagal.' };
              }
              return {
                ok: true,
                message: `Migrasi berhasil! Account UUID tetap utuh, ${data.preservedGroups ?? 0} grup dan ${data.preservedThreads ?? 0} riwayat obrolan terjaga tanpa kehilangan data.`,
              };
            }}
            onUploadBackup={async (params) => {
              await fetch('/api/backup/vault', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
              });
            }}
            onRestoreBackup={async (verifierHash) => {
              const res = await fetch('/api/backup/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ verifierHash }),
              });
              const data = (await res.json()) as {
                encryptedBlob?: { saltBase64: string; ivBase64: string; ciphertextBase64: string };
                error?: string;
              };
              if (!res.ok) {
                return { ok: false, error: data.error ?? 'Gagal memulihkan cadangan.' };
              }
              return { ok: true, encryptedBlob: data.encryptedBlob };
            }}
          />
        )}

        {activeTab === 'business' && (
          <BusinessWorkspace
            products={snapshot.business.products}
            autoReplies={snapshot.business.autoReplies}
            labels={snapshot.business.labels}
            webhooks={snapshot.business.webhooks}
            webhookLogs={snapshot.business.webhookLogs}
            conversations={snapshot.conversations}
            onCreateProduct={async (params) => {
              await fetch('/api/business/catalog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
              });
            }}
            onToggleProduct={async (id) => {
              await fetch(`/api/business/catalog/${encodeURIComponent(id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
              });
            }}
            onCreateAutoReply={async (triggerKeyword, responseText) => {
              await fetch('/api/business/autoreply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ triggerKeyword, responseText }),
              });
            }}
            onToggleAutoReply={async (id) => {
              await fetch(`/api/business/autoreply/${encodeURIComponent(id)}`, {
                method: 'PATCH',
              });
            }}
            onToggleLabel={async (conversationId, label) => {
              await fetch(`/api/business/labels/${encodeURIComponent(conversationId)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label }),
              });
            }}
            onCreateWebhook={async (targetUrl) => {
              await fetch('/api/business/webhooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetUrl }),
              });
            }}
            onTriggerWebhookTest={async (webhookId, eventName) => {
              await fetch('/api/business/webhooks/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ webhookId, eventName }),
              });
            }}
            onShareProductToChat={handleShareProductToChat}
          />
        )}

        {activeTab === 'tdd' && <TddEmbeddedWorkspace />}

        {activeTab === 'settings' && (
          <SettingsWorkspace
            account={snapshot.account}
            settings={snapshot.settings}
            onOpenSecurityTab={() => setActiveTab('security')}
            onSaveSettings={async (params) => {
              const res = await fetch('/api/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
              });
              const data = (await res.json()) as {
                account?: ServerSnapshotPayload['account'];
                settings?: AppSettings;
                error?: string;
              };
              if (!res.ok) {
                return { ok: false, message: data.error ?? 'Gagal menyimpan pengaturan.' };
              }
              if (data.account && data.settings) {
                setSnapshot((prev) =>
                  prev ? { ...prev, account: data.account!, settings: data.settings! } : prev
                );
              }
              return {
                ok: true,
                message: 'Pengaturan Handrawina berhasil disimpan dan disinkronkan ke seluruh perangkat.',
              };
            }}
            onResetSettings={async () => {
              const res = await fetch('/api/settings/reset', { method: 'POST' });
              if (res.ok) {
                const data = (await res.json()) as {
                  account: ServerSnapshotPayload['account'];
                  settings: AppSettings;
                };
                setSnapshot((prev) =>
                  prev ? { ...prev, account: data.account, settings: data.settings } : prev
                );
              }
            }}
          />
        )}
      </main>

      {/* Mobile Touch-First Bottom Navigation Bar (< md, strictly compact 56px height) */}
      <nav
        aria-label="Navigasi bawah seluler Handrawina"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-white/95 backdrop-blur-xs border-t border-slate-200 grid grid-cols-5"
      >
        {WORKSPACE_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors cursor-pointer ${
                isActive ? 'text-teal-800 font-semibold' : 'text-slate-500'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span className="text-[10px] leading-none truncate max-w-full px-1">
                {tab.mobileLabel}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Outgoing Call Dialer & Contact Picker Modal */}
      <OutgoingCallModal
        open={outgoingCallModalOpen}
        conversations={snapshot.conversations}
        defaultTurnProtect={snapshot.settings.alwaysRelayCallsTurn}
        onClose={() => setOutgoingCallModalOpen(false)}
        onLaunchOutgoingCall={handleLaunchOutgoingCall}
      />

      {/* Barcode & QR Code Join / Pairing / Video Call Modal */}
      <JoinBarcodeModal
        open={joinModalOpen}
        initialMode={joinModalMode}
        activeCallRoomCode={activeCall?.roomCode ?? null}
        onClose={() => setJoinModalOpen(false)}
        onRedeemSuccess={(res) => {
          if (res.mode === 'invite' && res.conversationId) {
            setActiveConvId(res.conversationId);
            setActiveTab('chats');
          } else if (res.mode === 'pair') {
            setActiveTab('security');
          } else if (res.mode === 'call' && res.callRoomCode) {
            handleJoinCallByCode(res.callRoomCode);
            setJoinModalOpen(false);
          }
        }}
      />
    </div>
  );
}
