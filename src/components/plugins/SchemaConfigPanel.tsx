import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useChannelsStore } from '@/store/channels'
import type { ChannelDetailPayload } from '@/types'
import { Button } from '@/components/ui/button'
import { Input, selectControlClassName } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const REDACTED_SENTINEL = '__OPENCLAW_REDACTED__'

type JsonSchema = Record<string, any>
type FieldGroup = 'credentials' | 'accessPolicy' | 'advanced'
type FieldKind = 'text' | 'secret' | 'number' | 'boolean' | 'select' | 'array'

type FieldOption = {
  value: unknown
  label: string
}

type SchemaField = {
  key: string
  path: string
  pathSegments: string[]
  schema: JsonSchema
  kind: FieldKind
  group: FieldGroup
  label: string
  hint?: string
  options?: FieldOption[]
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (s) => s.toUpperCase())
}

function compactPathKey(pathSegments: string[]): string {
  if (pathSegments.length === 0) return ''
  if (pathSegments.length === 1) return pathSegments[0]
  const [first, ...rest] = pathSegments
  return [
    first,
    ...rest.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1)),
  ].join('')
}

function resolveTranslatedText(
  key: string,
  fallback: string,
  t: ReturnType<typeof useTranslation>['t'],
  exists: ReturnType<typeof useTranslation>['i18n']['exists'],
): string {
  return exists(key) ? t(key) : fallback
}

function pickFieldGroup(key: string): FieldGroup {
  if (/policy|allowfrom|mention|replyto/i.test(key)) return 'accessPolicy'
  if (/token|secret|key|appid|password|webhook|host|port|domain|mode|path|url|account/i.test(key)) {
    return 'credentials'
  }
  return 'advanced'
}

function isSensitiveField(key: string, schema: JsonSchema): boolean {
  if (/token|secret|password|key/i.test(key)) return true
  return schema?.sensitive === true
}

function collectOptionValues(schema: JsonSchema): FieldOption[] | null {
  const options: FieldOption[] = []

  const pushScalar = (value: unknown) => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      options.push({ value, label: String(value) })
    }
  }

  if (Array.isArray(schema?.enum)) {
    schema.enum.forEach(pushScalar)
    return options.length > 0 ? options : null
  }

  const variants = Array.isArray(schema?.oneOf)
    ? schema.oneOf
    : Array.isArray(schema?.anyOf)
      ? schema.anyOf
      : null

  if (!variants) return null

  for (const variant of variants) {
    if (Array.isArray(variant?.enum)) {
      variant.enum.forEach(pushScalar)
      continue
    }
    if (Object.prototype.hasOwnProperty.call(variant || {}, 'const')) {
      pushScalar(variant.const)
    }
  }

  return options.length > 0 ? options : null
}

function normalizeFieldKind(key: string, schema: JsonSchema): FieldKind | null {
  const options = collectOptionValues(schema)
  if (options) return 'select'
  if (isSensitiveField(key, schema)) return 'secret'

  const type = Array.isArray(schema?.type) ? schema.type[0] : schema?.type
  if (type === 'boolean') return 'boolean'
  if (type === 'number' || type === 'integer') return 'number'
  if (type === 'string') return 'text'
  if (type === 'array') {
    const itemType = Array.isArray(schema?.items?.type) ? schema.items.type[0] : schema?.items?.type
    if (!itemType || itemType === 'string' || itemType === 'number' || itemType === 'integer') {
      return 'array'
    }
  }
  return null
}

