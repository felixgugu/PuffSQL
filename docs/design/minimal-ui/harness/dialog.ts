import { createApp, defineComponent, h, onMounted, ref, withDirectives } from 'vue';
import { createPinia } from 'pinia';
import { i18n } from '@/i18n';
import '@/assets/main.css';
import tooltip from '@/directives/tooltip';

import SqDialog from '@/components/ui/SqDialog.vue';
import SqButton from '@/components/ui/SqButton.vue';
import SqInput from '@/components/ui/SqInput.vue';
import SqChip from '@/components/ui/SqChip.vue';
import SqToast from '@/components/ui/SqToast.vue';
import ConfirmModal from '@/components/common/ConfirmModal.vue';
import DangerousQueryModal from '@/components/modals/DangerousQueryModal.vue';
import SettingsModal from '@/components/modals/SettingsModal.vue';
import ConnectionModal from '@/components/modals/ConnectionModal.vue';
import { useDialogWindow } from '@/composables/useDialogWindow';
import { useToastStore } from '@/stores/toastStore';
import { Database, X } from '@/components/icons';

// `#dark` renders the paired dark variant, `#overlay` shows one dialog over its real fixed mask,
// `#pair` is the close-up used to check the footer and the title bar at readable size.
const hash = location.hash.slice(1);
const isDark = hash.endsWith('dark');
const isOverlay = hash.startsWith('overlay');
const isPair = hash.startsWith('pair');
const isDebug = hash.startsWith('debug');
const isWindow = hash.startsWith('window');
const isTooltipDemo = hash.startsWith('tooltip');
const isToastDemo = hash.startsWith('toast');
const isSettings = hash.startsWith('settings');
const isConnection = hash.startsWith('connection');
if (isDark) document.documentElement.classList.add('dark');

/**
 * With several dialogs on one page the real `position: fixed` scrims would all land on top of
 * each other. This flattens the scrim so the frames can be reviewed side by side; the `#overlay`
 * view keeps the genuine article.
 */
const flattenStyle = isOverlay
  ? ''
  : `.sq-dialog-mask {
       position: static !important;
       inset: auto !important;
       background: none !important;
       padding: 0 !important;
       overflow: visible !important;
     }`;

const Body = defineComponent({
  setup: () => () =>
    h('div', { class: 'space-y-3 text-xs text-dark-300' }, [
      h(
        'p',
        { class: 'leading-relaxed' },
        '標題列 40px、內容 14/16px、頁尾右對齊；1px 邊框 + 6px 圓角 + --shadow-overlay。'
      ),
      h('div', { class: 'flex items-center gap-2' }, [
        h(SqChip, { tone: 'ok', label: '已連線' }),
        h(SqChip, { tone: 'warn', label: '處理中' }),
        h(SqChip, { tone: 'neutral', label: 'INT' }),
      ]),
      h(SqInput, { modelValue: 'sql-prod-01.internal', class: 'w-full' }),
    ]),
});

const Footer = defineComponent({
  setup: () => () =>
    h('div', { class: 'flex w-full items-center justify-between' }, [
      h(SqButton, { label: '取消' }),
      h(SqButton, { label: '儲存', tone: 'accent', variant: 'solid' }),
    ]),
});

const HeaderlessFrame = defineComponent({
  setup: () => () =>
    h(
      SqDialog,
      {
        visible: true,
        'show-header': false,
        closable: false,
        class: 'w-full max-w-lg',
        contentClass: '!p-0',
      },
      {
        default: () => [
          h(
            'div',
            {
              class:
                'sq-dialog-drag-handle flex items-center justify-between gap-2 border-b border-dark-750 bg-dark-800 px-4 py-2.5',
            },
            [
              h('div', { class: 'flex items-center gap-2 text-xs font-semibold text-dark-100' }, [
                h(Database, { class: 'w-4 h-4 text-accent' }),
                '自繪標題列（show-header=false）',
              ]),
              h(X, { class: 'h-3.5 w-3.5 text-dark-500' }),
            ]
          ),
          h(
            'div',
            { class: 'p-4 text-xs text-dark-300' },
            '自繪標題列以 .sq-dialog-drag-handle 標記為拖曳區。'
          ),
        ],
      }
    ),
});

