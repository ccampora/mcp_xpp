import { promises as fs } from "fs";
import { join, resolve } from "path";
import { ModelDescriptor, ModelCreationResult } from "./types.js";
import { AOTStructureManager } from "./aot-structure.js";

/**
 * Creates a standalone D365 F&O model in .ocz deployment container structure
 */
export class ModelCreator {
  /**
   * Creates a standalone model with proper .ocz structure
   */
  static async createStandaloneModel(
    basePath: string,
    modelDescriptor: ModelDescriptor
  ): Promise<ModelCreationResult> {
    const { name, publisher, version, layer, description, dependencies } = modelDescriptor;
    
    // Validate inputs
    if (!name || !publisher || !version || !layer) {
      throw new Error("Model name, publisher, version, and layer are required");
    }
    
    // Create model directory path
    const modelName = `${name}_${publisher}_${version}`;
    const modelPath = resolve(basePath, modelName);
    
    // Check if model directory already exists
    try {
      await fs.access(modelPath);
      throw new Error(`Model directory already exists: ${modelPath}`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    
    const created: string[] = [];
    
    try {
      // Create main model directory
      await fs.mkdir(modelPath, { recursive: true });
      created.push(modelPath);
      
      // Create model descriptor XML
      const descriptorPath = await this.createModelDescriptor(modelPath, modelDescriptor);
      created.push(descriptorPath);
      
      // Create AOT structure
      const aotStructurePath = await this.createAOTStructure(modelPath);
      created.push(aotStructurePath);
      
      // Create model manifest file
      const manifestPath = await this.createModelManifest(modelPath, modelDescriptor);
      created.push(manifestPath);
      
      return {
        modelName,
        modelPath,
        descriptorPath,
        aotStructurePath,
        created,
        message: `Successfully created standalone model: ${modelName}`
      };
    } catch (error) {
      // Cleanup on error
      await this.cleanup(created);
      throw error;
    }
  }
  
  /**
   * Creates the model descriptor XML file
   */
  private static async createModelDescriptor(
    modelPath: string, 
    descriptor: ModelDescriptor
  ): Promise<string> {
    const descriptorPath = join(modelPath, "Descriptor", `${descriptor.name}.xml`);
    
    // Create Descriptor directory
    await fs.mkdir(join(modelPath, "Descriptor"), { recursive: true });
    
    const descriptorXml = this.generateModelDescriptorXml(descriptor);
    await fs.writeFile(descriptorPath, descriptorXml, 'utf-8');
    
    return descriptorPath;
  }
  
  /**
   * Creates the AOT folder structure based on aot-structure.json
   */
  private static async createAOTStructure(modelPath: string): Promise<string> {
    const aotPath = join(modelPath, "AxModel");
    await fs.mkdir(aotPath, { recursive: true });
    
    // Load AOT structure configuration
    await AOTStructureManager.loadStructure();
    const structure = AOTStructureManager.getRawStructure();
    
    if (!structure?.aotStructure) {
      throw new Error("Could not load AOT structure configuration");
    }
    
    // Create directory structure recursively
    await this.createDirectoryStructure(aotPath, structure.aotStructure);
    
    return aotPath;
  }
  
  /**
   * Creates directory structure recursively from AOT configuration
   */
  private static async createDirectoryStructure(
    basePath: string, 
    structure: any, 
    level: number = 0
  ): Promise<void> {
    // Prevent infinite recursion
    if (level > 10) {
      return;
    }
    
    for (const [key, config] of Object.entries(structure)) {
      const nodeConfig = config as any;
      
      if (nodeConfig.folderPatterns) {
        // Create folders for this node
        for (const pattern of nodeConfig.folderPatterns) {
          const folderPath = join(basePath, pattern);
          await fs.mkdir(folderPath, { recursive: true });
        }
      }
      
      if (nodeConfig.children) {
        // Recursively create child structure
        await this.createDirectoryStructure(basePath, nodeConfig.children, level + 1);
      }
    }
  }
  
  /**
   * Creates a model manifest file
   */
  private static async createModelManifest(
    modelPath: string,
    descriptor: ModelDescriptor
  ): Promise<string> {
    const manifestPath = join(modelPath, "ModelManifest.xml");
    
    const manifestXml = this.generateModelManifestXml(descriptor);
    await fs.writeFile(manifestPath, manifestXml, 'utf-8');
    
    return manifestPath;
  }
  
  /**
   * Generates model descriptor XML content
   */
  private static generateModelDescriptorXml(descriptor: ModelDescriptor): string {
    const { name, publisher, version, layer, description, dependencies } = descriptor;
    
    let dependenciesXml = '';
    if (dependencies && dependencies.length > 0) {
      dependenciesXml = '\n    <Dependencies>\n';
      for (const dep of dependencies) {
        dependenciesXml += `      <Dependency Name="${dep.name}" Publisher="${dep.publisher}" Version="${dep.version}" />\n`;
      }
      dependenciesXml += '    </Dependencies>';
    }
    
    return `<?xml version="1.0" encoding="utf-8"?>
<AxModelInfo xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <AppliedUpdates xmlns:d2p1="http://schemas.microsoft.com/2003/10/Serialization/Arrays" />
  <Customization>Allow</Customization>
  <Description>${description || `${name} model created by MCP X++ Server`}</Description>
  <DisplayName>${name}</DisplayName>
  <InstallMode>Standard</InstallMode>
  <IsBinary>false</IsBinary>
  <Layer>${layer}</Layer>
  <Locked>false</Locked>
  <Name>${name}</Name>
  <Publisher>${publisher}</Publisher>
  <VersionBuild>1</VersionBuild>
  <VersionMajor>${version.split('.')[0] || '1'}</VersionMajor>
  <VersionMinor>${version.split('.')[1] || '0'}</VersionMinor>
  <VersionRevision>${version.split('.')[2] || '0'}</VersionRevision>${dependenciesXml}
</AxModelInfo>`;
  }
  
  /**
   * Generates model manifest XML content
   */
  private static generateModelManifestXml(descriptor: ModelDescriptor): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<ModelManifest SchemaVersion="1.9">
  <Name>${descriptor.name}</Name>
  <Publisher>${descriptor.publisher}</Publisher>
  <Version>${descriptor.version}</Version>
  <Layer>${descriptor.layer}</Layer>
  <Description>${descriptor.description || `${descriptor.name} model created by MCP X++ Server`}</Description>
  <DisplayName>${descriptor.name}</DisplayName>
</ModelManifest>`;
  }
  
  /**
   * Cleanup created files/directories on error
   */
  private static async cleanup(created: string[]): Promise<void> {
    // Clean up in reverse order
    for (let i = created.length - 1; i >= 0; i--) {
      try {
        const stat = await fs.stat(created[i]);
        if (stat.isDirectory()) {
          await fs.rm(created[i], { recursive: true });
        } else {
          await fs.unlink(created[i]);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }
}