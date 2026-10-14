import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './assets/main.css';
import 'tabulator-tables/dist/css/tabulator.css';
import './styles/tabulatorTheme.css';

import PrimeVue from 'primevue/config';
import Aura from '@primevue/themes/aura';
import ToastService from 'primevue/toastservice';
import ConfirmationService from 'primevue/confirmationservice';
import Ripple from 'primevue/ripple';
import 'primeicons/primeicons.css';

import tooltip from './directives/tooltip';

import { i18n, primevueZhTW, primevueLocales } from './i18n';

// Prevent default browser/system context menu globally for a native desktop feel
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

const app = createApp(App);
const pinia = createPinia();

// Read initial saved locale if present to configure PrimeVue
let initialLocale = 'zh-TW';
try {
  const savedSettings = localStorage.getItem('sqlight_app_settings');
  if (savedSettings) {
    const parsed = JSON.parse(savedSettings);
    if (parsed.locale === 'en' || parsed.locale === 'zh-TW') {
      initialLocale = parsed.locale;
    }
  }
} catch {
  // fallback to default
}

(i18n.global.locale as any).value = initialLocale;

app.use(pinia);
app.use(i18n);
app.use(PrimeVue, {
  ripple: true,
  locale: (primevueLocales as any)[initialLocale] || primevueZhTW,
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: '.dark',
      cssLayer: false
    }
  }
});
app.use(ToastService);
app.use(ConfirmationService);
app.directive('tooltip', tooltip);
app.directive('ripple', Ripple);

app.mount('#app');
