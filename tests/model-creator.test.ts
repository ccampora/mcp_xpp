import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ModelCreator } from '../src/modules/model-creator.js';
import { ModelDescriptor } from '../src/modules/types.js';

describe('ModelCreator', () => {
  const testDir = '/tmp/test-models';
  
  beforeEach(async () => {
    // Clean up test directory before each test
    try {
      await fs.rm(testDir, { recursive: true });
    } catch (error) {
      // Ignore if directory doesn't exist
    }
    await fs.mkdir(testDir, { recursive: true });
  });
  
  afterEach(async () => {
    // Clean up test directory after each test
    try {
      await fs.rm(testDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });
  
  it('should create a basic standalone model with required files', async () => {
    const modelDescriptor: ModelDescriptor = {
      name: 'TestModel',
      publisher: 'TestPublisher',
      version: '1.0.0',
      layer: 'usr'
    };
    
    const result = await ModelCreator.createStandaloneModel(testDir, modelDescriptor);
    
    expect(result.modelName).toBe('TestModel_TestPublisher_1.0.0');
    expect(result.message).toContain('Successfully created standalone model');
    expect(result.created.length).toBeGreaterThan(0);
    
    // Check that the model directory was created
    const modelExists = await fs.access(result.modelPath).then(() => true).catch(() => false);
    expect(modelExists).toBe(true);
    
    // Check that the descriptor file was created
    const descriptorExists = await fs.access(result.descriptorPath).then(() => true).catch(() => false);
    expect(descriptorExists).toBe(true);
    
    // Check that the AOT structure was created
    const aotExists = await fs.access(result.aotStructurePath).then(() => true).catch(() => false);
    expect(aotExists).toBe(true);
  });
  
  it('should create model with dependencies', async () => {
    const modelDescriptor: ModelDescriptor = {
      name: 'TestModelWithDeps',
      publisher: 'TestPublisher',
      version: '1.0.0',
      layer: 'usr',
      description: 'Test model with dependencies',
      dependencies: [
        { name: 'BaseModel', publisher: 'Microsoft', version: '1.0.0' },
        { name: 'CoreModel', publisher: 'TestPublisher', version: '1.0.0' }
      ]
    };
    
    const result = await ModelCreator.createStandaloneModel(testDir, modelDescriptor);
    
    expect(result.modelName).toBe('TestModelWithDeps_TestPublisher_1.0.0');
    
    // Check that descriptor file contains dependencies
    const descriptorContent = await fs.readFile(result.descriptorPath, 'utf-8');
    expect(descriptorContent).toContain('<Dependencies>');
    expect(descriptorContent).toContain('BaseModel');
    expect(descriptorContent).toContain('CoreModel');
    expect(descriptorContent).toContain('Microsoft');
  });
  
  it('should validate required fields', async () => {
    const invalidDescriptor = {
      name: '',
      publisher: 'TestPublisher',
      version: '1.0.0',
      layer: 'usr'
    } as ModelDescriptor;
    
    await expect(
      ModelCreator.createStandaloneModel(testDir, invalidDescriptor)
    ).rejects.toThrow('Model name, publisher, version, and layer are required');
  });
  
  it('should prevent creating duplicate models', async () => {
    const modelDescriptor: ModelDescriptor = {
      name: 'DuplicateTest',
      publisher: 'TestPublisher',
      version: '1.0.0',
      layer: 'usr'
    };
    
    // Create the model first time
    await ModelCreator.createStandaloneModel(testDir, modelDescriptor);
    
    // Try to create the same model again
    await expect(
      ModelCreator.createStandaloneModel(testDir, modelDescriptor)
    ).rejects.toThrow('Model directory already exists');
  });
  
  it('should create proper XML descriptor content', async () => {
    const modelDescriptor: ModelDescriptor = {
      name: 'XMLTest',
      publisher: 'TestPublisher',
      version: '1.2.3',
      layer: 'cus',
      description: 'Test XML generation'
    };
    
    const result = await ModelCreator.createStandaloneModel(testDir, modelDescriptor);
    
    const descriptorContent = await fs.readFile(result.descriptorPath, 'utf-8');
    
    // Check XML structure
    expect(descriptorContent).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(descriptorContent).toContain('<AxModelInfo');
    expect(descriptorContent).toContain('<Name>XMLTest</Name>');
    expect(descriptorContent).toContain('<Publisher>TestPublisher</Publisher>');
    expect(descriptorContent).toContain('<Layer>cus</Layer>');
    expect(descriptorContent).toContain('<VersionMajor>1</VersionMajor>');
    expect(descriptorContent).toContain('<VersionMinor>2</VersionMinor>');
    expect(descriptorContent).toContain('<VersionRevision>3</VersionRevision>');
    expect(descriptorContent).toContain('Test XML generation');
  });
  
  it('should create AOT directory structure', async () => {
    const modelDescriptor: ModelDescriptor = {
      name: 'AOTTest',
      publisher: 'TestPublisher', 
      version: '1.0.0',
      layer: 'usr'
    };
    
    const result = await ModelCreator.createStandaloneModel(testDir, modelDescriptor);
    
    // Check that some key AOT directories exist
    const dataTypesPath = join(result.aotStructurePath, 'DataTypes');
    const codePath = join(result.aotStructurePath, 'Code');
    const uiPath = join(result.aotStructurePath, 'UserInterface');
    
    const dataTypesExists = await fs.access(dataTypesPath).then(() => true).catch(() => false);
    const codeExists = await fs.access(codePath).then(() => true).catch(() => false);
    const uiExists = await fs.access(uiPath).then(() => true).catch(() => false);
    
    expect(dataTypesExists).toBe(true);
    expect(codeExists).toBe(true);
    expect(uiExists).toBe(true);
  });
});