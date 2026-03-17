type JsonSchema = Record<string, unknown>

type ChannelSchemaPayload = {
  schema: JsonSchema
  uiHints: Record<string, unknown> | null
}

const dmPolicyEnum = ['pairing', 'open', 'allowlist', 'disabled']
const groupPolicyEnum = ['open', 'allowlist', 'disabled']

function stringField(extra: Record<string, unknown> = {}): JsonSchema {
  return { type: 'string', ...extra }
}

function booleanField(defaultValue?: boolean): JsonSchema {
  return defaultValue === undefined ? { type: 'boolean' } : { type: 'boolean', default: defaultValue }
}

function integerField(extra: Record<string, unknown> = {}): JsonSchema {
  return { type: 'integer', ...extra }
}

function numberField(extra: Record<string, unknown> = {}): JsonSchema {
  return { type: 'number', ...extra }
}

function enumField(values: string[], defaultValue?: string): JsonSchema {
  return defaultValue === undefined ? { type: 'string', enum: values } : { type: 'string', enum: values, default: defaultValue }
}

function arrayField(itemType: 'string' | 'number' | 'mixed' = 'string'): JsonSchema {
  if (itemType === 'number') return { type: 'array', items: { type: 'number' } }
  if (itemType === 'mixed') return { type: 'array', items: {} }
  return { type: 'array', items: { type: 'string' } }
}

function objectField(properties: Record<string, JsonSchema>): JsonSchema {
  return {
    type: 'object',
    properties,
  }
}

function markdownField(): JsonSchema {
  return objectField({
    mode: enumField(['native', 'escape', 'strip']),
    tableMode: enumField(['native', 'ascii', 'simple']),
  })
}

function heartbeatField(): JsonSchema {
  return objectField({
    visibility: enumField(['visible', 'hidden']),
    intervalMs: integerField({ minimum: 1 }),
  })
}

function blockStreamingCoalesceField(): JsonSchema {
  return objectField({
    enabled: booleanField(),
    minDelayMs: integerField({ minimum: 1 }),
    maxDelayMs: integerField({ minimum: 1 }),
  })
}

function dmField(): JsonSchema {
  return objectField({
    enabled: booleanField(),
    policy: enumField(dmPolicyEnum),
    allowFrom: arrayField('mixed'),
  })
}

function multiAccountSchema(baseProperties: Record<string, JsonSchema>): JsonSchema {
  return {
    type: 'object',
    properties: {
      ...baseProperties,
      defaultAccount: stringField(),
      accounts: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: baseProperties,
        },
      },
    },
  }
}

const telegramProperties: Record<string, JsonSchema> = {
  name: stringField(),
  enabled: booleanField(true),
  botToken: stringField(),
  tokenFile: stringField(),
  dmPolicy: enumField(dmPolicyEnum, 'pairing'),
  allowFrom: arrayField('mixed'),
  defaultTo: stringField(),
  groupAllowFrom: arrayField('mixed'),
  groupPolicy: enumField(groupPolicyEnum, 'allowlist'),
  requireMention: booleanField(),
  historyLimit: integerField({ minimum: 0 }),
  dmHistoryLimit: integerField({ minimum: 0 }),
  replyToMode: enumField(['off', 'first', 'all']),
  streaming: enumField(['off', 'partial', 'block', 'progress']),
  mediaMaxMb: numberField({ minimum: 0 }),
  webhookUrl: stringField(),
  webhookPath: stringField(),
  webhookHost: stringField(),
  webhookPort: integerField({ minimum: 0 }),
  webhookSecret: stringField(),
  markdown: markdownField(),
  heartbeat: heartbeatField(),
  responsePrefix: stringField(),
}

const whatsappProperties: Record<string, JsonSchema> = {
  name: stringField(),
  enabled: booleanField(true),
  authDir: stringField(),
  dmPolicy: enumField(['pairing', 'open', 'allowlist'], 'pairing'),
  allowFrom: arrayField(),
  defaultTo: stringField(),
  groupAllowFrom: arrayField(),
  groupPolicy: enumField(groupPolicyEnum, 'allowlist'),
  historyLimit: integerField({ minimum: 0 }),
  dmHistoryLimit: integerField({ minimum: 0 }),
  sendReadReceipts: booleanField(),
  selfChatMode: booleanField(),
  messagePrefix: stringField(),
  responsePrefix: stringField(),
  mediaMaxMb: integerField({ minimum: 1 }),
  debounceMs: integerField({ minimum: 0 }),
  markdown: markdownField(),
  heartbeat: heartbeatField(),
}

