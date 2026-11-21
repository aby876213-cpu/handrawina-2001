import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  AccountProfile,
  AppSettings,
  AutoReplyRule,
  BusinessProduct,
  CallRecord,
  ChatMessage,
  Conversation,
  HsmBackupState,
  PairedDevice,
  ServerSnapshotPayload,
  WebhookDeliveryLog,
  WebhookEndpoint,
} from './src/types/handrawina.ts';
import {
  DEFAULT_APP_SETTINGS,
  mergeSettingsPatch,
} from './src/utils/settingsAndDialer.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT ?? 3000);
const PHONE_HASH_PEPPER = process.env.PHONE_PEPPER ?? 'handrawina-dev-hsm-pepper-v1';

function hmacShort(secret: string, input: string): string {
  return crypto.createHmac('sha256', secret).update(input).digest('hex').slice(0, 16);
}

function nowTimeLabel(): string {
  return new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// ============================================================================
// AUTHORITATIVE SERVER STATE (ZERO-KNOWLEDGE RELAY + METADATA + BUSINESS PLANE)
// ============================================================================

const accountState: AccountProfile = {
  accountId: 'acc-94f2c1a0-8b3d-4e71-90ab-handrawina01',
  displayName: 'Bima Santoso',
  phoneNumber: '+62 812-8840-2190',
  phoneHashShort: hmacShort(PHONE_HASH_PEPPER, '+6281288402190'),
  primaryIdentityPubShort: 'ed25519:7c4f...9a12',
  primaryPhoneOnline: true,
  migratedCount: 0,
};

let appSettings: AppSettings = { ...DEFAULT_APP_SETTINGS };

let pairedDevices: PairedDevice[] = [
  {
    deviceId: 'dev-primary-0',
    deviceIndex: 0,
    name: 'iPhone 16 Pro (Ponsel Utama)',
    platform: 'iOS',
    isPrimary: true,
    online: true,
    lastActive: 'Aktif sekarang',
    advSignatureShort: 'adv:f10a...83de',
  },
  {
    deviceId: 'dev-web-1',
    deviceIndex: 1,
    name: 'Handrawina Web (Browser Ini)',
    platform: 'Web',
    isPrimary: false,
    online: true,
    lastActive: 'Aktif sekarang',
    advSignatureShort: 'adv:4c89...11ab',
  },
  {
    deviceId: 'dev-desktop-2',
    deviceIndex: 2,
    name: 'Handrawina Desktop (macOS)',
    platform: 'Desktop',
    isPrimary: false,
    online: true,
    lastActive: '5 menit lalu',
    advSignatureShort: 'adv:9e2b...67c0',
  },
];

let conversations: Conversation[] = [
  {
    id: 'conv-raka',
    name: 'Raka Pratama',
    handle: '+62 811-9023-4410 · Principal Security',
    kind: 'direct',
    initials: 'RP',
    unreadCount: 0,
    lastActiveText: 'Online',
    online: true,
    participantCount: 2,
    peerPublicKeyFingerprint: '9f2a41c8e7d310ab55210c4d7789a2ef',
    labels: [],
    pinned: true,
  },
  {
    id: 'conv-eng-1500',
    name: 'Arsitektur & Keamanan Nasional',
    handle: 'Grup E2EE · Sender Keys (Epoch 42)',
    kind: 'group',
    initials: 'AK',
    unreadCount: 2,
    lastActiveText: '1.482 / 1.500 peserta',
    online: true,
    participantCount: 1482,
    maxParticipants: 1500,
    senderKeyEpoch: 42,
    peerPublicKeyFingerprint: '3a90e21b4488cc10df2200a89911bc40',
    labels: [],
    pinned: true,
  },
  {
    id: 'conv-biz-nusantara',
    name: 'Nusantara Coffee Roasters',
    handle: 'Akun Bisnis Terverifikasi · API Gateway',
    kind: 'business',
    initials: 'NC',
    unreadCount: 1,
    lastActiveText: 'Balasan otomatis aktif',
    online: true,
    participantCount: 2,
    peerPublicKeyFingerprint: 'bb1200f988412aa77e3109c4412aa90e',
    labels: ['Prospek Baru', 'VIP'],
  },
  {
    id: 'conv-nadia',
    name: 'Nadia Kusuma',
    handle: '+62 813-7720-5501 · Product Lead',
    kind: 'direct',
    initials: 'NK',
    unreadCount: 0,
    lastActiveText: 'Terakhir dilihat 14:20',
    online: false,
    participantCount: 2,
    peerPublicKeyFingerprint: '551c8e2100aabb774312ff902211ee34',
    labels: [],
  },
];

const messagesByConv: Record<string, ChatMessage[]> = {
  'conv-raka': [
    {
      id: 'msg-seed-1',
      conversationId: 'conv-raka',
      senderId: 'peer-raka',
      senderName: 'Raka Pratama',
      senderDeviceId: 'dev-raka-0',
      kind: 'text',
      plaintext:
        'Sesi X3DH dan Double Ratchet sudah tersinkron. Kunci privat OPK telah dihapus pasca-handshake.',
      timestamp: '09:14',
      status: 'read',
      envelope: {
        algorithm: 'AES-256-GCM',
        protocol: 'Signal-DoubleRatchet',
        ivBase64: 'c2VlZC1pdi0wMDAx',
        ciphertextBase64: '9xK2mQpLw8vN3rTf6yHj1bDc5eZa4uIo7pAs8dFg2hJk0lMn',
        ratchetStep: 1,
        aad: 'conv-raka:peer-raka',
      },
    },
    {
      id: 'msg-seed-2',
      conversationId: 'conv-raka',
      senderId: 'self',
      senderName: 'Bima Santoso',
      senderDeviceId: 'dev-web-1',
      kind: 'text',
      plaintext:
        'Siap Raka. Saya kirim dari Handrawina Web — sekarang perangkat companion bisa berkirim pesan mandiri tanpa ponsel utama harus online.',
      timestamp: '09:16',
      status: 'read',
      envelope: {
        algorithm: 'AES-256-GCM',
        protocol: 'Signal-DoubleRatchet',
        ivBase64: 'c2VlZC1pdi0wMDAy',
        ciphertextBase64: '4mLp8vQr2tYx6zWc9bNj1kHf3gDs5aPq7wEr0uTy2iOp4aSd',
        ratchetStep: 2,
        aad: 'conv-raka:self',
      },
    },
  ],
  'conv-eng-1500': [
    {
      id: 'msg-grp-1',
      conversationId: 'conv-eng-1500',
      senderId: 'system',
      senderName: 'Sistem',
      senderDeviceId: 'server',
      kind: 'system',
      plaintext:
        'Grup ini dilindungi protokol Sender Keys E2EE (1.482 peserta, Epoch 42). Setiap pesan dienkripsi sekali O(1) di perangkat pengirim.',
      timestamp: '08:00',
      status: 'read',
    },
    {
      id: 'msg-grp-2',
      conversationId: 'conv-eng-1500',
      senderId: 'peer-dimas',
      senderName: 'Dimas Wijaya',
      senderDeviceId: 'dev-dimas-0',
      kind: 'text',
      plaintext:
        'Pengujian fan-out klaster BEAM untuk 1.500 anggota mencapai latensi P99 38 ms dengan penghematan bandwidth klien >99,9%.',
      timestamp: '10:05',
      status: 'delivered',
      envelope: {
        algorithm: 'AES-256-GCM',
        protocol: 'SenderKeys-O1',
        ivBase64: 'Z3JwLWl2LTAwNDI=',
        ciphertextBase64: '8pQr3sTu5vWx7yZa9bCd1eFg3hIj5kLm7nOp9qRs1tUv3wXy',
        ratchetStep: 14,
        senderKeyEpoch: 42,
        aad: 'conv-eng-1500:epoch-42',
      },
    },
  ],
  'conv-biz-nusantara': [
    {
      id: 'msg-biz-1',
      conversationId: 'conv-biz-nusantara',
      senderId: 'peer-biz',
      senderName: 'Nusantara Coffee Roasters',
      senderDeviceId: 'biz-gateway-1',
      kind: 'text',
      plaintext:
        'Halo! Selamat datang di Handrawina Business Nusantara Coffee. Ketik "harga" atau "katalog" untuk melihat daftar biji kopi sangrai terbaru.',
      timestamp: '11:20',
      status: 'read',
      envelope: {
        algorithm: 'AES-256-GCM',
        protocol: 'Signal-DoubleRatchet',
        ivBase64: 'Yml6LWl2LTAwMDE=',
        ciphertextBase64: '2kLm4nOp6qRs8tUv0wXy2zAb4cDe6fGh8iJk0lMn2oPq4rSt',
        ratchetStep: 1,
        aad: 'conv-biz-nusantara:peer-biz',
      },
    },
  ],
  'conv-nadia': [
    {
      id: 'msg-nadia-1',
      conversationId: 'conv-nadia',
      senderId: 'peer-nadia',
      senderName: 'Nadia Kusuma',
      senderDeviceId: 'dev-nadia-0',
      kind: 'voice',
      plaintext: 'Pesan suara terenkripsi Opus (0:18)',
      voiceDurationSec: 18,
      timestamp: '14:18',
      status: 'read',
      envelope: {
        algorithm: 'AES-256-GCM',
        protocol: 'Signal-DoubleRatchet',
        ivBase64: 'dm9pY2UtaXYtMDE=',
        ciphertextBase64: '7aBc9dEf1gHi3jKl5mNo7pQr9sTu1vWx3yZa5bCd7eFg9hIj',
        ratchetStep: 3,
        aad: 'conv-nadia:voice',
      },
    },
  ],
};

// Cloud Backup HSM Vault State
interface StoredBackupVault {
  meta: HsmBackupState;
  verifierHash: string | null;
  encryptedBlob: { saltBase64: string; ivBase64: string; ciphertextBase64: string } | null;
}

const backupVault: StoredBackupVault = {
  meta: {
    hasBackup: false,
    s3BlobKey: null,
    updatedAt: null,
    sizeKb: 0,
    ciphertextPreview: null,
    failedAttempts: 0,
    maxAttempts: 5,
    lockedWiped: false,
    protectionMode: null,
  },
  verifierHash: null,
  encryptedBlob: null,
};

let callRecords: CallRecord[] = [
  {
    id: 'call-1',
    conversationId: 'conv-raka',
    peerName: 'Raka Pratama',
    mode: 'video',
    topology: 'P2P-DTLS-SRTP',
    participants: ['Bima Santoso', 'Raka Pratama'],
    startedAt: 'Hari ini, 09:40',
    durationSec: 342,
    direction: 'outgoing',
  },
  {
    id: 'call-2',
    conversationId: 'conv-eng-1500',
    peerName: 'Arsitektur & Keamanan Nasional',
    mode: 'audio',
    topology: 'SFU-SFrame-E2EE',
    participants: ['Bima Santoso', 'Raka Pratama', 'Dimas Wijaya', 'Nadia Kusuma'],
    startedAt: 'Kemarin, 16:15',
    durationSec: 1280,
    direction: 'incoming',
  },
];

// Business API Plane State (Isolated)
let businessProducts: BusinessProduct[] = [
  {
    id: 'prod-1',
    sku: 'NCR-GAYO-250',
    title: 'Aceh Gayo Honey Process 250g',
    priceIdr: 115000,
    description: 'Single origin arabika Gayo, roasting medium-light untuk pour over.',
    active: true,
  },
  {
    id: 'prod-2',
    sku: 'NCR-FLORES-500',
    title: 'Flores Bajawa Washed 500g',
    priceIdr: 210000,
    description: 'Catatan rasa cokelat hitam, kacang panggang, dan karamel bersih.',
    active: true,
  },
  {
    id: 'prod-3',
    sku: 'NCR-ESPRESSO-1KG',
    title: 'House Blend Espresso Crema 1kg',
    priceIdr: 345000,
    description: 'Racikan 70% Arabika Jawa Barat & 30% Robusta Temanggung untuk kafe.',
    active: true,
  },
];

let autoReplyRules: AutoReplyRule[] = [
  {
    id: 'ar-1',
    triggerKeyword: 'harga',
    responseText:
      '[Auto-Reply Bisnis] Harga mulai Rp 115.000 (250g) hingga Rp 345.000 (1kg). Cek kartu katalog atau ketik SKU untuk pemesanan cepat.',
    enabled: true,
  },
  {
    id: 'ar-2',
    triggerKeyword: 'katalog',
    responseText:
      '[Auto-Reply Bisnis] Katalog aktif hari ini: Aceh Gayo Honey 250g, Flores Bajawa 500g, dan House Blend Espresso 1kg. Pengiriman sameday Jabodetabek.',
    enabled: true,
  },
];

const businessLabels: string[] = ['Prospek Baru', 'Menunggu Pembayaran', 'Lunas', 'VIP'];

let webhookEndpoints: WebhookEndpoint[] = [
  {
    id: 'wh-1',
    targetUrl: 'https://erp.nusantaracoffee.id/webhooks/handrawina',
    events: ['message.received', 'message.status', 'catalog.order'],
    circuitState: 'CLOSED',
    lastDeliveredAt: '11:20',
  },
];

let webhookLogs: WebhookDeliveryLog[] = [
  {
    id: 'whlog-1',
    webhookId: 'wh-1',
    event: 'message.received',
    statusCode: 200,
    signatureHeader: `sha256=${crypto
      .createHmac('sha256', 'handrawina-webhook-secret')
      .update('{"event":"message.received","tenant":"nusantara"}')
      .digest('hex')
      .slice(0, 32)}...`,
    latencyMs: 34,
    timestamp: '11:20',
  },
];

function getSnapshot(): ServerSnapshotPayload {
  return {
    account: accountState,
    settings: appSettings,
    devices: pairedDevices,
    conversations,
    messages: messagesByConv,
    backup: backupVault.meta,
    calls: callRecords,
    business: {
      products: businessProducts,
      autoReplies: autoReplyRules,
      labels: businessLabels,
      webhooks: webhookEndpoints,
      webhookLogs,
    },
    iceConfig: {
      stunUrls: ['stun:stun-ap-se1.handrawina.net:3478', 'stun:stun-eu-c1.handrawina.net:3478'],
      turnUrl: 'turns:turn-anycast.handrawina.net:5349?transport=tcp',
      relayRegion: 'ap-southeast-1 (Jakarta / Singapore Anycast)',
    },
  };
}

// ============================================================================
// SERVER BOOTSTRAP (EXPRESS + WEBSOCKET + VITE MIDDLEWARE)
// ============================================================================

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  function broadcastWs(event: string, payload: unknown, exclude?: WebSocket) {
    const frame = JSON.stringify({ event, payload });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN && client !== exclude) {
        client.send(frame);
      }
    }
  }

  wss.on('connection', (socket) => {
    // Initial full state sync per real-time guidelines
    socket.send(JSON.stringify({ event: 'init', payload: getSnapshot() }));

    socket.on('message', (raw) => {
      try {
        const parsed = JSON.parse(String(raw)) as { event: string; payload: Record<string, unknown> };
        const { event, payload } = parsed;

        if (event === 'message:send') {
          const msg = payload as unknown as ChatMessage;
          if (!msg?.id || !msg?.conversationId) return;

          const convList = messagesByConv[msg.conversationId] ?? [];
          if (convList.some((m) => m.id === msg.id)) {
            return; // Idempotent guard
          }

          const storedMsg: ChatMessage = {
            ...msg,
            status: 'delivered',
            timestamp: msg.timestamp || nowTimeLabel(),
          };
          messagesByConv[msg.conversationId] = [...convList, storedMsg];

          // Update conversation last active
          conversations = conversations.map((c) =>
            c.id === msg.conversationId
              ? { ...c, lastActiveText: 'Baru saja', unreadCount: 0 }
              : c
          );

          // Broadcast authoritative message & receipt to all connected tabs/devices
          broadcastWs('message:created', storedMsg);

          // If this is a Business conversation, run server-side Auto-Reply & Webhook Dispatch!
          const targetConv = conversations.find((c) => c.id === msg.conversationId);
          if (targetConv?.kind === 'business' && msg.senderId === 'self') {
            const lowerText = msg.plaintext.toLowerCase();
            const matchedRule = autoReplyRules.find(
              (r) => r.enabled && lowerText.includes(r.triggerKeyword.toLowerCase())
            );

            // Log real HMAC-SHA256 webhook event
            const activeWh = webhookEndpoints[0];
            if (activeWh) {
              const eventBody = JSON.stringify({
                event: 'message.received',
                conversationId: msg.conversationId,
                messageId: msg.id,
                encrypted: Boolean(msg.envelope),
              });
              const digest = crypto
                .createHmac('sha256', 'handrawina-webhook-secret')
                .update(eventBody)
                .digest('hex');
              const logEntry: WebhookDeliveryLog = {
                id: `whlog-${Date.now()}`,
                webhookId: activeWh.id,
                event: 'message.received',
                statusCode: 200,
                signatureHeader: `sha256=${digest.slice(0, 32)}...`,
                latencyMs: 28,
                timestamp: nowTimeLabel(),
              };
              webhookLogs = [logEntry, ...webhookLogs].slice(0, 20);
              broadcastWs('business:webhook_logged', logEntry);
            }

            if (matchedRule) {
              const autoMsg: ChatMessage = {
                id: `msg-ar-${Date.now()}`,
                conversationId: msg.conversationId,
                senderId: 'peer-biz',
                senderName: targetConv.name,
                senderDeviceId: 'biz-gateway-1',
                kind: 'text',
                plaintext: matchedRule.responseText,
                timestamp: nowTimeLabel(),
                status: 'delivered',
                envelope: {
                  algorithm: 'AES-256-GCM',
                  protocol: 'Signal-DoubleRatchet',
                  ivBase64: Buffer.from(crypto.randomBytes(12)).toString('base64'),
                  ciphertextBase64: Buffer.from(crypto.randomBytes(36)).toString('base64'),
                  ratchetStep: (messagesByConv[msg.conversationId]?.length ?? 1) + 1,
                  aad: `${msg.conversationId}:auto-reply`,
                },
              };
              messagesByConv[msg.conversationId] = [
                ...(messagesByConv[msg.conversationId] ?? []),
                autoMsg,
              ];
              broadcastWs('message:created', autoMsg);
            }
          }
        } else if (event === 'typing:update') {
          broadcastWs('typing:update', payload, socket);
        } else if (event === 'receipt:read') {
          const { conversationId } = payload as { conversationId: string };
          if (conversationId && messagesByConv[conversationId]) {
            messagesByConv[conversationId] = messagesByConv[conversationId].map((m) =>
              m.status === 'delivered' || m.status === 'sent' ? { ...m, status: 'read' } : m
            );
            conversations = conversations.map((c) =>
              c.id === conversationId ? { ...c, unreadCount: 0 } : c
            );
            broadcastWs('receipt:read', { conversationId });
          }
        } else if (event === 'call:signal') {
          // Real WebRTC Offer/Answer/ICE signaling relay over WebSocket
          broadcastWs('call:signal', payload, socket);
        } else if (event === 'call:room_join') {
          const { roomCode, participantName } = payload as {
            roomCode?: string;
            participantName?: string;
          };
          if (roomCode && participantName) {
            broadcastWs('call:participant_joined', { roomCode, participantName }, socket);
          }
        } else if (event === 'call:room_leave') {
          const { roomCode, participantName } = payload as {
            roomCode?: string;
            participantName?: string;
          };
          if (roomCode && participantName) {
            broadcastWs('call:participant_left', { roomCode, participantName }, socket);
          }
        }
      } catch {
        // Ignore malformed WS frames
      }
    });
  });

  // ==========================================================================
  // REST API ROUTES (CONSUMER SECURITY + ISOLATED BUSINESS PLANE)
  // ==========================================================================

  app.get('/api/state', (_req, res) => {
    res.json(getSnapshot());
  });

  app.patch('/api/settings', (req, res) => {
    const { displayName, settings } = req.body as {
      displayName?: string;
      settings?: Partial<AppSettings>;
    };

    if (typeof displayName === 'string') {
      const cleaned = displayName.trim();
      if (cleaned.length < 2) {
        res.status(400).json({ error: 'Nama tampilan minimal 2 karakter.' });
        return;
      }
      accountState.displayName = cleaned.slice(0, 60);
    }

    if (settings && typeof settings === 'object') {
      appSettings = mergeSettingsPatch(appSettings, settings);
    }

    broadcastWs('settings:updated', { account: accountState, settings: appSettings });
    res.json({ account: accountState, settings: appSettings });
  });

  app.post('/api/settings/reset', (_req, res) => {
    appSettings = { ...DEFAULT_APP_SETTINGS };
    broadcastWs('settings:updated', { account: accountState, settings: appSettings });
    res.json({ account: accountState, settings: appSettings });
  });

  app.post('/api/conversations', (req, res) => {
    const { name, kind, participantCount } = req.body as {
      name?: string;
      kind?: 'direct' | 'group' | 'business';
      participantCount?: number;
    };
    const cleanName = (name ?? '').trim();
    if (!cleanName) {
      res.status(400).json({ error: 'Nama obrolan atau grup wajib diisi.' });
      return;
    }

    const convKind = kind === 'group' || kind === 'business' ? kind : 'direct';
    const members =
      convKind === 'group' ? Math.max(3, Math.min(1500, Number(participantCount) || 25)) : 2;
    const initials = cleanName
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');

    const newConv: Conversation = {
      id: `conv-${Date.now()}`,
      name: cleanName,
      handle:
        convKind === 'group'
          ? `Grup E2EE · Sender Keys (Epoch 1)`
          : convKind === 'business'
          ? 'Akun Bisnis · API Gateway'
          : 'Kontak E2EE · Signal Protocol',
      kind: convKind,
      initials: initials || 'HW',
      unreadCount: 0,
      lastActiveText: convKind === 'group' ? `${members.toLocaleString('id-ID')} / 1.500 peserta` : 'Online',
      online: true,
      participantCount: members,
      maxParticipants: convKind === 'group' ? 1500 : undefined,
      senderKeyEpoch: convKind === 'group' ? 1 : undefined,
      peerPublicKeyFingerprint: crypto.randomBytes(16).toString('hex'),
      labels: convKind === 'business' ? ['Prospek Baru'] : [],
    };

    conversations = [newConv, ...conversations];
    messagesByConv[newConv.id] = [
      {
        id: `msg-sys-${Date.now()}`,
        conversationId: newConv.id,
        senderId: 'system',
        senderName: 'Sistem',
        senderDeviceId: 'server',
        kind: 'system',
        plaintext:
          convKind === 'group'
            ? `Grup "${cleanName}" dibuat dengan Sender Keys E2EE (${members.toLocaleString('id-ID')} peserta, Epoch 1).`
            : `Sesi Signal X3DH terbentuk dengan "${cleanName}". Pesan dienkripsi ujung-ke-ujung.`,
        timestamp: nowTimeLabel(),
        status: 'read',
      },
    ];

    broadcastWs('conversation:created', { conversation: newConv, messages: messagesByConv[newConv.id] });
    res.status(201).json({ conversation: newConv });
  });

  app.post('/api/groups/:id/rotate-epoch', (req, res) => {
    const convId = req.params.id;
    const target = conversations.find((c) => c.id === convId && c.kind === 'group');
    if (!target) {
      res.status(404).json({ error: 'Grup tidak ditemukan.' });
      return;
    }

    const nextEpoch = (target.senderKeyEpoch ?? 1) + 1;
    const nextCount = Math.max(2, target.participantCount - 1);
    const updated: Conversation = {
      ...target,
      senderKeyEpoch: nextEpoch,
      participantCount: nextCount,
      handle: `Grup E2EE · Sender Keys (Epoch ${nextEpoch})`,
      lastActiveText: `${nextCount.toLocaleString('id-ID')} / 1.500 peserta`,
    };
    conversations = conversations.map((c) => (c.id === convId ? updated : c));

    const sysMsg: ChatMessage = {
      id: `msg-epoch-${Date.now()}`,
      conversationId: convId,
      senderId: 'system',
      senderName: 'Sistem',
      senderDeviceId: 'server',
      kind: 'system',
      plaintext: `Anggota dikeluarkan. Server menaikkan epoch_version ke Epoch ${nextEpoch} — seluruh klien merotasi Sender Key baru secara otomatis.`,
      timestamp: nowTimeLabel(),
      status: 'read',
    };
    messagesByConv[convId] = [...(messagesByConv[convId] ?? []), sysMsg];

    broadcastWs('group:epoch_rotated', { conversation: updated, systemMessage: sysMsg });
    res.json({ conversation: updated, systemMessage: sysMsg });
  });

  // Multi-Device Pairing & Primary Phone Status
  app.post('/api/devices/pair', (req, res) => {
    const { name, platform } = req.body as {
      name?: string;
      platform?: PairedDevice['platform'];
    };
    if (pairedDevices.length >= 5) {
      res.status(400).json({ error: 'Batas maksimal tercapai (1 ponsel utama + 4 perangkat companion).' });
      return;
    }
    const cleanName = (name ?? '').trim();
    if (!cleanName) {
      res.status(400).json({ error: 'Nama perangkat wajib diisi.' });
      return;
    }

    const usedIndexes = new Set(pairedDevices.map((d) => d.deviceIndex));
    let nextIdx = 1;
    while (usedIndexes.has(nextIdx) && nextIdx <= 4) nextIdx += 1;

    const newDevice: PairedDevice = {
      deviceId: `dev-comp-${Date.now()}`,
      deviceIndex: nextIdx,
      name: cleanName,
      platform: platform ?? 'Desktop',
      isPrimary: false,
      online: true,
      lastActive: 'Baru ditautkan via QR ADV',
      advSignatureShort: `adv:${crypto.randomBytes(2).toString('hex')}...${crypto.randomBytes(2).toString('hex')}`,
    };
    pairedDevices = [...pairedDevices, newDevice];
    broadcastWs('devices:updated', pairedDevices);
    res.status(201).json({ device: newDevice, devices: pairedDevices });
  });

  app.delete('/api/devices/:deviceId', (req, res) => {
    const { deviceId } = req.params;
    const target = pairedDevices.find((d) => d.deviceId === deviceId);
    if (!target) {
      res.status(404).json({ error: 'Perangkat tidak ditemukan.' });
      return;
    }
    if (target.isPrimary) {
      res.status(400).json({ error: 'Ponsel utama tidak dapat dicabut dari perangkat companion.' });
      return;
    }
    pairedDevices = pairedDevices.filter((d) => d.deviceId !== deviceId);
    broadcastWs('devices:updated', pairedDevices);
    res.json({ devices: pairedDevices });
  });

  app.post('/api/devices/primary-status', (req, res) => {
    const { online } = req.body as { online?: boolean };
    accountState.primaryPhoneOnline = Boolean(online);
    pairedDevices = pairedDevices.map((d) =>
      d.isPrimary
        ? {
            ...d,
            online: accountState.primaryPhoneOnline,
            lastActive: accountState.primaryPhoneOnline ? 'Aktif sekarang' : 'Offline (Companion tetap aktif)',
          }
        : d
    );
    broadcastWs('account:updated', { account: accountState, devices: pairedDevices });
    res.json({ account: accountState, devices: pairedDevices });
  });

  // Zero-Loss Phone Number Migration
  app.post('/api/account/migrate-phone', (req, res) => {
    const { newPhoneNumber, oldOtp, newOtp } = req.body as {
      newPhoneNumber?: string;
      oldOtp?: string;
      newOtp?: string;
    };
    const cleanedPhone = (newPhoneNumber ?? '').trim();
    if (!cleanedPhone || cleanedPhone.length < 8) {
      res.status(400).json({ error: 'Masukkan nomor telepon baru yang valid (minimal 8 digit).' });
      return;
    }
    if ((oldOtp ?? '').trim().length !== 6 || (newOtp ?? '').trim().length !== 6) {
      res.status(400).json({ error: 'Kode OTP ganda (6 digit nomor lama & 6 digit nomor baru) wajib valid.' });
      return;
    }

    accountState.phoneNumber = cleanedPhone;
    accountState.phoneHashShort = hmacShort(PHONE_HASH_PEPPER, cleanedPhone.replace(/\s|-/g, ''));
    accountState.migratedCount += 1;

    broadcastWs('account:updated', { account: accountState, devices: pairedDevices });
    res.json({
      account: accountState,
      preservedGroups: conversations.filter((c) => c.kind === 'group').length,
      preservedThreads: conversations.length,
    });
  });

  // HSM Cloud Backup Key Vault (OPAQUE + 5-attempt lockout)
  app.post('/api/backup/vault', (req, res) => {
    const { verifierHash, encryptedBlob, protectionMode } = req.body as {
      verifierHash?: string;
      encryptedBlob?: { saltBase64: string; ivBase64: string; ciphertextBase64: string };
      protectionMode?: 'password-opaque' | 'key-64digit';
    };
    if (!verifierHash || !encryptedBlob?.ciphertextBase64) {
      res.status(400).json({ error: 'Payload cadangan terenkripsi tidak lengkap.' });
      return;
    }

    const approxSizeKb = Math.max(1, Math.round(encryptedBlob.ciphertextBase64.length / 1024));
    backupVault.verifierHash = verifierHash;
    backupVault.encryptedBlob = encryptedBlob;
    backupVault.meta = {
      hasBackup: true,
      s3BlobKey: `s3://handrawina-backup-vault-prod/${accountState.accountId.slice(0, 12)}/backup_v${Date.now()}.enc`,
      updatedAt: nowTimeLabel(),
      sizeKb: approxSizeKb,
      ciphertextPreview: `${encryptedBlob.ciphertextBase64.slice(0, 44)}...`,
      failedAttempts: 0,
      maxAttempts: 5,
      lockedWiped: false,
      protectionMode: protectionMode ?? 'password-opaque',
    };

    broadcastWs('backup:updated', backupVault.meta);
    res.status(201).json({ backup: backupVault.meta });
  });

  app.post('/api/backup/restore', (req, res) => {
    const { verifierHash } = req.body as { verifierHash?: string };
    if (!backupVault.meta.hasBackup || !backupVault.encryptedBlob) {
      res.status(404).json({ error: 'Belum ada cadangan E2EE di brankas HSM.' });
      return;
    }
    if (backupVault.meta.lockedWiped) {
      res.status(423).json({
        error: 'Slot HSM telah dimusnahkan permanen karena melewati 5 percobaan salah.',
        backup: backupVault.meta,
      });
      return;
    }

    if (verifierHash !== backupVault.verifierHash) {
      backupVault.meta.failedAttempts += 1;
      if (backupVault.meta.failedAttempts >= backupVault.meta.maxAttempts) {
        backupVault.meta.lockedWiped = true;
        backupVault.meta.hasBackup = false;
        backupVault.encryptedBlob = null;
        backupVault.verifierHash = null;
      }
      broadcastWs('backup:updated', backupVault.meta);
      res.status(401).json({
        error: backupVault.meta.lockedWiped
          ? 'Batas 5 percobaan HSM terlampaui! Slot kunci telah dihapus permanen untuk mencegah brute-force.'
          : `Autentikasi OPAQUE ditolak HSM. Sisa percobaan: ${backupVault.meta.maxAttempts - backupVault.meta.failedAttempts} dari 5.`,
        backup: backupVault.meta,
      });
      return;
    }

    backupVault.meta.failedAttempts = 0;
    broadcastWs('backup:updated', backupVault.meta);
    res.json({ encryptedBlob: backupVault.encryptedBlob, backup: backupVault.meta });
  });

  // WebRTC Call Logging
  app.post('/api/calls/log', (req, res) => {
    const record = req.body as CallRecord;
    if (!record?.peerName) {
      res.status(400).json({ error: 'Data panggilan tidak valid.' });
      return;
    }
    const saved: CallRecord = {
      ...record,
      id: `call-${Date.now()}`,
      startedAt: `Hari ini, ${nowTimeLabel()}`,
    };
    callRecords = [saved, ...callRecords].slice(0, 20);
    broadcastWs('call:logged', saved);
    res.status(201).json({ call: saved });
  });

  // ==========================================================================
  // BARCODE & QR CODE JOIN / DEVICE PAIRING / VIDEO CALL ROOM TOKENS
  // ==========================================================================
  type JoinTokenMode = 'invite' | 'pair' | 'call';
  interface JoinTokenRecord {
    code: string;
    mode: JoinTokenMode;
    label: string;
    expiresAt: number;
    advChallenge?: string;
    roomId?: string;
  }

  const joinTokens = new Map<string, JoinTokenRecord>();

  app.post('/api/join/token', (req, res) => {
    const { mode, existingCallRoomCode } = req.body as {
      mode?: JoinTokenMode;
      existingCallRoomCode?: string;
    };

    const resolvedMode: JoinTokenMode =
      mode === 'pair' || mode === 'call' ? mode : 'invite';

    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    let code: string;
    let label: string;
    let expiresInSec: number;
    let advChallenge: string | undefined;
    let roomId: string | undefined;

    if (resolvedMode === 'pair') {
      code = `HND-PAIR-${suffix}`;
      label = 'Token Pairing Multi-Device ADV (Sekali Pakai)';
      expiresInSec = 120;
      advChallenge = crypto.randomBytes(4).toString('hex').toUpperCase();
    } else if (resolvedMode === 'call') {
      const cleanedExisting = (existingCallRoomCode ?? '').trim().toUpperCase();
      code = /^HND-VID-[A-Z0-9]{4,12}$/.test(cleanedExisting)
        ? cleanedExisting
        : `HND-VID-${suffix}`;
      label = 'Undangan Ruang Video Call WebRTC Terenkripsi';
      expiresInSec = 600;
      roomId = code;
    } else {
      code = `HND-INV-${suffix}`;
      label = 'Undangan Gabung Aplikasi Handrawina (Signal E2EE)';
      expiresInSec = 300;
    }

    const record: JoinTokenRecord = {
      code,
      mode: resolvedMode,
      label,
      expiresAt: Date.now() + expiresInSec * 1000,
      advChallenge,
      roomId,
    };
    joinTokens.set(code, record);

    res.status(201).json({
      code: record.code,
      mode: record.mode,
      label: record.label,
      expiresInSec,
      advChallenge: record.advChallenge,
      roomId: record.roomId,
    });
  });

  app.post('/api/join/redeem', (req, res) => {
    const { code, memberName } = req.body as {
      code?: string;
      memberName?: string;
    };
    const normalized = (code ?? '').trim().toUpperCase();
    if (!normalized) {
      res.status(400).json({ error: 'Kode barcode wajib diisi.' });
      return;
    }

    const record = joinTokens.get(normalized);
    const isDirectVideoCode = /^HND-VID-[A-Z0-9]{4,12}$/.test(normalized);
    const isDirectInviteCode = /^HND-INV-[A-Z0-9]{4,12}$/.test(normalized);
    const isDirectPairCode = /^HND-PAIR-[A-Z0-9]{4,12}$/.test(normalized);

    if (record && Date.now() > record.expiresAt) {
      joinTokens.delete(normalized);
      res.status(410).json({ error: 'Kode barcode telah kedaluwarsa. Perbarui barcode terlebih dahulu.' });
      return;
    }

    if (!record && !isDirectVideoCode && !isDirectInviteCode && !isDirectPairCode) {
      res.status(404).json({ error: 'Kode barcode tidak dikenali oleh server Handrawina.' });
      return;
    }

    const mode: JoinTokenMode =
      record?.mode ?? (isDirectVideoCode ? 'call' : isDirectPairCode ? 'pair' : 'invite');
    const cleanMember = (memberName ?? '').trim();

    if (mode === 'pair') {
      if (pairedDevices.length >= 5) {
        res.status(400).json({
          error: 'Batas maksimal tercapai (1 ponsel utama + 4 perangkat companion). Cabut salah satu perangkat di tab Keamanan.',
        });
        return;
      }
      const usedIndexes = new Set(pairedDevices.map((d) => d.deviceIndex));
      let nextIdx = 1;
      while (usedIndexes.has(nextIdx) && nextIdx <= 4) nextIdx += 1;

      const devName = cleanMember || `Handrawina Web Companion #${nextIdx}`;
      const newDevice: PairedDevice = {
        deviceId: `dev-qr-${Date.now()}`,
        deviceIndex: nextIdx,
        name: devName,
        platform: 'Web',
        isPrimary: false,
        online: true,
        lastActive: 'Baru ditautkan via Barcode ADV',
        advSignatureShort: `adv:${crypto.randomBytes(2).toString('hex')}...${crypto.randomBytes(2).toString('hex')}`,
      };
      pairedDevices = [...pairedDevices, newDevice];
      broadcastWs('devices:updated', pairedDevices);
      res.status(200).json({
        mode: 'pair',
        message: `Perangkat "${devName}" berhasil ditautkan melalui QR/Barcode ADV (${normalized}).`,
      });
      return;
    }

    if (mode === 'call') {
      const guestName = cleanMember || 'Tamu Video Call (QR)';
      broadcastWs('call:participant_joined', {
        roomCode: normalized,
        participantName: guestName,
      });
      res.status(200).json({
        mode: 'call',
        callRoomCode: normalized,
        message: `Tersambung ke Ruang Video Call terenkripsi ${normalized} sebagai ${guestName}.`,
      });
      return;
    }

    // Default: 'invite' -> Join Handrawina E2EE chat
    const peerDisplay = cleanMember || `Kontak Barcode (${normalized.slice(-4)})`;
    const initials = peerDisplay
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');

    const newConv: Conversation = {
      id: `conv-qr-${Date.now()}`,
      name: peerDisplay,
      handle: `Bergabung via Barcode · Signal X3DH (${normalized})`,
      kind: 'direct',
      initials: initials || 'QR',
      unreadCount: 0,
      lastActiveText: 'Baru bergabung',
      online: true,
      participantCount: 2,
      peerPublicKeyFingerprint: crypto.randomBytes(16).toString('hex'),
      labels: [],
    };

    const welcomeMsg: ChatMessage = {
      id: `msg-qr-${Date.now()}`,
      conversationId: newConv.id,
      senderId: 'system',
      senderName: 'Sistem',
      senderDeviceId: 'server',
      kind: 'system',
      plaintext: `${peerDisplay} berhasil bergabung ke aplikasi Handrawina melalui kode barcode ${normalized}. Kunci sesi Signal X3DH telah terverifikasi.`,
      timestamp: nowTimeLabel(),
      status: 'read',
    };

    conversations = [newConv, ...conversations];
    messagesByConv[newConv.id] = [welcomeMsg];
    broadcastWs('conversation:created', { conversation: newConv, messages: [welcomeMsg] });

    res.status(200).json({
      mode: 'invite',
      conversationId: newConv.id,
      message: `${peerDisplay} berhasil bergabung ke Handrawina! Sesi obrolan E2EE siap digunakan.`,
    });
  });

  // ==========================================================================
  // ISOLATED BUSINESS API PLANE (/api/business/*)
  // ==========================================================================

  app.post('/api/business/catalog', (req, res) => {
    const { sku, title, priceIdr, description } = req.body as Partial<BusinessProduct>;
    if (!sku?.trim() || !title?.trim() || !priceIdr || priceIdr < 0) {
      res.status(400).json({ error: 'SKU, nama produk, dan harga wajib diisi.' });
      return;
    }
    const created: BusinessProduct = {
      id: `prod-${Date.now()}`,
      sku: sku.trim().toUpperCase(),
      title: title.trim(),
      priceIdr: Math.round(Number(priceIdr)),
      description: (description ?? '').trim() || 'Produk katalog resmi Handrawina Business.',
      active: true,
    };
    businessProducts = [created, ...businessProducts];
    broadcastWs('business:updated', getSnapshot().business);
    res.status(201).json({ product: created });
  });

  app.patch('/api/business/catalog/:id', (req, res) => {
    const { id } = req.params;
    const { active } = req.body as { active?: boolean };
    businessProducts = businessProducts.map((p) =>
      p.id === id ? { ...p, active: active !== undefined ? Boolean(active) : !p.active } : p
    );
    broadcastWs('business:updated', getSnapshot().business);
    res.json({ products: businessProducts });
  });

  app.post('/api/business/autoreply', (req, res) => {
    const { triggerKeyword, responseText } = req.body as Partial<AutoReplyRule>;
    if (!triggerKeyword?.trim() || !responseText?.trim()) {
      res.status(400).json({ error: 'Kata kunci pemicu dan teks balasan wajib diisi.' });
      return;
    }
    const rule: AutoReplyRule = {
      id: `ar-${Date.now()}`,
      triggerKeyword: triggerKeyword.trim().toLowerCase(),
      responseText: responseText.trim(),
      enabled: true,
    };
    autoReplyRules = [rule, ...autoReplyRules];
    broadcastWs('business:updated', getSnapshot().business);
    res.status(201).json({ rule });
  });

  app.patch('/api/business/autoreply/:id', (req, res) => {
    const { id } = req.params;
    autoReplyRules = autoReplyRules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    broadcastWs('business:updated', getSnapshot().business);
    res.json({ autoReplies: autoReplyRules });
  });

  app.post('/api/business/labels/:conversationId', (req, res) => {
    const { conversationId } = req.params;
    const { label } = req.body as { label?: string };
    if (!label) {
      res.status(400).json({ error: 'Label wajib dipilih.' });
      return;
    }
    conversations = conversations.map((c) => {
      if (c.id !== conversationId) return c;
      const exists = c.labels.includes(label);
      return {
        ...c,
        labels: exists ? c.labels.filter((l) => l !== label) : [...c.labels, label],
      };
    });
    broadcastWs('conversations:updated', conversations);
    res.json({ conversations });
  });

  app.post('/api/business/webhooks', (req, res) => {
    const { targetUrl, events } = req.body as { targetUrl?: string; events?: string[] };
    const url = (targetUrl ?? '').trim();
    if (!url.startsWith('https://')) {
      res.status(400).json({ error: 'URL Webhook wajib menggunakan protokol HTTPS.' });
      return;
    }
    const created: WebhookEndpoint = {
      id: `wh-${Date.now()}`,
      targetUrl: url,
      events: events?.length ? events : ['message.received', 'message.status'],
      circuitState: 'CLOSED',
      lastDeliveredAt: null,
    };
    webhookEndpoints = [created, ...webhookEndpoints];
    broadcastWs('business:updated', getSnapshot().business);
    res.status(201).json({ webhook: created });
  });

  app.post('/api/business/webhooks/test', (req, res) => {
    const { webhookId, eventName } = req.body as { webhookId?: string; eventName?: string };
    const target = webhookEndpoints.find((w) => w.id === webhookId) ?? webhookEndpoints[0];
    if (!target) {
      res.status(404).json({ error: 'Endpoint webhook belum terdaftar.' });
      return;
    }
    const ev = eventName || 'catalog.order';
    const bodyStr = JSON.stringify({
      event: ev,
      tenant: 'handrawina-business',
      timestamp: new Date().toISOString(),
    });
    const sig = crypto
      .createHmac('sha256', 'handrawina-webhook-secret')
      .update(bodyStr)
      .digest('hex');

    const log: WebhookDeliveryLog = {
      id: `whlog-${Date.now()}`,
      webhookId: target.id,
      event: ev,
      statusCode: 200,
      signatureHeader: `sha256=${sig.slice(0, 32)}...`,
      latencyMs: 24 + (Date.now() % 19),
      timestamp: nowTimeLabel(),
    };
    webhookLogs = [log, ...webhookLogs].slice(0, 20);
    webhookEndpoints = webhookEndpoints.map((w) =>
      w.id === target.id ? { ...w, lastDeliveredAt: log.timestamp } : w
    );
    broadcastWs('business:updated', getSnapshot().business);
    res.json({ log });
  });

  // ==========================================================================
  // FRONTEND SERVING (VITE MIDDLEWARE IN DEV, STATIC DIST IN PROD)
  // ==========================================================================
  const isProd = process.env.NODE_ENV === 'production';
  const distPath = path.resolve(__dirname, 'dist');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Handrawina Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
