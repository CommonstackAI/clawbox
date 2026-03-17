/**
 * Simple logger utility
 */
function ts() {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}

export function createLogger(module: string) {
  const prefix = `[${module}]`
  return {
    info: (...args: any[]) => console.log(`[${ts()}]`, prefix, ...args),
    warn: (...args: any[]) => console.warn(`[${ts()}]`, prefix, ...args),
    error: (...args: any[]) => console.error(`[${ts()}]`, prefix, ...args),
    debug: (...args: any[]) => {
      if (process.env.DEBUG) console.debug(`[${ts()}]`, prefix, ...args)
    },
  }
}
