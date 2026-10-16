import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

const EDITOR_TABS = 'src/components/layout/AppMain.vue';
const RESULT_TABS = 'src/components/layout/AppBottomPanel.vue';

/**
 * Middle-click closes a tab, like every browser. The strips keep their own close paths (the editor
 * tabs may open a fresh query when the last one goes, the result tabs refuse to close the last
 * one), so the middle button has to call exactly the same store action as the tab's × button
 * rather than inventing a second close route.
 */
describe('middle-click closes a tab', () => {
  test('both tab strips route the middle button to their own close action', () => {
    const cases = [
      { path: EDITOR_TABS, close: 'workspaceStore.closeTab(tab.id)' },
      { path: RESULT_TABS, close: 'queryStore.deleteResultTab(rtab.id)' },
    ];

    for (const { path, close } of cases) {
      const source = readSource(path);

      assert.ok(
        source.includes(`@auxclick.middle.prevent="${close}"`),
        `${path} must close its tab on a middle click`
      );
      assert.ok(
        source.includes(`@click.stop="${close}"`),
        `${path} must use the same close action as its × button`
      );
      assert.match(
        source,
        /@mousedown\.middle\.prevent/,
        `${path} must swallow the middle press so Windows does not start auto-scroll`
      );
    }
  });

  test('a middle press never starts a tab drag', () => {
    for (const path of [EDITOR_TABS, RESULT_TABS]) {
      const handler = /function onTabPointerDown\(e: PointerEvent, index: number\) \{([\s\S]{0,220})/.exec(
        readSource(path)
      )?.[1];

      assert.ok(handler, `${path} must keep onTabPointerDown`);
      assert.match(
        handler!,
        /if \(e\.button !== 0\) return;/,
        `${path} must ignore every button but the left one`
      );
    }
  });
});
