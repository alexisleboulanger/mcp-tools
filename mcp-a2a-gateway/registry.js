const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CARDS_DIR = process.env.A2A_AGENT_CARDS_PATH || path.join(__dirname, 'agent-cards');

function safeParseJson(text, filePath) {
  try {
    return JSON.parse(text);
  } catch {
    return {
      name: path.basename(filePath, '.json'),
      description: 'Invalid Agent Card JSON',
      _invalid: true,
    };
  }
}

function loadAgentCards(cardsDir = DEFAULT_CARDS_DIR) {
  if (!fs.existsSync(cardsDir)) return [];
  const files = fs.readdirSync(cardsDir).filter((f) => f.endsWith('.json'));

  return files.map((file) => {
    const fullPath = path.join(cardsDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const card = safeParseJson(content, fullPath);
    return {
      ...card,
      _file: file,
      _path: fullPath,
    };
  });
}

function ensureCardsDir(cardsDir = DEFAULT_CARDS_DIR) {
  if (!fs.existsSync(cardsDir)) {
    fs.mkdirSync(cardsDir, { recursive: true });
  }
}

function slugifyFileName(name) {
  return String(name || 'agent')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function writeAgentCard(card, cardsDir = DEFAULT_CARDS_DIR) {
  ensureCardsDir(cardsDir);
  const base = slugifyFileName(card?.name || 'agent-card');
  const fileName = `${base}.json`;
  const fullPath = path.join(cardsDir, fileName);
  fs.writeFileSync(fullPath, `${JSON.stringify(card, null, 2)}\n`, 'utf8');
  return { fileName, fullPath };
}

function normalize(value) {
  return String(value || '').toLowerCase();
}

function discoverAgents(query, cards) {
  const q = normalize(query).trim();
  if (!q) {
    return cards.map((card) => ({ card, score: 0 }));
  }

  return cards
    .map((card) => {
      const name = normalize(card.name);
      const description = normalize(card.description);
      const skills = Array.isArray(card.skills)
        ? card.skills.map((s) => `${normalize(s.name)} ${normalize(s.description)}`).join(' ')
        : '';

      let score = 0;
      if (name.includes(q)) score += 5;
      if (description.includes(q)) score += 3;
      if (skills.includes(q)) score += 2;

      // Token overlap bonus for multi-word queries.
      const tokens = q.split(/\s+/).filter(Boolean);
      for (const token of tokens) {
        if (name.includes(token)) score += 2;
        if (description.includes(token)) score += 1;
        if (skills.includes(token)) score += 1;
      }

      return { card, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

module.exports = {
  DEFAULT_CARDS_DIR,
  loadAgentCards,
  discoverAgents,
  ensureCardsDir,
  writeAgentCard,
  slugifyFileName,
};