/** Exercises the real hand-off: SqDialog `show` → useDialogWindow injects the 8 grab zones. */
const WindowFrame = defineComponent({
  setup() {
    const dialogWindow = useDialogWindow();
    return () =>
      h(
        SqDialog,
        {
          visible: true,
          header: '拖曳與縮放整合',
          class: `w-full max-w-lg ${dialogWindow.marker}`,
          onShow: dialogWindow.onShow,
          onHide: dialogWindow.onHide,
        },
        { default: () => h(Body) }
      );
  },
});

/**
 * Drives a real `v-tooltip` through a synthetic hover so a screenshot can capture the shared
 * tooltip element, its placement and its styling.
 */
const ToastSeeder = defineComponent({
  setup() {
    const toasts = useToastStore();
    toasts.add({ summary: '提示', detail: '游標處未偵測到資料表名稱', life: 0 });
    toasts.add({ summary: '成功', detail: '已複製「CustomerName」的值至剪貼簿', severity: 'success', life: 0 });
    toasts.add({ summary: '警告', detail: '複製失敗：無法寫入剪貼簿', severity: 'warn', life: 0 });
    toasts.add({ summary: '錯誤', detail: 'Msg 208: Invalid object name \'dbo.Ordrers\'', severity: 'error', life: 0 });
    return () => null;
  },
});

const TooltipDemo = defineComponent({
  setup() {
    const host = ref<HTMLElement | null>(null);
    onMounted(() => {
      // The directive listens for this, and the 400ms delay has to elapse before the shot.
      host.value
        ?.querySelector('.tt-bottom')
        ?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
    });
    return () =>
      h('div', { ref: host, class: 'flex flex-col items-start gap-4 p-10', style: 'width: 460px' }, [
        h(SqInput, { modelValue: '', placeholder: '搜尋資料庫、資料表…', class: 'w-full' }),
        withDirectives(h(SqButton, { label: '重新整理', class: 'tt-top' }), [
          [tooltip, '重新整理', undefined, { top: true }],
        ]),
        withDirectives(
          h(SqButton, {
            label: '執行查詢 (Ctrl+Enter)',
            class: 'tt-bottom',
            tone: 'accent',
            variant: 'solid',
          }),
          [[tooltip, '執行游標所在語句 (Ctrl + Enter)', undefined, { bottom: true }]]
        ),
        h(SqButton, { label: '關閉' }),
      ]);
  },
});

