export type Kind = 'news' | 'review';
export type Verdict = 'reliable' | 'suspicious' | 'fake';
export interface Marker { type: string; weight: number; quote: string; note: string }
export interface Fact { claim: string; source: string; similarity: number }
export interface CheckResult { id: number; title: string; kind: Kind; risk: number; verdict: Verdict; markers: Marker[]; facts: Fact[]; createdAt: string; isPreliminary?: boolean }
export type Role = 'user' | 'analyst' | 'expert' | 'admin';
export interface User { id: number; login: string; fullName: string; role: Role }

export const T1 = 0.4, T2 = 0.75; // пороги τ1 и τ2 (настраиваются администратором)
export const verdictOf = (r: number): Verdict => (r < T1 ? 'reliable' : r < T2 ? 'suspicious' : 'fake');

export const API = import.meta.env.VITE_API_URL as string | undefined; // адрес серверного приложения; не задан — демо-режим
let seq = 1048;

export interface BatchItem { type: Kind; url: string; text: string }
export interface Task { id: number; checkId?: number; text?: string; title: string; kind: Kind; verdict: Verdict; risk: number; priority: 'Высокий' | 'Обычный'; assignee: string | null; reason: string; status: 'new' | 'work' | 'done' }
export const demoTasks: Task[] = [
  { id: 1, title: 'Тарифы на транспорт вырастут вдвое', kind: 'news', verdict: 'suspicious', risk: 0.62, priority: 'Высокий', assignee: null, reason: 'Оспаривание: нет ссылки на принятое решение.', status: 'new' },
  { id: 2, title: 'Отзыв о сервисе «ГородДоставка»', kind: 'review', verdict: 'fake', risk: 0.83, priority: 'Высокий', assignee: null, reason: 'Повторяющийся текст в нескольких отзывах.', status: 'new' },
  { id: 3, title: 'Отзыв о клинике «Вектор»', kind: 'review', verdict: 'suspicious', risk: 0.54, priority: 'Обычный', assignee: null, reason: 'Необходимо подтвердить описанное событие.', status: 'new' },
];
// Формат файла: CSV (заголовок type,url,text) или JSON-массив объектов с теми же полями
export function parseBatch(name: string, raw: string): BatchItem[] {
  const rows: BatchItem[] = name.toLowerCase().endsWith('.json')
    ? (JSON.parse(raw) as BatchItem[])
    : raw.split(/\r?\n/).slice(1).filter(l => l.trim()).map(l => { const [type, url, ...t] = l.split(','); return { type: type.trim() as Kind, url: (url ?? '').trim(), text: t.join(',').trim() }; });
  return rows.filter(r => (r.type === 'news' || r.type === 'review') && (r.text || r.url));
}
const DEMO = 'Тарифы на транспорт вырастут вдвое. По словам неназванных экспертов, цены взлетят — горожане в шоке. Решение якобы вступит в силу уже в ноябре.';


// ---------- сессия и запросы к серверу ----------
const KEY = 'mf_session';
export interface Session { token: string; user: User }
export function getSession(): Session | null {
  try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as Session) : null; } catch { return null; }
}
function saveSession(s: Session | null) {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* хранилище недоступно */ }
}
export const logout = () => saveSession(null);

let onUnauthorized: (() => void) | null = null;
export const setOnUnauthorized = (f: (() => void) | null) => { onUnauthorized = f; };

export class ApiError extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function apiFetch<T>(path: string, init: RequestInit = {}, fallback = 'Не удалось выполнить запрос. Повторите попытку.'): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) };
  const s = getSession(); if (s) headers.Authorization = `Bearer ${s.token}`;
  let r: Response;
  try { r = await fetch(`${API}${path}`, { ...init, headers }); } catch { throw new ApiError(0, 'Сервер недоступен. Проверьте подключение.'); }
  if (r.status === 401 && s) { saveSession(null); onUnauthorized?.(); }
  if (!r.ok) {
    let msg = fallback;
    try { const j = await r.json(); if (typeof j.detail === 'string') msg = j.detail; else if (Array.isArray(j.detail)) msg = 'Проверьте введённые данные.'; } catch { /* тело не JSON */ }
    throw new ApiError(r.status, msg);
  }
  return r.json() as Promise<T>;
}

