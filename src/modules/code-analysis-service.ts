/**
 * Code Analysis Service for X++ Method Call and Reference Extraction
 * 
 * This service analyzes X++ source code to extract method calls, references,
 * and other code patterns for efficient searching and indexing.
 */

import { D365ServiceClient } from './d365-service-client.js';
import { MethodCall, CodeReference, ObjectCode, IndexingMetadata } from './code-analysis-schema.js';
import crypto from 'crypto';

export interface CodeAnalysisResult {
    objectName: string;
    objectType: string;
    objectModel: string;
    methodCalls: MethodCall[];
    codeReferences: CodeReference[];
    objectCode: ObjectCode[];
    metadata: IndexingMetadata;
    analysisErrors?: string[];
}

export interface MethodSignature {
    name: string;
    accessLevel: string;
    isStatic: boolean;
    parameters: string[];
    returnType: string;
    sourceCode: string;
}

/**
 * Regular expressions for parsing X++ code patterns
 */
const XPP_PATTERNS = {
    // Static method calls: ClassName::methodName()
    STATIC_METHOD_CALL: /([A-Za-z_][A-Za-z0-9_]*)::\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
    
    // Instance method calls: object.methodName()
    INSTANCE_METHOD_CALL: /([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
    
    // Global function calls: methodName()
    GLOBAL_METHOD_CALL: /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
    
    // Class references: new ClassName, ClassName variable declarations
    CLASS_REFERENCE: /\b(new\s+)?([A-Za-z_][A-Za-z0-9_]*)\b/g,
    
    // Table references: select * from TableName, TableName buffer
    TABLE_REFERENCE: /\b(select\s+.*?\s+from\s+)?([A-Za-z_][A-Za-z0-9_]*Table)\b/gi,
    
    // Method signatures: public static void methodName(parameters)
    METHOD_SIGNATURE: /^\s*(public|private|protected)?\s*(static)?\s*([A-Za-z_][A-Za-z0-9_<>]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/gm,
    
    // Form/Report references
    FORM_REFERENCE: /\b([A-Za-z_][A-Za-z0-9_]*Form)\b/g,
    
    // Enum references
    ENUM_REFERENCE: /\b([A-Za-z_][A-Za-z0-9_]*)::\s*([A-Za-z_][A-Za-z0-9_]*)/g
};

/**
 * Known D365 object patterns for better classification
 */
const D365_OBJECT_PATTERNS = {
    TABLES: /Table$/,
    FORMS: /Form$/,
    CLASSES: /^[A-Z][a-zA-Z0-9_]*$/, // CamelCase
    ENUMS: /^[A-Z][a-zA-Z0-9_]*$/, // Same as classes, need context
    REPORTS: /Report$/,
    QUERIES: /Query$/,
    VIEWS: /View$/
};

export class CodeAnalysisService {
    private serviceClient: D365ServiceClient;
    private analysisVersion = '1.0.0';

    constructor(serviceClient?: D365ServiceClient) {
        this.serviceClient = serviceClient || new D365ServiceClient('mcp-xpp-d365-service', 10000, 30000);
    }

    /**
     * Analyze a single D365 object for method calls and references
     */
    async analyzeObject(objectName: string, objectType: string, objectModel: string): Promise<CodeAnalysisResult> {
        const result: CodeAnalysisResult = {
            objectName,
            objectType,
            objectModel,
            methodCalls: [],
            codeReferences: [],
            objectCode: [],
            metadata: {
                objectName,
                objectType,
                objectModel,
                lastAnalyzed: Date.now(),
                methodCount: 0,
                referenceCount: 0,
                analysisVersion: this.analysisVersion,
                analysisStatus: 'pending' as const
            },
            analysisErrors: []
        };

        try {
            await this.serviceClient.connect();

            // Get the object's source code
            const codeResult = await this.serviceClient.sendRequest('getObjectCode', objectType, {
                objectName,
                objectType,
                codeTarget: 'methods'
            });

            if (!codeResult.Success) {
                result.analysisErrors?.push(`Failed to get source code: ${codeResult.Message}`);
                return result;
            }

            const methods = codeResult.Data?.Methods || [];
            result.metadata.analysisStatus = methods.length > 0 ? 'completed' : 'skipped';
            result.metadata.methodCount = methods.length;

            // Analyze each method
            for (const method of methods) {
                await this.analyzeMethod(method, result);
            }

            // Update totals
            result.metadata.referenceCount = result.codeReferences.length;

        } catch (error) {
            result.analysisErrors?.push(`Analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            await this.serviceClient.disconnect();
        }

        return result;
    }

    /**
     * Analyze a single method's source code
     */
    private async analyzeMethod(method: any, result: CodeAnalysisResult): Promise<void> {
        const methodName = method.Name || method.MethodName;
        const sourceCode = method.SourceCode || method.Source || '';
        
        if (!sourceCode || !methodName) {
            return;
        }

        // Create object code entry
        const codeHash = crypto.createHash('md5').update(sourceCode).digest('hex');
        const objectCode: ObjectCode = {
            objectName: result.objectName,
            objectType: result.objectType,
            objectModel: result.objectModel,
            methodName,
            sourceCode,
            codeHash,
            methodSignature: this.extractMethodSignature(sourceCode, methodName),
            accessLevel: this.extractAccessLevel(sourceCode),
            isStatic: this.isStaticMethod(sourceCode),
            parameters: this.extractParameters(sourceCode, methodName),
            returnType: this.extractReturnType(sourceCode, methodName),
            lastIndexed: Date.now()
        };
        result.objectCode.push(objectCode);

        // Extract method calls
        const methodCalls = this.extractMethodCalls(sourceCode, result.objectName, result.objectType, result.objectModel, methodName);
        result.methodCalls.push(...methodCalls);

        // Extract code references
        const codeReferences = this.extractCodeReferences(sourceCode, result.objectName, result.objectType, result.objectModel, methodName);
        result.codeReferences.push(...codeReferences);
    }

    /**
     * Extract method calls from source code
     */
    private extractMethodCalls(sourceCode: string, objectName: string, objectType: string, objectModel: string, methodName: string): MethodCall[] {
        const methodCalls: MethodCall[] = [];
        const lines = sourceCode.split('\n');

        // Extract static method calls (Class::method)
        let match;
        XPP_PATTERNS.STATIC_METHOD_CALL.lastIndex = 0;
        while ((match = XPP_PATTERNS.STATIC_METHOD_CALL.exec(sourceCode)) !== null) {
            const lineNumber = this.getLineNumber(sourceCode, match.index);
            const callContext = this.getCallContext(lines, lineNumber);
            
            methodCalls.push({
                objectName,
                objectType,
                objectModel,
                methodName,
                calledClass: match[1],
                calledMethod: match[2],
                callType: 'static',
                sourceLocation: methodName,
                lineNumber,
                callContext,
                lastIndexed: Date.now()
            });
        }

        // Extract instance method calls (object.method)
        XPP_PATTERNS.INSTANCE_METHOD_CALL.lastIndex = 0;
        while ((match = XPP_PATTERNS.INSTANCE_METHOD_CALL.exec(sourceCode)) !== null) {
            const lineNumber = this.getLineNumber(sourceCode, match.index);
            const callContext = this.getCallContext(lines, lineNumber);
            
            methodCalls.push({
                objectName,
                objectType,
                objectModel,
                methodName,
                calledClass: match[1],
                calledMethod: match[2],
                callType: 'instance',
                sourceLocation: methodName,
                lineNumber,
                callContext,
                lastIndexed: Date.now()
            });
        }

        // Extract potential global function calls
        // Note: This will have false positives, but we filter known patterns
        const knownGlobalFunctions = ['info', 'warning', 'error', 'checkFailed', 'throw', 'strFmt', 'int2Str', 'str2Int'];
        XPP_PATTERNS.GLOBAL_METHOD_CALL.lastIndex = 0;
        while ((match = XPP_PATTERNS.GLOBAL_METHOD_CALL.exec(sourceCode)) !== null) {
            const funcName = match[1];
            
            // Only include known global functions or functions starting with lowercase
            if (knownGlobalFunctions.includes(funcName) || /^[a-z]/.test(funcName)) {
                const lineNumber = this.getLineNumber(sourceCode, match.index);
                const callContext = this.getCallContext(lines, lineNumber);
                
                methodCalls.push({
                    objectName,
                    objectType,
                    objectModel,
                    methodName,
                    calledClass: 'Global',
                    calledMethod: funcName,
                    callType: 'global',
                    sourceLocation: methodName,
                    lineNumber,
                    callContext,
                    lastIndexed: Date.now()
                });
            }
        }

        return methodCalls;
    }

    /**
     * Extract code references from source code
     */
    private extractCodeReferences(sourceCode: string, objectName: string, objectType: string, objectModel: string, methodName: string): CodeReference[] {
        const references: CodeReference[] = [];
        const lines = sourceCode.split('\n');

        // Extract table references
        let match;
        XPP_PATTERNS.TABLE_REFERENCE.lastIndex = 0;
        while ((match = XPP_PATTERNS.TABLE_REFERENCE.exec(sourceCode)) !== null) {
            const tableName = match[2];
            if (D365_OBJECT_PATTERNS.TABLES.test(tableName)) {
                const lineNumber = this.getLineNumber(sourceCode, match.index);
                
                references.push({
                    objectName,
                    objectType,
                    objectModel,
                    referencedObject: tableName,
                    referenceType: 'table',
                    referenceContext: match[0],
                    sourceLocation: methodName,
                    lineNumber,
                    lastIndexed: Date.now()
                });
            }
        }

        // Extract form references
        XPP_PATTERNS.FORM_REFERENCE.lastIndex = 0;
        while ((match = XPP_PATTERNS.FORM_REFERENCE.exec(sourceCode)) !== null) {
            const formName = match[1];
            const lineNumber = this.getLineNumber(sourceCode, match.index);
            
            references.push({
                objectName,
                objectType,
                objectModel,
                referencedObject: formName,
                referenceType: 'form',
                referenceContext: match[0],
                sourceLocation: methodName,
                lineNumber,
                lastIndexed: Date.now()
            });
        }

        // Extract enum references (Enum::Value)
        XPP_PATTERNS.ENUM_REFERENCE.lastIndex = 0;
        while ((match = XPP_PATTERNS.ENUM_REFERENCE.exec(sourceCode)) !== null) {
            const enumName = match[1];
            const lineNumber = this.getLineNumber(sourceCode, match.index);
            
            references.push({
                objectName,
                objectType,
                objectModel,
                referencedObject: enumName,
                referenceType: 'enum',
                referenceContext: match[0],
                sourceLocation: methodName,
                lineNumber,
                lastIndexed: Date.now()
            });
        }

        return references;
    }

    /**
     * Extract method signature from source code
     */
    private extractMethodSignature(sourceCode: string, methodName: string): string {
        const lines = sourceCode.split('\n');
        for (const line of lines) {
            if (line.includes(methodName) && line.includes('(')) {
                return line.trim();
            }
        }
        return '';
    }

    /**
     * Extract access level (public, private, protected)
     */
    private extractAccessLevel(sourceCode: string): string {
        const firstLine = sourceCode.split('\n')[0];
        if (firstLine.includes('public')) return 'public';
        if (firstLine.includes('private')) return 'private';
        if (firstLine.includes('protected')) return 'protected';
        return 'public'; // Default in X++
    }

    /**
     * Check if method is static
     */
    private isStaticMethod(sourceCode: string): boolean {
        const firstLine = sourceCode.split('\n')[0];
        return firstLine.includes('static');
    }

    /**
     * Extract method parameters
     */
    private extractParameters(sourceCode: string, methodName: string): string[] {
        const match = sourceCode.match(new RegExp(`${methodName}\\s*\\(([^)]*)\\)`));
        if (!match || !match[1]) return [];
        
        return match[1]
            .split(',')
            .map(param => param.trim())
            .filter(param => param.length > 0);
    }

    /**
     * Extract return type
     */
    private extractReturnType(sourceCode: string, methodName: string): string {
        const match = sourceCode.match(new RegExp(`(\\w+)\\s+${methodName}\\s*\\(`));
        return match ? match[1] : 'void';
    }

    /**
     * Get line number for a character position
     */
    private getLineNumber(text: string, position: number): number {
        return text.substring(0, position).split('\n').length;
    }

    /**
     * Get context around a specific line
     */
    private getCallContext(lines: string[], lineNumber: number): string {
        const contextRadius = 1;
        const start = Math.max(0, lineNumber - contextRadius - 1);
        const end = Math.min(lines.length, lineNumber + contextRadius);
        return lines.slice(start, end).join(' ').trim();
    }

    /**
     * Batch analyze multiple objects
     */
    async batchAnalyzeObjects(objects: Array<{name: string, type: string, model: string}>): Promise<CodeAnalysisResult[]> {
        const results: CodeAnalysisResult[] = [];
        
        for (const obj of objects) {
            try {
                const result = await this.analyzeObject(obj.name, obj.type, obj.model);
                results.push(result);
            } catch (error) {
                console.error(`Failed to analyze ${obj.type}:${obj.name}:`, error);
                // Create error result
                results.push({
                    objectName: obj.name,
                    objectType: obj.type,
                    objectModel: obj.model,
                    methodCalls: [],
                    codeReferences: [],
                    objectCode: [],
                    metadata: {
                        objectName: obj.name,
                        objectType: obj.type,
                        objectModel: obj.model,
                        lastAnalyzed: Date.now(),
                        methodCount: 0,
                        referenceCount: 0,
                        analysisVersion: this.analysisVersion,
                        analysisStatus: 'error' as const,
                        errorMessage: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
                    }
                });
            }
        }
        
        return results;
    }
}