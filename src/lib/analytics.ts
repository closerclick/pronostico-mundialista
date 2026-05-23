// Analítica de tráfico COOKIELESS y autohosteada (GoatCounter en
// goat.closer.click): agregados, sin cookies ni datos personales, tus datos en
// tu server (coherente con la ideología CloserClick).
//
// Solo cuenta en PRODUCCIÓN (mundial.closer.click): nunca en dev/local, LAN ni
// previews. Carga el script de forma diferida, sin bloquear el arranque.

const PROD_HOST = 'mundial.closer.click'
const GOATCOUNTER = 'https://goat.closer.click'

export function initAnalytics (): void {
  if (typeof window === 'undefined') return
  if (location.hostname !== PROD_HOST) return
  const s = document.createElement('script')
  s.async = true
  s.src = `${GOATCOUNTER}/count.js`
  s.setAttribute('data-goatcounter', `${GOATCOUNTER}/count`)
  document.head.appendChild(s)
}