export async function login(loginName: string, password: string): Promise<User> {
  if (!API) return { id: 0, login: loginName, fullName: loginName, role: 'admin' }; // демо-режим: любая пара, доступны все экраны
  const r = await apiFetch<{ accessToken: string; user: User }>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ login: loginName, password }) }, 'Не удалось войти.');
  saveSession({ token: r.accessToken, user: r.user });
  return r.user;
}

// выполняет задания с ограничением числа одновременных запросов
async function pool<I, O>(items: I[], limit: number, fn: (i: I) => Promise<O>): Promise<O[]> {
  const out: O[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) { const k = next++; out[k] = await fn(items[k]); } }));
  return out;
}
export const checkMany = (items: BatchItem[]) => pool(items, 4, i => check(i.type, i.text, i.url || undefined));

export const fetchHistory = () => apiFetch<CheckResult[]>('/api/v1/checks?limit=200');
export const sendFeedback = (id: number, decision: 'agree' | 'disagree') =>
  apiFetch(`/api/v1/checks/${id}/feedback`, { method: 'POST', body: JSON.stringify({ decision }) }, 'Не удалось сохранить отклик.');

export async function fetchTasks(): Promise<Task[]> {
  if (!API) return demoTasks;
  const parts = await Promise.all((['new', 'work', 'done'] as const).map(s => apiFetch<Task[]>(`/api/v1/expert/tasks?status=${s}`)));
  return parts.flat();
}
export const takeTask = (id: number) => apiFetch(`/api/v1/expert/tasks/${id}/take`, { method: 'POST' }, 'Не удалось взять задачу.');
export const resolveTask = (id: number, decision: Verdict, comment: string) =>
  apiFetch(`/api/v1/expert/tasks/${id}/resolve`, { method: 'POST', body: JSON.stringify({ decision, comment }) }, 'Не удалось сохранить решение.');

export interface Summary { days: number; byVerdict: Partial<Record<Verdict, number>>; daily: { day: string; total: number; fake: number }[]; topSources: { source: string; checks: number; fakes: number; avgRisk: number; trust: number }[]; expertQueue: number }
export const fetchSummary = (days: number) => apiFetch<Summary>(`/api/v1/analytics/summary?days=${days}`);

export async function check(kind: Kind, text: string, url?: string): Promise<CheckResult> {
  if (API) { // боевой режим: POST /api/v1/checks
    return apiFetch<CheckResult>('/api/v1/checks', { method: 'POST', body: JSON.stringify({ kind, text: text || undefined, url }) }, 'Не удалось выполнить проверку. Повторите попытку.');
  }
  await new Promise(r => setTimeout(r, 700)); // демо-режим: учебные данные
  if (url && !text) text = DEMO; // демо: «получаем» текст по ссылке
  const hits = text.match(/вдвое|шок|срочно|секрет|!/gi) ?? [];
  const risk = Math.min(0.95, 0.18 + hits.length * 0.22);
  const bad = risk >= T1;
  return {
    id: ++seq, title: url ? new URL(url).hostname : text.slice(0, 60), kind, risk, verdict: verdictOf(risk), createdAt: new Date().toLocaleString('ru-RU'),
    markers: bad ? [{ type: 'Эмоциональное давление', weight: 0.24, quote: hits[0] ?? '', note: 'Оценочная лексика усиливает тревогу без доказательств.' }] : [],
    facts: bad ? [{ claim: 'Изменение тарифа: 8%, а не 100%', source: 'city.example / Проект решения', similarity: 0.91 }] : [],
  };
}
