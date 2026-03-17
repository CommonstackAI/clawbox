type TranslateFn = (...args: any[]) => string

function normalizeMessage(message: string): string {
  return message.trim().toLowerCase()
}

export function formatProviderRequestError(
  message: string,
  baseUrl: string,
  t: TranslateFn,
): string {
  const normalized = normalizeMessage(message)

  if (
    normalized.includes('socket connection was closed unexpectedly') ||
    normalized.includes('fetch failed') ||
    normalized.includes('connection refused') ||
    normalized.includes('network is unreachable') ||
    normalized.includes('timed out') ||
    normalized.includes('tls') ||
    normalized.includes('certificate')
  ) {
    return t('settings.providerEndpointUnavailable', {
      baseUrl,
      defaultValue: `Unable to reach the provider endpoint (${baseUrl}). Check the Base URL, compatibility mode, API key, and local network or TLS settings.`,
    })
  }

  return message
}
