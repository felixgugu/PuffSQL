import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aiRegistry } from '../src/services/ai/aiRegistry';
import { curlAiService } from '../src/services/ai/curlAiService';
import { parseCurlCommand } from '../src/services/ai/curlParser';
import { CustomOpenAiProvider, MiniMaxProvider } from '../src/services/ai/minimaxProvider';
import { DEFAULT_CURL_TEMPLATE } from '../src/types/ai';
import { buildErrorDiagnosisPrompt, buildExecutionPlanAdvicePrompt, buildExecutionStatsAdvicePrompt, extractPlanInsights } from '../src/utils/aiPromptBuilder';
import { enhanceHtml, renderMarkdownToHtml, sanitizeHtml } from '../src/utils/markdownRenderer';

describe('ai_diagnostics', () => {
describe('AI Diagnostics & Plan Tuning Prompt Builder', () => {
  describe('buildErrorDiagnosisPrompt', () => {
    it('should generate complete diagnostic prompt with all metadata and SQL', () => {
      const prompt = buildErrorDiagnosisPrompt({
        message: "Column 'Customers.ContactName' is invalid in the select list because it is not contained in either an aggregate function or the GROUP BY clause.",
        code: 8120,
        lineNumber: 1,
        database: 'Northwind',
        sql: 'SELECT City, ContactName, COUNT(*) FROM Customers GROUP BY City',
      });

      assert.ok(prompt.includes('Msg 8120'));
      assert.ok(prompt.includes('Line 1'));
      assert.ok(prompt.includes('Northwind'));
      assert.ok(prompt.includes('Customers.ContactName'));
      assert.ok(prompt.includes('SELECT City, ContactName, COUNT(*) FROM Customers GROUP BY City'));
      assert.ok(prompt.includes('錯誤根本原因分析'));
      assert.ok(prompt.includes('修復後的完整 T-SQL 語法'));
    });

    it('should handle error prompt with minimal fields gracefully', () => {
      const prompt = buildErrorDiagnosisPrompt({
        message: 'Syntax error near keyword WHERE.',
      });

      assert.ok(prompt.includes('Syntax error near keyword WHERE.'));
      assert.ok(prompt.includes('(未提供具體 SQL 語法'));
      assert.ok(!prompt.includes('Msg undefined'));
      assert.ok(!prompt.includes('Line undefined'));
    });
  });

  describe('extractPlanInsights', () => {
    it('should extract missing index recommendations, warnings, and top operators from ShowPlanXML', () => {
      const sampleXml = `
<ShowPlanXML xmlns="http://schemas.microsoft.com/sqlserver/2004/07/showplan" Version="1.2" Build="15.0.2000.5">
  <BatchSequence>
    <Batch>
      <Statements>
        <StmtSimple StatementText="SELECT * FROM Orders WHERE CustomerID = 1045 AND OrderDate &gt; '2023-01-01'">
          <QueryPlan DegreeOfParallelism="1">
            <Warnings SpillToTempDb="true" PlanAffectingConvert="true" UnmatchedIndexes="true" />
            <MissingIndexes>
              <MissingIndexGroup Impact="87.6543">
                <MissingIndex Database="[Northwind]" Schema="[dbo]" Table="[Orders]">
                  <ColumnGroup Usage="EQUALITY">
                    <Column Name="[CustomerID]" ColumnId="1" />
                  </ColumnGroup>
                  <ColumnGroup Usage="INEQUALITY">
                    <Column Name="[OrderDate]" ColumnId="2" />
                  </ColumnGroup>
                  <ColumnGroup Usage="INCLUDE">
                    <Column Name="[ShipCity]" ColumnId="3" />
                    <Column Name="[Freight]" ColumnId="4" />
                  </ColumnGroup>
                </MissingIndex>
              </MissingIndexGroup>
            </MissingIndexes>
            <RelOp NodeId="0" PhysicalOp="Clustered Index Scan" LogicalOp="Clustered Index Scan" EstimateRows="1250" EstimatedTotalSubtreeCost="0.7523">
              <OutputList>
                <ColumnReference Table="[Orders]" Column="OrderID" />
              </OutputList>
              <IndexScan>
                <Object Table="[Orders]" Index="[PK_Orders]" />
              </IndexScan>
            </RelOp>
            <RelOp NodeId="1" PhysicalOp="Sort" LogicalOp="Sort" EstimateRows="500" EstimatedTotalSubtreeCost="0.3120">
              <OutputList>
                <ColumnReference Table="[Orders]" Column="OrderID" />
              </OutputList>
            </RelOp>
            <RelOp NodeId="2" PhysicalOp="Compute Scalar" LogicalOp="Compute Scalar" EstimateRows="1" EstimatedTotalSubtreeCost="0.0012">
            </RelOp>
          </QueryPlan>
        </StmtSimple>
      </Statements>
    </Batch>
  </BatchSequence>
</ShowPlanXML>
      `;

      const insights = extractPlanInsights(sampleXml);

      assert.equal(insights.missingIndexes.length, 1);
      const mi = insights.missingIndexes[0];
      assert.equal(mi.table, '[Orders]');
      assert.equal(mi.schema, '[dbo]');
      assert.equal(mi.impact, '87.6543');
      assert.deepEqual(mi.equalityColumns, ['[CustomerID]']);
      assert.deepEqual(mi.inequalityColumns, ['[OrderDate]']);
      assert.deepEqual(mi.includeColumns, ['[ShipCity]', '[Freight]']);

      assert.equal(insights.warnings.length, 3);
      assert.ok(insights.warnings.some((w) => w.includes('SpillToTempDb')));
      assert.ok(insights.warnings.some((w) => w.includes('PlanAffectingConvert')));
      assert.ok(insights.warnings.some((w) => w.includes('UnmatchedIndexes')));

      assert.ok(insights.topOperators.length >= 2);
      assert.equal(insights.topOperators[0].physicalOp, 'Clustered Index Scan');
      assert.equal(insights.topOperators[0].cost, 0.7523);
      assert.equal(insights.topOperators[0].targetObject, '[Orders]');
      assert.equal(insights.topOperators[1].physicalOp, 'Sort');
      assert.equal(insights.topOperators[1].cost, 0.3120);
    });

    it('should return empty insights on empty or invalid XML input', () => {
      const emptyInsights = extractPlanInsights('');
      assert.equal(emptyInsights.missingIndexes.length, 0);
      assert.equal(emptyInsights.warnings.length, 0);
      assert.equal(emptyInsights.topOperators.length, 0);

      const nullInsights = extractPlanInsights(null);
      assert.equal(nullInsights.missingIndexes.length, 0);
    });
  });

  describe('buildExecutionPlanAdvicePrompt', () => {
    it('should assemble comprehensive execution plan prompt with missing index DDL and warnings', () => {
      const sampleXml = `
        <QueryPlan>
          <Warnings SpillToTempDb="true" />
          <MissingIndexes>
            <MissingIndexGroup Impact="92.4">
              <MissingIndex Table="[Customers]">
                <ColumnGroup Usage="EQUALITY">
                  <Column Name="[City]" />
                </ColumnGroup>
                <ColumnGroup Usage="INCLUDE">
                  <Column Name="[CompanyName]" />
                </ColumnGroup>
              </MissingIndex>
            </MissingIndexGroup>
          </MissingIndexes>
          <RelOp NodeId="0" PhysicalOp="Table Scan" EstimatedTotalSubtreeCost="1.2345" EstimateRows="5000">
            <TableScan>
              <Object Table="[Customers]" />
            </TableScan>
          </RelOp>
        </QueryPlan>
      `;

      const prompt = buildExecutionPlanAdvicePrompt({
        sql: 'SELECT City, CompanyName FROM Customers WHERE City = "Berlin"',
        planXml: sampleXml,
        durationMs: 450,
        database: 'Northwind',
      });

      assert.ok(prompt.includes('執行耗時：450 ms'));
      assert.ok(prompt.includes('資料庫：Northwind'));
      assert.ok(prompt.includes('SpillToTempDb'));
      assert.ok(prompt.includes('92.4%'));
      assert.ok(prompt.includes('[Customers]'));
      assert.ok(prompt.includes('CREATE NONCLUSTERED INDEX'));
      assert.ok(prompt.includes('Table Scan'));
      assert.ok(prompt.includes('SELECT City, CompanyName FROM Customers WHERE City = "Berlin"'));
      assert.ok(prompt.includes('執行計畫效能瓶頸深入診斷'));
      assert.ok(prompt.includes('SQL 語句重構調校建言'));
    });
  });

  describe('buildExecutionStatsAdvicePrompt', () => {
    it('should build execution stats advice prompt with table IO breakdown and wait stats', () => {
      const prompt = buildExecutionStatsAdvicePrompt({
        sql: 'SELECT o.OrderID, c.CompanyName FROM Orders o JOIN Customers c ON o.CustomerID = c.CustomerID',
        cpuTimeMs: 145,
        elapsedTimeMs: 420,
        compileCpuTimeMs: 12,
        compileElapsedTimeMs: 25,
        totalLogicalReads: 15400,
        logicalReadsFormatted: '120.3 MB',
        totalPhysicalReads: 320,
        cacheHitRatio: 97.9,
        database: 'Northwind',
        tableStats: [
          {
            tableName: 'Orders',
            scanCount: 2,
            logicalReads: 12000,
            physicalReads: 250,
            readAheadReads: 50,
            bytesFormatted: '93.8 MB',
            isHighIo: true,
          },
          {
            tableName: 'Customers',
            scanCount: 1,
            logicalReads: 3400,
            physicalReads: 70,
            readAheadReads: 10,
            bytesFormatted: '26.5 MB',
            isHighIo: false,
          },
        ],
        waitStats: [
          {
            waitType: 'PAGEIOLATCH_SH',
            waitingTasksCount: 15,
            waitTimeMs: 180,
            maxWaitTimeMs: 45,
          },
        ],
      });

      assert.ok(prompt.includes('CPU 耗時: 145 ms'));
      assert.ok(prompt.includes('總執行耗時: 420 ms'));
      assert.ok(prompt.includes('15,400 頁 (120.3 MB)'));
      assert.ok(prompt.includes('快取命中率: 97.9%'));
      assert.ok(prompt.includes('Orders ⚠️ (高讀取)'));
      assert.ok(prompt.includes('Customers'));
      assert.ok(prompt.includes('PAGEIOLATCH_SH'));
      assert.ok(prompt.includes('180'));
      assert.ok(prompt.includes('IO 消耗與效能瓶頸評估'));
      assert.ok(prompt.includes('索引與覆蓋索引最佳化建議'));
      assert.ok(prompt.includes('SQL 查詢重構調優'));
    });
  });
});
});

