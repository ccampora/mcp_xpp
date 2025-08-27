# Unified Developer Experience Guide for D365 F&O Object Creation

## Table of Contents

1. [Overview](#overview)
2. [Environment Structure](#environment-structure)
3. [Model Creation](#model-creation)
4. [Project Creation (Pending)](#project-creation-pending)
5. [Object Creation Guide](#object-creation-guide)
6. [Implementation Examples](#implementation-examples)
7. [Best Practices](#best-practices)

## Overview

This guide provides comprehensive instructions for creating models and all types of D365 Finance and Operations objects in the Unified Developer Experience environment.

The Unified Developer Experience uses a different folder structure compared to the traditional PackagesLocalDirectory approach, with metadata stored in a separate CustomXppMetadata directory.

## Environment Structure

### Base Directory Structure

```
C:\CustomXppMetadata[randomstring]\
├── ModelName1\
│   ├── ModelName1\                    # Nested model content
│   │   ├── AxClass\                   # Classes
│   │   ├── AxTable\                   # Tables
│   │   ├── AxForm\                    # Forms
│   │   └── [Other AOT folders]        # Based on object types
│   ├── bin\                           # Build output
│   ├── Descriptor\                    # Model descriptors
│   └── XppMetadata\                   # Metadata cache
├── ModelName2\
└── ...
```

### Key Characteristics

- **Double-nested structure**: Each model has a folder with the same name inside
- **Separate metadata location**: Independent from PackagesLocalDirectory
- **Delta-based structure**: Uses Delta folders for customizations
- **XML-based files**: All objects stored as XML with embedded source code
- **No project files in metadata**: Project management is handled externally

## Model Creation

### Step 1: Create Model Structure

For creating a model named `MyModel`:

```
C:\CustomXppMetadata[randomstring]\MyModel\
├── MyModel\                           # Nested model content
│   ├── AxClass\                       # Classes container
│   │   └── Delta\                     # Delta folder (can be empty)
│   ├── AxTable\                       # Tables container
│   │   └── Delta\
│   └── [Other AxObject folders]       # Based on needs
├── bin\                               # Build directory
├── Descriptor\                        # Model metadata
│   └── ModelDescriptor.xml
└── XppMetadata\                       # Metadata cache
```

### Step 2: Model Descriptor File

**Location:** `MyModel\Descriptor\ModelDescriptor.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<ModelDescriptor>
  <Name>MyModel</Name>
  <Publisher>YourCompany</Publisher>
  <Layer>usr</Layer>
  <Description>Custom model for business requirements</Description>
  <Version>1.0.0.0</Version>
</ModelDescriptor>
```

## Project Creation (Pending)

> **Note**: Project creation with .rnrproj files is specific to Visual Studio integration and is managed outside of the metadata directory structure. Projects are typically created in user-defined locations separate from the CustomXppMetadata folder.
>
> **Status**: Project creation functionality is pending implementation as it depends on:
> - Available build tools in the target environment
> - Integration requirements with VSCode vs Visual Studio
> - User workflow preferences for project organization
>
> The MCP X++ server currently focuses on object creation within the metadata structure, which is environment-agnostic and works effectively with VSCode-based development workflows.

## Object Creation Guide

Based on the AOT structure configuration, here's how to create each type of object:

### Data Types

#### Base Enums (AxEnum)

**Location:** `ModelName\ModelName\AxEnum\EnumName.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxEnum xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MyEnum</Name>
  <EnumValues>
    <AxEnumValue>
      <Name>Value1</Name>
      <Value>0</Value>
    </AxEnumValue>
    <AxEnumValue>
      <Name>Value2</Name>
      <Value>1</Value>
    </AxEnumValue>
  </EnumValues>
</AxEnum>
```

#### Base Enum Extensions (AxEnumExtension)

**Location:** `ModelName\ModelName\AxEnumExtension\EnumName_Extension.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxEnumExtension xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MyEnum_Extension</Name>
  <EnumName>MyEnum</EnumName>
  <EnumValues>
    <AxEnumValue>
      <Name>NewValue</Name>
      <Value>2</Value>
    </AxEnumValue>
  </EnumValues>
</AxEnumExtension>
```

#### Extended Data Types (AxEdt)

**Location:** `ModelName\ModelName\AxEdt\EdtName.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxEdt xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MyEdt</Name>
  <Extends>str</Extends>
  <StringSize>50</StringSize>
  <Label>@MyLabel:MyEdtLabel</Label>
  <HelpText>@MyLabel:MyEdtHelp</HelpText>
</AxEdt>
```

#### Extended Data Type Extensions (AxEdtExtension)

**Location:** `ModelName\ModelName\AxEdtExtension\EdtName_Extension.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxEdtExtension xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MyEdt_Extension</Name>
  <EdtName>MyEdt</EdtName>
  <StringSize>100</StringSize>
</AxEdtExtension>
```

### Data Model

#### Tables (AxTable)

**Location:** `ModelName\ModelName\AxTable\TableName.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxTable xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MyTable</Name>
  <Fields>
    <AxTableField i:type="AxTableFieldString">
      <Name>MyField</Name>
      <ExtendedDataType>Name</ExtendedDataType>
      <StringSize>60</StringSize>
    </AxTableField>
    <AxTableField i:type="AxTableFieldInt">
      <Name>MyIntField</Name>
      <ExtendedDataType>Integer</ExtendedDataType>
    </AxTableField>
  </Fields>
  <FullTextIndexes />
  <Indexes>
    <AxTableIndex>
      <Name>MyFieldIdx</Name>
      <Fields>
        <AxTableIndexField>
          <DataField>MyField</DataField>
        </AxTableIndexField>
      </Fields>
    </AxTableIndex>
  </Indexes>
  <Relations />
  <StateMachines />
  <SourceCode>
    <Methods>
      <Method>
        <Name>insert</Name>
        <Source><![CDATA[
public void insert()
{
    super();
    // Custom logic here
}
        ]]></Source>
      </Method>
    </Methods>
  </SourceCode>
</AxTable>
```

#### Table Extensions (AxTableExtension)

**Location:** `ModelName\ModelName\AxTableExtension\TableName_Extension.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxTableExtension xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MyTable_Extension</Name>
  <TableName>MyTable</TableName>
  <Fields>
    <AxTableField i:type="AxTableFieldString">
      <Name>NewField</Name>
      <ExtendedDataType>Description</ExtendedDataType>
    </AxTableField>
  </Fields>
</AxTableExtension>
```

#### Views (AxView)

**Location:** `ModelName\ModelName\AxView\ViewName.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxView xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MyView</Name>
  <ViewBaseType>Union</ViewBaseType>
  <Metadata>
    <Name>MyView</Name>
    <Fields>
      <AxViewField>
        <DataSource>MyTable</DataSource>
        <DataField>MyField</DataField>
      </AxViewField>
    </Fields>
    <DataSources>
      <AxViewDataSource>
        <Name>MyTable</Name>
        <Table>MyTable</Table>
      </AxViewDataSource>
    </DataSources>
  </Metadata>
</AxView>
```

#### Queries (AxQuery)

**Location:** `ModelName\ModelName\AxQuery\QueryName.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxQuery xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MyQuery</Name>
  <DataSources>
    <AxQuerySimpleRootDataSource>
      <Name>MyTable</Name>
      <Table>MyTable</Table>
      <Fields>
        <AxQuerySimpleDataSourceField>
          <DataField>MyField</DataField>
        </AxQuerySimpleDataSourceField>
      </Fields>
    </AxQuerySimpleRootDataSource>
  </DataSources>
</AxQuery>
```

#### Data Entities (AxDataEntity)

**Location:** `ModelName\ModelName\AxDataEntity\DataEntityName.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxDataEntity xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MyDataEntity</Name>
  <EntityCategory>Master</EntityCategory>
  <DataManagementEnabled>Yes</DataManagementEnabled>
  <PublicCollectionName>MyDataEntities</PublicCollectionName>
  <PublicEntityName>MyDataEntity</PublicEntityName>
  <Fields>
    <AxDataEntityField>
      <Name>MyField</Name>
      <DataSource>MyTable</DataSource>
      <DataField>MyField</DataField>
      <IsComputed>No</IsComputed>
      <IsMandatory>Yes</IsMandatory>
    </AxDataEntityField>
  </Fields>
  <DataSources>
    <AxDataEntityDataSource>
      <Name>MyTable</Name>
      <Table>MyTable</Table>
      <IsReadOnly>No</IsReadOnly>
    </AxDataEntityDataSource>
  </DataSources>
</AxDataEntity>
```

### Code

#### Classes (AxClass)

**Location:** `ModelName\ModelName\AxClass\ClassName.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxClass xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MyClass</Name>
  <SourceCode>
    <Declaration><![CDATA[
/// <summary>
/// My custom class for business logic
/// </summary>
public class MyClass
{
    private str myField;
}
    ]]></Declaration>
    <Methods>
      <Method>
        <Name>new</Name>
        <Source><![CDATA[
/// <summary>
/// Constructor
/// </summary>
public void new()
{
    super();
}
        ]]></Source>
      </Method>
      <Method>
        <Name>setMyField</Name>
        <Source><![CDATA[
/// <summary>
/// Sets the myField value
/// </summary>
/// <param name="_value">The value to set</param>
public void setMyField(str _value)
{
    myField = _value;
}
        ]]></Source>
      </Method>
      <Method>
        <Name>getMyField</Name>
        <Source><![CDATA[
/// <summary>
/// Gets the myField value
/// </summary>
/// <returns>The myField value</returns>
public str getMyField()
{
    return myField;
}
        ]]></Source>
      </Method>
    </Methods>
  </SourceCode>
</AxClass>
```

#### Macros (AxMacro)

**Location:** `ModelName\ModelName\AxMacro\MacroName.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxMacro xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MyMacro</Name>
  <Source><![CDATA[
#localmacro.MyConstant
'MyConstantValue'
#endmacro

#localmacro.MyFunction
    static void myFunction()
    {
        info("Macro function executed");
    }
#endmacro
  ]]></Source>
</AxMacro>
```

### User Interface

#### Forms (AxForm)

**Location:** `ModelName\ModelName\AxForm\FormName.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxForm xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MyForm</Name>
  <FormTemplate>Details</FormTemplate>
  <TitleDataSource>MyTable</TitleDataSource>
  <DataSources>
    <AxFormDataSource>
      <Name>MyTable</Name>
      <Table>MyTable</Table>
      <Fields>
        <AxFormDataSourceField>
          <DataField>MyField</DataField>
        </AxFormDataSourceField>
      </Fields>
    </AxFormDataSource>
  </DataSources>
  <Design>
    <Caption>My Form</Caption>
    <Pattern>Details</Pattern>
    <PatternVersion>1.0</PatternVersion>
    <Controls>
      <AxFormControl i:type="AxFormActionPaneControl">
        <Name>ActionPane</Name>
        <Type>ActionPane</Type>
      </AxFormControl>
      <AxFormControl i:type="AxFormGroupControl">
        <Name>DetailsHeader</Name>
        <Type>Group</Type>
        <Controls>
          <AxFormControl i:type="AxFormStringControl">
            <Name>MyField</Name>
            <Type>String</Type>
            <DataSource>MyTable</DataSource>
            <DataField>MyField</DataField>
          </AxFormControl>
        </Controls>
      </AxFormControl>
    </Controls>
  </Design>
  <SourceCode>
    <Methods />
  </SourceCode>
</AxForm>
```

#### Form Extensions (AxFormExtension)

**Location:** `ModelName\ModelName\AxFormExtension\FormName_Extension.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxFormExtension xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MyForm_Extension</Name>
  <FormName>MyForm</FormName>
  <DataSources>
    <AxFormDataSourceExtension>
      <Name>MyTable</Name>
      <Fields>
        <AxFormDataSourceField>
          <DataField>NewField</DataField>
        </AxFormDataSourceField>
      </Fields>
    </AxFormDataSourceExtension>
  </DataSources>
</AxFormExtension>
```

#### Menu Items (AxMenuItems)

**Location:** `ModelName\ModelName\AxMenuItems\MenuItemName.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxMenuItems xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <MenuItemDisplays>
    <AxMenuItemDisplay>
      <Name>MyMenuItemDisplay</Name>
      <Label>@MyLabel:MyMenuLabel</Label>
      <Object>MyForm</Object>
      <ObjectType>Form</ObjectType>
    </AxMenuItemDisplay>
  </MenuItemDisplays>
  <MenuItemOutputs>
    <AxMenuItemOutput>
      <Name>MyMenuItemOutput</Name>
      <Label>@MyLabel:MyReportLabel</Label>
      <Object>MyReport</Object>
      <ObjectType>Report</ObjectType>
    </AxMenuItemOutput>
  </MenuItemOutputs>
  <MenuItemActions>
    <AxMenuItemAction>
      <Name>MyMenuItemAction</Name>
      <Label>@MyLabel:MyActionLabel</Label>
      <Object>MyClass</Object>
      <ObjectType>Class</ObjectType>
    </AxMenuItemAction>
  </MenuItemActions>
</AxMenuItems>
```

#### Menus (AxMenu)

**Location:** `ModelName\ModelName\AxMenu\MenuName.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxMenu xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MyMenu</Name>
  <Label>@MyLabel:MyMenuLabel</Label>
  <SubMenus>
    <AxMenuReference>
      <Name>MySubMenu</Name>
      <MenuName>MySubMenu</MenuName>
    </AxMenuReference>
  </SubMenus>
  <MenuItems>
    <AxMenuItemReference>
      <Name>MyMenuItem</Name>
      <MenuItemName>MyMenuItemDisplay</MenuItemName>
      <MenuItemType>Display</MenuItemType>
    </AxMenuItemReference>
  </MenuItems>
</AxMenu>
```

### Security

#### Security Roles (AxSecurityRole)

**Location:** `ModelName\ModelName\AxSecurityRole\RoleName.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxSecurityRole xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MySecurityRole</Name>
  <Label>@MyLabel:MyRoleLabel</Label>
  <Description>@MyLabel:MyRoleDescription</Description>
  <Duties>
    <AxSecurityRoleDuty>
      <DutyName>MySecurityDuty</DutyName>
    </AxSecurityRoleDuty>
  </Duties>
</AxSecurityRole>
```

#### Security Duties (AxSecurityDuty)

**Location:** `ModelName\ModelName\AxSecurityDuty\DutyName.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxSecurityDuty xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MySecurityDuty</Name>
  <Label>@MyLabel:MyDutyLabel</Label>
  <Description>@MyLabel:MyDutyDescription</Description>
  <Privileges>
    <AxSecurityDutyPrivilege>
      <PrivilegeName>MySecurityPrivilege</PrivilegeName>
    </AxSecurityDutyPrivilege>
  </Privileges>
</AxSecurityDuty>
```

#### Security Privileges (AxSecurityPrivilege)

**Location:** `ModelName\ModelName\AxSecurityPrivilege\PrivilegeName.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxSecurityPrivilege xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MySecurityPrivilege</Name>
  <Label>@MyLabel:MyPrivilegeLabel</Label>
  <Description>@MyLabel:MyPrivilegeDescription</Description>
  <EntryPoints>
    <AxSecurityEntryPointReference>
      <Name>MyForm</Name>
      <ObjectName>MyForm</ObjectName>
      <ObjectType>Form</ObjectType>
      <AccessLevel>Read</AccessLevel>
    </AxSecurityEntryPointReference>
  </EntryPoints>
</AxSecurityPrivilege>
```

### Analytics

#### Reports (AxReport)

**Location:** `ModelName\ModelName\AxReport\ReportName.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxReport xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MyReport</Name>
  <DataSets>
    <AxReportDataSet>
      <Name>MyDataSet</Name>
      <Query>MyQuery</Query>
      <Fields>
        <AxReportDataSetField>
          <Name>MyField</Name>
          <DataField>MyField</DataField>
        </AxReportDataSetField>
      </Fields>
    </AxReportDataSet>
  </DataSets>
  <Designs>
    <AxReportDesign>
      <Name>ReportDesign</Name>
      <Layout>
        <LayoutType>RDLC</LayoutType>
      </Layout>
    </AxReportDesign>
  </Designs>
</AxReport>
```

### Services

#### Service Groups (AxServiceGroup)

**Location:** `ModelName\ModelName\AxServiceGroup\ServiceGroupName.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxServiceGroup xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MyServiceGroup</Name>
  <Label>@MyLabel:MyServiceGroupLabel</Label>
  <Description>@MyLabel:MyServiceGroupDescription</Description>
  <Services>
    <AxServiceGroupService>
      <Service>MyService</Service>
    </AxServiceGroupService>
  </Services>
</AxServiceGroup>
```

#### Services (AxService)

**Location:** `ModelName\ModelName\AxService\ServiceName.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxService xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MyService</Name>
  <Class>MyServiceClass</Class>
  <Label>@MyLabel:MyServiceLabel</Label>
  <Description>@MyLabel:MyServiceDescription</Description>
  <Operations>
    <AxServiceOperation>
      <Name>myOperation</Name>
      <Method>myOperationMethod</Method>
      <Label>@MyLabel:MyOperationLabel</Label>
    </AxServiceOperation>
  </Operations>
</AxService>
```

### Configuration

#### Configuration Keys (AxConfigurationKey)

**Location:** `ModelName\ModelName\AxConfigurationKey\ConfigKeyName.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxConfigurationKey xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MyConfigurationKey</Name>
  <Label>@MyLabel:MyConfigKeyLabel</Label>
  <ParentKey>ApplicationFoundation</ParentKey>
</AxConfigurationKey>
```

### Resources and Labels

#### Label Files

**Location:** `ModelName\ModelName\LabelFiles\MyLabel_en-US.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxLabelFile xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MyLabel_en-US</Name>
  <LanguageId>en-US</LanguageId>
  <Labels>
    <AxLabel>
      <Name>@MyLabel:MyClassLabel</Name>
      <LabelId>MyClassLabel</LabelId>
      <Label>My Class</Label>
      <Description>Label for My Class</Description>
    </AxLabel>
  </Labels>
</AxLabelFile>
```

#### Resources

**Location:** `ModelName\ModelName\Resources\MyResource.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<AxResource xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>MyResource</Name>
  <File>MyImage.png</File>
  <ResourceType>Image</ResourceType>
</AxResource>
```

## Implementation Examples

### TypeScript Implementation for Object Creation

```typescript
interface ObjectCreationConfig {
  basePath: string;
  modelName: string;
  objectName: string;
  objectType: string;
}

class UnifiedDeveloperExperienceCreator {
  
  async createModel(basePath: string, modelName: string): Promise<void> {
    const modelPath = join(basePath, modelName);
    const nestedModelPath = join(modelPath, modelName);
    
    // Create main model structure
    await fs.mkdir(join(modelPath, "bin"), { recursive: true });
    await fs.mkdir(join(modelPath, "Descriptor"), { recursive: true });
    await fs.mkdir(join(modelPath, "XppMetadata"), { recursive: true });
    
    // Create nested model content structure with common AOT folders
    const commonFolders = [
      "AxClass", "AxTable", "AxForm", "AxEnum", "AxEdt",
      "AxQuery", "AxDataEntity", "AxReport", "AxMenuItems",
      "AxMenu", "AxSecurityRole", "AxSecurityDuty", 
      "AxSecurityPrivilege", "AxMacro"
    ];
    
    for (const folder of commonFolders) {
      await fs.mkdir(join(nestedModelPath, folder, "Delta"), { recursive: true });
    }
    
    // Create model descriptor
    const descriptor = this.generateModelDescriptor(modelName);
    await fs.writeFile(join(modelPath, "Descriptor", "ModelDescriptor.xml"), descriptor);
  }
  
  async createObject(config: ObjectCreationConfig): Promise<void> {
    const { basePath, modelName, objectName, objectType } = config;
    
    // Determine folder based on object type
    const folderMapping = this.getObjectFolderMapping();
    const objectFolder = folderMapping[objectType];
    
    if (!objectFolder) {
      throw new Error(`Unsupported object type: ${objectType}`);
    }
    
    // Create directory structure if it doesn't exist
    const objectPath = join(basePath, modelName, modelName, objectFolder);
    await fs.mkdir(objectPath, { recursive: true });
    await fs.mkdir(join(objectPath, "Delta"), { recursive: true });
    
    // Generate object XML
    const objectXml = this.generateObjectXml(objectName, objectType);
    const filePath = join(objectPath, `${objectName}.xml`);
    await fs.writeFile(filePath, objectXml);
  }
  
  private generateModelDescriptor(modelName: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<ModelDescriptor>
  <Name>${modelName}</Name>
  <Publisher>ccampora_microsoft</Publisher>
  <Layer>usr</Layer>
  <Description>Model ${modelName} created on ${new Date().toISOString().split('T')[0]}</Description>
  <Version>1.0.0.0</Version>
</ModelDescriptor>`;
  }
  
  private getObjectFolderMapping(): Record<string, string> {
    return {
      'CLASSES': 'AxClass',
      'TABLES': 'AxTable',
      'FORMS': 'AxForm',
      'BASE_ENUMS': 'AxEnum',
      'EXTENDED_DATA_TYPES': 'AxEdt',
      'QUERIES': 'AxQuery',
      'DATA_ENTITIES': 'AxDataEntity',
      'REPORTS': 'AxReport',
      'MENU_ITEMS': 'AxMenuItems',
      'MENUS': 'AxMenu',
      'SECURITY_ROLES': 'AxSecurityRole',
      'SECURITY_DUTIES': 'AxSecurityDuty',
      'SECURITY_PRIVILEGES': 'AxSecurityPrivilege',
      'SERVICE_GROUPS': 'AxServiceGroup',
      'SERVICES': 'AxService',
      'MACROS': 'AxMacro',
      'WORKFLOWS': 'AxWorkflow',
      'PERSPECTIVES': 'AxPerspective',
      'KPIS': 'AxKpi',
      'VIEWS': 'AxView',
      'MAPS': 'AxMap',
      'CONFIGURATION_KEYS': 'AxConfigurationKey',
      'SECURITY_KEYS': 'AxSecurityKey',
      'TILES': 'AxTile'
    };
  }
  
  private generateObjectXml(objectName: string, objectType: string): string {
    const templates = {
      'CLASSES': this.generateClassXml(objectName),
      'TABLES': this.generateTableXml(objectName),
      'FORMS': this.generateFormXml(objectName),
      'BASE_ENUMS': this.generateEnumXml(objectName),
      // Add other templates as needed
    };
    
    return templates[objectType] || this.generateGenericXml(objectName, objectType);
  }
  
  private generateClassXml(className: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<AxClass xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>${className}</Name>
  <SourceCode>
    <Declaration><![CDATA[
/// <summary>
/// ${className} class
/// </summary>
public class ${className}
{
}
    ]]></Declaration>
    <Methods>
      <Method>
        <Name>classDeclaration</Name>
        <Source><![CDATA[
/// <summary>
/// Class declaration
/// </summary>
public static void classDeclaration()
{
    // Implementation here
}
        ]]></Source>
      </Method>
    </Methods>
  </SourceCode>
</AxClass>`;
  }
  
  private generateTableXml(tableName: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<AxTable xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>${tableName}</Name>
  <Fields>
    <AxTableField i:type="AxTableFieldString">
      <Name>Name</Name>
      <ExtendedDataType>Name</ExtendedDataType>
      <StringSize>60</StringSize>
    </AxTableField>
  </Fields>
  <FullTextIndexes />
  <Indexes />
  <Relations />
  <StateMachines />
  <SourceCode>
    <Methods />
  </SourceCode>
</AxTable>`;
  }
  
  private generateGenericXml(objectName: string, objectType: string): string {
    const elementName = objectType.replace('_', '');
    return `<?xml version="1.0" encoding="utf-8"?>
<Ax${elementName} xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Name>${objectName}</Name>
  <!-- Object-specific properties will be added here -->
</Ax${elementName}>`;
  }
}
```

### Example Usage

```typescript
async function createCompleteModel() {
  const creator = new UnifiedDeveloperExperienceCreator();
  const basePath = "C:\\CustomXppMetadata1x4ye02p.ocz";
  
  // Create model structure first
  await creator.createModel(basePath, "MyModel");
  
  // Create various objects
  await creator.createObject({
    basePath,
    modelName: "MyModel",
    objectName: "MyBusinessClass",
    objectType: "CLASSES"
  });
  
  await creator.createObject({
    basePath,
    modelName: "MyModel",
    objectName: "MyBusinessTable", 
    objectType: "TABLES"
  });
  
  await creator.createObject({
    basePath,
    modelName: "MyModel",
    objectName: "MyBusinessForm",
    objectType: "FORMS"
  });
}
```

## Best Practices

### Naming Conventions

1. **Models**: Use PascalCase, descriptive names (e.g., `FleetManagement`, `InventoryControl`)
2. **Objects**: Follow D365 naming conventions:
   - Classes: PascalCase (e.g., `FleetVehicleManager`)
   - Tables: PascalCase (e.g., `FleetVehicleTable`)
   - Forms: PascalCase (e.g., `FleetVehicleForm`)
   - Enums: PascalCase (e.g., `FleetVehicleType`)

### Folder Organization

1. **Logical Grouping**: Group related objects in the same model
2. **Dependency Management**: Keep dependent objects in the same model when possible
3. **Extension Separation**: Place extensions in separate models from base objects
4. **Security Separation**: Keep security objects in dedicated models

### Model Management

1. **Single Responsibility**: Each model should have a focused purpose
2. **Minimal Dependencies**: Only reference necessary models
3. **Layer Awareness**: Respect X++ layer hierarchy
4. **Version Control**: Use meaningful commit messages for model changes

### VSCode Integration

1. **File Watching**: Monitor changes to XML files for live updates
2. **IntelliSense**: Leverage XML schemas for code completion
3. **Search Integration**: Use VSCode's search capabilities across metadata files
4. **Extension Development**: Consider VSCode extensions for enhanced X++ development

### Performance Considerations

1. **Index Strategy**: Create appropriate indexes for tables
2. **Query Optimization**: Design efficient queries
3. **Caching Strategy**: Implement proper caching where needed
4. **Resource Management**: Clean up resources properly

## Conclusion

This guide provides the foundation for creating D365 F&O objects in the Unified Developer Experience environment. Each object type has its specific XML structure and placement requirements, but all follow the same general pattern of XML metadata with embedded source code in CDATA sections.

Remember to:
- Always maintain proper folder structure within models
- Follow naming conventions consistently
- Keep models focused and organized
- Test objects thoroughly in development environments
- Document custom implementations properly

The MCP X++ server can leverage this structure to provide intelligent object creation and management capabilities within VSCode, independent of Visual Studio project files and build tools.