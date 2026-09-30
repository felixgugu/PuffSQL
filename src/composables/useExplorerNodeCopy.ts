import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorkspaceStore } from '@/stores/workspaceStore';

/**
 * Explorer 樹節點「複製名稱」互動邏輯。
 *
 * - 透過 setHovered / clearHovered 追蹤目前游標停留的節點名稱。
 * - 當節點被 hover 且焦點不在輸入元件時，攔截 Ctrl/Cmd + C 複製該節點名稱。
 * - 僅負責狀態與剪貼簿，實際節點繫結交由呼叫端（AppSidebar）處理。
 */
export function useExplorerNodeCopy() {
  const { t } = useI18n();
  const workspaceStore = useWorkspaceStore();

  const hoveredNodeName = ref<string | null>(null);

  function isEditableTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el || typeof el.tagName !== 'string') return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return el.isContentEditable === true;
  }

  function copyName(name: string) {
    const text = name.trim();
    if (!text) return;
    try {
      navigator.clipboard?.writeText(text);
    } catch {
      // Ignore clipboard access errors (non-secure context / permission denied)
    }
    workspaceStore.showToast(t('sidebar.nameCopied', { name: text }), 'info', 2000);
  }

  function setHovered(name: string) {
    hoveredNodeName.value = name;
  }

  function clearHovered() {
    hoveredNodeName.value = null;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
    if (event.key !== 'c' && event.key !== 'C') return;
    // 焦點在輸入框 / 編輯器（contenteditable）時，交還瀏覽器處理原生複製
    if (isEditableTarget(event.target)) return;
    const name = hoveredNodeName.value;
    if (!name) return;
    event.preventDefault();
    copyName(name);
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown);
  });

  return {
    hoveredNodeName,
    setHovered,
    clearHovered,
    copyName,
  };
}