const discordProperties: Record<string, JsonSchema> = {
  name: stringField(),
  enabled: booleanField(true),
  token: stringField(),
  proxy: stringField(),
  dmPolicy: enumField(['pairing', 'open', 'allowlist'], 'pairing'),
  allowFrom: arrayField('mixed'),
  defaultTo: stringField(),
  groupPolicy: enumField(groupPolicyEnum, 'allowlist'),
  requireMention: booleanField(),
  allowBots: enumField(['true', 'false', 'mentions']),
  dangerouslyAllowNameMatching: booleanField(),
  historyLimit: integerField({ minimum: 0 }),
  dmHistoryLimit: integerField({ minimum: 0 }),
  replyToMode: enumField(['off', 'first', 'all']),
  streaming: enumField(['off', 'partial', 'block', 'progress']),
  mediaMaxMb: numberField({ minimum: 0 }),
  markdown: markdownField(),
  heartbeat: heartbeatField(),
  activity: stringField(),
  status: enumField(['online', 'dnd', 'idle', 'invisible']),
  responsePrefix: stringField(),
}

const ircProperties: Record<string, JsonSchema> = {
  name: stringField(),
  enabled: booleanField(true),
  host: stringField(),
  port: integerField({ minimum: 1 }),
  tls: booleanField(),
  nick: stringField(),
  username: stringField(),
  realname: stringField(),
  password: stringField(),
  channels: arrayField(),
  dmPolicy: enumField(dmPolicyEnum, 'pairing'),
  allowFrom: arrayField('mixed'),
  defaultTo: stringField(),
  groupAllowFrom: arrayField('mixed'),
  groupPolicy: enumField(groupPolicyEnum, 'allowlist'),
  mentionPatterns: arrayField(),
  historyLimit: integerField({ minimum: 0 }),
  dmHistoryLimit: integerField({ minimum: 0 }),
  mediaMaxMb: numberField({ minimum: 0 }),
  markdown: markdownField(),
  heartbeat: heartbeatField(),
  responsePrefix: stringField(),
}

const googleChatProperties: Record<string, JsonSchema> = {
  name: stringField(),
  enabled: booleanField(true),
  webhookPath: stringField(),
  webhookUrl: stringField(),
  dmPolicy: enumField(dmPolicyEnum, 'pairing'),
  allowFrom: arrayField('mixed'),
  defaultTo: stringField(),
  groupPolicy: enumField(groupPolicyEnum, 'allowlist'),
  groupAllowFrom: arrayField('mixed'),
  historyLimit: integerField({ minimum: 0 }),
  dmHistoryLimit: integerField({ minimum: 0 }),
  textChunkLimit: integerField({ minimum: 1 }),
  chunkMode: enumField(['length', 'newline']),
  blockStreamingCoalesce: blockStreamingCoalesceField(),
  streamMode: enumField(['replace', 'status_final', 'append'], 'replace'),
  mediaMaxMb: numberField({ minimum: 0 }),
  replyToMode: enumField(['off', 'first', 'all']),
  typingIndicator: enumField(['none', 'message', 'reaction']),
  markdown: markdownField(),
  responsePrefix: stringField(),
}

const slackProperties: Record<string, JsonSchema> = {
  name: stringField(),
  enabled: booleanField(true),
  mode: enumField(['socket', 'http'], 'socket'),
  botToken: stringField(),
  appToken: stringField(),
  userToken: stringField(),
  signingSecret: stringField(),
  webhookPath: stringField(),
  dmPolicy: enumField(dmPolicyEnum, 'pairing'),
  allowFrom: arrayField('mixed'),
  defaultTo: stringField(),
  groupPolicy: enumField(groupPolicyEnum, 'allowlist'),
  requireMention: booleanField(),
  allowBots: booleanField(),
  historyLimit: integerField({ minimum: 0 }),
  dmHistoryLimit: integerField({ minimum: 0 }),
  replyToMode: enumField(['off', 'first', 'all']),
  streaming: enumField(['off', 'partial', 'block', 'progress']),
  nativeStreaming: booleanField(),
  mediaMaxMb: numberField({ minimum: 0 }),
  markdown: markdownField(),
  heartbeat: heartbeatField(),
  responsePrefix: stringField(),
}