describe('aiProvider', () => {
describe('AI Provider Architecture & Registry', () => {
  it('should have MiniMax and OpenAI providers registered by default', () => {
    const providers = aiRegistry.getAll();
    assert.equal(providers.length >= 2, true);

    const minimax = aiRegistry.get('minimax');
    assert.equal(minimax.id, 'minimax');
    assert.equal(minimax.name, 'MiniMax (Token Plan)');
    assert.equal(minimax.defaultEndpoint, 'https://api.minimax.chat/v1');
    assert.equal(minimax.defaultModel, 'MiniMax-Text-01');

    const openai = aiRegistry.get('openai');
    assert.equal(openai.id, 'openai');
    assert.equal(openai.defaultEndpoint, 'https://api.openai.com/v1');
  });

  it('should provide available model options for MiniMax', () => {
    const minimax = new MiniMaxProvider();
    assert.equal(minimax.availableModels.length >= 2, true);
    const modelIds = minimax.availableModels.map((m) => m.id);
    assert.equal(modelIds.includes('MiniMax-Text-01'), true);
    assert.equal(modelIds.includes('abab6.5s-chat'), true);
  });

  it('should fall back to minimax provider when unknown provider is requested', () => {
    const fallback = aiRegistry.get('unknown' as any);
    assert.equal(fallback.id, 'minimax');
  });

  it('should format endpoint correctly without trailing slashes', () => {
    const provider = new MiniMaxProvider();
    const formatFn = (provider as any).formatEndpoint.bind(provider);
    assert.equal(formatFn('https://api.minimax.chat/v1/'), 'https://api.minimax.chat/v1/chat/completions');
    assert.equal(formatFn('https://api.minimax.chat/v1'), 'https://api.minimax.chat/v1/chat/completions');
    assert.equal(formatFn('https://api.minimax.chat/v1/chat/completions'), 'https://api.minimax.chat/v1/chat/completions');
  });

  it('should reject when API key is missing', async () => {
    const provider = new MiniMaxProvider();
    await assert.rejects(
      async () => {
        await provider.sendMessage(
          [{ id: '1', role: 'user', content: 'hello', timestamp: Date.now() }],
          {
            providerId: 'minimax',
            apiKey: '',
            endpoint: 'https://api.minimax.chat/v1',
            model: 'MiniMax-Text-01',
          }
        );
      },
      /請先在/
    );
  });
});
});

