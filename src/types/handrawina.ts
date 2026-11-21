export type AppWorkspaceTab = 'chats' | 'calls' | 'security' | 'business' | 'tdd' | 'settings';

export type ConversationKind = 'direct' | 'group' | 'business';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export interface EncryptedEnvelope {
  algorithm: 'AES-256-GCM';
  protocol: 'Signal-DoubleRatchet' | 'SenderKeys-O1';
  ivBase64: string;
  ciphertextBase64: string;
  ratchetStep: number;
  senderKeyEpoch?: number;
  aad: string;
}

export interface ProductAttachment {
  productId: string;
  sku: string;
  title: string;
  priceIdr: number;
  description: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderDeviceId: string;
  kind: 'text' | 'voice' | 'media' | 'product' | 'system';
  plaintext: string;
  voiceDurationSec?: number;
  mediaLabel?: string;
  mediaSizeKb?: number;
  product?: ProductAttachment;
  envelope?: EncryptedEnvelope;
  timestamp: string;
  status: MessageStatus;
}

export interface Conversation {
  id: string;
  name: string;
  handle: string;
  kind: ConversationKind;
  initials: string;
  unreadCount: number;
  lastActiveText: string;
  online: boolean;
  participantCount: number;
  maxParticipants?: number;
  senderKeyEpoch?: number;
  peerPublicKeyFingerprint: string;
  labels: string[];
  pinned?: boolean;
}

export interface PairedDevice {
  deviceId: string;
  deviceIndex: number;
  name: string;
  platform: 'iOS' | 'Android' | 'Web' | 'Desktop';
  isPrimary: boolean;
  online: boolean;
  lastActive: string;
  advSignatureShort: string;
}

export interface AccountProfile {
  accountId: string;
  displayName: string;
  phoneNumber: string;
  phoneHashShort: string;
  primaryIdentityPubShort: string;
  primaryPhoneOnline: boolean;
  migratedCount: number;
}

export interface HsmBackupState {
  hasBackup: boolean;
  s3BlobKey: string | null;
  updatedAt: string | null;
  sizeKb: number;
  ciphertextPreview: string | null;
  failedAttempts: number;
  maxAttempts: number;
  lockedWiped: boolean;
  protectionMode: 'password-opaque' | 'key-64digit' | null;
}

export interface BusinessProduct {
  id: string;
  sku: string;
  title: string;
  priceIdr: number;
  description: string;
  active: boolean;
}

export interface AutoReplyRule {
  id: string;
  triggerKeyword: string;
  responseText: string;
  enabled: boolean;
}

export interface WebhookEndpoint {
  id: string;
  targetUrl: string;
  events: string[];
  circuitState: 'CLOSED' | 'OPEN';
  lastDeliveredAt: string | null;
}

export interface WebhookDeliveryLog {
  id: string;
  webhookId: string;
  event: string;
  statusCode: number;
  signatureHeader: string;
  latencyMs: number;
  timestamp: string;
}

export interface CallRecord {
  id: string;
  conversationId: string;
  peerName: string;
  mode: 'audio' | 'video';
  topology: 'P2P-DTLS-SRTP' | 'TURN-Relay-SRTP' | 'SFU-SFrame-E2EE';
  participants: string[];
  startedAt: string;
  durationSec: number;
  direction: 'outgoing' | 'incoming';
}

export interface AppSettings {
  aboutText: string;
  readReceiptsEnabled: boolean;
  typingIndicatorsEnabled: boolean;
  disappearingMessages: 'off' | '24h' | '7d' | '90d';
  screenLockEnabled: boolean;
  alwaysRelayCallsTurn: boolean;
  lowDataCalls: boolean;
  defaultVideoQuality: '720p' | '480p' | '360p';
  soundNotifications: boolean;
  messagePreview: boolean;
  autoDownloadMedia: boolean;
}

export interface ServerSnapshotPayload {
  account: AccountProfile;
  settings: AppSettings;
  devices: PairedDevice[];
  conversations: Conversation[];
  messages: Record<string, ChatMessage[]>;
  backup: HsmBackupState;
  calls: CallRecord[];
  business: {
    products: BusinessProduct[];
    autoReplies: AutoReplyRule[];
    labels: string[];
    webhooks: WebhookEndpoint[];
    webhookLogs: WebhookDeliveryLog[];
  };
  iceConfig: {
    stunUrls: string[];
    turnUrl: string;
    relayRegion: string;
  };
}
