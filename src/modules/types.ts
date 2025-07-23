// Type definitions for AOT structure
export interface AOTNodeConfig {
  folderPatterns?: string[];
  fileExtensions?: string[];
  objectType?: string;
  children?: { [key: string]: AOTNodeConfig };
}

export interface AOTStructure {
  aotStructure: { [key: string]: AOTNodeConfig };
}

export interface DiscoveredTypeInfo {
  displayName: string;
  folderPatterns: string[];
  fileExtensions: string[];
}

// Object index structure
export interface ObjectIndex {
  name: string;
  type: string;
  path: string;
  package: string;
  lastModified: number;
  methods?: string[];
  fields?: string[];
  dependencies?: string[];
  size: number;
}

// Model creation types
export interface ModelDescriptor {
  name: string;
  publisher: string;
  version: string;
  layer: string;
  description?: string;
  dependencies?: ModelDependency[];
}

export interface ModelDependency {
  name: string;
  publisher: string;
  version: string;
}

export interface ModelCreationResult {
  modelName: string;
  modelPath: string;
  descriptorPath: string;
  aotStructurePath: string;
  created: string[];
  message: string;
}
