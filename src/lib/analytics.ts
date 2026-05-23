// Analítica de tráfico COOKIELESS y autohosteada (GoatCounter en
// goat.closer.click): agregados, sin cookies ni datos personales, tus datos en
// tu server (coherente con la ideología CloserClick).
//
// Solo cuenta en PRODUCCIÓN (mundial.closer.click): nunca en dev/local, LAN ni
// previews. Carga el script de forma diferida, sin bloquear el arranque.

const PROD_HOST = 'mundial.closer.click'
const GOATCOUNTER = 'https://goat.closer.click'

interface GoatCounter { count: (vars: { path: string; title?: string; event?: boolean }) => void }
function gc (): GoatCounter | null {
  const g = (window as unknown as { goatcounter?: GoatCounter }).goatcounter
  return g && typeof g.count === 'function' ? g : null
}

function enabled (): boolean {
  return typeof window !== 'undefined' && location.hostname === PROD_HOST
}

export function initAnalytics (): void {
  if (!enabled()) return
  const s = document.createElement('script')
  s.async = true
  s.src = `${GOATCOUNTER}/count.js`
  s.setAttribute('data-goatcounter', `${GOATCOUNTER}/count`)
  document.head.appendChild(s)
}

/**
 * Registra un EVENTO (no pageview) en GoatCounter: navegación por sección/tab,
 * acciones, etc. No-op fuera de producción o si el script aún no cargó.
 */
export function trackEvent (path: string, title?: string): void {
  if (!enabled()) return
  const g = gc()
  if (g) g.count({ path, title: title ?? path, event: true })
}
