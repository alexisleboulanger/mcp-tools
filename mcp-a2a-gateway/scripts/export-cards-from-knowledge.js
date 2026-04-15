#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_CARDS_DIR, ensureCardsDir, writeAgentCard } = require('../registry');

const KNOWLEDGE_PATH = process.env.KNOWLEDGE_PATH || 'C:/dev/yorizon/.knowledge';
const GRAPH_PATH = path.join(KNOWLEDGE_PATH, '.memory', 'knowledge-graph.json');
const CARDS_DIR = process.env.A2A_AGENT_CARDS_PATH || DEFAULT_CARDS_DIR;
const BASE_PORT = Number(process.env.A2A_ENDPOINT_BASE_PORT || 8900);

function loadGraph() {
  if (!fs.existsSync(GRAPH_PATH)) {
    throw new Error(`Knowledge graph not found: ${GRAPH_PATH}`);
  }
  return JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
}

function isDeprecatedEntity(entity) {
  return (entity?.observations || []).some((obs) => String(obs).toLowerCase().includes('status=deprecated'));
}

function activeAgents(graph) {
  return Object.values(graph.entities || {})
    .filter((e) => e.type === 'Agent')
    .filter((e) => !isDeprecatedEntity(e));
}

function relationsFrom(graph, from, type) {
  return (graph.relations || []).filter((r) => r.from === from && r.type === type).map((r) => r.to);
}

function skillsFor(entity) {
  const baseName = String(entity.name || 'Agent');
  const skillId = baseName
    .replace(/Agent$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .toLowerCase();

  return [
    {
      id: skillId,
      name: baseName,
      description: entity.observations?.[0] || `${baseName} capability`,
      inputModes: ['text/plain'],
      outputModes: ['text/markdown'],
    },
  ];
}

function cardFromEntity(graph, entity, index) {
  const delegatesTo = relationsFrom(graph, entity.name, 'delegates_to');
  const servedBy = relationsFrom(graph, entity.name, 'served_by');
  const endpoint = `http://localhost:${BASE_PORT + index}/a2a`;

  return {
    name: entity.name,
    description: entity.observations?.[0] || '',
    provider: { organization: 'Yorizon' },
    version: '1.0.0',
    capabilities: {
      streaming: false,
      pushNotifications: false,
    },
    skills: skillsFor(entity),
    metadata: {
      entityId: entity.id,
      entityType: entity.type,
      created: entity.created,
      delegatesTo,
      servedBy,
      endpoint,
      authMode: 'none',
      timeoutMs: 30000,
      retryCount: 1,
      retryDelayMs: 500,
      resultSchemaId: 'yorizon.a2a.result.v1',
      generatedAt: new Date().toISOString(),
      source: 'knowledge-graph',
    },
  };
}

function cleanupExistingCards(cardsDir) {
  if (!fs.existsSync(cardsDir)) return;
  const existing = fs.readdirSync(cardsDir).filter((f) => f.endsWith('.json'));
  for (const file of existing) {
    fs.unlinkSync(path.join(cardsDir, file));
  }
}

function main() {
  const graph = loadGraph();
  const agents = activeAgents(graph).sort((a, b) => String(a.name).localeCompare(String(b.name)));

  ensureCardsDir(CARDS_DIR);
  cleanupExistingCards(CARDS_DIR);

  const written = [];
  agents.forEach((entity, index) => {
    const card = cardFromEntity(graph, entity, index);
    const out = writeAgentCard(card, CARDS_DIR);
    written.push({ name: entity.name, file: out.fileName, endpoint: card.metadata.endpoint });
  });

  const result = {
    status: 'ok',
    knowledgePath: KNOWLEDGE_PATH,
    graphPath: GRAPH_PATH,
    cardsPath: CARDS_DIR,
    count: written.length,
    cards: written,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
