export type Settings = {
  id?: string;
  rejectCall: boolean;
  msgCall?: string;
  groupsIgnore: boolean;
  alwaysOnline: boolean;
  readMessages: boolean;
  readStatus: boolean;
  syncFullHistory: boolean;
  createdAt?: string;
  updatedAt?: string;
  instanceId?: string;
};

export type NewInstance = {
  instanceName: string;
  qrcode?: boolean;
  integration: string;
  token?: string | null;
  number?: string | null;
  businessId?: string | null;
};

export type Instance = {
  id: string;
  name: string;
  connectionStatus: string;
  ownerJid: string;
  profileName: string;
  profilePicUrl: string;
  integration: string;
  number: string;
  businessId: string;
  token: string;
  clientName: string;
  createdAt: string;
  updatedAt: string;
  Setting: Settings;
  _count?: {
    Message?: number;
    Contact?: number;
    Chat?: number;
  };
};

// ── EvoHub (canal adicional) ──────────────────────────────────────────────
// integration value usado no payload de /instance/create e no enum do form
export const EVOHUB_INTEGRATION = "EVOHUB" as const;

// Tipo de canal do hub (espelha HubChannel['type'] do CRM)
export type HubChannelType = "whatsapp" | "facebook" | "instagram";

// Tipo de canal selecionável na UI do manager-v2 (mapeia para HubChannelType)
export type EvoHubUiChannelType = "whatsapp_cloud" | "facebook_page" | "instagram";

export interface HubPlan {
  id: string;
  slug: string;
  name: string;
  description?: string;
  allow_own_meta_app: boolean;
  allow_shared_meta_app: boolean;
  max_channels_total: number | null;
  max_webhooks: number | null;
  max_byo_credentials: number | null;
}

export interface MetaAppOptionCred {
  id: string;
  name: string;
  app_id: string;
}

export interface MetaAppOptions {
  allowed_modes: ("shared" | "byo")[];
  shared_configured: boolean;
  shared_allowed_by_plan: boolean;
  byo_allowed_by_plan: boolean;
  max_byo_credentials?: number | null;
  byo_credentials: MetaAppOptionCred[];
}

// HubChannel = item da LISTA (GET /evohub/channels e /evohub/available-channels).
// NÃO inclui token. GET /evohub/channels/:id (singular) adicionalmente carrega
// `token` + `meta_connection.phone_number_id`, mas isso é resolvido/consumido
// SERVER-SIDE pelo back-end no link-existing — o front nunca recebe esses campos.
export interface HubChannel {
  id: string;
  name: string;
  type: HubChannelType;
  status: string;
  channel_credentials_id?: string | null;
  created_at?: string;
}

// Resposta do control-plane do evolution-api ao vincular/provisionar.
// FASE 1 (link-existing): a Instance é criada server-side; o retorno traz info da
// Instance (NUNCA o token — contrato §1, §4-A). Sem public_link.
// FASE 2 (provision/criar-novo): public_link presente (abrir em nova aba).
export interface EvoHubProvisionResponse {
  instanceName: string;
  integration: string; // "EVOHUB"
  linked?: boolean; // FASE 1: true quando a Instance foi criada e vinculada
  hub_channel_id?: string | null;
  public_link?: string | null; // FASE 2 apenas (criar-novo); ausente na Fase 1
}

export type Contact = {
  id: string;
  pushName: string;
  remoteJid: string;
  profilePicUrl: string;
  createdAt: string;
  updatedAt: string;
  instanceId: string;
};

export type Chat = {
  id: string;
  pushName: string;
  remoteJid: string;
  labels: string[] | null;
  profilePicUrl: string;
  createdAt: string;
  updatedAt: string;
  instanceId: string;
};

export type Key = {
  id: string;
  fromMe: boolean;
  remoteJid: string;
  participant?: string;
};

export type Message = {
  id: string;
  key: Key;
  pushName: string;
  messageType: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: any;
  messageTimestamp: string;
  instanceId: string;
  source: string;
};

export type SendText = {
  number: string;
  text: string;
  options?: {
    delay?: number;
    presence?: string;
    linkPreview?: boolean;
  };
};

