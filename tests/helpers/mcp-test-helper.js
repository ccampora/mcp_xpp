import { spawn } from 'child_process';
import { join } from 'path';
import { promises as fs } from 'fs';

/**
 * MCP Test Helper - Utility class for testing MCP X++ Server
 */
export class MCPTestHelper {
  constructor() {
    this.serverProcess = null;
    this.mockCodebasePath = join(process.cwd(), 'tests', 'mock-codebase');
  }

  /**
   * Start the MCP server for testing
   */
  async startServer() {
    return new Promise((resolve, reject) => {
      const serverPath = join(process.cwd(), 'build', 'index.js');
      
      this.serverProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      });

      this.serverProcess.on('error', reject);
      
      // Give server time to start
      setTimeout(() => {
        if (this.serverProcess && !this.serverProcess.killed) {
          resolve();
        } else {
          reject(new Error('Server failed to start'));
        }
      }, 2000);
    });
  }

  /**
   * Stop the MCP server
   */
  async stopServer() {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
  }

  /**
   * Send an MCP request and get response
   */
  async sendMCPRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.serverProcess) {
        reject(new Error('Server not started'));
        return;
      }

      const request = {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      };

      const requestStr = JSON.stringify(request) + '\n';
      
      let responseData = '';
      // Increased timeout for index building operations
      const timeoutMs = (params.name === 'build_object_index') ? global.INDEX_TIMEOUT : global.TEST_TIMEOUT;
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, timeoutMs);

      const onData = (data) => {
        responseData += data.toString();
        
        try {
          const lines = responseData.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              const response = JSON.parse(line);
              if (response.id === request.id) {
                clearTimeout(timeout);
                this.serverProcess.stdout.off('data', onData);
                
                if (response.error) {
                  reject(new Error(response.error.message || 'MCP Error'));
                } else {
                  resolve(response.result);
                }
                return;
              }
            }
          }
        } catch (error) {
          // Continue waiting for complete response
        }
      };

      this.serverProcess.stdout.on('data', onData);
      this.serverProcess.stdin.write(requestStr);
    });
  }

  /**
   * Create mock D365 F&O codebase structure
   */
  async createMockCodebase() {
    const structure = {
      'TestPackage': {
        'TestPackage': {
          'AxClass': {
            'TestClass.xml': this.generateMockClassXml('TestClass'),
            'AnotherClass.xml': this.generateMockClassXml('AnotherClass')
          },
          'AxTable': {
            'TestTable.xml': this.generateMockTableXml('TestTable'),
            'AnotherTable.xml': this.generateMockTableXml('AnotherTable')
          },
          'AxForm': {
            'TestForm.xml': this.generateMockFormXml('TestForm')
          }
        }
      },
      'AnotherPackage': {
        'AnotherPackage': {
          'AxClass': {
            'PackageClass.xml': this.generateMockClassXml('PackageClass')
          }
        }
      }
    };

    await this.createDirectoryStructure(this.mockCodebasePath, structure);
  }

  /**
   * Clean up mock codebase
   */
  async cleanupMockCodebase() {
    try {
      await fs.rm(this.mockCodebasePath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  /**
   * Configure the server with mock codebase path
   */
  async configureMockPath() {
    return await this.sendMCPRequest('tools/call', {
      name: 'set_xpp_codebase_path',
      arguments: { path: this.mockCodebasePath }
    });
  }

  // Private helper methods
  async createDirectoryStructure(basePath, structure) {
    await fs.mkdir(basePath, { recursive: true });
    
    for (const [name, content] of Object.entries(structure)) {
      const itemPath = join(basePath, name);
      
      if (typeof content === 'string') {
        await fs.writeFile(itemPath, content, 'utf-8');
      } else {
        await this.createDirectoryStructure(itemPath, content);
      }
    }
  }

  generateMockClassXml(className) {
    return `<?xml version="1.0" encoding="utf-8"?>
<AxClass xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>${className}</Name>
  <SourceCode>
    <Declaration><![CDATA[
public class ${className}
{
    str name;
    int value;
}
]]></Declaration>
    <Methods>
      <Method>
        <Name>new</Name>
        <Source><![CDATA[
public void new()
{
    super();
}
]]></Source>
      </Method>
      <Method>
        <Name>testMethod</Name>
        <Source><![CDATA[
public str testMethod(str _input)
{
    return _input + " processed";
}
]]></Source>
      </Method>
    </Methods>
  </SourceCode>
</AxClass>`;
  }

  generateMockTableXml(tableName) {
    return `<?xml version="1.0" encoding="utf-8"?>
<AxTable xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>${tableName}</Name>
  <Label>${tableName} Table</Label>
  <Fields>
    <AxTableField>
      <Name>RecId</Name>
      <ExtendedDataType>RecId</ExtendedDataType>
      <Label>Record ID</Label>
    </AxTableField>
    <AxTableField>
      <Name>Name</Name>
      <ExtendedDataType>Name</ExtendedDataType>
      <Label>Name</Label>
    </AxTableField>
  </Fields>
  <Indexes>
    <AxTableIndex>
      <Name>RecIDIdx</Name>
      <AllowDuplicates>No</AllowDuplicates>
      <Fields>
        <AxTableIndexField>
          <DataField>RecId</DataField>
        </AxTableIndexField>
      </Fields>
    </AxTableIndex>
  </Indexes>
</AxTable>`;
  }

  generateMockFormXml(formName) {
    return `<?xml version="1.0" encoding="utf-8"?>
<AxForm xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>${formName}</Name>
  <Label>${formName} Form</Label>
</AxForm>`;
  }
}
