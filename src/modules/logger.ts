import { promises as fs } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG_DIR = "C:\\TEMP";
const LOG_FILE_REQUESTS = join(LOG_DIR, "mcp-xpp-requests.log");
const LOG_FILE_RESPONSES = join(LOG_DIR, "mcp-xpp-responses.log");
const LOG_FILE_DEBUG = join(LOG_DIR, "mcp-xpp-debug.log");

interface LogEntry {
  timestamp: string;
  id?: string | number;
  method?: string;
  type: 'REQUEST' | 'RESPONSE' | 'ERROR' | 'DEBUG';
  size: number;
  preview: string;
  fullContent?: any;
}

export class DiskLogger {
  private static async ensureLogDirectory(): Promise<void> {
    try {
      await fs.mkdir(LOG_DIR, { recursive: true });
    } catch (error) {
      console.error(`Failed to create log directory ${LOG_DIR}:`, error);
    }
  }

  private static async appendToFile(filePath: string, content: string): Promise<void> {
    try {
      await this.ensureLogDirectory();
      await fs.appendFile(filePath, content + '\n');
    } catch (error) {
      console.error(`Failed to write to log file ${filePath}:`, error);
    }
  }

  private static createLogEntry(type: LogEntry['type'], data: any, metadata?: Partial<LogEntry>): LogEntry {
    const timestamp = new Date().toISOString();
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const preview = jsonStr.length > 200 ? jsonStr.substring(0, 200) + '...' : jsonStr;
    
    return {
      timestamp,
      type,
      size: jsonStr.length,
      preview,
      fullContent: data,
      ...metadata
    };
  }

  static async logRequest(request: any): Promise<void> {
    const entry = this.createLogEntry('REQUEST', request, {
      id: request.id,
      method: request.method
    });

    const logLine = `[${entry.timestamp}] REQUEST ID:${entry.id} METHOD:${entry.method} SIZE:${entry.size}b\n${JSON.stringify(request, null, 2)}\n${'='.repeat(80)}`;
    
    await this.appendToFile(LOG_FILE_REQUESTS, logLine);
    await this.logDebug(`📤 REQUEST: ${entry.method} (ID:${entry.id}, ${entry.size} bytes)`);
  }

  static async logResponse(response: any, requestId?: string | number): Promise<void> {
    const entry = this.createLogEntry('RESPONSE', response, {
      id: requestId || response.id
    });

    const logLine = `[${entry.timestamp}] RESPONSE ID:${entry.id} SIZE:${entry.size}b\n${JSON.stringify(response, null, 2)}\n${'='.repeat(80)}`;
    
    await this.appendToFile(LOG_FILE_RESPONSES, logLine);
    await this.logDebug(`📥 RESPONSE: ID:${entry.id} (${entry.size} bytes)`);
  }

  static async logError(error: any, context?: string): Promise<void> {
    const entry = this.createLogEntry('ERROR', error, {
      method: context
    });

    const logLine = `[${entry.timestamp}] ERROR ${context ? 'CONTEXT:' + context : ''} SIZE:${entry.size}b\n${JSON.stringify(error, null, 2)}\n${'='.repeat(80)}`;
    
    await this.appendToFile(LOG_FILE_DEBUG, logLine);
    await this.logDebug(`ERROR: ${context || 'Unknown'} (${entry.size} bytes)`);
  }

  static async logDebug(message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}`;
    
    await this.appendToFile(LOG_FILE_DEBUG, logLine);
    console.error(logLine); // Also log to stderr for immediate visibility
  }

  static async logStartup(): Promise<void> {
    const startupMessage = `
${'='.repeat(100)}
MCP X++ CODEBASE SERVER STARTUP - ${new Date().toISOString()}
${'='.repeat(100)}
Log Files:
- Requests: ${LOG_FILE_REQUESTS}
- Responses: ${LOG_FILE_RESPONSES}
- Debug: ${LOG_FILE_DEBUG}
${'='.repeat(100)}
`;
    
    // Clear previous logs and start fresh
    try {
      await this.ensureLogDirectory();
      await fs.writeFile(LOG_FILE_REQUESTS, startupMessage);
      await fs.writeFile(LOG_FILE_RESPONSES, startupMessage);
      await fs.writeFile(LOG_FILE_DEBUG, startupMessage);
    } catch (error) {
      console.error('Failed to initialize log files:', error);
    }
    
    console.error('MCP X++ Server logging initialized');
    console.error(`Logs writing to: ${LOG_DIR}`);
  }
}

// Helper function to create logged response
export async function createLoggedResponse(content: any, requestId?: string | number, toolName?: string): Promise<any> {
  const response = {
    content: [
      {
        type: "text",
        text: content,
      },
    ],
  };
  
  await DiskLogger.logResponse(response, requestId);
  await DiskLogger.logDebug(`[AVAILABLE] TOOL RESPONSE: ${toolName} (${content.length} chars)`);
  
  return response;
}
