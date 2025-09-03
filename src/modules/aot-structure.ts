import { promises as fs } from "fs";
import { join, dirname, extname } from "path";
import { fileURLToPath } from "url";
import { AOTStructure, AOTNodeConfig, DiscoveredTypeInfo } from "./types.js";
import { loadAOTStructure, loadD365ModelConfig, loadD365ObjectTemplates } from "./config-loader.js";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dynamic AOT Structure Manager
export class AOTStructureManager {
  private static aotStructure: AOTStructure | null = null;
  private static discoveredObjectTypes: Map<string, DiscoveredTypeInfo> = new Map();

  static async loadStructure(): Promise<void> {
    try {
      this.aotStructure = await loadAOTStructure<AOTStructure>();
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
                  typeName: value.objectType,
                  category: 'Unknown', // Default category for legacy structure
                  folderPatterns: value.folderPatterns,
                  fileExtensions: value.fileExtensions || ['.xml'],
                  description: value.description || `${key} object type`,
                  apiSupported: value.apiSupported || false,
                  apiClass: value.apiClass
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

  // Get AOT directories from configuration
  static async getAOTDirectories(): Promise<string[]> {
    try {
      const config = await loadD365ModelConfig<{ aotDirectories?: string[] }>();
      return config.aotDirectories || [];
    } catch (error) {
      console.error('Failed to load AOT directories from config:', error);
      // Fallback to minimal set
      return ['AxClass', 'AxTable', 'AxForm', 'AxEnum', 'AxQuery'];
    }
  }

  // Get XppMetadata directories from configuration
  static async getXppMetadataDirectories(): Promise<string[]> {
    try {
      const config = await loadD365ModelConfig<{ xppMetadataDirectories?: string[] }>();
      return config.xppMetadataDirectories || [];
    } catch (error) {
      console.error('Failed to load XppMetadata directories from config:', error);
      // Fallback to minimal set
      return ['AxClass', 'AxTable', 'AxForm'];
    }
  }

  // Get numeric layer value from configuration
  static async getLayerNumber(layerCode: string): Promise<number> {
    try {
      const config = await loadD365ModelConfig<{ layerMapping?: Record<string, number> }>();
      return config.layerMapping?.[layerCode.toLowerCase()] ?? 14; // Default to USR (14)
    } catch (error) {
      console.error('Failed to load layer mapping from config:', error);
      return 14; // Default to USR
    }
  }

  // Get model descriptor template from configuration
  static async getModelDescriptorTemplate(): Promise<any> {
    try {
      const config = await loadD365ModelConfig<{ modelDescriptorTemplate?: any }>();
      return config.modelDescriptorTemplate;
    } catch (error) {
      console.error('Failed to load model descriptor template from config:', error);
      return null;
    }
  }

  // Generate model descriptor XML using template
  static async generateModelDescriptorXml(params: {
    modelName: string;
    publisher: string;
    version: string;
    layer: string;
    dependencies: string[];
  }): Promise<string> {
    const template = await this.getModelDescriptorTemplate();
    if (!template) {
      throw new Error('Model descriptor template not found in configuration');
    }

    const versionParts = params.version.split('.');
    const versionMajor = versionParts[0] || '1';
    const versionMinor = versionParts[1] || '0';
    const versionBuild = versionParts[2] || '0';
    const versionRevision = versionParts[3] || '0';

    // Get the numeric layer value from configuration
    const layerNumber = await this.getLayerNumber(params.layer);

    // Create dependencies XML
    const dependenciesXml = params.dependencies
      .map(dep => `    <d2p1:string>${dep}</d2p1:string>`)
      .join('\n');

    // Build the XML structure
    let xml = `${template.xmlDeclaration}\n`;
    xml += `<${template.rootElement} ${template.namespace}>\n`;
    
    const structure = template.structure;
    
    // AppliedUpdates
    xml += `  <AppliedUpdates ${structure.AppliedUpdates.attributes} />\n`;
    
    // Simple elements
    xml += `  <Customization>${structure.Customization.replace('{{customization}}', 'Allow')}</Customization>\n`;
    xml += `  <DataLoss>${structure.DataLoss}</DataLoss>\n`;
    xml += `  <Description>${structure.Description.replace('{{modelName}}', params.modelName)}</Description>\n`;
    xml += `  <DisplayName>${structure.DisplayName.replace('{{modelName}}', params.modelName)}</DisplayName>\n`;
    xml += `  <Id>${structure.Id}</Id>\n`;
    xml += `  <InstallMode>${structure.InstallMode}</InstallMode>\n`;
    xml += `  <Layer>${layerNumber}</Layer>\n`;
    xml += `  <Locked>${structure.Locked.replace('{{locked}}', 'false')}</Locked>\n`;
    xml += `  <n>${params.modelName}</n>\n`;
    xml += `  <Publisher>${structure.Publisher.replace('{{publisher}}', params.publisher)}</Publisher>\n`;
    
    // References
    xml += `  <References ${structure.References.attributes}>\n`;
    xml += dependenciesXml + '\n';
    xml += `  </References>\n`;
    
    // More simple elements
    xml += `  <Signed>${structure.Signed}</Signed>\n`;
    xml += `  <SupportedPlatforms ${structure.SupportedPlatforms.attributes} />\n`;
    xml += `  <VersionBuildNumber>${structure.VersionBuildNumber.replace('{{versionBuild}}', versionBuild)}</VersionBuildNumber>\n`;
    xml += `  <VersionMajor>${structure.VersionMajor.replace('{{versionMajor}}', versionMajor)}</VersionMajor>\n`;
    xml += `  <VersionMinor>${structure.VersionMinor.replace('{{versionMinor}}', versionMinor)}</VersionMinor>\n`;
    xml += `  <VersionRevision>${structure.VersionRevision.replace('{{versionRevision}}', versionRevision)}</VersionRevision>\n`;
    
    xml += `</${template.rootElement}>`;
    
    return xml;
  }

  static async getAvailableLayers(): Promise<string[]> {
    const config = await this.getD365ModelConfig();
    if (config && config.layerMapping) {
      return Object.keys(config.layerMapping);
    }
    // Fallback to basic layers if config is not available
    return ["usr", "cus", "var", "isv"];
  }

  static async getObjectTemplates(): Promise<any> {
    try {
      return await loadD365ObjectTemplates();
    } catch (error) {
      console.error('Failed to load D365 object templates:', error);
      return null;
    }
  }

  static async getAvailableObjectTypes(): Promise<string[]> {
    const templates = await this.getObjectTemplates();
    if (templates && templates.objectTypes) {
      return Object.keys(templates.objectTypes);
    }
    return ["model"]; // Fallback
  }

  static async getObjectTypeDefinition(objectType: string): Promise<any> {
    const templates = await this.getObjectTemplates();
    if (templates && templates.objectTypes && templates.objectTypes[objectType]) {
      return templates.objectTypes[objectType];
    }
    return null;
  }

  private static async getD365ModelConfig(): Promise<any> {
    try {
      return await loadD365ModelConfig();
    } catch (error) {
      console.error('Failed to load D365 model configuration:', error);
      return null;
    }
  }
}