function collectEditableFields(
  channelId: string,
  detail: ChannelDetailPayload,
  t: ReturnType<typeof useTranslation>['t'],
  exists: ReturnType<typeof useTranslation>['i18n']['exists'],
): SchemaField[] {
  const schema = detail.schema
  if (!schema || typeof schema !== 'object') return []

  const fields: SchemaField[] = []

  const walk = (current: JsonSchema, parentPath: string[] = []) => {
    const properties = current.properties && typeof current.properties === 'object'
      ? current.properties as Record<string, JsonSchema>
      : {}

    for (const [key, propertySchema] of Object.entries(properties)) {
      const pathSegments = [...parentPath, key]
      const path = pathSegments.join('.')
      const compactKey = compactPathKey(pathSegments)
      const kind = normalizeFieldKind(key, propertySchema)

      if (kind) {
        const labelFallback = pathSegments.length > 1
          ? `${humanizeKey(pathSegments[pathSegments.length - 2])}: ${humanizeKey(key)}`
          : humanizeKey(key)
        const label = resolveTranslatedText(
          `plugins.channels.${channelId}.${compactKey}`,
          resolveTranslatedText(
            `plugins.channels.${compactKey}`,
            resolveTranslatedText(`plugins.channels.${key}`, labelFallback, t, exists),
            t,
            exists,
          ),
          t,
          exists,
        )
        const hint = resolveTranslatedText(
          `plugins.channels.${channelId}.${compactKey}Hint`,
          resolveTranslatedText(
            `plugins.channels.${compactKey}Hint`,
            resolveTranslatedText(`plugins.channels.${key}Hint`, '', t, exists),
            t,
            exists,
          ),
          t,
          exists,
        )
        fields.push({
          key: compactKey,
          path,
          pathSegments,
          schema: propertySchema,
          kind,
          group: pickFieldGroup(path),
          label,
          ...(hint ? { hint } : {}),
          ...(collectOptionValues(propertySchema) ? { options: collectOptionValues(propertySchema) ?? undefined } : {}),
        })
        continue
      }

      const nestedProperties = propertySchema?.properties && typeof propertySchema.properties === 'object'
      const nestedType = Array.isArray(propertySchema?.type) ? propertySchema.type[0] : propertySchema?.type
      if ((nestedType === 'object' || nestedProperties) && pathSegments.length < 2) {
        walk(propertySchema, pathSegments)
      }
    }
  }

  walk(schema)
  return fields
}

function getValueAtPath(config: Record<string, unknown> | null, pathSegments: string[]): unknown {
  let current: unknown = config
  for (const segment of pathSegments) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function setValueAtPath(target: Record<string, unknown>, pathSegments: string[], value: unknown): void {
  let cursor = target
  for (let index = 0; index < pathSegments.length; index++) {
    const segment = pathSegments[index]
    const isLeaf = index === pathSegments.length - 1
    if (isLeaf) {
      cursor[segment] = value
      return
    }
    const next = cursor[segment]
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      cursor[segment] = {}
    }
    cursor = cursor[segment] as Record<string, unknown>
  }
}

function initialValueForField(field: SchemaField, config: Record<string, unknown> | null): unknown {
  const current = getValueAtPath(config, field.pathSegments)
  if (current !== undefined) return current
  if (Object.prototype.hasOwnProperty.call(field.schema || {}, 'default')) return field.schema.default
  if (field.kind === 'boolean') return false
  if (field.kind === 'array') return []
  return ''
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function normalizePatchValue(field: SchemaField, value: unknown): unknown {
  if (field.kind === 'array') {
    if (!Array.isArray(value)) return []
    return value.map((entry) => String(entry).trim()).filter(Boolean)
  }
  if (field.kind === 'number') {
    if (value === '' || value == null) return undefined
    return Number(value)
  }
  return value
}

function SecretFieldInput(props: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
  label: string
}) {
  const { t } = useTranslation()
  const redacted = props.value === REDACTED_SENTINEL
  const [editing, setEditing] = useState(false)

  return (
    <div>
      <label className="text-xs text-muted-foreground">{props.label}</label>
      {redacted && !editing ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
            <span>••••••••••••</span>
            <span className="text-xs text-green-600 dark:text-green-400">({t('plugins.channels.configured')})</span>
          </div>
          <Button
            type="button"
            onClick={() => { setEditing(true); props.onChange('') }}
            variant="outline"
            size="compact"
            className="flex-shrink-0 text-xs"
          >
            {t('plugins.channels.change')}
          </Button>
        </div>
      ) : (
        <Input
          type="password"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
        />
      )}
      {props.hint && <p className="text-[11px] text-muted-foreground/70 mt-1">{props.hint}</p>}
    </div>
  )
}

