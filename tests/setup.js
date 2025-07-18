// Jest setup file for MCP X++ Server tests

// Extend Jest matchers
expect.extend({
  toContainMCPContent(received, expected) {
    const pass = received && 
                 received.content && 
                 received.content[0] && 
                 received.content[0].text && 
                 received.content[0].text.includes(expected);
    
    if (pass) {
      return {
        message: () => `Expected MCP response not to contain "${expected}"`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected MCP response to contain "${expected}"`,
        pass: false,
      };
    }
  },

  toBeValidMCPResponse(received) {
    // Check for different types of valid MCP responses
    const hasContent = received && 
                      received.content && 
                      Array.isArray(received.content) && 
                      received.content.length > 0;
    
    const hasTools = received && 
                    received.tools && 
                    Array.isArray(received.tools) && 
                    received.tools.length > 0;
    
    const hasError = received && received.error !== undefined;
    
    const pass = hasContent || hasTools || hasError;
    
    if (pass) {
      return {
        message: () => `Expected not to be a valid MCP response`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected to be a valid MCP response with content array, tools array, or error property`,
        pass: false,
      };
    }
  }
});

// Global test configuration
global.TEST_TIMEOUT = 30000;
global.INDEX_TIMEOUT = 15000;
