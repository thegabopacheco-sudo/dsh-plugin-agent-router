// Test end-to-end de agent-router.
import path from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const packageDir = path.resolve(import.meta.dirname, '..');
const tmpDir = path.join(packageDir, 'test', 'tmp');
rmSync(tmpDir, { recursive: true, force: true });
const home = path.join(tmpDir, 'dsh-home');
mkdirSync(path.join(home, 'agent-router'), { recursive: true });
writeFileSync(path.join(home, 'agent-router', 'config.json'), JSON.stringify({
  defaultModel: 'mid',
  models: [
    { id: 'cheap', provider: 'x', strengths: ['rapido', 'barato'], cost: 'bajo', contextWindow: 64000 },
    { id: 'smart', provider: 'x', strengths: ['razonamiento', 'analisis', 'arquitectura'], cost: 'alto', contextWindow: 256000 },
    { id: 'mid', provider: 'x', strengths: ['codigo', 'herramientas'], cost: 'medio', contextWindow: 128000 },
  ],
}), 'utf8');

function makeClient() {
  const entry = process.env.ROUTER_SERVER ? path.resolve(process.env.ROUTER_SERVER) : path.join(packageDir, 'server.mjs');
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env: { SystemRoot: process.env.SystemRoot || 'C:\\Windows', PATH: process.env.PATH, USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME || process.env.USERPROFILE, TEMP: process.env.TEMP, TMP: process.env.TMP, DSH_HOME: home }, stderr: 'pipe' });
  transport.stderr?.on('data', (c) => process.stderr.write(`[server] ${c}`));
  const client = new Client({ name: 'router-test', version: '1.0.0' }, { capabilities: {}, versionNegotiation: { mode: 'auto' } });
  return client.connect(transport).then(() => ({ client, transport }));
}
const textOf = (r) => (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

const { client, transport } = await makeClient();
console.log('tools:', (await client.listTools()).tools.map((t) => t.name).join(', '));
const status = textOf(await client.callTool({ name: 'status', arguments: {} }));
console.log('--- status ---'); console.log(status);
console.log('3 modelos:', status.includes('Modelos: 3'));
const policies = textOf(await client.callTool({ name: 'policies', arguments: {} }));
console.log('policies señales:', policies.includes('razonamiento') && policies.includes('codigo'));
const smart = textOf(await client.callTool({ name: 'route', arguments: { task: 'Analiza la arquitectura y razona los trade-offs del diseño' } }));
console.log('--- smart ---'); console.log(smart);
console.log('recomienda smart:', smart.includes('x/smart'));
const cheap = textOf(await client.callTool({ name: 'route', arguments: { task: 'arregla un typo rápido en el README' } }));
console.log('--- cheap ---'); console.log(cheap);
console.log('recomienda cheap:', cheap.includes('x/cheap'));
const coded = textOf(await client.callTool({ name: 'route', arguments: { task: 'refactoriza la función de tests' } }));
console.log('codigo recomienda mid:', coded.includes('x/mid'));
const budget = textOf(await client.callTool({ name: 'route', arguments: { task: 'analiza la arquitectura', budget: 'low' } }));
console.log('presupuesto bajo evita smart:', budget.includes('x/smart') && budget.includes('excede presupuesto'));
const longCtx = textOf(await client.callTool({ name: 'route', arguments: { task: 'resume un documento grande de historial', minContextTokens: 200000 } }));
console.log('contexto alto exige smart:', longCtx.includes('x/smart') && longCtx.includes('contexto insuficiente'));
const empty = await client.callTool({ name: 'route', arguments: { task: ' ' } });
console.log('task vacía isError:', empty.isError === true);
await client.close(); try { await transport.close?.(); } catch {}
console.log('OK');