export type SendMedia = {
  number: string;
  mediaMessage: {
    mediatype: "image" | "video" | "audio" | "document";
    mimetype: string;
    caption?: string;
    media: string; // Base64 string
    fileName?: string;
  };
  options?: {
    delay?: number;
    presence?: string;
  };
};

export type SendAudio = {
  number: string;
  audioMessage: {
    audio: string; // Base64 string
  };
  options?: {
    delay?: number;
    presence?: string;
  };
};

export type IntegrationSession = {
  id?: string;
  remoteJid: string;
  pushName: string;
  sessionId: string;
  status: string;
  awaitUser: boolean;
  createdAt: string;
  updatedAt: string;
  botId: string;
};

export type OpenaiCreds = {
  id?: string;
  name: string;
  apiKey: string;
};

export type Openai = {
  id?: string;
  openaiCredsId: string;
  enabled: boolean;
  description: string;
  botType: string;
  assistantId: string;
  functionUrl: string;
  model: string;
  systemMessages: string | string[];
  assistantMessages: string | string[];
  userMessages: string | string[];
  maxTokens: number;
  triggerType: string;
  triggerOperator: string;
  triggerValue: string;
  expire: number;
  keywordFinish: string;
  delayMessage: number;
  unknownMessage: string;
  listeningFromMe: boolean;
  stopBotFromMe: boolean;
  keepOpen: boolean;
  debounceTime: number;
  ignoreJids?: string[];
  splitMessages?: boolean;
  timePerChar?: number;
};

export type OpenaiSettings = {
  openaiCredsId: string;
  expire: number;
  keywordFinish: string;
  delayMessage: number;
  unknownMessage: string;
  listeningFromMe: boolean;
  stopBotFromMe: boolean;
  keepOpen: boolean;
  debounceTime: number;
  speechToText: boolean;
  openaiIdFallback?: string;
  ignoreJids?: string[];
  splitMessages?: boolean;
  timePerChar?: number;
};

export type Dify = {
  id?: string;
  enabled: boolean;
  description: string;
  botType: string;
  apiUrl: string;
  apiKey: string;
  triggerType: string;
  triggerOperator: string;
  triggerValue: string;
  expire: number;
  keywordFinish: string;
  delayMessage: number;
  unknownMessage: string;
  listeningFromMe: boolean;
  stopBotFromMe: boolean;
  keepOpen: boolean;
  debounceTime: number;
  ignoreJids?: string[];
  splitMessages?: boolean;
  timePerChar?: number;
};

export type DifySettings = {
  expire: number;
  keywordFinish: string;
  delayMessage: number;
  unknownMessage: string;
  listeningFromMe: boolean;
  stopBotFromMe: boolean;
  keepOpen: boolean;
  debounceTime: number;
  difyIdFallback?: string;
  ignoreJids?: string[];
  splitMessages?: boolean;
  timePerChar?: number;
};

export type N8n = {
  id?: string;
  enabled: boolean;
  description: string;
  webhookUrl: string;
  basicAuthUser: string;
  basicAuthPass: string;
  triggerType: string;
  triggerOperator: string;
  triggerValue: string;
  expire: number;
  keywordFinish: string;
  delayMessage: number;
  unknownMessage: string;
  listeningFromMe: boolean;
  stopBotFromMe: boolean;
  keepOpen: boolean;
  debounceTime: number;
  ignoreJids?: string[];
  splitMessages?: boolean;
  timePerChar?: number;
};

export type N8nSettings = {
  expire: number;
  keywordFinish: string;
  delayMessage: number;
  unknownMessage: string;
  listeningFromMe: boolean;
  stopBotFromMe: boolean;
  keepOpen: boolean;
  debounceTime: number;
  n8nIdFallback?: string;
  ignoreJids?: string[];
  splitMessages?: boolean;
  timePerChar?: number;
};

export type Evoai = {
  id?: string;
  enabled: boolean;
  description: string;
  agentUrl: string;
  apiKey: string;
  triggerType: string;
  triggerOperator: string;
  triggerValue: string;
  expire: number;
  keywordFinish: string;
  delayMessage: number;
  unknownMessage: string;
  listeningFromMe: boolean;
  stopBotFromMe: boolean;
  keepOpen: boolean;
  debounceTime: number;
  ignoreJids?: string[];
  splitMessages?: boolean;
  timePerChar?: number;
};

