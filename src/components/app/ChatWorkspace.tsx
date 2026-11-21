import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Code2,
  Lock,
  Mic,
  Paperclip,
  PhoneOutgoing,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  Square,
  Video,
  X,
} from 'lucide-react';
import type { JoinBarcodeMode } from './JoinBarcodeModal';
import type {
  AccountProfile,
  BusinessProduct,
  ChatMessage,
  Conversation,
  ConversationKind,
} from '../../types/handrawina';
import { computeSafetyNumber } from '../../crypto/e2eeEngine';
import {
  filterConversations,
  formatDuration,
  formatIdr,
  type ChatFilterKind,
} from '../../utils/handrawinaState';

interface ChatWorkspaceProps {
  account: AccountProfile;
  localFingerprint: string;
  conversations: Conversation[];
  messagesByConv: Record<string, ChatMessage[]>;
  activeConvId: string;
  onSelectConversation: (id: string) => void;
  onSendMessage: (params: {
    conversationId: string;
    plaintext: string;
    kind?: ChatMessage['kind'];
    voiceDurationSec?: number;
    mediaLabel?: string;
    mediaSizeKb?: number;
    product?: ChatMessage['product'];
  }) => Promise<void>;
  onCreateConversation: (params: {
    name: string;
    kind: ConversationKind;
    participantCount?: number;
  }) => Promise<void>;
  onRotateGroupEpoch: (conversationId: string) => Promise<void>;
  onTypingChange: (conversationId: string, isTyping: boolean) => void;
  typingByConv: Record<string, string | null>;
  onStartCall: (conversation: Conversation, mode: 'audio' | 'video') => void;
  onOpenJoinBarcode: (mode: JoinBarcodeMode) => void;
  businessProducts: BusinessProduct[];
  wsConnected: boolean;
}

