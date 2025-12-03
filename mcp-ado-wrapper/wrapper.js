#!/usr/bin/env node
// Lightweight wrapper around the upstream @azure-devops/mcp server.
// Converted to CommonJS for compatibility without needing package.json "type": "module".
// Responsibilities:
// 1. Resolve a PAT from several possible env var names / .env.local.
// 2. Optional preflight to validate PAT (projects list REST call) before starting MCP.
// 3. Spawn upstream server (npx @azure-devops/mcp ...) with cleaned environment.
// 4. Avoid emitting any non-protocol output after the child takes over stdio.

const { spawn } = require('node:child_process');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

// Load local .env next to this wrapper so we rely solely on
// AZURE_DEVOPS_PAT and AZURE_DEVOPS_ORG_URL defined there.
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx === -1) continue;
      const k = line.slice(0, idx).trim();
      if (!k) continue;
      if (process.env[k] != null) continue;
      const v = line.slice(idx + 1).trim();
      process.env[k] = v;
    }
  }
} catch (e) {
  console.error('[ado-wrapper] Failed reading .env:', e.message);
}

function resolvePAT() {
  const names = [
    'AZURE_DEVOPS_PAT',
    'ADO_PAT',
    'AZURE_DEVOPS_EXT_PAT',
    'SYSTEM_ACCESSTOKEN'
  ];
  for (const n of names) {
    if (process.env[n] && process.env[n].trim()) return process.env[n].trim();
  }
  return null;
}

