import { describe, test, expect, beforeAll } from 'vitest';
import { MCPTestUtils } from './tools/mcp-xpp-client.js';
import { AppConfig } from '../build/modules/app-config.js';

let mcpClient;

beforeAll(async () => {
  await AppConfig.initialize();
  mcpClient = await MCPTestUtils.createTestClient();
}, 60000);

async function isAvailable() {
  try {
    const resp = await mcpClient.executeTool('get_current_config', {});
    return !!resp;
  } catch {
    return false;
  }
}

function toText(resp) {
  const c = resp?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(x => x?.text ?? '').join('\n');
  return JSON.stringify(c ?? null);
}

function parseFoundObject(resp) {
  // The MCP client typically returns { content: [ { type:'text', text:'...' } ] }
  // For JSON-ish tools, the text is usually a JSON string.
  const text = toText(resp);

  // If it's not JSON, fall back to heuristics.
  try {
    const asJson = JSON.parse(text);
    // common shapes:
    // - { found: true/false, ... }
    // - { object: { name, model, ... } }
    // - { results: [...] }
    return { kind: 'json', value: asJson, text };
  } catch {
    return { kind: 'text', value: null, text };
  }
}

function assertHitInModel(found, edtName, expectedModel) {
  if (found.kind === 'json') {
    const json = found.value;

    // Try a few common structures.
    const modelFromJson =
      json?.model ||
      json?.Model ||
      json?.object?.model ||
      json?.object?.Model ||
      json?.foundObject?.model ||
      json?.foundObject?.Model ||
      (Array.isArray(json?.matches) ? json.matches?.[0]?.model : undefined) ||
      (Array.isArray(json?.results) ? json.results?.[0]?.model : undefined);

    const nameFromJson =
      json?.name ||
      json?.objectName ||
      json?.object?.name ||
      json?.object?.objectName ||
      json?.foundObject?.name ||
      (Array.isArray(json?.matches) ? json.matches?.[0]?.name : undefined) ||
      (Array.isArray(json?.results) ? json.results?.[0]?.name : undefined);

    expect((nameFromJson ?? '').toLowerCase()).toBe(edtName.toLowerCase());
    expect((modelFromJson ?? '').toLowerCase()).toBe(expectedModel.toLowerCase());
    return;
  }

  const t = found.text.toLowerCase();
  expect(t).toContain(edtName.toLowerCase());
  expect(t).toContain(expectedModel.toLowerCase());
}

function assertNoHit(found, edtName) {
  if (found.kind === 'json') {
    const json = found.value;

    const foundFlag = json?.found ?? json?.Found ?? json?.success ?? json?.Success;
    if (typeof foundFlag === 'boolean') {
      expect(foundFlag).toBe(false);
      return;
    }

    const resultsArray = json?.results || json?.matches || json?.items;
    if (Array.isArray(resultsArray)) {
      expect(resultsArray.length).toBe(0);
      return;
    }

    // If we can't interpret structure, fall through to text-based checks.
  }

  const t = found.text.toLowerCase();

  // For the negative case we want a strong signal that the lookup did not match.
  // Messages vary a bit across transports/paths.
  const looksNegative =
    t.includes('not found') ||
    t.includes('no objects found') ||
    t.includes('does not exist');

  expect(looksNegative).toBe(true);

  // And it should not look like it returned a structured hit for the EDT.
  expect(t.includes(`\"name\":\"${edtName.toLowerCase()}\"`)).toBe(false);
}

/**
 * Validates: exact-match EDT lookup respects requested model filter.
 * - EDTs "Name" and "Description" should be found in ApplicationPlatform.
 * - The same exact lookup should NOT find them in ApplicationSuite.
 */
describe('EDT exact match respects model filter', () => {
  test('find_xpp_object exact-match honors model filter (ApplicationPlatform vs ApplicationSuite)', async () => {
    if (!(await isAvailable())) return;

    const edtNames = ['Name', 'Description'];

    for (const edtName of edtNames) {
      const platformResp = await mcpClient.executeTool('find_xpp_object', {
        objectName: edtName,
        objectType: 'AxEdt',
        model: 'ApplicationPlatform'
      });

      const platformFound = parseFoundObject(platformResp);
      assertHitInModel(platformFound, edtName, 'ApplicationPlatform');

      const suiteResp = await mcpClient.executeTool('find_xpp_object', {
        objectName: edtName,
        objectType: 'AxEdt',
        model: 'ApplicationSuite'
      });

      const suiteFound = parseFoundObject(suiteResp);
      assertNoHit(suiteFound, edtName);
    }
  }, 60000);

  test('find_xpp_object exact-match works without model (search across all models)', async () => {
    if (!(await isAvailable())) return;

    const edtNames = ['Name', 'Description'];

    for (const edtName of edtNames) {
      const resp = await mcpClient.executeTool('find_xpp_object', {
        objectName: edtName,
        objectType: 'AxEdt'
        // model intentionally omitted
      });

      expect(resp).toBeDefined();

      const found = parseFoundObject(resp);
      const t = found.text.toLowerCase();

      // With no model, ensure we are not accidentally applying a default model filter.
      // (This should not say 'in model "ApplicationSuite"' unless explicitly requested.)
      expect(t.includes('in model "applicationsuite"')).toBe(false);

      // If the environment/index includes EDTS, we expect a hit; otherwise we only require
      // that the call completed successfully.
      const looksNegative = t.includes('no objects found') || t.includes('does not exist') || t.includes('not found');
      if (!looksNegative) {
        expect(t).toContain(edtName.toLowerCase());
      }
    }
  }, 60000);

  it('when model is omitted, search spans all models (EDT exact match)', async () => {
    if (!(await isAvailable())) return;

    const res = await mcpClient.executeTool('find_xpp_object', {
      objectName: 'Name',
      objectType: 'AxEdt'
      // model intentionally omitted
    });

    expect(res).toBeDefined();

    const found = parseFoundObject(res);
    const t = found.text.toLowerCase();

    // Now that EDTs are indexed, this should resolve to the correct model.
    expect(t).toContain('applicationplatform');
    expect(found.text).toMatch(/\bName\b/);
  }, 60000);
});
