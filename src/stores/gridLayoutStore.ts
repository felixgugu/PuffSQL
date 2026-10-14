import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { Tabulator, TabulatorLayoutColumn, TabulatorSorter } from 'tabulator-tables';

/**
 * Per-result-tab grid layout cache (session only, never persisted).
 *
 * Tabulator loses column state when a table is destroyed (the multi result set tabs recycle grid
 * instances) and when its column definitions are replaced (a new query in the same tab rebuilds the
 * grid). This store remembers column widths/visibility/order plus the sorters keyed by
 * `tabId:setIndex`, so switching back restores what the user set up. It also remembers whether the
 * result grids of a tab render their toolbar / info bars, which is a per result tab view mode too.
 */

export interface GridLayoutColumnEntry {
  field: string;
  width: number;
  visible: boolean;
}

export interface GridLayoutSortEntry {
  field: string;
  dir: 'asc' | 'desc';
}

export interface GridLayoutEntry {
  columns: GridLayoutColumnEntry[];
  sorters: GridLayoutSortEntry[];
}

/** Builds the stable layout key for one result set. Kept pure for unit testing. */
export function buildLayoutKey(tabId: string | null | undefined, setIndex: number): string {
  return `${tabId ?? 'orphan'}:${setIndex}`;
}

/**
 * Toolbar default of one result tab, before the user touches the header toggle. A tab that shows
 * a single grid keeps its toolbar open — the common one-SELECT case, and also the fallback empty
 * grid of a statement that returned no result set. A tab stacking two or more grids (a batch with
 * several SELECTs) starts with the toolbars hidden so the data area keeps the vertical space.
 * Kept pure for unit testing.
 */
export function defaultToolbarHiddenForCount(resultSetCount: number): boolean {
  return resultSetCount > 1;
}

export const useGridLayoutStore = defineStore('gridLayout', () => {
  // Plain (non-reactive) maps: nothing renders from them and column entries can grow with the
  // result width, so keeping them outside Vue's reactivity avoids proxy overhead on every capture.
  const layouts = new Map<string, GridLayoutEntry>();
  const activeSetIndexByTab = new Map<string, number>();
  // Toolbar visibility is the opposite case: the header button and every grid pane of the tab
  // render from it, so this one has to be reactive.
  const toolbarHiddenByTab = ref(new Map<string, boolean>());

  function layoutKey(tabId: string | null | undefined, setIndex: number): string {
    return buildLayoutKey(tabId, setIndex);
  }

  /** Snapshots the current column widths/visibility/order and sorters of one grid. */
  function capture(key: string, table: Tabulator | null | undefined): void {
    if (!table) return;
    try {
      const columns = table.getColumns().map((column) => ({
        field: column.getField(),
        width: column.getWidth(),
        visible: column.isVisible(),
      }));
      const sorters: GridLayoutSortEntry[] = [];
      for (const sorter of table.getSorters() ?? []) {
        if (!sorter.field) continue;
        if (sorter.dir !== 'asc' && sorter.dir !== 'desc') continue;
        sorters.push({ field: sorter.field, dir: sorter.dir });
      }
      layouts.set(key, { columns, sorters });
    } catch {
      // A grid torn down mid-capture must not break unmount: skip this snapshot.
    }
  }

  /** Re-applies a stored layout. Returns false when nothing was stored for the key. */
  function restore(key: string, table: Tabulator | null | undefined): boolean {
    if (!table) return false;
    const entry = layouts.get(key);
    if (!entry) return false;
    try {
      if (entry.columns.length > 0) {
        table.setColumnLayout(entry.columns as TabulatorLayoutColumn[]);
      }
      if (entry.sorters.length > 0) {
        // Tabulator's `setSort` resolves columns by field name, not by the `field` key of the
        // sorter object it hands back from `getSorters()`.
        table.setSort(
          entry.sorters.map((sorter) => ({ column: sorter.field, dir: sorter.dir })) as TabulatorSorter[]
        );
      }
      return true;
    } catch {
      return false;
    }
  }

  function has(key: string): boolean {
    return layouts.has(key);
  }

  function getActiveSetIndex(tabId: string | null | undefined): number | null {
    if (!tabId) return null;
    const index = activeSetIndexByTab.get(tabId);
    return index === undefined ? null : index;
  }

  function setActiveSetIndex(tabId: string | null | undefined, index: number): void {
    if (!tabId) return;
    activeSetIndexByTab.set(tabId, index);
  }

  /** Whether one result tab hides the toolbar and info bars of all its grids. */
  function isToolbarHidden(tabId: string | null | undefined, defaultHidden: boolean = false): boolean {
    if (!tabId) return defaultHidden;
    const explicit = toolbarHiddenByTab.value.get(tabId);
    return explicit !== undefined ? explicit : defaultHidden;
  }

  /** Sets the toolbar visibility of one result tab. An unknown tab id is ignored. */
  function setToolbarHidden(tabId: string | null | undefined, hidden: boolean): void {
    if (!tabId) return;
    const next = new Map(toolbarHiddenByTab.value);
    next.set(tabId, hidden);
    toolbarHiddenByTab.value = next;
  }

  /** Flips the toolbar visibility of one result tab; returns the resulting state. */
  function toggleToolbarHidden(tabId: string | null | undefined, defaultHidden: boolean = false): boolean {
    if (!tabId) return false;
    const current = isToolbarHidden(tabId, defaultHidden);
    const hidden = !current;
    setToolbarHidden(tabId, hidden);
    return hidden;
  }

  /** Drops every cached layout / remembered index of a closed result tab. */
  function clearTab(tabId: string | null | undefined): void {
    if (!tabId) return;
    activeSetIndexByTab.delete(tabId);
    if (toolbarHiddenByTab.value.has(tabId)) {
      const next = new Map(toolbarHiddenByTab.value);
      next.delete(tabId);
      toolbarHiddenByTab.value = next;
    }
    const prefix = `${tabId}:`;
    for (const key of [...layouts.keys()]) {
      if (key.startsWith(prefix)) layouts.delete(key);
    }
  }

  return {
    layoutKey,
    capture,
    restore,
    has,
    getActiveSetIndex,
    setActiveSetIndex,
    isToolbarHidden,
    setToolbarHidden,
    toggleToolbarHidden,
    clearTab,
  };
});