function FieldControl(props: {
  field: SchemaField
  value: unknown
  setValue: (value: unknown) => void
}) {
  const { field, value, setValue } = props

  if (field.kind === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => setValue(e.target.checked)}
          className="rounded border-input"
        />
        <span>{field.label}</span>
      </label>
    )
  }

  if (field.kind === 'secret') {
    return (
      <SecretFieldInput
        label={field.label}
        value={typeof value === 'string' ? value : ''}
        onChange={setValue}
        hint={field.hint}
      />
    )
  }

  if (field.kind === 'select') {
    const options = field.options ?? []
    const selectedIndex = options.findIndex((option) => valuesEqual(option.value, value))
    return (
      <div>
        <label className="text-xs text-muted-foreground">{field.label}</label>
        <select
          value={selectedIndex >= 0 ? String(selectedIndex) : ''}
          onChange={(e) => {
            const option = options[Number(e.target.value)]
            setValue(option?.value ?? '')
          }}
          className={selectControlClassName}
        >
          <option value="" />
          {options.map((option, index) => (
            <option key={`${field.key}-${index}`} value={String(index)}>
              {option.label}
            </option>
          ))}
        </select>
        {field.hint && <p className="text-[11px] text-muted-foreground/70 mt-1">{field.hint}</p>}
      </div>
    )
  }

  if (field.kind === 'number') {
    return (
      <div>
        <label className="text-xs text-muted-foreground">{field.label}</label>
        <Input
          type="number"
          value={typeof value === 'number' ? value : (value as string ?? '')}
          onChange={(e) => setValue(e.target.value === '' ? '' : Number(e.target.value))}
        />
        {field.hint && <p className="text-[11px] text-muted-foreground/70 mt-1">{field.hint}</p>}
      </div>
    )
  }

  if (field.kind === 'array') {
    return (
      <div>
        <label className="text-xs text-muted-foreground">{field.label}</label>
        <Input
          type="text"
          value={Array.isArray(value) ? value.join(', ') : (typeof value === 'string' ? value : '')}
          onChange={(e) => setValue(e.target.value.split(',').map((entry) => entry.trim()).filter(Boolean))}
        />
        {field.hint && <p className="text-[11px] text-muted-foreground/70 mt-1">{field.hint}</p>}
      </div>
    )
  }

  return (
    <div>
      <label className="text-xs text-muted-foreground">{field.label}</label>
      <Input
        type="text"
        value={typeof value === 'string' ? value : String(value ?? '')}
        onChange={(e) => setValue(e.target.value)}
      />
      {field.hint && <p className="text-[11px] text-muted-foreground/70 mt-1">{field.hint}</p>}
    </div>
  )
}

