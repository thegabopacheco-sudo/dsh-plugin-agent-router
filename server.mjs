#!/usr/bin/env node
// dsh-plugin-agent-router — recomienda modelo/agente según tarea y presupuesto.
// Tools: status, policies, route.

import path from 'node:path';
import os from 'node:os';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

const VERSION = '0.1.0';
const DSH_HOME = (() => {
  const v = process.env.DSH_HOME && process.env.DSH_HOME.trim();
  return v || path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), '.dsh');
})();
const CONFIG_FILE = path.join(DSH_HOME, 'agent-router', 'config.json');
const CACHE_DIR = path.join(DSH_HOME, 'cache', 'agent-router');
const log = (m) => process.stderr.write(`[router] ${m}\n`);

const DEFAULT_MODELS = [
  { id: 'deepseek-flash', provider: 'deepseek', strengths: ['rapido', 'codigo', 'barato', 'herramientas'], cost: 'bajo', contextWindow: 128000, notes: 'Buen default para tareas directas y tool calls.' },
  { id: 'deepseek-pro', provider: 'deepseek', strengths: ['razonamiento', 'analisis', 'arquitectura', 'planificacion'], cost: 'alto', contextWindow: 256000, notes: 'Para razonamiento profundo y planes largos.' },
  { id: 'deepseek-lite', provider: 'deepseek', strengths: ['rapido', 'barato', 'clasificar', 'resumir'], cost: 'bajo', contextWindow: 64000, notes: 'Para clasificación/resúmenes simples.' },
];
const SIGNALS = [
  { label: 'razonamiento', patterns: [/razon|analiz|arquitectur|diseñ|dise[gñ]|decisi|trade-?off|planific|estrateg|profund/i], strengths: ['razonamiento', 'analisis', 'arquitectura', 'planificacion'] },
  { label: 'codigo', patterns: [/c[oó]digo|refactor|bug|test|implement|program|error|stack|api|funci[oó]n/i], strengths: ['codigo', 'herramientas'] },
  { label: 'rapido', patterns: [/r[aá]pid|typo|simple|clasific|resum|breve|corto|quick/i], strengths: ['rapido', 'barato', 'clasificar', 'resumir'] },
  { label: 'contexto largo', patterns: [/contexto\s+largo|historial|documento\s+grande|archivo\s+grande|muchas\s+p[aá]ginas|long\s+context/i], strengths: [] },
  { label: 'contenido', patterns: [/redact|copy|post|art[ií]culo|contenido|marketing|guion/i], strengths: ['rapido', 'resumir'] },
];
function loadConfig() {
  try { if (existsSync(CONFIG_FILE)) { const data = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) || {}; return { models: Array.isArray(data.models) && data.models.length ? data.models : DEFAULT_MODELS, defaultModel: data.defaultModel || null }; } } catch { /* defaults */ }
  return { models: DEFAULT_MODELS, defaultModel: null };
}
function budgetRank(cost) { return cost === 'bajo' ? 0 : cost === 'medio' ? 1 : 2; }
function route(task, budget, minContextTokens) {
  if (!task || typeof task !== 'string' || task.trim().length < 3) throw new Error('task vacía o demasiado corta');
  const config = loadConfig();
  const signals = SIGNALS.filter((signal) => signal.patterns.some((pattern) => pattern.test(task))).map((signal) => signal.label);
  const wanted = new Set(signals.flatMap((label) => SIGNALS.find((signal) => signal.label === label)?.strengths || []));
  const maxCost = budget === 'low' ? 0 : budget === 'medium' ? 1 : 2;
  const scored = config.models.map((model) => {
    let score = 0;
    const reasons = [];
    for (const strength of model.strengths || []) if (wanted.has(strength)) { score += 10; reasons.push(`cubre ${strength}`); }
    if (model.cost === 'bajo') score += 2;
    if (budget === 'low' && model.cost !== 'bajo') { score -= 40; reasons.push('excede presupuesto bajo'); }
    if (budget === 'medium' && model.cost === 'alto') { score -= 25; reasons.push('excede presupuesto medio'); }
    if (minContextTokens && (model.contextWindow || 0) < minContextTokens) { score -= 30; reasons.push(`contexto insuficiente (${model.contextWindow || 0})`); }
    if (model.id === config.defaultModel) { score += 1; reasons.push('modelo default'); }
    return { ...model, score, reasons };
  }).sort((a, b) => b.score - a.score);
  const available = scored.filter((model) => model.score > 0);
  const best = available[0] || scored[0];
  return { task, signals, best, alternatives: scored.slice(1, 4), budget, minContextTokens };
}
function textResult(text) { return { content: [{ type: 'text', text }] }; }