const Harness = defineComponent({
  setup: () => () => {
    if (isOverlay) {
      return h('div', { class: 'min-h-screen bg-dark-900' }, [
        h(ConfirmModal, {
          isOpen: true,
          title: '刪除連線設定',
          message: '將從本機移除「生產環境 SQL Server」的連線設定與已儲存的密碼。',
          confirmText: '刪除',
          cancelText: '取消',
          isDanger: true,
        }),
      ]);
    }

    if (isWindow) {
      return h('div', { class: 'bg-dark-850 p-6' }, [h(WindowFrame)]);
    }

    if (isTooltipDemo) {
      return h('div', { class: 'min-h-screen bg-dark-900' }, [h(TooltipDemo)]);
    }

    if (isToastDemo) {
      return h('div', { class: 'min-h-screen bg-dark-900' }, [h(SqToast), h(ToastSeeder)]);
    }

    if (isSettings) {
      // The About panel is the other place the version shows; open it so a shot can prove the
      // injected number reached the UI.
      setTimeout(() => {
        const tab = [...document.querySelectorAll<HTMLElement>('button')].find(
          (node) => node.textContent?.trim() === '關於'
        );
        tab?.click();
      }, 800);
      return h('div', { class: 'min-h-screen bg-dark-900' }, [
        h(SettingsModal, { isOpen: true, onClose: () => {} }),
      ]);
    }

    if (isConnection) {
      return h('div', { class: 'min-h-screen bg-dark-900' }, [
        h(ConnectionModal, {
          isOpen: true,
          editProfile: { id: 'demo', name: 'Production SQL Server', host: 'sql-prod-01', port: 1433, username: 'sa', password: '', database: 'AdventureWorks2022', color: '#2a6791' },
          initialProfile: null,
          onClose: () => {},
        }),
      ]);
    }

    if (isPair || isDebug) {
      return h('div', { class: 'bg-dark-850 p-6' }, [
        h(SqDialog, { visible: true, header: '一般對話框（標題列 + 頁尾）', class: 'w-full max-w-lg mx-auto mb-6' }, {
          default: () => h(Body),
          footer: () => h(Footer),
        }),
        h(
          SqDialog,
          { visible: true, header: '確認提交資料變更', class: 'w-full max-w-lg mx-auto' },
          {
            default: () => h(Body),
            footer: () =>
              h('div', { class: 'flex items-center justify-between w-full' }, [
                h(SqButton, { label: '取消 (Esc)' }),
                h(SqButton, {
                  label: '繼續確認 (下一步)',
                  tone: 'warn',
                  variant: 'outline',
                  'aria-label': '繼續確認 (下一步)',
                }),
              ]),
          }
        ),
      ]);
    }

    const section = (label: string, children: unknown[]) =>
      h('section', { class: 'mb-8' }, [
        h(
          'h2',
          { class: 'mb-3 text-xxs font-semibold uppercase tracking-wider text-dark-500' },
          label
        ),
        ...children,
      ]);

    return h('div', { class: 'min-h-screen bg-dark-850 p-8 text-xs text-dark-200' }, [
      h('h1', { class: 'mb-6 text-sm font-semibold text-dark-100' }, 'PuffSQL · SqDialog 對話框外框'),

      section('外框變體', [
        h('div', { class: 'grid grid-cols-2 gap-6' }, [
          h(SqDialog, { visible: true, header: '一般對話框（標題列 + 頁尾）', class: 'w-full max-w-lg' }, {
            default: () => h(Body),
            footer: () => h(Footer),
          }),
          h(SqDialog, { visible: true, header: '無頁尾', class: 'w-full max-w-lg' }, { default: () => h(Body) }),
          h(HeaderlessFrame),
          h(DangerousQueryModal, {
            isOpen: true,
            step: 1,
            connectionName: 'sql-prod-01',
            databaseName: 'AdventureWorks2022',
            detectedKeywords: ['UPDATE', 'DELETE'],
            sql: 'UPDATE dbo.Orders SET Status = 1 WHERE CreatedAt < @cutoff;',
          }),
        ]),
      ]),

      section('語意強調外框（僅用於不可逆寫入）', [
        h('div', { class: 'grid grid-cols-2 gap-6' }, [
          h(
            SqDialog,
            { visible: true, header: '確認提交資料變更', class: 'w-full max-w-md sq-dialog-accent-warn' },
            { default: () => h(Body) }
          ),
          h(
            SqDialog,
            { visible: true, header: '確認提交資料變更', class: 'w-full max-w-md sq-dialog-accent-danger' },
            { default: () => h(Body) }
          ),
        ]),
      ]),

      section('既有呼叫端元件（真實渲染，非示意）', [
        h('div', { class: 'grid grid-cols-2 gap-6' }, [
          h(ConfirmModal, {
            isOpen: true,
            title: '刪除連線設定',
            message: '將從本機移除「生產環境 SQL Server」的連線設定與已儲存的密碼。',
            confirmText: '刪除',
            cancelText: '取消',
            isDanger: true,
          }),
          h(ConfirmModal, {
            isOpen: true,
            title: '關閉其他結果分頁',
            message: '目前有 6 個未釘選的結果分頁。關閉後僅保留已釘選分頁與目前檢視的分頁。',
            confirmText: '關閉其他分頁',
            cancelText: '取消',
          }),
        ]),
      ]),
    ]);
  },
});

const style = document.createElement('style');
style.textContent = flattenStyle;
document.head.appendChild(style);

const app = createApp(Harness);
app.use(createPinia());
app.use(i18n);
app.directive('tooltip', tooltip);
app.mount('#harness');

if (isDebug) {
  requestAnimationFrame(() => {
    const out = document.createElement('pre');
    out.id = 'metrics';
    const panel = document.querySelector<HTMLElement>('.sq-dialog-panel')!;
    const footer = panel.querySelector<HTMLElement>('.sq-dialog-footer')!;
    const child = footer.firstElementChild as HTMLElement;
    const rect = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return `${el.className.slice(0, 32)} | x=${r.left.toFixed(1)} w=${r.width.toFixed(1)}`;
    };
    out.textContent = [
      rect(panel),
      rect(footer),
      rect(child),
      `footer computed padding: ${getComputedStyle(footer).padding}`,
      `footer computed display: ${getComputedStyle(footer).display}`,
      `child computed width: ${getComputedStyle(child).width}`,
      ...[...footer.querySelectorAll('button')].map(rect),
      ...[...document.querySelectorAll('.sq-btn')].slice(0, 6).map(
        (el) => `${rect(el)} | cssWidth=${getComputedStyle(el).width}`
      ),
    ].join('\n');
    document.body.appendChild(out);
  });
}
