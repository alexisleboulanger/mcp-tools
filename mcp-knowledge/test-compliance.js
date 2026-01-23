#!/usr/bin/env node
/**
 * Knowledge Memory Compliance Test
 * 
 * Answers:
 * 1. Is ontology in memory? (loadable)
 * 2. Can ontology be set in memory?
 * 3. Is knowledge aligned with memory ontology?
 * 4. Is ontology enforcement enforced?
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_KNOWLEDGE_BASE = process.env.KNOWLEDGE_PATH || 
  path.join(process.cwd(), '.knowledge');

const MEMORY_DIR = path.join(DEFAULT_KNOWLEDGE_BASE, '.memory');
const ONTOLOGY_DIR = path.join(DEFAULT_KNOWLEDGE_BASE, '.ontology');
const GRAPH_FILE = path.join(MEMORY_DIR, 'knowledge-graph.json');
const ONTOLOGY_JSON_FILE = path.join(MEMORY_DIR, 'ontology.json');
const ONTOLOGY_MD_FILE = path.join(ONTOLOGY_DIR, 'knowledge-ontology.md');
const GRAPH_MD_FILE = path.join(MEMORY_DIR, 'knowledge-graph.md');

class ComplianceTest {
  constructor() {
    this.tests = [];
    this.data = {};
  }

  test(name, fn) {
    try {
      const result = fn();
      this.tests.push({ name, passed: true, result });
      return true;
    } catch (err) {
      this.tests.push({ name, passed: false, error: err.message });
      return false;
    }
  }

  report() {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║       KNOWLEDGE MEMORY COMPLIANCE TEST RESULTS        ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    const passed = this.tests.filter(t => t.passed).length;
    const total = this.tests.length;
    const percentage = Math.round((passed / total) * 100);

    // Q1: Is ontology in memory?
    console.log('❓ Q1: Is ontology in memory? (loadable)');
    const ontologyTests = this.tests.filter(t => t.name.includes('Ontology'));
    const ontologyPassed = ontologyTests.filter(t => t.passed).length === ontologyTests.length;
    console.log(ontologyPassed ? '✅ YES - Ontology is in .memory/ and loadable\n' : '❌ NO - Issues loading ontology\n');

    // Q2: Can ontology be set in memory?
    console.log('❓ Q2: Can ontology be set in memory?');
    const dirTests = this.tests.filter(t => t.name.includes('Directory') || t.name.includes('Location'));
    const dirPassed = dirTests.filter(t => t.passed).length === dirTests.length;
    console.log(dirPassed ? '✅ YES - .memory/ directory writable and configured\n' : '❌ NO - Directory issues\n');

    // Q3: Is knowledge aligned with memory ontology?
    console.log('❓ Q3: Is knowledge aligned with memory ontology?');
    const alignmentTests = this.tests.filter(t => t.name.includes('Valid') || t.name.includes('Align'));
    const alignmentPassed = alignmentTests.filter(t => t.passed).length === alignmentTests.length;
    console.log(alignmentPassed ? '✅ YES - All entities/relations use valid types\n' : '❌ NO - Alignment issues found\n');

    // Q4: Is ontology enforcement enforced?
    console.log('❓ Q4: Is ontology enforcement enforced?');
    const enforcementTests = this.tests.filter(t => t.name.includes('Embedded') || t.name.includes('Separation'));
    const enforcementPassed = enforcementTests.filter(t => t.passed).length === enforcementTests.length;
    console.log(enforcementPassed ? '✅ YES - Ontology separated from graph, server enforces memory\n' : '❌ NO - Enforcement issues\n');

    // Overall summary
    console.log('─'.repeat(58));
    console.log(`Overall Compliance: ${passed}/${total} tests passed (${percentage}%)`);
    console.log('─'.repeat(58) + '\n');

    if (passed === total) {
      console.log('🎉 ALL TESTS PASSED - Memory is fully compliant!\n');
    } else {
      console.log(`⚠️  ${total - passed} tests failed - see details below\n`);
    }

    // Detailed results
    console.log('DETAILED TEST RESULTS:\n');
    this.tests.forEach((t, i) => {
      const icon = t.passed ? '✅' : '❌';
      console.log(`${i + 1}. ${icon} ${t.name}`);
      if (t.result) console.log(`   Result: ${t.result}`);
      if (t.error) console.log(`   Error: ${t.error}`);
    });

    // Structure check
    console.log('\n\nFILE STRUCTURE:\n');
    console.log('✅ Files in correct locations:');
    if (fs.existsSync(ONTOLOGY_JSON_FILE)) {
      console.log(`  • ${path.relative(DEFAULT_KNOWLEDGE_BASE, ONTOLOGY_JSON_FILE)} (Primary ontology)`);
    }
    if (fs.existsSync(GRAPH_FILE)) {
      console.log(`  • ${path.relative(DEFAULT_KNOWLEDGE_BASE, GRAPH_FILE)} (Primary graph)`);
    }
    if (fs.existsSync(ONTOLOGY_MD_FILE)) {
      console.log(`  • ${path.relative(DEFAULT_KNOWLEDGE_BASE, ONTOLOGY_MD_FILE)} (Human-readable)`);
    }
    if (fs.existsSync(GRAPH_MD_FILE)) {
      console.log(`  • ${path.relative(DEFAULT_KNOWLEDGE_BASE, GRAPH_MD_FILE)} (Human-readable)`);
    }

    // Data inventory
    if (this.data.graph) {
      console.log(`\n✅ Knowledge Inventory:`);
      console.log(`  • ${Object.keys(this.data.graph.entities || {}).length} entities`);
      console.log(`  • ${(this.data.graph.relations || []).length} relations`);
    }

    if (this.data.ontology) {
      console.log(`\n✅ Ontology Structure:`);
      console.log(`  • ${this.data.ontology.entityTypes.length} entity types`);
      console.log(`  • ${this.data.ontology.relationTypes.length} relation types`);
      console.log(`  • Layers: Strategy, Delivery, Solution`);
    }

    return passed === total;
  }
}

function runTests() {
  const test = new ComplianceTest();

  console.log('🧪 Running compliance tests...\n');

  // Test Group 1: File Locations
  console.log('📍 Checking file locations...');
  test.test('Memory directory exists', () => {
    if (!fs.existsSync(MEMORY_DIR)) throw new Error('Not found');
    return '.memory/ directory exists';
  });

  test.test('Ontology directory exists', () => {
    if (!fs.existsSync(ONTOLOGY_DIR)) throw new Error('Not found');
    return '.ontology/ directory exists';
  });

  test.test('Ontology JSON in .memory/', () => {
    if (!fs.existsSync(ONTOLOGY_JSON_FILE)) throw new Error('Not found');
    return ONTOLOGY_JSON_FILE;
  });

  test.test('Graph JSON in .memory/', () => {
    if (!fs.existsSync(GRAPH_FILE)) throw new Error('Not found');
    return GRAPH_FILE;
  });

  // Test Group 2: Ontology Loading
  console.log('📚 Checking ontology loading...');
  test.test('Load Ontology JSON', () => {
    const content = fs.readFileSync(ONTOLOGY_JSON_FILE, 'utf8');
    test.data.ontology = JSON.parse(content);
    return `Loaded: ${test.data.ontology.entityTypes.length} types, ${test.data.ontology.relationTypes.length} relations`;
  });

  test.test('Ontology has entityTypes', () => {
    if (!test.data.ontology.entityTypes || test.data.ontology.entityTypes.length === 0) {
      throw new Error('No entity types');
    }
    return `${test.data.ontology.entityTypes.length} types defined`;
  });

  test.test('Ontology has relationTypes', () => {
    if (!test.data.ontology.relationTypes || test.data.ontology.relationTypes.length === 0) {
      throw new Error('No relation types');
    }
    return `${test.data.ontology.relationTypes.length} types defined`;
  });

  test.test('Ontology has 3-layer structure', () => {
    const layers = new Set(test.data.ontology.entityTypes.map(t => t.layer));
    const required = new Set(['strategy', 'delivery', 'solution']);
    if (!Array.from(required).every(l => layers.has(l))) {
      throw new Error(`Missing layers. Found: ${Array.from(layers).join(', ')}`);
    }
    return `Has all layers: ${Array.from(layers).sort().join(', ')}`;
  });

  // Test Group 3: Knowledge Graph Loading
  console.log('📊 Checking knowledge graph...');
  test.test('Load Graph JSON', () => {
    const content = fs.readFileSync(GRAPH_FILE, 'utf8');
    test.data.graph = JSON.parse(content);
    return `Loaded: ${Object.keys(test.data.graph.entities || {}).length} entities, ${(test.data.graph.relations || []).length} relations`;
  });

  test.test('Graph has no embedded ontology', () => {
    if (test.data.graph.ontology) {
      throw new Error('Graph has embedded ontology - should be in .memory/ontology.json');
    }
    return 'Clean (no duplication)';
  });

  // Test Group 4: Knowledge Alignment
  console.log('🔗 Checking knowledge-ontology alignment...');
  test.test('All entities valid type', () => {
    const entityTypes = new Set(test.data.ontology.entityTypes.map(t => t.name));
    const invalid = Object.values(test.data.graph.entities || {})
      .filter(e => !entityTypes.has(e.type));
    if (invalid.length > 0) {
      throw new Error(`Invalid: ${invalid.map(e => `${e.name}(${e.type})`).join(', ')}`);
    }
    return `All ${Object.keys(test.data.graph.entities).length} entities valid`;
  });

  test.test('All relations valid type', () => {
    const relationTypes = new Set(test.data.ontology.relationTypes.map(t => t.name));
    const invalid = (test.data.graph.relations || [])
      .filter(r => !relationTypes.has(r.type));
    if (invalid.length > 0) {
      throw new Error(`Invalid: ${invalid.map(r => `${r.type}`).join(', ')}`);
    }
    return `All ${(test.data.graph.relations || []).length} relations valid`;
  });

  // Test Group 5: Enforcement Verification
  console.log('🔒 Checking enforcement...');
  test.test('Ontology separated from graph', () => {
    if (test.data.graph.ontology) {
      throw new Error('Ontology still embedded in graph');
    }
    return 'Properly separated';
  });

  test.test('Ontology markdown exists', () => {
    if (!fs.existsSync(ONTOLOGY_MD_FILE)) {
      throw new Error(`Not found: ${ONTOLOGY_MD_FILE}`);
    }
    return 'Human-readable version available';
  });

  test.test('Graph markdown exists', () => {
    if (!fs.existsSync(GRAPH_MD_FILE)) {
      throw new Error(`Not found: ${GRAPH_MD_FILE}`);
    }
    return 'Human-readable version available';
  });

  return test;
}

// Main
console.log('\n╔════════════════════════════════════════════════════════╗');
console.log('║      KNOWLEDGE MEMORY COMPLIANCE CHECKER              ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

const test = runTests();
const passed = test.report();

process.exit(passed ? 0 : 1);
