import type { Verdict } from './api';
export const V: Record<Verdict, [string, string]> = { reliable: ['Достоверно', '✓'], suspicious: ['Подозрительно', '⚠'], fake: ['Недостоверно', '✕'] };
export const Badge = ({ v, p }: { v: Verdict; p?: string }) => <span className={`badge ${v}`}>{V[v][1]} {V[v][0]}{p ? ` · ${p}` : ''}</span>;
