# Storage Location Update - MCP Knowledge Server

**Date:** January 22, 2026  
**Change:** Updated storage location to follow Yorizon `.knowledge` structure  
**Status:** ✅ Complete

## What Changed

### Old Structure (Deprecated)
```
.knowledge/
└── solution/
    └── taxonomy/
        ├── knowledge-graph.json
        ├── knowledge-ontology.md
        └── knowledge-model.md
```

### New Structure (Current)
```
.knowledge/
├── .ontology/                    ← Entity/relation type definitions
│   ├── knowledge-ontology.md    ← Generated ontology (3 layers, 17 types)
│   └── knowledge-model.md       ← Generated model (instances, diagrams)
├── solution/                    ← Solution layer folder (for organization)
├── delivery/                    ← Delivery layer folder (for organization)
├── knowledge-graph.json         ← Core graph data (entities, relations)
├── knowledge-index.json         ← Index metadata (optional)
└── INDEX.md                     ← Human-readable index (optional)
```

## Why This Change

The new structure:
1. ✅ **Aligns with Yorizon** - Follows the proven `.knowledge` pattern from Yorizon project
2. ✅ **Better organization** - Separates concerns (ontology, solution, delivery)
3. ✅ **More discoverable** - Root-level graph.json is easier to find
4. ✅ **Scalable** - `solution/` and `delivery/` folders can be organized further
5. ✅ **Standards-compliant** - Matches organizational knowledge management conventions

## Files Updated

1. **server.js** (lines 40-75, 153-160, 871-895)
   - Changed GRAPH_FILE path: `.knowledge/knowledge-graph.json`
   - Changed ONTOLOGY_FILE path: `.knowledge/.ontology/knowledge-ontology.md`
   - Changed MODEL_FILE path: `.knowledge/.ontology/knowledge-model.md`
   - Updated `ensureKnowledgeBaseDirs()` to create 3 directories: `.ontology/`, `solution/`, `delivery/`

2. **README.md**
   - Updated "Storage Location" section with new structure diagram
   - Reflected .ontology/ folder instead of solution/taxonomy/

3. **SCHEMA.md**
   - Updated "File Format" section
   - Added generated documentation file references

4. **QUICKSTART.md**
   - Updated "File Structure After First Use" with new layout

5. **IMPLEMENTATION.md**
   - Updated "Storage Structure" section

## Directory Creation Behavior

When the server initializes or saves the graph:

```javascript
function ensureKnowledgeBaseDirs() {
  const dirs = [
    '.knowledge/.ontology',
    '.knowledge/solution',
    '.knowledge/delivery'
  ];
  // All created if missing
}
```

**When folders are created:**
- On first server start via `loadGraph()`
- On any save via `saveGraph()`
- On documentation sync via `knowledge_docs_sync`

## Migration Guide

If you have existing data in `.knowledge/solution/taxonomy/knowledge-graph.json`:

```bash
# Backup old location
cp -r .knowledge/solution/taxonomy/* .knowledge/

# Or keep both for a transition period
```

The new location is:
- Graph data: `.knowledge/knowledge-graph.json`
- Ontology docs: `.knowledge/.ontology/knowledge-ontology.md`
- Model docs: `.knowledge/.ontology/knowledge-model.md`

## Compatibility

- ✅ **Backward compatible** in terms of file content (same JSON structure)
- ❌ **Not backward compatible** in terms of file paths (old paths won't be checked)
- 🔄 **Migration path** included above

## Next Steps

1. Delete or archive `.knowledge/solution/taxonomy/` if migrating
2. Use new paths in any custom tools or scripts
3. Verify with `knowledge_graph_read` tool that data is accessible
4. Use `knowledge_docs_sync` to regenerate documentation

## Validation

To verify the structure is correct:

```bash
# Check that folders exist after first use
ls -la .knowledge/
# Should show: .ontology/ solution/ delivery/ knowledge-graph.json

# Verify graph file
cat .knowledge/knowledge-graph.json | jq '.metadata'

# Verify generated docs
cat .knowledge/.ontology/knowledge-ontology.md
```

## References

- Yorizon `.knowledge` structure: `c:\dev\yorizon\.knowledge\`
- Schema reference: [SCHEMA.md](SCHEMA.md)
- Quick start: [QUICKSTART.md](QUICKSTART.md)
- Full documentation: [README.md](README.md)