const signalProperties: Record<string, JsonSchema> = {
  name: stringField(),
  enabled: booleanField(true),
  account: stringField(),
  httpUrl: stringField(),
  httpHost: stringField(),
  httpPort: integerField({ minimum: 1 }),
  cliPath: stringField(),
  autoStart: booleanField(),
  startupTimeoutMs: integerField({ minimum: 1000 }),
  receiveMode: enumField(['on-start', 'manual']),
  ignoreAttachments: booleanField(),
  ignoreStories: booleanField(),
  sendReadReceipts: booleanField(),
  dmPolicy: enumField(dmPolicyEnum, 'pairing'),
  allowFrom: arrayField('mixed'),
  defaultTo: stringField(),
  groupAllowFrom: arrayField('mixed'),
  groupPolicy: enumField(groupPolicyEnum, 'allowlist'),
  historyLimit: integerField({ minimum: 0 }),
  dmHistoryLimit: integerField({ minimum: 0 }),
  mediaMaxMb: integerField({ minimum: 1 }),
  reactionNotifications: enumField(['off', 'own', 'all', 'allowlist']),
  reactionLevel: enumField(['off', 'ack', 'minimal', 'extensive']),
  markdown: markdownField(),
  heartbeat: heartbeatField(),
  responsePrefix: stringField(),
}

const imessageProperties: Record<string, JsonSchema> = {
  name: stringField(),
  enabled: booleanField(true),
  cliPath: stringField(),
  dbPath: stringField(),
  remoteHost: stringField(),
  service: enumField(['imessage', 'sms', 'auto']),
  region: stringField(),
  dmPolicy: enumField(dmPolicyEnum, 'pairing'),
  allowFrom: arrayField('mixed'),
  defaultTo: stringField(),
  groupAllowFrom: arrayField('mixed'),
  groupPolicy: enumField(groupPolicyEnum, 'allowlist'),
  historyLimit: integerField({ minimum: 0 }),
  dmHistoryLimit: integerField({ minimum: 0 }),
  includeAttachments: booleanField(),
  mediaMaxMb: integerField({ minimum: 1 }),
  markdown: markdownField(),
  heartbeat: heartbeatField(),
  responsePrefix: stringField(),
}

const feishuProperties: Record<string, JsonSchema> = {
  name: stringField(),
  enabled: booleanField(true),
  appId: stringField(),
  appSecret: stringField(),
  encryptKey: stringField(),
  verificationToken: stringField(),
  domain: enumField(['feishu', 'lark'], 'feishu'),
  connectionMode: enumField(['websocket', 'webhook'], 'websocket'),
  webhookHost: stringField(),
  webhookPort: integerField({ minimum: 1 }),
  webhookPath: stringField(),
  dmPolicy: enumField(['open', 'pairing', 'allowlist'], 'pairing'),
  allowFrom: arrayField('mixed'),
  groupPolicy: enumField(groupPolicyEnum, 'allowlist'),
  groupAllowFrom: arrayField('mixed'),
  requireMention: booleanField(),
  historyLimit: integerField({ minimum: 0 }),
  dmHistoryLimit: integerField({ minimum: 0 }),
  renderMode: enumField(['auto', 'raw', 'card']),
  streaming: booleanField(),
  markdown: markdownField(),
  heartbeat: heartbeatField(),
  responsePrefix: stringField(),
}

const nostrProperties: Record<string, JsonSchema> = {
  name: stringField(),
  enabled: booleanField(true),
  privateKey: stringField(),
  relays: arrayField(),
  dmPolicy: enumField(dmPolicyEnum, 'pairing'),
  allowFrom: arrayField('mixed'),
  profile: objectField({
    name: stringField(),
    displayName: stringField(),
    about: stringField(),
    picture: stringField(),
    banner: stringField(),
    website: stringField(),
    nip05: stringField(),
    lud16: stringField(),
  }),
  markdown: markdownField(),
}

const msteamsProperties: Record<string, JsonSchema> = {
  enabled: booleanField(true),
  appId: stringField(),
  appPassword: stringField(),
  tenantId: stringField(),
  webhook: objectField({
    port: integerField({ minimum: 1 }),
    path: stringField(),
  }),
  dmPolicy: enumField(dmPolicyEnum, 'pairing'),
  allowFrom: arrayField(),
  defaultTo: stringField(),
  groupAllowFrom: arrayField(),
  groupPolicy: enumField(groupPolicyEnum, 'allowlist'),
  requireMention: booleanField(),
  historyLimit: integerField({ minimum: 0 }),
  dmHistoryLimit: integerField({ minimum: 0 }),
  replyStyle: enumField(['message', 'adaptive-card']),
  mediaMaxMb: numberField({ minimum: 0 }),
  sharePointSiteId: stringField(),
  markdown: markdownField(),
  heartbeat: heartbeatField(),
  responsePrefix: stringField(),
}