function buildInstructions() {
  return [
    'Agent Router: recomienda modelo/agente para una tarea.',
    '',
    'Herramientas: status, policies, route.',
    '',
    'Reglas:',
    '- Heurísticas locales: fortalezas, coste y ventana de contexto. No llama a ningún modelo.',
    '- Explica por qué recomienda ese modelo y muestra alternativas.',
    '- Respeta el presupuesto indicado; si ninguno cumple, dilo claramente.',
  ].join('\n');
}

function buildServer() {
  const server = new McpServer({ name: 'dsh-plugin-agent-router', version: VERSION }, { capabilities: { tools: {} }, instructions: buildInstructions() });

  server.registerTool(
    'status',
    { title: 'Estado', description: 'Modelos configurados y reglas.', inputSchema: z.object({}) },
    async () => {
      const config = loadConfig();
      return textResult([`Modelos: ${config.models.length}`, ...config.models.map((model) => `- ${model.provider || '?'}/${model.id} · coste ${model.cost || '?'} · contexto ${model.contextWindow || '?'}`), `Default: ${config.defaultModel || '(ninguno)'}`].join('\n'));
    },
  );

  server.registerTool(
    'policies',
    { title: 'Reglas', description: 'Señales y fortalezas que usa el router.', inputSchema: z.object({}) },
    async () => textResult(SIGNALS.map((signal) => `- ${signal.label}: ${signal.patterns.map((pattern) => pattern.source).join(' | ')}${signal.strengths.length ? ` → ${signal.strengths.join(', ')}` : ''}`).join('\n')),
  );

  server.registerTool(
    'route',
    { title: 'Recomendar modelo', description: 'Devuelve el modelo recomendado y alternativas con razones.', inputSchema: z.object({ task: z.string().min(3).max(4000), budget: z.enum(['low', 'medium', 'high']).optional(), minContextTokens: z.number().int().min(1000).max(2000000).optional() }) },
    async (args) => {
      const result = route(args.task, args.budget || 'high', args.minContextTokens);
      const fmt = (model) => `${model.provider || '?'}/${model.id} (score ${model.score})${model.reasons.length ? ` · ${model.reasons.join('; ')}` : ''}`;
      return textResult([
        `Tarea: ${result.task}`,
        `Señales: ${result.signals.length ? result.signals.join(', ') : '(ninguna)'}`,
        '',
        `Recomendado: ${fmt(result.best)}`,
        result.best.notes ? `Nota: ${result.best.notes}` : '',
        '',
        'Alternativas:',
        ...result.alternatives.map((model) => `- ${fmt(model)}`),
      ].filter((line) => line !== undefined).join('\n'));
    },
  );

  return server;
}

try { mkdirSync(CACHE_DIR, { recursive: true }); } catch { /* ignora */ }
log('router listo');
serveStdio(buildServer, { onerror: (e) => log(`serveStdio: ${e.message}`) });
process.on('uncaughtException', (e) => log(`excepción: ${e.message}`));
process.on('unhandledRejection', (e) => log(`rechazo: ${e && e.message ? e.message : String(e)}`));
