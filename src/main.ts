import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './assets/main.css';
import 'tabulator-tables/dist/css/tabulator.css';
import './styles/tabulatorTheme.css';
import './styles/editorGuard.css';

import tooltip from './directives/tooltip';

import { i18n } from './i18n';

// Prevent default browser/system context menu globally for a native desktop feel
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

const app = createApp(App);
const pinia = createPinia();

// Read initial saved locale before the first render so the app never flashes the wrong language.
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
app.directive('tooltip', tooltip);

app.mount('#app');
