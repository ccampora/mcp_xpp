import { promises as fs } from "fs";
import { join, dirname, extname } from "path";
import { fileURLToPath } from "url";
import { AOTStructure, AOTNodeConfig, DiscoveredTypeInfo } from "./types.js";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dynamic AOT Structure Manager
export class AOTStructureManager {
  private static aotStructure: AOTStructure | null = null;
  private static discoveredObjectTypes: Map<string, DiscoveredTypeInfo> = new Map();

  static async loadStructure(): Promise<void> {
    try {
      const structureFile = join(__dirname, '..', 'config', 'aot-structure.json');
      const content = await fs.readFile(structureFile, 'utf-8');
      this.aotStructure = JSON.parse(content);
    } catch (error) {
      console.error('Failed to load AOT structure:', error);
      // Fallback to minimal structure
      this.aotStructure = {
        aotStructure: {
          "Classes": { folderPatterns: ["AxClass"], fileExtensions: [".xml", ".xpp"], objectType: "CLASSES" },
          "Tables": { folderPatterns: ["AxTable"], fileExtensions: [".xml"], objectType: "TABLES" },
          "Forms": { folderPatterns: ["AxForm"], fileExtensions: [".xml"], objectType: "FORMS" }
        }
      };
    }
  }

  static async discoverAvailableObjectTypes(basePath: string): Promise<string[]> {
    if (!this.aotStructure) await this.loadStructure();
    
    const discoveredTypes: Set<string> = new Set();
    
    // Recursively scan for actual AOT folders that exist
    if (this.aotStructure) {
      await this.scanForExistingAOTTypes(basePath, this.aotStructure.aotStructure, discoveredTypes);
    }
    
    return Array.from(discoveredTypes).sort();
  }