export function ChatWorkspace({
  account,
  localFingerprint,
  conversations,
  messagesByConv,
  activeConvId,
  onSelectConversation,
  onSendMessage,
  onCreateConversation,
  onRotateGroupEpoch,
  onTypingChange,
  typingByConv,
  onStartCall,
  onOpenJoinBarcode,
  businessProducts,
  wsConnected,
}: ChatWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKind, setFilterKind] = useState<ChatFilterKind>('all');
  const [mobileShowThread, setMobileShowThread] = useState(false);

  const [draftText, setDraftText] = useState('');
  const [sending, setSending] = useState(false);
  const [inspectedMsgId, setInspectedMsgId] = useState<string | null>(null);

  // Voice recording state
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [voiceSec, setVoiceSec] = useState(0);

  // Product picker popover (for business chats)
  const [showProductPicker, setShowProductPicker] = useState(false);

  // Safety Number verification modal
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [safetyNumber, setSafetyNumber] = useState<string>('');

  // New conversation modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<ConversationKind>('direct');
  const [newMembers, setNewMembers] = useState(120);
  const [newFormError, setNewFormError] = useState<string | null>(null);

  // Rotating group sender key loading state
  const [rotatingEpoch, setRotatingEpoch] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const filteredConversations = useMemo(
    () => filterConversations(conversations, { query: searchQuery, filter: filterKind }),
    [conversations, searchQuery, filterKind]
  );

  const activeConv =
    conversations.find((c) => c.id === activeConvId) ?? conversations[0] ?? null;
  const activeMessages = activeConv ? messagesByConv[activeConv.id] ?? [] : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length, activeConvId]);

  useEffect(() => {
    if (!recordingVoice) {
      setVoiceSec(0);
      return;
    }
    const timer = window.setInterval(() => {
      setVoiceSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recordingVoice]);

  useEffect(() => {
    if (!showSafetyModal || !activeConv) return;
    let mounted = true;
    computeSafetyNumber(localFingerprint, activeConv.peerPublicKeyFingerprint).then((num) => {
      if (mounted) setSafetyNumber(num);
    });
    return () => {
      mounted = false;
    };
  }, [showSafetyModal, activeConv, localFingerprint]);

  const handleSelectConv = (id: string) => {
    onSelectConversation(id);
    setMobileShowThread(true);
    setShowProductPicker(false);
    setInspectedMsgId(null);
  };

  const handleSubmitText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || !draftText.trim() || sending) return;
    const content = draftText.trim();
    setDraftText('');
    setSending(true);
    onTypingChange(activeConv.id, false);
    try {
      await onSendMessage({
        conversationId: activeConv.id,
        plaintext: content,
        kind: 'text',
      });
    } finally {
      setSending(false);
    }
  };

  const handleStopAndSendVoice = async () => {
    if (!activeConv) return;
    const duration = Math.max(1, voiceSec);
    setRecordingVoice(false);
    await onSendMessage({
      conversationId: activeConv.id,
      plaintext: `Pesan suara terenkripsi Opus (${formatDuration(duration)})`,
      kind: 'voice',
      voiceDurationSec: duration,
    });
  };

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConv) return;
    const sizeKb = Math.max(1, Math.round(file.size / 1024));
    await onSendMessage({
      conversationId: activeConv.id,
      plaintext: `Berkas terenkripsi AES-256-GCM: ${file.name} (${sizeKb} KB)`,
      kind: 'media',
      mediaLabel: file.name,
      mediaSizeKb: sizeKb,
    });
    e.target.value = '';
  };

  const handleSendProductCard = async (prod: BusinessProduct) => {
    if (!activeConv) return;
    setShowProductPicker(false);
    await onSendMessage({
      conversationId: activeConv.id,
      plaintext: `Katalog Produk: ${prod.title} (${formatIdr(prod.priceIdr)})`,
      kind: 'product',
      product: {
        productId: prod.id,
        sku: prod.sku,
        title: prod.title,
        priceIdr: prod.priceIdr,
        description: prod.description,
      },
    });
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setNewFormError('Nama kontak atau grup wajib diisi.');
      return;
    }
    setNewFormError(null);
    await onCreateConversation({
      name: newName.trim(),
      kind: newKind,
      participantCount: newKind === 'group' ? newMembers : undefined,
    });
    setNewName('');
    setShowNewModal(false);
    setMobileShowThread(true);
  };

  const handleRotateSenderKey = async () => {
    if (!activeConv || activeConv.kind !== 'group' || rotatingEpoch) return;
    setRotatingEpoch(true);
    try {
      await onRotateGroupEpoch(activeConv.id);
    } finally {
      setRotatingEpoch(false);
    }
  };

  return (
    <div className="flex-1 flex min-h-0 bg-white border-t border-slate-200 overflow-hidden">
      {/* LEFT PANE: Conversation Directory */}
      <aside
        aria-label="Daftar percakapan"
        className={`${
          mobileShowThread ? 'hidden lg:flex' : 'flex'
        } flex-col w-full lg:w-[340px] xl:w-[368px] shrink-0 border-r border-slate-200 bg-slate-50/50 min-h-0`}
      >
        <div className="p-4 border-b border-slate-200 bg-white space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-base font-display font-bold text-slate-900">Obrolan</h1>
              <p className="text-xs text-slate-500">
                {wsConnected ? 'Tersambung ke Edge WebSocket' : 'Menyambungkan ulang...'}
                {!account.primaryPhoneOnline ? ' · Mode Mandiri Web' : ''}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onOpenJoinBarcode('invite')}
                aria-label="Tampilkan Barcode dan QR Gabung Handrawina"
                className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[36px]"
              >
                <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                Barcode
              </button>
              <button
                type="button"
                onClick={() => setShowNewModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[36px]"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Baru
              </button>
            </div>
          </div>

          <div className="relative">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <label htmlFor="chat-search-input" className="sr-only">
              Cari percakapan atau label
            </label>
            <input
              id="chat-search-input"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari kontak, grup, atau label..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-100/80 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-500 focus:outline-none focus:bg-white focus:border-teal-700 transition-colors"
            />
          </div>

          <div
            role="tablist"
            aria-label="Filter percakapan"
            className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-md"
          >
            {(
              [
                { id: 'all', label: 'Semua' },
                { id: 'unread', label: 'Baru' },
                { id: 'group', label: 'Grup' },
                { id: 'business', label: 'Bisnis' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={filterKind === tab.id}
                onClick={() => setFilterKind(tab.id)}
                className={`px-2 py-1.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap truncate cursor-pointer ${
                  filterKind === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-200/70" data-testid="conversation-list">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-sm font-medium text-slate-700">Tidak ada percakapan cocok</p>
              <p className="text-xs text-slate-500">
                Ubah kata kunci pencarian atau buat obrolan E2EE baru.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFilterKind('all');
                }}
                className="mt-2 px-3 py-1.5 text-xs font-medium text-teal-800 border border-teal-200 bg-teal-50 rounded-md hover:bg-teal-100 cursor-pointer"
              >
                Reset Filter
              </button>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const convMsgs = messagesByConv[conv.id] ?? [];
              const lastMsg = convMsgs[convMsgs.length - 1];
              const isSelected = activeConv?.id === conv.id;

              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => handleSelectConv(conv.id)}
                  className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors cursor-pointer min-h-[68px] ${
                    isSelected
                      ? 'bg-teal-50/80'
                      : 'bg-white hover:bg-slate-50'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-xs font-display font-bold ${
                      conv.kind === 'group'
                        ? 'bg-slate-900 text-white'
                        : conv.kind === 'business'
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    {conv.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {conv.name}
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
                        {lastMsg?.timestamp ?? ''}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 truncate mt-0.5">
                      {lastMsg ? lastMsg.plaintext : conv.handle}
                    </p>
                    <div className="flex items-center justify-between gap-2 mt-1 text-[11px] text-slate-500">
                      <span className="truncate">
                        {conv.kind === 'group'
                          ? `${conv.participantCount.toLocaleString('id-ID')} peserta · Epoch ${conv.senderKeyEpoch ?? 1}`
                          : conv.kind === 'business'
                          ? conv.labels.length > 0
                            ? `Bisnis · ${conv.labels.join(' / ')}`
                            : 'Akun Bisnis Terverifikasi'
                          : 'Signal E2EE'}
                      </span>
                      {conv.unreadCount > 0 && (
                        <span className="font-mono font-semibold tabular-nums text-teal-800 shrink-0">
                          {conv.unreadCount} baru
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* RIGHT PANE: Active Encrypted Thread */}
      <section
        aria-label="Ruang percakapan aktif"
        className={`${
          mobileShowThread ? 'flex' : 'hidden lg:flex'
        } flex-1 flex-col min-w-0 min-h-0 bg-slate-50`}
      >
        {!activeConv ? (
          <div className="flex-1 flex items-center justify-center p-8 text-center">
            <div className="max-w-sm space-y-2">
              <p className="text-base font-semibold text-slate-900">Pilih Percakapan</p>
              <p className="text-sm text-slate-600">
                Semua obrolan pribadi, grup hingga 1.500 peserta, dan panggilan dienkripsi ujung-ke-ujung dengan Web Crypto AES-256-GCM.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Thread Header */}
            <header className="px-4 sm:px-5 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileShowThread(false)}
                  aria-label="Kembali ke daftar obrolan"
                  className="lg:hidden p-2 -ml-2 text-slate-700 hover:bg-slate-100 rounded-md min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div
                  className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-xs font-display font-bold ${
                    activeConv.kind === 'group'
                      ? 'bg-slate-900 text-white'
                      : activeConv.kind === 'business'
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-200 text-slate-800'
                  }`}
                >
                  {activeConv.initials}
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-slate-900 truncate">
                    {activeConv.name}
                  </h2>
                  <p className="text-xs text-slate-500 truncate">
                    {typingByConv[activeConv.id]
                      ? `${typingByConv[activeConv.id]} sedang mengetik...`
                      : activeConv.handle}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {activeConv.kind === 'group' && (
                  <button
                    type="button"
                    onClick={handleRotateSenderKey}
                    disabled={rotatingEpoch}
                    className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${rotatingEpoch ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    Rotasi Sender Key
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowSafetyModal(true)}
                  aria-label={`Verifikasi nomor keamanan ${activeConv.name}`}
                  className="p-2 text-slate-600 hover:text-teal-800 hover:bg-slate-100 rounded-md transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => onStartCall(activeConv, 'audio')}
                  aria-label={`Mulai panggilan keluar dengan ${activeConv.name}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-700 hover:text-teal-800 hover:bg-slate-100 rounded-md transition-colors min-h-[40px] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <PhoneOutgoing className="w-4 h-4" aria-hidden="true" />
                  <span className="hidden xl:inline">Panggilan Keluar</span>
                </button>

                <button
                  type="button"
                  onClick={() => onStartCall(activeConv, 'video')}
                  aria-label={`Mulai panggilan video dengan ${activeConv.name}`}
                  className="p-2 text-slate-600 hover:text-teal-800 hover:bg-slate-100 rounded-md transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
                >
                  <Video className="w-4 h-4" />
                </button>
              </div>
            </header>

            {/* E2EE Banner Line (Unboxed subtle technical strip) */}
            <div className="px-4 sm:px-5 py-2 bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 shrink-0">
              <div className="flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-teal-800 shrink-0" aria-hidden="true" />
                <span>
                  {activeConv.kind === 'group'
                    ? `Enkripsi Sender Keys O(1) · ${activeConv.participantCount.toLocaleString('id-ID')} peserta · Epoch ${activeConv.senderKeyEpoch ?? 1}`
                    : activeConv.kind === 'business'
                    ? 'Enkripsi Signal E2EE hingga Business API Enclave · Auto-Reply & Webhook aktif'
                    : 'Enkripsi Signal Protocol (X3DH + Double Ratchet AES-256-GCM)'}
                </span>
              </div>
              <span className="font-mono text-slate-500">
                {account.primaryPhoneOnline ? 'Multi-Device Tersinkron' : 'Ponsel Utama Offline · Web Mandiri'}
              </span>
            </div>

            {/* Message Feed */}
            <div
              className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-3"
              data-testid="message-feed"
            >
              {activeMessages.map((msg) => {
                if (msg.kind === 'system') {
                  return (
                    <div key={msg.id} className="flex justify-center my-2">
                      <div className="max-w-xl text-center text-xs text-slate-600 bg-white border border-slate-200 px-3.5 py-2 rounded-md">
                        {msg.plaintext}
                      </div>
                    </div>
                  );
                }

                const isSelf = msg.senderId === 'self';
                const isInspected = inspectedMsgId === msg.id;

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[86%] sm:max-w-[70%] rounded-lg px-4 py-2.5 border ${
                        isSelf
                          ? 'bg-teal-700 text-white border-teal-700'
                          : 'bg-white text-slate-900 border-slate-200'
                      }`}
                    >
                      {!isSelf && (
                        <div className="text-[11px] font-semibold text-teal-800 mb-1">
                          {msg.senderName}
                        </div>
                      )}

                      {msg.kind === 'product' && msg.product ? (
                        <div
                          className={`p-3 rounded-md mb-1.5 border ${
                            isSelf
                              ? 'bg-teal-800/70 border-teal-600 text-white'
                              : 'bg-slate-50 border-slate-200 text-slate-900'
                          }`}
                        >
                          <div className="text-[11px] font-mono opacity-80">
                            Katalog · {msg.product.sku}
                          </div>
                          <div className="text-sm font-semibold mt-0.5">{msg.product.title}</div>
                          <div className="text-xs opacity-90 mt-1">{msg.product.description}</div>
                          <div className="text-sm font-mono font-bold tabular-nums mt-2">
                            {formatIdr(msg.product.priceIdr)}
                          </div>
                        </div>
                      ) : msg.kind === 'voice' ? (
                        <div className="flex items-center gap-3 py-1">
                          <Mic className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <div className="flex-1 min-w-[140px]">
                            <div className="flex items-center gap-0.5 h-4">
                              {[35, 70, 50, 90, 45, 80, 60, 100, 55, 75, 40, 65].map((h, i) => (
                                <span
                                  key={i}
                                  className={`w-1 rounded-xs ${isSelf ? 'bg-teal-200' : 'bg-teal-700'}`}
                                  style={{ height: `${h}%` }}
                                />
                              ))}
                            </div>
                            <div className="text-[11px] font-mono tabular-nums mt-1 opacity-85">
                              Opus E2EE · {formatDuration(msg.voiceDurationSec ?? 12)}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                          {msg.plaintext}
                        </p>
                      )}

                      <div
                        className={`flex items-center justify-between gap-4 mt-1.5 text-[11px] ${
                          isSelf ? 'text-teal-100' : 'text-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {msg.envelope && (
                            <button
                              type="button"
                              onClick={() => setInspectedMsgId(isInspected ? null : msg.id)}
                              className={`inline-flex items-center gap-1 underline-offset-2 hover:underline cursor-pointer ${
                                isSelf ? 'text-teal-100' : 'text-teal-800'
                              }`}
                            >
                              <Code2 className="w-3 h-3" aria-hidden="true" />
                              {isInspected ? 'Tutup Ciphertext' : 'Inspeksi E2EE'}
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1 font-mono tabular-nums shrink-0">
                          <span>{msg.timestamp}</span>
                          {isSelf && (
                            <span aria-label={`Status pesan: ${msg.status}`}>
                              {msg.status === 'read' ? (
                                <CheckCheck className="w-3.5 h-3.5 text-teal-200" />
                              ) : msg.status === 'delivered' ? (
                                <CheckCheck className="w-3.5 h-3.5 opacity-80" />
                              ) : (
                                <Check className="w-3.5 h-3.5 opacity-80" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {isInspected && msg.envelope && (
                      <div
                        className="mt-1.5 max-w-[86%] sm:max-w-[70%] p-3 bg-slate-950 text-slate-200 rounded-md text-[11px] font-mono space-y-1 overflow-x-auto"
                        data-testid="ciphertext-inspector"
                      >
                        <div className="text-teal-300 font-semibold">
                          Amplop Ciphertext Zero-Knowledge ({msg.envelope.protocol})
                        </div>
                        <div>Algoritma: {msg.envelope.algorithm} · Ratchet #{msg.envelope.ratchetStep}{msg.envelope.senderKeyEpoch ? ` · Epoch ${msg.envelope.senderKeyEpoch}` : ''}</div>
                        <div>IV (96-bit): {msg.envelope.ivBase64}</div>
                        <div className="break-all text-slate-300">
                          Ciphertext: {msg.envelope.ciphertextBase64}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Product Picker Popover for Business Chats */}
            {showProductPicker && activeConv.kind === 'business' && (
              <div className="px-4 py-3 bg-white border-t border-slate-200 space-y-2 shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900">
                    Kirim Kartu Produk dari Katalog Bisnis
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowProductPicker(false)}
                    aria-label="Tutup pemilih katalog"
                    className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {businessProducts
                    .filter((p) => p.active)
                    .map((prod) => (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => handleSendProductCard(prod)}
                        className="text-left p-2.5 bg-slate-50 hover:bg-teal-50 border border-slate-200 hover:border-teal-300 rounded-md transition-colors cursor-pointer"
                      >
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {prod.title}
                        </div>
                        <div className="text-[11px] font-mono text-teal-800 mt-0.5 tabular-nums">
                          {formatIdr(prod.priceIdr)}
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Composer Footer */}
            <footer className="px-4 py-3 bg-white border-t border-slate-200 shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleAttachFile}
                className="hidden"
                aria-label="Unggah berkas media terenkripsi"
              />

              {recordingVoice ? (
                <div className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-100 rounded-md">
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-900 tabular-nums">
                    <Mic className="w-4 h-4 text-red-600" aria-hidden="true" />
                    <span>Merekam Pesan Suara Opus... {formatDuration(voiceSec)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRecordingVoice(false)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleStopAndSendVoice}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
                    >
                      <Square className="w-3 h-3" aria-hidden="true" />
                      Kirim Suara
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmitText} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Lampirkan berkas terenkripsi"
                    className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  {activeConv.kind === 'business' && (
                    <button
                      type="button"
                      onClick={() => setShowProductPicker((v) => !v)}
                      aria-label="Lampirkan kartu produk bisnis"
                      className="p-2 text-slate-600 hover:text-teal-800 hover:bg-slate-100 rounded-md transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <ShoppingBag className="w-4 h-4" />
                    </button>
                  )}

                  <label htmlFor="message-composer-input" className="sr-only">
                    Tulis pesan terenkripsi
                  </label>
                  <input
                    id="message-composer-input"
                    type="text"
                    value={draftText}
                    onChange={(e) => {
                      setDraftText(e.target.value);
                      onTypingChange(activeConv.id, e.target.value.length > 0);
                    }}
                    placeholder={
                      activeConv.kind === 'business'
                        ? 'Ketik "harga" atau "katalog" untuk uji Auto-Reply Bisnis...'
                        : 'Tulis pesan terenkripsi AES-256-GCM...'
                    }
                    className="flex-1 min-w-0 px-3.5 py-2.5 text-sm bg-slate-100/80 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-500 focus:outline-none focus:bg-white focus:border-teal-700 transition-colors"
                  />

                  <button
                    type="button"
                    onClick={() => setRecordingVoice(true)}
                    aria-label="Rekam pesan suara"
                    className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <Mic className="w-4 h-4" />
                  </button>

                  <button
                    type="submit"
                    disabled={!draftText.trim() || sending}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-40 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px]"
                  >
                    <Send className="w-3.5 h-3.5" aria-hidden="true" />
                    Kirim
                  </button>
                </form>
              )}
            </footer>
          </>
        )}
      </section>

      {/* Safety Number Verification Modal */}
      {showSafetyModal && activeConv && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Verifikasi Nomor Keamanan E2EE"
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-display font-bold text-slate-900">
                  Verifikasi Nomor Keamanan
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Bandingkan 60 digit sidik jari kriptografi SHA-256 ini dengan perangkat milik{' '}
                  <strong>{activeConv.name}</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSafetyModal(false)}
                aria-label="Tutup modal nomor keamanan"
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              className="p-4 bg-slate-50 border border-slate-200 rounded-md font-mono text-sm tracking-wider text-center text-slate-900 leading-loose tabular-nums"
              data-testid="safety-number-value"
            >
              {safetyNumber || 'Menghitung sidik jari SHA-256...'}
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Jika angka di atas identik di kedua perangkat, sesi Signal Protocol Anda bebas dari serangan Man-in-the-Middle.
            </p>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowSafetyModal(false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
              >
                Selesai Verifikasi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Conversation / Group Modal */}
      {showNewModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Buat Obrolan atau Grup E2EE Baru"
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleCreateSubmit}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-display font-bold text-slate-900">
                  Buat Obrolan / Grup E2EE Baru
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Otomatis menginisialisasi sesi Signal X3DH atau protokol Sender Keys.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                aria-label="Tutup modal obrolan baru"
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="new-conv-kind" className="block text-xs font-medium text-slate-700 mb-1">
                  Tipe Percakapan
                </label>
                <select
                  id="new-conv-kind"
                  value={newKind}
                  onChange={(e) => setNewKind(e.target.value as ConversationKind)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white text-slate-900"
                >
                  <option value="direct">Obrolan Pribadi 1-on-1 (Signal X3DH)</option>
                  <option value="group">Grup Besar Sender Keys (Maks 1.500 Peserta)</option>
                  <option value="business">Kontak Pelanggan Bisnis</option>
                </select>
              </div>

              <div>
                <label htmlFor="new-conv-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Kontak atau Grup
                </label>
                <input
                  id="new-conv-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Mis. Tim Core Infrastructure"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md text-slate-900"
                />
              </div>

              {newKind === 'group' && (
                <div>
                  <label htmlFor="new-conv-members" className="block text-xs font-medium text-slate-700 mb-1">
                    Jumlah Peserta Awal (3 – 1.500)
                  </label>
                  <input
                    id="new-conv-members"
                    type="number"
                    min={3}
                    max={1500}
                    value={newMembers}
                    onChange={(e) => setNewMembers(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md text-slate-900"
                  />
                </div>
              )}

              {newFormError && <p className="text-xs text-red-700 font-medium">{newFormError}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
              >
                Buat Percakapan
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