export default function SchemaConfigPanel({
  channelId,
  detail,
  schemaRoot,
  configRoot,
  patchPathSegments,
  emptyMessage,
  includeKeys,
  submitLabel,
  compact = false,
  onAfterSave,
}: {
  channelId: string
  detail: ChannelDetailPayload
  schemaRoot?: Record<string, unknown> | null
  configRoot?: Record<string, unknown> | null
  patchPathSegments?: string[]
  emptyMessage?: string
  includeKeys?: string[]
  submitLabel?: string
  compact?: boolean
  onAfterSave?: () => Promise<void> | void
}) {
  const { t, i18n } = useTranslation()
  const store = useChannelsStore()
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [baseValues, setBaseValues] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [rawJson, setRawJson] = useState('')

  const effectiveDetail = detail
  const effectiveSchema = (schemaRoot ?? detail.schema) as Record<string, unknown> | null | undefined
  const effectiveConfig = (configRoot ?? detail.config) as Record<string, unknown> | null | undefined
  const fields = collectEditableFields(
    channelId,
    { ...effectiveDetail, schema: effectiveSchema ?? null, config: effectiveConfig ?? null },
    t,
    i18n.exists,
  )
  const visibleFields = includeKeys?.length
    ? fields.filter((field) => includeKeys.includes(field.key))
    : fields
  const groupedFields = {
    credentials: visibleFields.filter((field) => field.group === 'credentials'),
    accessPolicy: visibleFields.filter((field) => field.group === 'accessPolicy'),
    advanced: visibleFields.filter((field) => field.group === 'advanced'),
  }

  useEffect(() => {
    const initial = visibleFields.reduce<Record<string, unknown>>((acc, field) => {
      acc[field.key] = initialValueForField(field, effectiveConfig ?? null)
      return acc
    }, {})
    setForm(initial)
    setBaseValues(initial)
    setRawJson(JSON.stringify(effectiveConfig ?? {}, null, 2))
    setSaveError(null)
  }, [channelId, effectiveConfig, effectiveSchema, detail.config, detail.schema])

  const updateField = (key: string, value: unknown) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleSave = async () => {
    const patch: Record<string, unknown> = {}
    for (const field of visibleFields) {
      const currentValue = form[field.key]
      const baseValue = baseValues[field.key]
      if (currentValue === REDACTED_SENTINEL && baseValue === REDACTED_SENTINEL) {
        continue
      }
      if (valuesEqual(currentValue, baseValue)) {
        continue
      }
      const normalized = normalizePatchValue(field, currentValue)
      if (normalized !== undefined) {
        setValueAtPath(patch, [...(patchPathSegments ?? []), ...field.pathSegments], normalized)
      }
    }

    if (Object.keys(patch).length === 0) {
      if (!onAfterSave) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        return
      }
      setSaving(true)
      setSaveError(null)
      try {
        await onAfterSave()
        await store.fetchDetail(channelId, true)
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } catch (error: any) {
        setSaveError(error.message)
      } finally {
        setSaving(false)
      }
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      await store.updateChannelConfig(channelId, patch)
      if (onAfterSave) {
        await onAfterSave()
      }
      await store.fetchDetail(channelId, true)
      setBaseValues(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (error: any) {
      setSaveError(error.message)
    } finally {
      setSaving(false)
    }
  }

  if (visibleFields.length === 0) {
    const handleSaveRaw = async () => {
      setSaving(true)
      setSaveError(null)
      try {
        const parsed = JSON.parse(rawJson || '{}') as Record<string, unknown>
        await store.updateChannelConfig(channelId, {
          ...(patchPathSegments?.length
            ? patchPathSegments.reduceRight<Record<string, unknown>>((acc, segment) => ({ [segment]: acc }), parsed)
            : parsed),
        })
        await store.fetchDetail(channelId, true)
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } catch (error: any) {
        setSaveError(error.message || t('plugins.channels.invalidJson'))
      } finally {
        setSaving(false)
      }
    }

    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
          {emptyMessage || (effectiveSchema
            ? t('plugins.channels.schemaPending')
            : t('plugins.channels.rawConfigFallback'))}
        </div>
        <div className="rounded-lg border p-4 space-y-3">
          <div className="text-sm font-medium">{t('plugins.channels.rawConfigEditor')}</div>
          <Textarea
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            className="min-h-64 font-mono"
            spellCheck={false}
          />
          {saveError && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3">
              {saveError}
            </div>
          )}
          <div className="flex items-center justify-end">
            <Button
              onClick={handleSaveRaw}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
              {saved ? t('common.saved') : t('plugins.channels.saveConfig')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const renderGroup = (title: string, items: SchemaField[]) => {
    if (items.length === 0) return null
    if (compact) {
      return (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((field) => (
            <FieldControl
              key={field.key}
              field={field}
              value={form[field.key]}
              setValue={(value) => updateField(field.key, value)}
            />
          ))}
        </div>
      )
    }
    return (
      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="font-semibold">{title}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((field) => (
            <FieldControl
              key={field.key}
              field={field}
              value={form[field.key]}
              setValue={(value) => updateField(field.key, value)}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
          {saved ? t('common.saved') : (submitLabel || t('plugins.channels.saveConfig'))}
        </Button>
      </div>

      {saveError && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3">
          {saveError}
        </div>
      )}

      {renderGroup(t('plugins.channels.credentials'), groupedFields.credentials)}
      {renderGroup(t('plugins.channels.accessPolicy'), groupedFields.accessPolicy)}
      {renderGroup(t('plugins.channels.advanced'), groupedFields.advanced)}
    </div>
  )
}
