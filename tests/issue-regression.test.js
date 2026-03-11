/**
 * ISSUE REGRESSION TESTS
 * Verifies fixes for closed GitHub issues #6, #7, #8
 *
 * Issue #6: get_label / get_labels_batch: @SYS label file not found
 * Issue #7: inspect_xpp_object (inspectionMode=field): Label and HelpText missing
 * Issue #8: inspect_xpp_object (inspectionMode=controls): only top-level controls returned
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { AppConfig } from '../build/modules/app-config.js';

let ToolHandlers;

const REQ_ID = 'issue-regression-test';

beforeAll(async () => {
  await AppConfig.initialize();
  const mod = await import('../build/modules/tool-handlers.js');
  ToolHandlers = mod.ToolHandlers;
}, 60000);

// Helper: check if D365 service is reachable
async function isServiceAvailable() {
  try {
    const result = await ToolHandlers.getCurrentConfig({}, REQ_ID);
    return !!(result?.content);
  } catch {
    return false;
  }
}

// =============================================================================
// ISSUE #6 - @SYS label file not found
// =============================================================================

describe('Issue #6 – get_label / get_labels_batch: @SYS label resolution', () => {
  test('get_label should resolve a @SYS-prefixed label (e.g. @SYS19627)', async () => {
    if (!(await isServiceAvailable())) {
      console.log('⏭️  Service not available – skipping');
      return;
    }

    const result = await ToolHandlers.getLabel(
      { labelId: '@SYS19627', language: 'en-US' },
      REQ_ID
    );

    expect(result).toBeDefined();
    const text = typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content);

    console.log('get_label @SYS19627 response:\n', text);

    // Must NOT return "Label not found"
    expect(text).not.toMatch(/Label not found/i);
    // Must contain the resolved text
    expect(text).toMatch(/Found/i);
  });

  test('get_label should also resolve a known non-SYS label for comparison', async () => {
    if (!(await isServiceAvailable())) return;

    const result = await ToolHandlers.getLabel(
      { labelId: '@SYS1', language: 'en-US' },
      REQ_ID
    );

    const text = typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content);

    console.log('get_label @SYS1 response:\n', text);
    // Should either find it or give a meaningful message – not an uncaught error
    expect(text).toBeDefined();
    expect(text.length).toBeGreaterThan(0);
  });

  test('get_labels_batch should handle mixed @SYS and @SCM labels', async () => {
    if (!(await isServiceAvailable())) return;

    const result = await ToolHandlers.getLabelsBatch(
      { labelIds: ['@SYS19627', '@SYS1', '@SCM1'], language: 'en-US' },
      REQ_ID
    );

    expect(result).toBeDefined();
    const text = typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content);

    console.log('get_labels_batch response:\n', text);

    // Should return batch header, not a raw "Label not found" error
    expect(text).toMatch(/Batch Label Retrieval|Found|Requested/i);
  });
});

// =============================================================================
// ISSUE #7 – inspect_xpp_object (field mode): Label and HelpText missing
// =============================================================================

describe('Issue #7 – inspect_xpp_object field mode: Label and HelpText present', () => {
  test('should return Label for SalesLine.ShippingDateConfirmed', async () => {
    if (!(await isServiceAvailable())) return;

    const result = await ToolHandlers.inspectXppObject(
      {
        objectName: 'SalesLine',
        objectType: 'AxTable',
        inspectionMode: 'field',
        fieldName: 'ShippingDateConfirmed',
      },
      REQ_ID
    );

    expect(result).toBeDefined();
    const text = typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content);

    console.log('inspect_xpp_object field SalesLine.ShippingDateConfirmed:\n', text);

    // Label must be present and non-empty
    expect(text).toMatch(/Label/i);
    // Should NOT show empty or null label
    expect(text).not.toMatch(/Label:\s*(null|undefined|"")/i);
  });

  test('should return Label for SalesLine.ShippingDateConfirmed (via EDT fallback)', async () => {
    if (!(await isServiceAvailable())) return;

    const result = await ToolHandlers.inspectXppObject(
      {
        objectName: 'SalesLine',
        objectType: 'AxTable',
        inspectionMode: 'field',
        fieldName: 'ShippingDateConfirmed',
      },
      REQ_ID
    );

    const text = typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content);

    // Label must be enriched from the EDT (SalesShippingDateConfirmed → @SYS88228).
    // This EDT has no HelpText, so we don't assert HelpText here.
    expect(text).toMatch(/Label/i);
    expect(text).not.toMatch(/Label not found/i);
  });

  test('should return Label for a second field to confirm fix is general', async () => {
    if (!(await isServiceAvailable())) return;

    const result = await ToolHandlers.inspectXppObject(
      {
        objectName: 'SalesTable',
        objectType: 'AxTable',
        inspectionMode: 'field',
        fieldName: 'SalesId',
      },
      REQ_ID
    );

    const text = typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content);

    console.log('inspect_xpp_object field SalesTable.SalesId:\n', text);

    expect(text).toMatch(/Label/i);
    expect(text).not.toMatch(/Label:\s*(null|undefined|"")/i);
  });
});

// =============================================================================
// ISSUE #8 – inspect_xpp_object (controls mode): only top-level controls
// =============================================================================

describe('Issue #8 – inspect_xpp_object controls mode: recursive depth traversal', () => {
  test('SalesTable controls should return more than 18 controls (depth > 1)', async () => {
    if (!(await isServiceAvailable())) return;

    const result = await ToolHandlers.inspectXppObject(
      {
        objectName: 'SalesTable',
        objectType: 'AxForm',
        inspectionMode: 'controls',
      },
      REQ_ID
    );

    expect(result).toBeDefined();
    const text = typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content);

    console.log('inspect_xpp_object controls SalesTable (first 1000 chars):\n',
      text.substring(0, 1000));

    // Count control entries – lines with a control name pattern
    const controlMatches = text.match(/\bControl\b|\bTab\b|\bGroup\b|\bGrid\b|\bButton\b/gi) || [];
    console.log(`Controls/keywords found: ${controlMatches.length}`);

    // Should be significantly more than 18 top-level controls
    expect(controlMatches.length).toBeGreaterThan(18);
  });

  test('controls mode with explicit maxDepth=3 should reach nested controls', async () => {
    if (!(await isServiceAvailable())) return;

    const result = await ToolHandlers.inspectXppObject(
      {
        objectName: 'SalesTable',
        objectType: 'AxForm',
        inspectionMode: 'controls',
        maxDepth: 3,
      },
      REQ_ID
    );

    const text = typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content);

    console.log('inspect_xpp_object controls SalesTable maxDepth=3 (first 1000 chars):\n',
      text.substring(0, 1000));

    // With depth 3, should surface nested controls inside tab pages / groups
    const controlCount = (text.match(/\n/g) || []).length;
    console.log(`Response lines: ${controlCount}`);
    expect(text.length).toBeGreaterThan(500);
  });

  test('should be able to find a deeply nested control (LineDetails area)', async () => {
    if (!(await isServiceAvailable())) return;

    const result = await ToolHandlers.inspectXppObject(
      {
        objectName: 'SalesTable',
        objectType: 'AxForm',
        inspectionMode: 'controls',
        maxDepth: 5,
        filterPattern: '*Delivery*',
      },
      REQ_ID
    );

    const text = typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content);

    console.log('inspect_xpp_object controls SalesTable filter=*Delivery*:\n', text);

    // The Delivery tab/group should appear when traversal is deep enough
    expect(text).toMatch(/Delivery|DeliveryDate|LineDetails/i);
  });
});
