import { createApp } from 'vue'
import App from './App.vue'
import { initPWA } from './pwa'
import './style.css'

createApp(App).mount('#app')
initPWA()