const mattermostProperties: Record<string, JsonSchema> = {
  name: stringField(),
  enabled: booleanField(true),
  botToken: stringField(),
  baseUrl: stringField(),
  chatmode: enumField(['oncall', 'onmessage', 'onchar']),
  requireMention: booleanField(),
  dmPolicy: enumField(dmPolicyEnum, 'pairing'),
  allowFrom: arrayField('mixed'),
  groupAllowFrom: arrayField('mixed'),
  groupPolicy: enumField(groupPolicyEnum, 'allowlist'),
  textChunkLimit: integerField({ minimum: 1 }),
  chunkMode: enumField(['length', 'newline']),
  blockStreaming: booleanField(),
  blockStreamingCoalesce: blockStreamingCoalesceField(),
  commands: objectField({
    native: booleanField(),
    nativeSkills: booleanField(),
    callbackPath: stringField(),
    callbackUrl: stringField(),
  }),
  interactions: objectField({
    callbackBaseUrl: stringField(),
    allowedSourceIps: arrayField(),
  }),
  markdown: markdownField(),
  responsePrefix: stringField(),
}

const nextcloudTalkProperties: Record<string, JsonSchema> = {
  name: stringField(),
  enabled: booleanField(true),
  baseUrl: stringField(),
  botSecret: stringField(),
  apiUser: stringField(),
  apiPassword: stringField(),
  webhookPort: integerField({ minimum: 1 }),
  webhookHost: stringField(),
  webhookPath: stringField(),
  webhookPublicUrl: stringField(),
  dmPolicy: enumField(dmPolicyEnum, 'pairing'),
  allowFrom: arrayField(),
  groupAllowFrom: arrayField(),
  groupPolicy: enumField(groupPolicyEnum, 'allowlist'),
  markdown: markdownField(),
}

const matrixProperties: Record<string, JsonSchema> = {
  name: stringField(),
  enabled: booleanField(true),
  homeserver: stringField(),
  userId: stringField(),
  accessToken: stringField(),
  password: stringField(),
  deviceName: stringField(),
  initialSyncLimit: integerField({ minimum: 0 }),
  encryption: booleanField(),
  allowlistOnly: booleanField(),
  groupPolicy: enumField(groupPolicyEnum),
  groupAllowFrom: arrayField('mixed'),
  replyToMode: enumField(['off', 'first', 'all']),
  threadReplies: enumField(['off', 'inbound', 'always']),
  textChunkLimit: numberField({ minimum: 0 }),
  chunkMode: enumField(['length', 'newline']),
  responsePrefix: stringField(),
  mediaMaxMb: numberField({ minimum: 0 }),
  autoJoin: enumField(['always', 'allowlist', 'off']),
  autoJoinAllowlist: arrayField('mixed'),
  markdown: markdownField(),
  dm: dmField(),
}

const bluebubblesProperties: Record<string, JsonSchema> = {
  name: stringField(),
  enabled: booleanField(true),
  serverUrl: stringField(),
  password: stringField(),
  webhookPath: stringField(),
  dmPolicy: enumField(dmPolicyEnum, 'pairing'),
  allowFrom: arrayField('mixed'),
  groupAllowFrom: arrayField('mixed'),
  groupPolicy: enumField(groupPolicyEnum, 'allowlist'),
  historyLimit: integerField({ minimum: 0 }),
  dmHistoryLimit: integerField({ minimum: 0 }),
  textChunkLimit: integerField({ minimum: 1 }),
  chunkMode: enumField(['length', 'newline']),
  mediaMaxMb: integerField({ minimum: 1 }),
  mediaLocalRoots: arrayField(),
  sendReadReceipts: booleanField(),
  blockStreaming: booleanField(),
  blockStreamingCoalesce: blockStreamingCoalesceField(),
  markdown: markdownField(),
  heartbeat: heartbeatField(),
  responsePrefix: stringField(),
}

const lineProperties: Record<string, JsonSchema> = {
  name: stringField(),
  enabled: booleanField(true),
  channelAccessToken: stringField(),
  channelSecret: stringField(),
  tokenFile: stringField(),
  secretFile: stringField(),
  dmPolicy: enumField(dmPolicyEnum, 'pairing'),
  allowFrom: arrayField('mixed'),
  groupAllowFrom: arrayField('mixed'),
  groupPolicy: enumField(groupPolicyEnum, 'allowlist'),
  responsePrefix: stringField(),
  mediaMaxMb: numberField({ minimum: 0 }),
  webhookPath: stringField(),
}

