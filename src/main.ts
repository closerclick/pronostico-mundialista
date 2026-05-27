import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import '@gatoseya/closer-click-support'
import { i18n } from './i18n'
import { initAnalytics } from './lib/analytics'

createApp(App).use(i18n).mount('#app')

// Analítica cookieless autohosteada (GoatCounter); solo en producción.
initAnalytics()

// Web Push: el SW (closer-click-push-sw.js, inyectado en el SW de Workbox)
// hace postMessage('cc-push-ring') al recibir el timbre. Si la app está abierta,
// nos aseguramos de estar conectados → identify drena la cola offline del proxy.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (ev: MessageEvent) => {
    if (ev.data && ev.data.type === 'cc-push-ring') {
      import('./lib/connection').then(m => m.ensureConnected()).catch(() => {})
    }
  })
}