  private static async scanForExistingAOTTypes(
    basePath: string, 
    structureNode: { [key: string]: AOTNodeConfig }, 
    discoveredTypes: Set<string>
  ): Promise<void> {
    try {
      const entries = await fs.readdir(basePath, { withFileTypes: true });
      
      // For each package directory
      for (const entry of entries) {
        if (entry.isDirectory() && 
            !entry.name.startsWith('.') && 
            !['node_modules', 'bin', 'obj', 'temp'].includes(entry.name.toLowerCase())) {
          
          const packagePath = join(basePath, entry.name);
          const innerPackagePath = join(packagePath, entry.name);
          
          // Check double-nested structure first
          try {
            const innerStats = await fs.stat(innerPackagePath);
            if (innerStats.isDirectory()) {
              await this.checkAOTFoldersInPackage(innerPackagePath, structureNode, discoveredTypes);
            } else {
              await this.checkAOTFoldersInPackage(packagePath, structureNode, discoveredTypes);
            }
          } catch (error) {
            await this.checkAOTFoldersInPackage(packagePath, structureNode, discoveredTypes);
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${basePath}:`, error);
    }
  }

  private static async checkAOTFoldersInPackage(
    packagePath: string, 
    structureNode: any, 
    discoveredTypes: Set<string>
  ): Promise<void> {
    try {
      const entries = await fs.readdir(packagePath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Check if this folder matches any AOT pattern
          this.matchFolderToStructure(entry.name, structureNode, discoveredTypes);
        }
      }
    } catch (error) {
      // Skip packages we can't access
    }
  }

  private static matchFolderToStructure(
    folderName: string, 
    structureNode: { [key: string]: AOTNodeConfig }, 
    discoveredTypes: Set<string>
  ): void {
    for (const [key, value] of Object.entries(structureNode)) {
      if (value && typeof value === 'object') {
        // Check if this node has folder patterns
        if (value.folderPatterns && Array.isArray(value.folderPatterns)) {
          for (const pattern of value.folderPatterns) {
            if (folderName === pattern || folderName.startsWith(pattern)) {
              if (value.objectType) {
                discoveredTypes.add(value.objectType);
                this.discoveredObjectTypes.set(value.objectType, {
                  displayName: key,
                  folderPatterns: value.folderPatterns,
                  fileExtensions: value.fileExtensions || ['.xml']
                });
              }
              break;
            }
          }
        }
        
        // Recursively check children
        if (value.children) {
          this.matchFolderToStructure(folderName, value.children, discoveredTypes);
        }
      }
    }
  }

  static getObjectTypeInfo(objectType: string): DiscoveredTypeInfo | undefined {
    return this.discoveredObjectTypes.get(objectType);
  }

  static getAllDiscoveredTypes(): Map<string, DiscoveredTypeInfo> {
    return new Map(this.discoveredObjectTypes);
  }

  static getFolderPatternsForType(objectType: string): string[] {
    const info = this.discoveredObjectTypes.get(objectType);
    return info ? info.folderPatterns : [];
  }

  static getRawStructure(): AOTStructure | null {
    return this.aotStructure;
  }

  static getStructuredTree(availableTypes: string[]): string {
    if (!this.aotStructure) return "AOT structure not loaded";
    
    let output = "DYNAMICS 365 F&O AOT STRUCTURE:\n\n";
    
    // Create a set of available types for quick lookup
    const availableSet = new Set(availableTypes);
    
    // Process each top-level category
    for (const [categoryName, categoryConfig] of Object.entries(this.aotStructure.aotStructure)) {
      const categoryHasChildren = this.categoryHasAvailableTypes(categoryConfig, availableSet);
      
      if (categoryHasChildren) {
        output += `${categoryName}\n`;
        
        // Check if category itself is an object type
        if (categoryConfig.objectType && availableSet.has(categoryConfig.objectType)) {
          output += `   [AVAILABLE] ${categoryConfig.objectType}\n`;
          output += `      Patterns: ${categoryConfig.folderPatterns?.join(', ') || 'N/A'}\n`;
          output += `      Extensions: ${categoryConfig.fileExtensions?.join(', ') || 'N/A'}\n`;
        }
        
        // Process children if they exist
        if (categoryConfig.children) {
          for (const [childName, childConfig] of Object.entries(categoryConfig.children)) {
            if (childConfig.objectType && availableSet.has(childConfig.objectType)) {
              output += `   ├── ${childName}\n`;
              output += `       [AVAILABLE] ${childConfig.objectType}\n`;
              output += `       Patterns: ${childConfig.folderPatterns?.join(', ') || 'N/A'}\n`;
              output += `       Extensions: ${childConfig.fileExtensions?.join(', ') || 'N/A'}\n`;
            }
          }
        }
        output += "\n";
      }
    }
    
    return output;
  }

  private static categoryHasAvailableTypes(categoryConfig: any, availableSet: Set<string>): boolean {
    // Check if category itself has an available object type
    if (categoryConfig.objectType && availableSet.has(categoryConfig.objectType)) {
      return true;
    }
    
    // Check if any children have available object types
    if (categoryConfig.children) {
      for (const childConfig of Object.values(categoryConfig.children) as any[]) {
        if (childConfig.objectType && availableSet.has(childConfig.objectType)) {
          return true;
        }
      }
    }
    
    return false;
  }

  static getStructure(): AOTStructure | null {
    return this.aotStructure;
  }

  static getAllObjectTypes(): string[] {
    if (!this.aotStructure) return [];
    
    const objectTypes: string[] = [];
    
    for (const [categoryName, categoryData] of Object.entries(this.aotStructure.aotStructure)) {
      // Check if category itself has an object type
      if (categoryData.objectType) {
        objectTypes.push(categoryData.objectType);
      }
      
      // Check children for object types
      if (categoryData.children) {
        for (const [childName, childData] of Object.entries(categoryData.children)) {
          if (childData.objectType) {
            objectTypes.push(childData.objectType);
          }
        }
      }
    }
    
    return objectTypes.sort();
  }

  static getObjectTypeFromPath(filePath: string): string {
    if (!this.aotStructure) return "UNKNOWN";
    
    const structure = this.aotStructure;
    
    // Check all categories and their children for matching patterns
    for (const [categoryName, categoryData] of Object.entries(structure.aotStructure)) {
      // Check if category itself matches
      if (categoryData.objectType && this.matchesAOTPattern(filePath, categoryData)) {
        return categoryData.objectType;
      }
      
      // Check children
      if (categoryData.children) {
        for (const [childName, childData] of Object.entries(categoryData.children)) {
          if (childData.objectType && this.matchesAOTPattern(filePath, childData)) {
            return childData.objectType;
          }
        }
      }
    }
    
    return "UNKNOWN";
  }

  private static matchesAOTPattern(filePath: string, nodeConfig: any): boolean {
    if (!nodeConfig.folderPatterns) return false;
    
    // Check if file path contains any of the folder patterns
    for (const pattern of nodeConfig.folderPatterns) {
      if (filePath.includes(pattern)) {
        // If file extensions are specified, check those too
        if (nodeConfig.fileExtensions && nodeConfig.fileExtensions.length > 0) {
          const fileExt = extname(filePath);
          return nodeConfig.fileExtensions.includes(fileExt);
        }
        return true;
      }
    }
    
    return false;
  }
}
