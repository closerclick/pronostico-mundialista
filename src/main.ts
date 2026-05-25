import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import '@gatoseya/closer-click-support'
import { i18n } from './i18n'
import { initAnalytics } from './lib/analytics'

createApp(App).use(i18n).mount('#app')

// Analítica cookieless autohosteada (GoatCounter); solo en producción.
initAnalytics()