async function preflight(orgUrl, pat) {
  return new Promise((resolve) => {
    // Ensure orgUrl retains its organization path when building the projects URL.
    // If orgUrl has no trailing slash, new URL(rel, orgUrl) would drop the org segment.
    // Example: new URL('_apis/projects', 'https://dev.azure.com/org') => https://dev.azure.com/_apis/projects (WRONG)
    // We fix by constructing an absolute URL string explicitly.
    const normalized = orgUrl.replace(/\/$/, '');
    const fullUrlStr = `${normalized}/_apis/projects?api-version=7.1-preview.4`;
    let url;
    try {
      url = new URL(fullUrlStr);
    } catch (e) {
      console.error('[ado-wrapper] Invalid org URL:', fullUrlStr, e.message);
      return resolve(false);
    }
    const auth = Buffer.from(':' + pat).toString('base64');
    const req = https.request({
      method: 'GET',
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(data);
            const count = json.count ?? (Array.isArray(json.value) ? json.value.length : 'unknown');
            console.error(`[ado-wrapper] Preflight success: ${count} projects visible.`);
            return resolve(true);
          } catch {
            console.error('[ado-wrapper] Preflight success (non-JSON parse)');
            return resolve(true);
          }
        } else {
          console.error(`[ado-wrapper] Preflight failed: HTTP ${res.statusCode}. Body: ${data.slice(0, 500)}`);
          return resolve(false);
        }
      });
    });
    req.on('error', (err) => {
      console.error('[ado-wrapper] Preflight error:', err.message);
      resolve(false);
    });
    req.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (['-h', '--help'].includes(args[0])) {
    console.error(`Usage: node ${path.relative(process.cwd(), __filename)} [domains...] [flags]\n\n` +
      `Description:\n  Starts the upstream @azure-devops/mcp server with PAT + optional preflight.\n  Organization URL is taken from AZURE_DEVOPS_ORG_URL in .env.\n  By DEFAULT (no domains listed) ALL tool domains are loaded (no -d filter).\n  Provide one or more domain names to restrict the tool set.\n\n` +
      `Common Flags:\n  --no-preflight             Skip the PAT validation projects call\n  --just-preflight           Run preflight then exit (0 on success)\n  --verbose/-v               Extra diagnostic stderr logs before MCP handshake\n  --keep-alive               Respawn upstream server if it exits\n  --debug                    Prefix child stderr for troubleshooting\n  --list-projects            Output JSON list of projects then exit\n  --wiki-project <p>         Project name for wiki operations\n  --wiki-name <name>         Wiki name (or id) for wiki operations\n  --wiki-page-index <n>      Fetch page by sorted index (with --wiki-project/--wiki-name)\n  --wiki-markdown            Output only page markdown content\n  --wiki-dump                Diagnostic: list wiki attempts JSON\n  --wiki-tree                Output recursive wiki hierarchy as markdown\n  --all-domains              (Optional) Explicitly request all domains (now default)\n  --work-items-project <p>   Project to query recent work items\n  --work-items-recent <days> Number of days back for changed date filter\n  --work-items-types <csv>   Optional types (e.g. 'User Story,Bug')\n\nExamples:\n  # All domains (default)\n  node mcp-ado-wrapper/wrapper.js myorg\n  # Restrict to core + work-items only\n  node mcp-ado-wrapper/wrapper.js myorg core work-items\n  # Recent 7-day user stories\n  node mcp-ado-wrapper/wrapper.js myorg --work-items-project "Yorizon Nexus" --work-items-recent 7 --work-items-types "User Story"\n`);
    process.exit(1);
  }

  let preflightEnabled = true;
  let verbose = false;
  let justPreflight = false;
  let keepAlive = false;
  let debugMode = false;
  let listProjectsOnly = false;
  let wikiProject = null;
  let wikiName = null;
  let wikiPageIndex = null; // 1-based
  let wikiSort = 'path';
  let wikiMarkdownOnly = false;
  let wikiDump = false; // diagnostic listing
  let wikiTree = false; // markdown hierarchy output
  let allDomains = false; // request all upstream domains/tools
  // Work items retrieval flags
  let workItemsRecentDays = null; // number of days back
  let workItemsProject = null; // project name
  let workItemsTypes = null; // comma separated types
  let workItemsOutputFile = null; // optional path to write JSON/MD
  let workItemsMarkdown = false; // output markdown table instead of JSON to stdout unless file specified
  const flagExtract = (flag) => {
    const idx = args.indexOf(flag);
    if (idx !== -1) args.splice(idx, 1);
    return idx !== -1;
  };
  preflightEnabled = !flagExtract('--no-preflight');
  verbose = flagExtract('--verbose') || flagExtract('-v');
  justPreflight = flagExtract('--just-preflight');
  keepAlive = flagExtract('--keep-alive');
  debugMode = flagExtract('--debug');
  listProjectsOnly = flagExtract('--list-projects');
  // Simple arg parsing for wiki flags (key value pairs)
  function takeFlagValue(flag) {
    const i = args.indexOf(flag);
    if (i !== -1 && i < args.length - 1) {
      const val = args[i + 1];
      args.splice(i, 2);
      return val;
    }
    return null;
  }
  wikiProject = takeFlagValue('--wiki-project');
  wikiName = takeFlagValue('--wiki-name');
  const pageIdxStr = takeFlagValue('--wiki-page-index');
  if (pageIdxStr) {
    const n = parseInt(pageIdxStr, 10);
    if (!Number.isNaN(n) && n > 0) wikiPageIndex = n;
  }
  const sortVal = takeFlagValue('--wiki-sort');
  if (sortVal && ['path','id'].includes(sortVal)) wikiSort = sortVal;
  if (args.includes('--wiki-markdown')) {
    wikiMarkdownOnly = true;
    args.splice(args.indexOf('--wiki-markdown'),1);
  }
  if (args.includes('--wiki-dump')) {
    wikiDump = true;
    args.splice(args.indexOf('--wiki-dump'),1);
  }
  if (args.includes('--wiki-tree')) {
    wikiTree = true;
    args.splice(args.indexOf('--wiki-tree'),1);
  }
  if (args.includes('--all-domains')) {
    allDomains = true;
    args.splice(args.indexOf('--all-domains'),1);
  }
  // Work items flags
  const wRecentIdx = args.indexOf('--work-items-recent');
  if (wRecentIdx !== -1 && wRecentIdx < args.length -1) {
    const v = parseInt(args[wRecentIdx+1],10); if(!Number.isNaN(v)&&v>0) workItemsRecentDays = v; args.splice(wRecentIdx,2);
  }
  const wProjIdx = args.indexOf('--work-items-project');
  if (wProjIdx !== -1 && wProjIdx < args.length -1) {
    workItemsProject = args[wProjIdx+1]; args.splice(wProjIdx,2);
  }
  const wTypesIdx = args.indexOf('--work-items-types');
  if (wTypesIdx !== -1 && wTypesIdx < args.length -1) {
    workItemsTypes = args[wTypesIdx+1]; args.splice(wTypesIdx,2);
  }
  const wOutIdx = args.indexOf('--work-items-output');
  if (wOutIdx !== -1 && wOutIdx < args.length -1) {
    workItemsOutputFile = args[wOutIdx+1]; args.splice(wOutIdx,2);
  }
  if (args.includes('--work-items-markdown')) {
    workItemsMarkdown = true; args.splice(args.indexOf('--work-items-markdown'),1);
  }

  // With .env-based config, organization URL comes from AZURE_DEVOPS_ORG_URL.
  // Positional args are treated purely as optional domain filters.
  const org = null;
  // New default: if user provides zero domain names (and doesn't explicitly request restriction) load ALL domains.
  const domains = allDomains ? [] : (args.length ? args : []);

  const pat = resolvePAT();
  if (!pat) {
    console.error('[ado-wrapper] No PAT found in env (AZURE_DEVOPS_PAT / ADO_PAT / AZURE_DEVOPS_EXT_PAT / SYSTEM_ACCESSTOKEN).');
    process.exit(1);
  }

  // Ensure all canonical env variable names are populated for downstream tools if absent.
  if (!process.env.ADO_PAT) process.env.ADO_PAT = pat;
  if (!process.env.AZURE_DEVOPS_PAT) process.env.AZURE_DEVOPS_PAT = pat;
  if (!process.env.AZURE_DEVOPS_EXT_PAT) process.env.AZURE_DEVOPS_EXT_PAT = pat;

  const orgUrl = process.env.AZURE_DEVOPS_ORG_URL || '';
  if (!orgUrl) {
    console.error('[ado-wrapper] AZURE_DEVOPS_ORG_URL must be set in .env.');
    process.exit(1);
  }
  if (verbose) {
    const patSource = ['AZURE_DEVOPS_PAT','ADO_PAT','AZURE_DEVOPS_EXT_PAT','SYSTEM_ACCESSTOKEN'].find(n => process.env[n]);
    const domainMsg = domains.length ? domains.join(',') : 'ALL (no filter)';
    console.error(`[ado-wrapper][verbose] orgUrl=${orgUrl}`);
    console.error(`[ado-wrapper][verbose] domains=${domainMsg} preflight=${preflightEnabled}`);
    console.error(`[ado-wrapper][verbose] PAT source variable: ${patSource || 'unknown'}`);
  }
  if (preflightEnabled) {
    const ok = await preflight(orgUrl, pat);
    if (!ok) {
      console.error('[ado-wrapper] Aborting due to failed preflight. Use --no-preflight to skip.');
      process.exit(1);
    } else if (verbose) {
      console.error('[ado-wrapper][verbose] Preflight passed.');
    }
  }

  if (justPreflight) {
    if (verbose) console.error('[ado-wrapper][verbose] Exiting after --just-preflight');
    process.exit(0);
  }

  if (listProjectsOnly) {
    // Fetch projects and output JSON list (names + id + state + visibility)
    const normalized = orgUrl.replace(/\/$/, '');
    const listUrl = `${normalized}/_apis/projects?api-version=7.1-preview.4`;
    const auth = Buffer.from(':' + pat).toString('base64');
    https.get(listUrl, { headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' } }, res => {
      let data='';
      res.on('data', d=>data+=d);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >=200 && res.statusCode<300) {
          try {
            const json = JSON.parse(data);
            const simplified = (json.value||[]).map(p=>({id:p.id,name:p.name,state:p.state,visibility:p.visibility}));
            process.stdout.write(JSON.stringify({count:simplified.length, projects:simplified}, null, 2));
            process.exit(0);
          } catch(e){
            console.error('[ado-wrapper] Failed to parse project list JSON:', e.message);
            process.exit(1);
          }
        } else {
          console.error(`[ado-wrapper] Project list request failed HTTP ${res.statusCode}. Body: ${data.slice(0,300)}`);
          process.exit(1);
        }
      });
    }).on('error', err => {
      console.error('[ado-wrapper] Project list request error:', err.message);
      process.exit(1);
    });
    return; // prevent spawning
  }

  // Work items recent retrieval mode
  if (workItemsRecentDays && workItemsProject) {
    const projectName = workItemsProject;
    const typesFilter = (workItemsTypes||'').split(',').map(s=>s.trim()).filter(Boolean);
    const orgBase = orgUrl.replace(/\/$/, '');
    const auth = Buffer.from(':'+pat).toString('base64');
    const headers = { 'Authorization': `Basic ${auth}`, 'Content-Type':'application/json', 'Accept':'application/json' };
    const wiql = (()=>{
      let clause = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.ChangedDate] >= @Today - ${workItemsRecentDays}`;
      if (typesFilter.length) {
        const typeClauses = typesFilter.map(t=>`[System.WorkItemType] = '${t.replace(/'/g,"''")}'`).join(' OR ');
        clause += ` AND (${typeClauses})`;
      }
      clause += ' ORDER BY [System.ChangedDate] DESC';
      return { query: clause };
    })();
    // POST WIQL
    function postJson(url, body){
      return new Promise((resolve,reject)=>{
        const u = new URL(url);
        const req = https.request({method:'POST',hostname:u.hostname,path:u.pathname+u.search,headers},res=>{
          let d='';res.on('data',c=>d+=c);res.on('end',()=>resolve({status:res.statusCode,body:d}));});
        req.on('error',reject); req.write(JSON.stringify(body)); req.end();
      });
    }
    function getJson(url){
      return new Promise((resolve,reject)=>{
        https.get(url,{headers},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>resolve({status:res.statusCode,body:d}));}).on('error',reject);
      });
    }
    (async()=>{
      try {
        const wiqlUrl = `${orgBase}/${encodeURIComponent(projectName)}/_apis/wit/wiql?api-version=7.1-preview.2`;
        const wiqlResp = await postJson(wiqlUrl, wiql);
        if (!(wiqlResp.status>=200 && wiqlResp.status<300)) {
          console.error('[ado-wrapper] WIQL query failed', wiqlResp.status, wiqlResp.body.slice(0,300));
          process.exit(1); return;
        }
        let wiqlJson; try { wiqlJson = JSON.parse(wiqlResp.body); } catch { console.error('[ado-wrapper] Invalid WIQL JSON'); process.exit(1); return; }
        const ids = (wiqlJson.workItems||[]).map(w=>w.id);
        const chunks = []; const size=150; for(let i=0;i<ids.length;i+=size) chunks.push(ids.slice(i,i+size));
        const results=[];
        for (const ch of chunks) {
          const idsStr = ch.join(',');
            const itemsUrl = `${orgBase}/${encodeURIComponent(projectName)}/_apis/wit/workitems?ids=${idsStr}&fields=System.Id,System.Title,System.State,System.WorkItemType,System.ChangedDate,System.Tags&api-version=7.1`; 
            const r = await getJson(itemsUrl);
            if (!(r.status>=200 && r.status<300)) { console.error('[ado-wrapper] Work items fetch failed', r.status); process.exit(1); return; }
            let j; try { j=JSON.parse(r.body);} catch { continue; }
            for (const v of (j.value||[])) {
              results.push({
                id: v.id,
                type: v.fields?.['System.WorkItemType'],
                title: v.fields?.['System.Title'],
                state: v.fields?.['System.State'],
                changed: v.fields?.['System.ChangedDate'],
                tags: v.fields?.['System.Tags'] || ''
              });
            }
        }
        // Sort by changed date desc if available
        results.sort((a,b)=> (b.changed||'').localeCompare(a.changed||''));
        const payload = { project: projectName, days: workItemsRecentDays, count: results.length, items: results };
        const md = (()=>{
          const lines = [];
          lines.push(`# Recent Work Items: ${projectName}`);
            lines.push('');
          lines.push(`Time Window: last ${workItemsRecentDays} day(s)`);
          if (typesFilter.length) lines.push(`Filtered Types: ${typesFilter.join(', ')}`);
          lines.push(`Total: ${results.length}`);
          lines.push('');
          lines.push('| ID | Type | State | Changed (UTC) | Title | Tags |');
          lines.push('|----|------|-------|---------------|-------|------|');
          for (const r of results) {
            const tags = (r.tags||'').replace(/\r?\n/g,' ').replace(/\|/g,'/');
            const title = (r.title||'').replace(/\|/g,'/');
            lines.push(`| ${r.id} | ${r.type||''} | ${r.state||''} | ${r.changed||''} | ${title} | ${tags} |`);
          }
          lines.push('');
          return lines.join('\n');
        })();
        try {
          if (workItemsOutputFile) {
            const outPath = path.isAbsolute(workItemsOutputFile) ? workItemsOutputFile : path.join(process.cwd(), workItemsOutputFile);
            const dir = path.dirname(outPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            if (workItemsMarkdown) {
              fs.writeFileSync(outPath, md, 'utf8');
            } else if (/\.md$/i.test(outPath)) {
              fs.writeFileSync(outPath, md, 'utf8');
            } else {
              fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
            }
            if (verbose) console.error(`[ado-wrapper][verbose] Work items written to ${outPath}`);
          }
          if (!workItemsOutputFile) {
            if (workItemsMarkdown) {
              process.stdout.write(md);
            } else {
              process.stdout.write(JSON.stringify(payload, null, 2));
            }
          }
          process.exit(0);
        } catch(writeErr){
          console.error('[ado-wrapper] Failed writing work items output', writeErr.message);
          process.exit(1);
        }
      } catch(e){
        console.error('[ado-wrapper] Work items retrieval error', e.message);
        process.exit(1);
      }
    })();
    return;
  }

  // Wiki page retrieval mode: requires project, wiki name, and page index.
  // Diagnostic: dump wiki pages list(s)
  if (wikiDump && wikiProject && wikiName) {
    const base = orgUrl.replace(/\/$/, '');
    const projectEnc = encodeURIComponent(wikiProject);
    const auth = Buffer.from(':' + pat).toString('base64');
    const headers = { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' };
    const wikisUrl = `${base}/${projectEnc}/_apis/wiki/wikis?api-version=7.1-preview.2`;
    https.get(wikisUrl, { headers }, res => {
      let data=''; res.on('data',d=>data+=d); res.on('end', ()=>{
        let wikiList=[]; try { const j=JSON.parse(data); wikiList=j.value||[];} catch { }
        const match = wikiList.find(w=>w.name===wikiName || w.id===wikiName);
        const targetId = match? match.id : null;
        const attempts = [];
        const collectResults = []; let pending = 0;
        function done(){
          process.stdout.write(JSON.stringify({
            wikiQuery:{project:wikiProject, requestedName:wikiName, resolvedId:targetId},
            wikis: wikiList.map(w=>({id:w.id,name:w.name,type:w.type})),
            attempts: collectResults
          }, null, 2));
          process.exit(0);
        }
        function fetchPages(label, url){
          pending++;
          https.get(url, { headers }, r => {
            let d=''; r.on('data',c=>d+=c); r.on('end', ()=>{
              let count=null; let samplePaths=[]; let status=r.statusCode;
              try { const pj=JSON.parse(d); const pages=pj.value||[]; count=pages.length; samplePaths=pages.slice(0,5).map(p=>p.path);} catch {}
              collectResults.push({label,url,status,count,samplePaths,rawPreview:d.slice(0,200)});
              if(--pending===0) done();
            });
          }).on('error', err=>{ collectResults.push({label,url,error:err.message}); if(--pending===0) done(); });
        }
        if (targetId){
          const idUrl = `${base}/${projectEnc}/_apis/wiki/wikis/${encodeURIComponent(targetId)}/pages?recursionLevel=Full&api-version=7.1-preview.1&includeContent=false`;
          fetchPages('byId', idUrl);
        }
        const nameUrl = `${base}/${projectEnc}/_apis/wiki/wikis/${encodeURIComponent(wikiName)}/pages?recursionLevel=Full&api-version=7.1-preview.1&includeContent=false`;
        fetchPages('byName', nameUrl);
      }); });
    return;
  }

  // Hierarchical tree output (markdown)
  if (wikiTree && wikiProject && wikiName) {
    const base = orgUrl.replace(/\/$/, '');
    const projectEnc = encodeURIComponent(wikiProject);
    const wikiEncName = encodeURIComponent(wikiName);
    const auth = Buffer.from(':' + pat).toString('base64');
    const headers = { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' };
    const treeUrl = `${base}/${projectEnc}/_apis/wiki/wikis/${wikiEncName}/pages?recursionLevel=Full&api-version=7.1-preview.1&includeContent=false`;
    https.get(treeUrl, { headers }, res => {
      let data=''; res.on('data',d=>data+=d); res.on('end', () => {
        if (!(res.statusCode >=200 && res.statusCode<300)) {
          console.error(`[ado-wrapper] Wiki tree fetch failed HTTP ${res.statusCode}. Body: ${data.slice(0,300)}`);
          process.exit(1); return;
        }
        let root; try { root = JSON.parse(data); } catch { console.error('[ado-wrapper] Invalid JSON for wiki tree'); process.exit(1); return; }
        // If root.value exists and is array, convert to synthetic root.
        if (Array.isArray(root.value)) {
          root = { path:'/', subPages: root.value };
        }
        function collect(page, depth, arr) {
          if (!page) return;
            const isParent = page.isParentPage === true;
            const lineName = page.path || '/';
            if (depth===0) {
              // skip printing root marker later, but store children
            } else {
              arr.push({ depth, path: lineName, parent: isParent, order: page.order });
            }
            const kids = page.subPages || [];
            for (const k of kids) collect(k, depth+1, arr);
        }
        const collected = [];
        collect(root, 0, collected);
        // Sort by path depth then order if original structure uncertain
        collected.sort((a,b)=> a.depth===b.depth ? (a.order||0)-(b.order||0) : a.depth-b.depth);
        // Build markdown
        let md = `# Wiki Hierarchy: ${wikiName}\n\n`;
        md += `Project: ${wikiProject}\nGenerated: ${new Date().toISOString()}\nTotal pages (excluding root containers): ${collected.length}\n\n`;
        let lastDepth = 1;
        for (const entry of collected) {
          const indent = '  '.repeat(entry.depth-1);
          const display = entry.path.replace(/^\//,'');
          md += `${indent}- ${display || '(root)'}\n`;
        }
        process.stdout.write(md);
        process.exit(0);
      });
    }).on('error', err => { console.error('[ado-wrapper] Wiki tree error:', err.message); process.exit(1); });
    return;
  }

  if (wikiProject && wikiName && wikiPageIndex) {
    const base = orgUrl.replace(/\/$/, '');
    const wikiEnc = encodeURIComponent(wikiName);
    const projectEnc = encodeURIComponent(wikiProject);
    const auth = Buffer.from(':' + pat).toString('base64');
    const headers = { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' };
    // 1. List pages metadata (full recursion)
    const listUrl = `${base}/${projectEnc}/_apis/wiki/wikis/${wikiEnc}/pages?recursionLevel=Full&api-version=7.1-preview.1&includeContent=false`;
    https.get(listUrl, { headers }, res => {
      let data='';
      res.on('data', d=>data+=d);
      res.on('end', () => {
        if (!(res.statusCode >=200 && res.statusCode<300)) {
          console.error(`[ado-wrapper] Wiki pages list failed HTTP ${res.statusCode}. Body: ${data.slice(0,300)}`);
          process.exit(1);
          return;
        }
        let json;
        try { json = JSON.parse(data); } catch(e) { console.error('[ado-wrapper] Invalid JSON for pages list'); process.exit(1); return; }
        let pages = json.value || [];
        // Filter out duplicates or root placeholders
        pages = pages.filter(p => p.isParentPage !== true);
        if (wikiSort === 'path') {
          pages.sort((a,b) => (a.path||'').localeCompare(b.path||''));
        } else if (wikiSort === 'id') {
          pages.sort((a,b) => (a.id||0) - (b.id||0));
        }
        if (pages.length < wikiPageIndex) {
          console.error(`[ado-wrapper] Requested page index ${wikiPageIndex} but only ${pages.length} pages found.`);
          process.exit(2);
          return;
        }
        const target = pages[wikiPageIndex - 1];
        const pageId = target.id;
        const pageUrl = `${base}/${projectEnc}/_apis/wiki/wikis/${wikiEnc}/pages/${pageId}?api-version=7.1-preview.1&includeContent=true`;
        https.get(pageUrl, { headers }, r2 => {
          let d2='';
          r2.on('data', c=>d2+=c);
          r2.on('end', () => {
            if (!(r2.statusCode >=200 && r2.statusCode<300)) {
              console.error(`[ado-wrapper] Fetch page ${pageId} failed HTTP ${r2.statusCode}. Body: ${d2.slice(0,300)}`);
              process.exit(1);
              return;
            }
            try {
              const pageJson = JSON.parse(d2);
              if (wikiMarkdownOnly) {
                process.stdout.write(pageJson.content || '');
              } else {
                const out = {
                  index: wikiPageIndex,
                  id: pageJson.id,
                  path: pageJson.path,
                  url: pageJson.url,
                  remoteUrl: pageJson.remoteUrl,
                  content: pageJson.content || ''
                };
                process.stdout.write(JSON.stringify(out, null, 2));
              }
              process.exit(0);
            } catch(e){
              console.error('[ado-wrapper] Invalid JSON for page content');
              process.exit(1);
            }
          });
        }).on('error', err => { console.error('[ado-wrapper] Page fetch error:', err.message); process.exit(1); });
      });
    }).on('error', err => { console.error('[ado-wrapper] Wiki pages list error:', err.message); process.exit(1); });
    return;
  }

  // Derive org slug for upstream CLI (uses https://dev.azure.com/<org>).
  // We parse it from AZURE_DEVOPS_ORG_URL to keep a similar behavior
  // while no longer requiring a positional org argument to this wrapper.
  let orgSlug = null;
  try {
    const u = new URL(orgUrl);
    // For URLs like https://dev.azure.com/yorizon or https://dev.azure.com/yorizon/
    const parts = u.pathname.split('/').filter(Boolean);
    orgSlug = parts[0] || null;
  } catch {
    // Fallback: attempt to trim base prefix manually
    const m = orgUrl.match(/dev\.azure\.com\/(.+?)(?:\/.+)?$/);
    if (m) orgSlug = m[1];
  }
  if (!orgSlug) {
    console.error('[ado-wrapper] Unable to derive organization slug from AZURE_DEVOPS_ORG_URL.');
    process.exit(1);
  }

  // Spawn upstream server
  const childEnv = { ...process.env };
  // Redundant assignments (already set above) kept for explicitness.
  childEnv.AZURE_DEVOPS_EXT_PAT = process.env.AZURE_DEVOPS_EXT_PAT;
  childEnv.AZURE_DEVOPS_PAT = process.env.AZURE_DEVOPS_PAT;
  childEnv.ADO_PAT = process.env.ADO_PAT;

  // Resolve npx path (Windows may require npx.cmd). If not found, advise installation.
  // Additionally attempt to resolve a locally installed @azure-devops/mcp binary to avoid npx spawn issues.
  let localBinPath = null;
  try {
    const pkgJson = require.resolve('@azure-devops/mcp/package.json');
    const pkgDir = path.dirname(pkgJson);
    const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
    const binField = pkg.bin;
    if (typeof binField === 'string') {
      localBinPath = path.join(pkgDir, binField);
    } else if (binField && typeof binField === 'object') {
      // Prefer key that matches typical CLI name
      const preferred = binField['azure-devops-mcp'] || Object.values(binField)[0];
      if (preferred) localBinPath = path.join(pkgDir, preferred);
    }
    if (localBinPath && !fs.existsSync(localBinPath)) localBinPath = null;
  } catch { /* ignore resolution errors */ }
  function resolveNpx() {
    const candidates = process.platform === 'win32'
      ? ['npx.cmd', 'npx.exe', 'npx']
      : ['npx'];
    const PATH = process.env.PATH || '';
    for (const dir of PATH.split(path.delimiter)) {
      for (const c of candidates) {
        const full = path.join(dir, c);
        if (fs.existsSync(full)) return full;
      }
    }
    return null;
  }
  const npxPath = resolveNpx();
  if (!npxPath) {
    console.error('[ado-wrapper] Could not locate npx in PATH. Ensure Node.js/npm is installed and npx is available.');
    process.exit(1);
  }
  // Build args depending on execution mode: direct bin vs npx.
  const usingLocalBin = !!localBinPath;
  const childArgs = (() => {
    if (usingLocalBin) {
      // Direct invocation of the CLI entry point with org + optional domains filter.
      return (allDomains || domains.length === 0)
        ? [localBinPath, orgSlug]
        : [localBinPath, orgSlug, '-d', ...domains];
    }
    // Fallback to npx usage.
    return (allDomains || domains.length === 0)
      ? ['-y', '@azure-devops/mcp', orgSlug]
      : ['-y', '@azure-devops/mcp', orgSlug, '-d', ...domains];
  })();
  if ((allDomains || domains.length === 0) && verbose) console.error('[ado-wrapper][verbose] All domains enabled (no -d filter passed).');
  function spawnOnce() {
    if (verbose) {
      if (usingLocalBin) {
        console.error(`[ado-wrapper][verbose] Spawning local bin: node ${childArgs.join(' ')}`);
      } else {
        console.error(`[ado-wrapper][verbose] Spawning via npx: ${npxPath} ${childArgs.join(' ')}`);
      }
    }
    // Use explicit pipe stdio to avoid Windows spawn EINVAL issues with inherit under extension host.
    // We'll manually forward stdout/stderr to maintain protocol purity (stdout) and diagnostics (stderr).
    let child;
    try {
      if (usingLocalBin) {
        child = spawn(process.execPath, childArgs, { stdio: ['pipe','pipe','pipe'], env: childEnv });
      } else {
        child = spawn(npxPath, childArgs, { stdio: ['pipe','pipe','pipe'], env: childEnv });
      }
    } catch (e) {
      console.error('[ado-wrapper] Primary spawn failed:', e.message);
      // Attempt shell-based fallback if not already using local bin
      if (!usingLocalBin) {
        try {
          console.error('[ado-wrapper] Retrying with shell invocation.');
          child = spawn(npxPath, childArgs, { stdio: ['pipe','pipe','pipe'], env: childEnv, shell: true });
        } catch (e2) {
          console.error('[ado-wrapper] Shell fallback failed:', e2.message);
          process.exit(1);
        }
      } else {
        process.exit(1);
      }
    }
    // Forward protocol stdout directly
    if (child.stdout) {
      child.stdout.on('data', chunk => {
        process.stdout.write(chunk);
      });
    }
    // Forward diagnostics stderr (prefix only in debugMode)
    if (child.stderr) {
      child.stderr.on('data', d => {
        if (debugMode) {
          process.stderr.write(`[ado-wrapper][child] ${d}`);
        } else {
          process.stderr.write(d);
        }
      });
    }
    // Pipe our stdin into child stdin
    if (child.stdin) {
      process.stdin.pipe(child.stdin);
    }
    child.on('exit', (code, signal) => {
      if (!keepAlive) {
        if (signal) {
          console.error(`[ado-wrapper] Upstream server terminated by signal ${signal}`);
          process.exit(1);
        }
        process.exit(code ?? 1);
      } else {
        const msg = `[ado-wrapper] Upstream exited (code=${code} signal=${signal || 'none'}). Respawning in 5s (Ctrl+C to quit)...`;
        console.error(msg);
        setTimeout(spawnOnce, 5000);
      }
    });
    child.on('error', (err) => {
      console.error('[ado-wrapper] Failed to spawn upstream server:', err);
      if (!keepAlive) process.exit(1); else setTimeout(spawnOnce, 5000);
    });
  }

  spawnOnce();
}

main();
