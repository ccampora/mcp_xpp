Golden Rules:
1. DO NOT use Emojis in the code
2. If you are creating test suites or adhoc test file, use the clients provided in the tests/tools folder
3. You will use the Build and Run Task only, do not attempt to build differentely
4. Avoid hardcoding. If you need to hardcode, you MUST ask first
5. Any adhoc tests, misc files, outputs, and/or anything that should not be versioned, put it in the misc folder. 
6. Internal documentation must be place in docs/internal folder.

D365 Object Creation:
7. Before creating D365 objects (tables, entities, enums, forms) via MCP tools, ALWAYS read the creation recipes in docs/internal/d365-creation-recipes/ first. These contain proven parameter sets, required defaults, and known pitfalls.
   - docs/internal/d365-creation-recipes/README.md - Index and overview
   - docs/internal/d365-creation-recipes/table-field-defaults.md - Required default params per field type
   - docs/internal/d365-creation-recipes/table-creation.md - Table creation recipe
   - docs/internal/d365-creation-recipes/data-entity-with-staging.md - Data entity + staging table recipe
   - docs/internal/d365-creation-recipes/common-property-gotchas.md - Known pitfalls and solutions
8. When you discover new required parameters, patterns, or gotchas during D365 object creation, update the relevant recipe file immediately so the knowledge is not lost.