const zaloProperties: Record<string, JsonSchema> = {
  name: stringField(),
  enabled: booleanField(true),
  botToken: stringField(),
  tokenFile: stringField(),
  webhookUrl: stringField(),
  webhookSecret: stringField(),
  webhookPath: stringField(),
  dmPolicy: enumField(dmPolicyEnum),
  allowFrom: arrayField('mixed'),
  groupPolicy: enumField(groupPolicyEnum),
  groupAllowFrom: arrayField('mixed'),
  mediaMaxMb: numberField({ minimum: 0 }),
  proxy: stringField(),
  markdown: markdownField(),
  responsePrefix: stringField(),
}

const zalouserProperties: Record<string, JsonSchema> = {
  name: stringField(),
  enabled: booleanField(true),
  profile: stringField(),
  dmPolicy: enumField(dmPolicyEnum),
  allowFrom: arrayField('mixed'),
  historyLimit: integerField({ minimum: 0 }),
  groupAllowFrom: arrayField('mixed'),
  groupPolicy: enumField(groupPolicyEnum),
  messagePrefix: stringField(),
  markdown: markdownField(),
  responsePrefix: stringField(),
}

const synologyProperties: Record<string, JsonSchema> = {
  enabled: booleanField(true),
  token: stringField(),
  incomingUrl: stringField(),
  nasHost: stringField(),
  webhookPath: stringField(),
  dmPolicy: enumField(['open', 'allowlist', 'disabled'], 'allowlist'),
  allowedUserIds: arrayField(),
  rateLimitPerMinute: integerField({ minimum: 0 }),
  botName: stringField(),
  allowInsecureSsl: booleanField(),
}

const tlonProperties: Record<string, JsonSchema> = {
  name: stringField(),
  enabled: booleanField(true),
  ship: stringField(),
  url: stringField(),
  code: stringField(),
  allowPrivateNetwork: booleanField(),
  groupChannels: arrayField(),
  dmAllowlist: arrayField(),
  autoDiscoverChannels: booleanField(),
  showModelSignature: booleanField(),
  responsePrefix: stringField(),
  autoAcceptDmInvites: booleanField(),
  autoAcceptGroupInvites: booleanField(),
  ownerShip: stringField(),
}

const fallbackSchemas: Record<string, ChannelSchemaPayload> = {
  telegram: { schema: multiAccountSchema(telegramProperties), uiHints: null },
  whatsapp: { schema: multiAccountSchema(whatsappProperties), uiHints: null },
  discord: { schema: multiAccountSchema(discordProperties), uiHints: null },
  irc: { schema: multiAccountSchema(ircProperties), uiHints: null },
  googlechat: { schema: multiAccountSchema(googleChatProperties), uiHints: null },
  slack: { schema: multiAccountSchema(slackProperties), uiHints: null },
  signal: { schema: multiAccountSchema(signalProperties), uiHints: null },
  imessage: { schema: multiAccountSchema(imessageProperties), uiHints: null },
  feishu: { schema: multiAccountSchema(feishuProperties), uiHints: null },
  nostr: { schema: objectField({ ...nostrProperties, defaultAccount: stringField() }), uiHints: null },
  msteams: { schema: objectField(msteamsProperties), uiHints: null },
  mattermost: { schema: multiAccountSchema(mattermostProperties), uiHints: null },
  'nextcloud-talk': { schema: multiAccountSchema(nextcloudTalkProperties), uiHints: null },
  matrix: { schema: multiAccountSchema(matrixProperties), uiHints: null },
  bluebubbles: { schema: multiAccountSchema(bluebubblesProperties), uiHints: null },
  line: { schema: multiAccountSchema(lineProperties), uiHints: null },
  zalo: { schema: multiAccountSchema(zaloProperties), uiHints: null },
  zalouser: { schema: multiAccountSchema(zalouserProperties), uiHints: null },
  'synology-chat': { schema: multiAccountSchema(synologyProperties), uiHints: null },
  tlon: { schema: multiAccountSchema(tlonProperties), uiHints: null },
}

export function getFallbackChannelSchema(channelId: string): ChannelSchemaPayload | null {
  return fallbackSchemas[channelId] ?? null
}
