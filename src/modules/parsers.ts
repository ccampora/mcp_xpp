import { promises as fs } from "fs";
import { basename, extname } from "path";
import { xppObjectCache } from "./cache.js";
import { AOTStructureManager } from "./aot-structure.js";
import { SQLiteObjectLookup } from "./sqlite-lookup.js";

/**
 * Determine X++ object type based on file path using dynamic structure
 */
export function getXppObjectType(filepath: string): string {
  const pathParts = filepath.split(/[\/\\]/);
  
  const allTypes = AOTStructureManager.getAllDiscoveredTypes();
  for (const [category, typeInfo] of allTypes.entries()) {
    if (typeInfo.folderPatterns.some(pattern => 
      pathParts.some(part => part.toLowerCase().includes(pattern.toLowerCase()))
    )) {
      return category;
    }
  }
  
  return "UNKNOWN";
}

/**
 * Parse X++ class file to extract methods, properties, and inheritance
 */
export async function parseXppClass(filepath: string): Promise<any> {
  const cacheKey = `class_${filepath}`;
  if (xppObjectCache.has(cacheKey)) {
    return xppObjectCache.get(cacheKey);
  }

  try {
    const content = await fs.readFile(filepath, "utf-8");
    const className = basename(filepath, ".xpp");
    
    const classInfo = {
      name: className,
      type: "class",
      extends: null as string | null,
      implements: [] as string[],
      methods: [] as any[],
      properties: [] as any[],
      attributes: [] as string[],
      isAbstract: false,
      isFinal: false,
      isPublic: true,
      path: filepath
    };

    // Parse class declaration
    const classDeclarationMatch = content.match(/(?:public\s+)?(?:abstract\s+)?(?:final\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/i);
    if (classDeclarationMatch) {
      classInfo.name = classDeclarationMatch[1];
      classInfo.extends = classDeclarationMatch[2] || null;
      if (classDeclarationMatch[3]) {
        classInfo.implements = classDeclarationMatch[3].split(',').map(i => i.trim());
      }
    }

    // Check for class modifiers
    classInfo.isAbstract = /\babstract\s+class\b/i.test(content);
    classInfo.isFinal = /\bfinal\s+class\b/i.test(content);

    // Parse attributes
    const attributeMatches = content.match(/\[([^\]]+)\]/g);
    if (attributeMatches) {
      classInfo.attributes = attributeMatches.map(attr => attr.slice(1, -1));
    }

    // Parse methods (enhanced regex for X++ method patterns)
    const methodRegex = /(?:public|private|protected|static)?\s*(?:final\s+)?(?:static\s+)?(?:void|int|str|boolean|real|date|utcdatetime|guid|[\w\[\]]+)\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/g;
    let methodMatch;
    while ((methodMatch = methodRegex.exec(content)) !== null) {
      const methodName = methodMatch[1];
      const parameters = methodMatch[2];
      const returnType = methodMatch[3] || 'void';
      
      // Parse parameters
      const params = parameters ? parameters.split(',').map(param => {
        const paramParts = param.trim().split(/\s+/);
        return {
          type: paramParts[0] || 'var',
          name: paramParts[1] || 'unknown',
          isOptional: param.includes('=')
        };
      }) : [];

      classInfo.methods.push({
        name: methodName,
        parameters: params,
        returnType: returnType.trim(),
        isStatic: /\bstatic\b/i.test(methodMatch[0]),
        isPublic: /\bpublic\b/i.test(methodMatch[0]) || !/\b(private|protected)\b/i.test(methodMatch[0]),
        isPrivate: /\bprivate\b/i.test(methodMatch[0]),
        isProtected: /\bprotected\b/i.test(methodMatch[0])
      });
    }

    // Parse properties/fields
    const propertyRegex = /(?:public|private|protected)?\s*(?:static\s+)?([\w\[\]]+)\s+(\w+)(?:\s*=\s*[^;]+)?;/g;
    let propertyMatch;
    while ((propertyMatch = propertyRegex.exec(content)) !== null) {
      classInfo.properties.push({
        type: propertyMatch[1],
        name: propertyMatch[2],
        isStatic: /\bstatic\b/i.test(propertyMatch[0]),
        isPublic: /\bpublic\b/i.test(propertyMatch[0]) || !/\b(private|protected)\b/i.test(propertyMatch[0])
      });
    }

    xppObjectCache.set(cacheKey, classInfo);
    return classInfo;
  } catch (error) {
    return { error: `Failed to parse class: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

/**
 * Parse X++ table metadata from XML files
 */
export async function parseXppTable(filepath: string): Promise<any> {
  const cacheKey = `table_${filepath}`;
  if (xppObjectCache.has(cacheKey)) {
    return xppObjectCache.get(cacheKey);
  }

  try {
    const content = await fs.readFile(filepath, "utf-8");
    const tableName = basename(filepath, ".xml");
    
    const tableInfo = {
      name: tableName,
      type: "table",
      fields: [] as any[],
      indexes: [] as any[],
      relations: [] as any[],
      methods: [] as any[],
      properties: {} as any,
      path: filepath
    };

    // Parse XML content for table structure
    if (content.includes('<AxTable')) {
      // Extract table properties
      const labelMatch = content.match(/<Label>([^<]+)<\/Label>/);
      if (labelMatch) tableInfo.properties.label = labelMatch[1];

      const helpTextMatch = content.match(/<HelpText>([^<]+)<\/HelpText>/);
      if (helpTextMatch) tableInfo.properties.helpText = helpTextMatch[1];

      // Extract fields
      const fieldMatches = content.match(/<AxTableField[^>]*>[\s\S]*?<\/AxTableField>/g);
      if (fieldMatches) {
        for (const fieldMatch of fieldMatches) {
          const nameMatch = fieldMatch.match(/<Name>([^<]+)<\/Name>/);
          const typeMatch = fieldMatch.match(/<ExtendedDataType>([^<]+)<\/ExtendedDataType>/);
          const labelMatch = fieldMatch.match(/<Label>([^<]+)<\/Label>/);
          
          if (nameMatch) {
            tableInfo.fields.push({
              name: nameMatch[1],
              type: typeMatch ? typeMatch[1] : 'Unknown',
              label: labelMatch ? labelMatch[1] : ''
            });
          }
        }
      }

      // Extract indexes
      const indexMatches = content.match(/<AxTableIndex[^>]*>[\s\S]*?<\/AxTableIndex>/g);
      if (indexMatches) {
        for (const indexMatch of indexMatches) {
          const nameMatch = indexMatch.match(/<Name>([^<]+)<\/Name>/);
          const uniqueMatch = indexMatch.match(/<AllowDuplicates>([^<]+)<\/AllowDuplicates>/);
          
          if (nameMatch) {
            tableInfo.indexes.push({
              name: nameMatch[1],
              unique: uniqueMatch ? uniqueMatch[1] === 'No' : false
            });
          }
        }
      }
    }

    xppObjectCache.set(cacheKey, tableInfo);
    return tableInfo;
  } catch (error) {
    return { error: `Failed to parse table: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

/**
 * Find X++ object by name across the codebase using SQLite index
 */
export async function findXppObject(objectName: string, objectType?: string, model?: string): Promise<any[]> {
  const results: any[] = [];
  
  // Try SQLite lookup first (fastest method)
  const lookup = new SQLiteObjectLookup();
  if (lookup.initialize()) {
    try {
      let objects = lookup.findObject(objectName);
      
      // Apply filters
      if (objectType) {
        objects = objects.filter(obj => obj.type === objectType);
      }
      
      if (model) {
        objects = objects.filter(obj => obj.package?.toLowerCase() === model.toLowerCase());
      }
      
      // Convert to our expected format
      for (const obj of objects) {
        results.push({
          name: obj.name,
          path: obj.path,
          type: obj.type,
          model: obj.package
        });
      }
      
      lookup.close();
      
      // If we found results in SQLite, return them
      if (results.length > 0) {
        return results;
      }
    } catch (error) {
      console.error('SQLite lookup failed, falling back to filesystem search:', error);
      lookup.close();
    }
  }
  
  // Fallback to filesystem search if SQLite lookup fails
  console.log('Falling back to filesystem search...');
  
  async function searchInDirectory(dirPath: string, currentModel?: string) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          // If we're at the top level, this might be a model/package directory
          const potentialModel = currentModel || entry.name;
          
          // If model filter is specified, skip directories that don't match
          if (model && potentialModel.toLowerCase() !== model.toLowerCase()) {
            continue;
          }
          
          await searchInDirectory(`${dirPath}/${entry.name}`, potentialModel);
        } else if (entry.isFile()) {
          const fileName = entry.name.toLowerCase();
          const targetName = objectName.toLowerCase();
          
          if (fileName.includes(targetName)) {
            const fullPath = `${dirPath}/${entry.name}`;
            const detectedType = getXppObjectType(fullPath);
            
            if (!objectType || detectedType === objectType) {
              // Extract model from path if available
              const pathParts = fullPath.split(/[\/\\]/);
              const extractedModel = currentModel || (pathParts.length > 1 ? pathParts[pathParts.length - 3] || pathParts[pathParts.length - 2] : 'Unknown');
              
              results.push({
                name: entry.name,
                path: fullPath,
                type: detectedType,
                model: extractedModel
              });
            }
          }
        }
      }
    } catch (error) {
      // Skip directories we can't access
    }
  }
  
  const xppCodebasePath = process.env.XPP_CODEBASE_PATH || "";
  if (xppCodebasePath) {
    await searchInDirectory(xppCodebasePath);
  }
  
  return results;
}