export type EvoaiSettings = {
  expire: number;
  keywordFinish: string;
  delayMessage: number;
  unknownMessage: string;
  listeningFromMe: boolean;
  stopBotFromMe: boolean;
  keepOpen: boolean;
  debounceTime: number;
  evoaiIdFallback?: string;
  ignoreJids?: string[];
  splitMessages?: boolean;
  timePerChar?: number;
};

export type Typebot = {
  id?: string;
  enabled: boolean;
  description: string;
  url: string;
  typebot: string;
  triggerType: string;
  triggerOperator: string;
  triggerValue: string;
  expire: number;
  keywordFinish: string;
  delayMessage: number;
  unknownMessage: string;
  listeningFromMe: boolean;
  stopBotFromMe: boolean;
  keepOpen: boolean;
  debounceTime: number;
  splitMessages?: boolean;
  timePerChar?: number;
};

export type TypebotSettings = {
  expire: number;
  keywordFinish: string;
  delayMessage: number;
  unknownMessage: string;
  listeningFromMe: boolean;
  stopBotFromMe: boolean;
  keepOpen: boolean;
  debounceTime: number;
  typebotIdFallback?: string;
  ignoreJids?: string[];
  splitMessages?: boolean;
  timePerChar?: number;
};

export type Webhook = {
  id?: string;
  enabled: boolean;
  url: string;
  events: string[];
  base64: boolean;
  byEvents: boolean;
};

export type Websocket = {
  id?: string;
  enabled: boolean;
  events: string[];
};

export type Rabbitmq = {
  id?: string;
  enabled: boolean;
  events: string[];
};

export type Sqs = {
  id?: string;
  enabled: boolean;
  events: string[];
};

export type Proxy = {
  id?: string;
  enabled: boolean;
  host: string;
  port: string;
  protocol: string;
  username?: string;
  password?: string;
};

export type Chatwoot = {
  id?: string;
  enabled: boolean;
  accountId: string;
  token: string;
  url: string;
  signMsg: boolean;
  reopenConversation: boolean;
  conversationPending: boolean;
  nameInbox: string;
  mergeBrazilContacts: boolean;
  importContacts: boolean;
  importMessages: boolean;
  daysLimitImportMessages: number;
  signDelimiter: string;
  autoCreate: boolean;
  organization: string;
  logo: string;
  ignoreJids?: string[];
};

export type ModelOpenai = {
  id: string;
  object: string;
  created: number;
  owned_by: string;
};

export type EvolutionBot = {
  id?: string;
  enabled: boolean;
  description: string;
  apiUrl: string;
  apiKey?: string;
  triggerType: string;
  triggerOperator: string;
  triggerValue: string;
  expire: number;
  keywordFinish: string;
  delayMessage: number;
  unknownMessage: string;
  listeningFromMe: boolean;
  stopBotFromMe: boolean;
  keepOpen: boolean;
  debounceTime: number;
  ignoreJids?: string[];
  splitMessages?: boolean;
  timePerChar?: number;
};

export type EvolutionBotSettings = {
  expire: number;
  keywordFinish: string;
  delayMessage: number;
  unknownMessage: string;
  listeningFromMe: boolean;
  stopBotFromMe: boolean;
  keepOpen: boolean;
  debounceTime: number;
  botIdFallback?: string;
  ignoreJids?: string[];
  splitMessages?: boolean;
  timePerChar?: number;
};

export type Flowise = {
  id?: string;
  enabled: boolean;
  description: string;
  apiUrl: string;
  apiKey?: string;
  triggerType: string;
  triggerOperator: string;
  triggerValue: string;
  expire: number;
  keywordFinish: string;
  delayMessage: number;
  unknownMessage: string;
  listeningFromMe: boolean;
  stopBotFromMe: boolean;
  keepOpen: boolean;
  debounceTime: number;
  ignoreJids?: string[];
  splitMessages?: boolean;
  timePerChar?: number;
};

export type FlowiseSettings = {
  expire: number;
  keywordFinish: string;
  delayMessage: number;
  unknownMessage: string;
  listeningFromMe: boolean;
  stopBotFromMe: boolean;
  keepOpen: boolean;
  debounceTime: number;
  flowiseIdFallback?: string;
  ignoreJids?: string[];
  splitMessages?: boolean;
  timePerChar?: number;
};