describe('curlAi', () => {
describe('Curl Parser & AI Engine', () => {
  it('should parse standard curl command correctly', () => {
    const raw = `curl --request POST \\
  --url https://api.minimax.io/v1/chat/completions \\
  --header 'Authorization: Bearer <token>' \\
  --header 'Content-Type: application/json' \\
  --data '
{
  "model": "MiniMax-M3",
  "messages": [
    {
      "role": "user",
      "content": "<content>"
    }
  ],
  "thinking": {
    "type": "adaptive"
  },
  "max_completion_tokens": 1000
}'`;

    const parsed = parseCurlCommand(raw);
    assert.equal(parsed.url, 'https://api.minimax.io/v1/chat/completions');
    assert.equal(parsed.method, 'POST');
    assert.equal(parsed.headers['Authorization'], 'Bearer <token>');
    assert.equal(parsed.headers['Content-Type'], 'application/json');
    assert.equal(parsed.dataRaw.includes('"model": "MiniMax-M3"'), true);
  });

  it('should parse curl with -X and -H syntax and double quotes', () => {
    const raw = `curl -X POST "https://api.openai.com/v1/chat/completions" -H "Authorization: Bearer sk-12345" -H "Content-Type: application/json" -d '{"model":"gpt-4o"}'`;
    const parsed = parseCurlCommand(raw);
    assert.equal(parsed.url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(parsed.method, 'POST');
    assert.equal(parsed.headers['Authorization'], 'Bearer sk-12345');
    assert.equal(parsed.dataRaw, '{"model":"gpt-4o"}');
  });

  it('should parse DEFAULT_CURL_TEMPLATE and produce valid JSON with no Unterminated string errors', () => {
    const parsed = parseCurlCommand(DEFAULT_CURL_TEMPLATE);
    assert.equal(parsed.url, 'https://api.minimax.io/v1/chat/completions');
    assert.ok(parsed.dataRaw.length > 0);
    const json = JSON.parse(parsed.dataRaw);
    assert.equal(json.model, 'MiniMax-M3');
    assert.equal(json.messages[0].content, '<content>');
  });

  it('should gracefully parse curl with unclosed trailing quote (common copy-paste truncation)', () => {
    const rawNoClosingQuote = `curl --request POST 
  --url https://api.minimax.io/v1/chat/completions 
  --header 'Authorization: Bearer <token>' 
  --header 'Content-Type: application/json' 
  --data '
{
  "model": "MiniMax-M3",
  "messages": [
    {
      "role": "user",
      "content": "<content>"
    }
  ],
  "thinking": {
    "type": "adaptive"
  },
  "max_completion_tokens": 1000
}`;
    const parsed = parseCurlCommand(rawNoClosingQuote);
    assert.equal(parsed.url, 'https://api.minimax.io/v1/chat/completions');
    assert.ok(parsed.dataRaw.length > 0);
    const json = JSON.parse(parsed.dataRaw);
    assert.equal(json.model, 'MiniMax-M3');
    assert.equal(json.messages[0].role, 'user');
  });

  it('should fail testConnection gracefully on invalid URL or missing key', async () => {
    const res = await curlAiService.testConnection({
      apiKey: '',
      curlTemplate: DEFAULT_CURL_TEMPLATE,
    });
    assert.equal(typeof res.latencyMs, 'number');
    assert.equal(res.success, false);
  });

  it('should call aiLoggerService to log request content when sending AI message', async () => {
    const { aiLoggerService } = await import('../src/services/aiLoggerService.ts');
    assert.ok(typeof aiLoggerService.logAiRequest === 'function');
    assert.ok(typeof aiLoggerService.logAiResponse === 'function');
    assert.ok(typeof aiLoggerService.openAiLogFile === 'function');
    assert.ok(typeof aiLoggerService.getAiLogPath === 'function');

    const logPath = await aiLoggerService.getAiLogPath();
    assert.equal(logPath.endsWith('ai.log'), true);

    const openedPath = await aiLoggerService.openAiLogFile();
    assert.equal(openedPath.endsWith('ai.log'), true);

    await assert.doesNotReject(async () => {
      await aiLoggerService.logAiRequest(
        'https://api.openai.com/v1/chat/completions',
        JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'test' }] })
      );
    });

    await assert.doesNotReject(async () => {
      await aiLoggerService.logAiResponse(
        'https://api.openai.com/v1/chat/completions',
        JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'response test' } }] }),
        200,
        150,
        false
      );
    });
  });

  it('should have default quick prompts without icons and support CRUD operations in store', async () => {
    const { DEFAULT_QUICK_PROMPTS } = await import('../src/types/ai.ts');
    assert.equal(DEFAULT_QUICK_PROMPTS.length, 4);

    for (const prompt of DEFAULT_QUICK_PROMPTS) {
      assert.ok(prompt.label.length > 0);
      assert.ok(prompt.prompt.length > 0);
      assert.equal(/[\u{1F300}-\u{1F9FF}]/u.test(prompt.label), false);
    }

    const { setActivePinia, createPinia } = await import('pinia');
    setActivePinia(createPinia());
    const { useAiChatStore } = await import('../src/stores/aiChatStore.ts');
    const store = useAiChatStore();

    store.addQuickPrompt('自訂提示詞', '請幫我重構此 SQL');
    assert.equal(store.quickPrompts.length, 5);
    const added = store.quickPrompts.find((p) => p.label === '自訂提示詞');
    assert.ok(added);
    assert.equal(added.prompt, '請幫我重構此 SQL');

    store.updateQuickPrompt(added.id, '已更新提示詞', '更新後的內容');
    const updated = store.quickPrompts.find((p) => p.id === added.id);
    assert.equal(updated?.label, '已更新提示詞');
    assert.equal(updated?.prompt, '更新後的內容');

    store.deleteQuickPrompt(added.id);
    assert.equal(store.quickPrompts.some((p) => p.id === added.id), false);

    store.resetQuickPrompts();
    assert.equal(store.quickPrompts.length, 4);
    assert.equal(store.quickPrompts[0]?.label, '查詢最佳化');
  });
});
});

describe('markdown_render', () => {
describe('Markdown to HTML Renderer', () => {
  describe('GFM Tables', () => {
    it('should convert GFM markdown table into HTML table wrapped with .ai-table-wrapper', () => {
      const markdown = `
| 欄位名稱 | 資料型態 | 可為 NULL | 說明 |
| :--- | :---: | :---: | :--- |
| CustomerID | nchar(5) | 否 | 主鍵 (PK) |
| CompanyName | nvarchar(40) | 否 | 公司名稱 |
| City | nvarchar(15) | 是 | 所在城市 |
`;

      const html = renderMarkdownToHtml(markdown);

      assert.ok(html.includes('<div class="ai-table-wrapper">'));
      assert.ok(html.includes('<table class="ai-markdown-table">'));
      assert.ok(html.includes('欄位名稱</th>'));
      assert.ok(html.includes('資料型態</th>'));
      assert.ok(html.includes('CustomerID</td>'));
      assert.ok(html.includes('nchar(5)</td>'));
      assert.ok(html.includes('公司名稱</td>'));
      assert.ok(html.includes('</table></div>'));
    });

    it('should handle multiple tables correctly', () => {
      const markdown = `
### 表格 1
| A | B |
|---|---|
| 1 | 2 |

### 表格 2
| C | D |
|---|---|
| 3 | 4 |
`;

      const html = renderMarkdownToHtml(markdown);

      const wrapperMatches = html.match(/<div class="ai-table-wrapper">/g);
      assert.equal(wrapperMatches?.length, 2);
    });
  });

  describe('Standard Markdown Formatting', () => {
    it('should render headings (H1-H6), lists, bold, italics, blockquotes, and inline code (backticks)', () => {
      const markdown = `
# 一級標題
## 二級標題
### 三級標題
#### 四級標題
##### 五級標題
###### 六級標題

這是一段包含 **粗體** 與 *斜體* 以及 \`inline_code()\` 與 \`SELECT * FROM Users\` 的文字。

- 清單項目 1
- 清單項目 2

1. 順序項目 A
2. 順序項目 B

> 這是引言備註
`;

      const html = renderMarkdownToHtml(markdown);

      assert.ok(html.includes('<h1') && html.includes('一級標題</h1>'));
      assert.ok(html.includes('<h2') && html.includes('二級標題</h2>'));
      assert.ok(html.includes('<h3') && html.includes('三級標題</h3>'));
      assert.ok(html.includes('<h4') && html.includes('四級標題</h4>'));
      assert.ok(html.includes('<h5') && html.includes('五級標題</h5>'));
      assert.ok(html.includes('<h6') && html.includes('六級標題</h6>'));
      assert.ok(html.includes('<strong>粗體</strong>'));
      assert.ok(html.includes('<em>斜體</em>'));
      assert.ok(html.includes('<code>inline_code()</code>'));
      assert.ok(html.includes('<code>SELECT * FROM Users</code>'));
      assert.ok(html.includes('<ul>') && html.includes('<li>清單項目 1</li>'));
      assert.ok(html.includes('<ol>') && html.includes('<li>順序項目 A</li>'));
      assert.ok(html.includes('<blockquote>'));
      assert.ok(html.includes('這是引言備註'));
    });

    it('should enhance links with target="_blank" and rel="noopener noreferrer"', () => {
      const markdown = '請參考 [微軟官方文檔](https://learn.microsoft.com/sql) 取得完整指南。';
      const html = renderMarkdownToHtml(markdown);

      assert.ok(html.includes('href="https://learn.microsoft.com/sql"'));
      assert.ok(html.includes('target="_blank"'));
      assert.ok(html.includes('rel="noopener noreferrer"'));
      assert.ok(html.includes('微軟官方文檔</a>'));
    });
  });

  describe('XSS Sanitization & Safety', () => {
    it('should strip script tags and dangerous event handlers', () => {
      const dangerous = `
# 標題
<script>alert('pwned')</script>
<img src="valid.jpg" onerror="alert(1)" onload="evil()" />
<iframe src="https://attacker.com"></iframe>
<a href="javascript:alert(1)">點擊我</a>
`;

      const html = renderMarkdownToHtml(dangerous);

      assert.ok(!html.includes('<script>'));
      assert.ok(!html.includes('alert(\'pwned\')'));
      assert.ok(!html.includes('<iframe'));
      assert.ok(!html.includes('onerror'));
      assert.ok(!html.includes('onload'));
      assert.ok(!html.includes('javascript:'));
    });

    it('should sanitizeHtml directly', () => {
      const dirty = '<a href="javascript:doBad()" onclick="bad()">Click</a><script>console.log(1)</script>';
      const clean = sanitizeHtml(dirty);

      assert.ok(!clean.includes('<script>'));
      assert.ok(!clean.includes('onclick'));
      assert.ok(!clean.includes('javascript:'));
    });
  });

  describe('Edge Cases', () => {
    it('should return empty string for null, undefined, or empty text', () => {
      assert.equal(renderMarkdownToHtml(''), '');
      assert.equal(renderMarkdownToHtml('   '), '');
      assert.equal(renderMarkdownToHtml(null), '');
      assert.equal(renderMarkdownToHtml(undefined), '');
    });

    it('should gracefully handle plain text without markdown syntax', () => {
      const plain = '這是一段簡單的純文字回覆。';
      const html = renderMarkdownToHtml(plain);
      assert.ok(html.includes('這是一段簡單的純文字回覆。'));
    });
  });
});
});
