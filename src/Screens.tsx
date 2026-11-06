import { useCallback, useEffect, useState } from 'react';
import { API, fetchSummary, fetchTasks, resolveTask, takeTask, type Summary, type Task, type Verdict } from './api';
import { Badge } from './ui';

const STATES: Record<string, string> = { new: 'Ожидает эксперта', work: 'В работе', done: 'Решено' };
const VERDICTS: [Verdict, string][] = [['reliable', 'Достоверно'], ['suspicious', 'Подозрительно'], ['fake', 'Недостоверно']];

export function Expert() {
  const [tasks, setTasks] = useState<Task[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [st, setSt] = useState<Task['status']>('new'); const [pr, setPr] = useState('all');
  const [open, setOpen] = useState<number | null>(null); const [why, setWhy] = useState(''); const [fix, setFix] = useState<Verdict>('suspicious');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setTasks(await fetchTasks()); setError(''); } catch (e) { setError((e as Error).message); } setLoading(false); }, []);
  useEffect(() => { void load(); }, [load]);
  const n = (s: Task['status']) => tasks.filter(t => t.status === s).length;
  const rows = tasks.filter(t => t.status === st && (pr === 'all' || t.priority === pr));
  const cur = tasks.find(t => t.id === open);
  const act = async (f: () => Promise<unknown>, local: () => void) => {
    setBusy(true); setError('');
    try { if (API) { await f(); await load(); } else local(); } catch (e) { setError((e as Error).message); await load(); }
    setBusy(false);
  };
  const take = (t: Task) => act(() => takeTask(t.id), () => setTasks(ts => ts.map(x => (x.id === t.id ? { ...x, status: 'work', assignee: 'Вы' } : x)))).then(() => { setOpen(t.id); setWhy(''); setFix(t.verdict); });
  const done = (t: Task, d: Verdict) => act(() => resolveTask(t.id, d, why), () => setTasks(ts => ts.map(x => (x.id === t.id ? { ...x, status: 'done' } : x)))).then(() => setOpen(null));
  return <>
    <div><div className="eyebrow">Рабочее пространство</div><h1>Очередь экспертизы</h1><p className="small">Спорные оценки и материалы, которым нужна ручная проверка.</p></div>
    <div className="stats">{(['new', 'work', 'done'] as const).map(s => <div className="card" key={s}><div className="small">{STATES[s]}</div><div className="big">{n(s)}</div></div>)}</div>
    <div className="card grid2">
      <div><label htmlFor="s" style={{ marginTop: 0 }}>Состояние</label><select id="s" value={st} onChange={e => setSt(e.target.value as Task['status'])}>{Object.entries(STATES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div><label htmlFor="p" style={{ marginTop: 0 }}>Приоритет</label><select id="p" value={pr} onChange={e => setPr(e.target.value)}><option value="all">Все приоритеты</option><option>Высокий</option><option>Обычный</option></select></div>
    </div>
    {error && <div className="err">{error}</div>}
    <div className="card">{loading ? <p className="small">Загрузка…</p> : rows.length === 0 ? <p className="small">В этой категории задач нет.</p> :
      <table><thead><tr><th>Материал / основание</th><th>Вердикт / риск</th><th>Приоритет</th><th>Эксперт</th><th /></tr></thead><tbody>
        {rows.map(t => <tr key={t.id}><td><b>{t.title}</b><div className="small">{t.reason}</div></td><td><Badge v={t.verdict} /><div className="small">Риск {t.risk.toFixed(2)}</div></td><td>{t.priority}</td><td>{t.assignee ?? 'Не назначен'}</td>
          <td>{t.status === 'new' ? <button className="btn" disabled={busy} onClick={() => void take(t)}>Взять</button>
            : t.status === 'work' ? <button className="btn sec" onClick={() => { setOpen(t.id); setWhy(''); setFix(t.verdict); }}>Открыть</button> : null}</td></tr>)}
      </tbody></table>}</div>
    {cur && cur.status === 'work' && <div className="card"><h3>Решение должно быть обосновано</h3><p className="small">{cur.title} · риск {cur.risk.toFixed(2)}</p>
      {cur.text && <p className="small" style={{ maxHeight: '9rem', overflow: 'auto' }}>{cur.text}</p>}
      <label htmlFor="w">Аргумент эксперта</label><textarea id="w" rows={3} value={why} aria-invalid={why.length > 0 && why.length < 10} onChange={e => setWhy(e.target.value)} placeholder="Добавьте ссылку на источник или опишите, какой факт требует пересмотра." />
      <div className="small">Не менее 10 символов. Комментарий сохраняется в журнале действий вместе с решением.</div>
      <label htmlFor="v">Итоговый вердикт при исправлении</label>
      <select id="v" value={fix} onChange={e => setFix(e.target.value as Verdict)} style={{ maxWidth: '16rem' }}>{VERDICTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <p style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="btn" disabled={why.length < 10 || busy} onClick={() => void done(cur, cur.verdict)}>✓ Подтвердить вердикт</button>
        <button className="btn danger" disabled={why.length < 10 || busy || fix === cur.verdict} onClick={() => void done(cur, fix)}>✕ Исправить вердикт</button></p></div>}
  </>;
}

const DAYS = ['30.09', '01.10', '02.10', '03.10', '04.10', '05.10', '06.10']; const COUNTS = [28, 35, 31, 47, 53, 62, 58];
const fmtDay = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const pct = (x: number) => (x * 100).toFixed(1).replace('.', ',');

export function Analytics() {
  const [days, setDays] = useState(7);
  const [sum, setSum] = useState<Summary | null>(null); const [error, setError] = useState('');
  useEffect(() => {
    if (!API) return; let off = false;
    fetchSummary(days).then(r => { if (!off) { setSum(r); setError(''); } }).catch(e => { if (!off) setError((e as Error).message); });
    return () => { off = true; };
  }, [days]);

  // демо-данные, если сервер не подключён
  const live = API !== undefined;
  const labels = live ? (sum?.daily ?? []).map(d => fmtDay(d.day)) : DAYS.slice(-days);
  const data = live ? (sum?.daily ?? []).map(d => d.total) : COUNTS.slice(-days);
  const by = live ? sum?.byVerdict ?? {} : { reliable: 0.596, suspicious: 0.283, fake: 0.121 };
  const total = live ? Object.values(by).reduce((a, b) => a + b, 0) : data.reduce((a, b) => a + b, 0);
  const cnt = (k: Verdict) => (live ? by[k] ?? 0 : Math.round(total * (by[k] ?? 0)));
  const risky = live ? cnt('suspicious') + cnt('fake') : Math.round(total * 0.404);
  const max = Math.max(1, ...data);
  return <>
    <div><div className="eyebrow">Рабочее пространство</div><h1>Аналитика и кампании</h1><p className="small">{live ? 'Динамика проверок и источники с наибольшей долей недостоверных материалов.' : 'Динамика проверок и группы материалов с похожими формулировками.'}</p></div>
    <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: '12.5rem' }}><label htmlFor="d" style={{ marginTop: 0 }}>Период</label><select id="d" value={days} onChange={e => setDays(+e.target.value)}>{live ? <><option value={7}>7 дней</option><option value={30}>30 дней</option><option value={90}>90 дней</option></> : <><option value={7}>{DAYS[0]}–{DAYS[6]}.2026 (7 дней)</option><option value={3}>{DAYS[4]}–{DAYS[6]}.2026 (3 дня)</option></>}</select></div>
      <button className="btn sec" onClick={() => window.print()}>Экспорт отчёта</button></div>
    {error && <div className="err">{error}</div>}
    <div className="stats">
      <div className="card"><div className="small">Всего проверок</div><div className="big">{total}</div></div>
      <div className="card"><div className="small">С риском ≥ 0,40</div><div className="big">{risky}</div><div className="small">{total ? pct(risky / total) : 0}% всех материалов</div></div>
      {live ? <div className="card"><div className="small">В очереди экспертов</div><div className="big">{sum?.expertQueue ?? 0}</div></div>
        : <div className="card"><div className="small">Активные кампании</div><div className="big">2</div><div className="small">46 похожих материалов</div></div>}</div>
    <div className="grid2">
      <div className="card"><h3>Динамика проверок</h3><p className="small">Количество материалов{labels.length ? ` · ${labels[0]}–${labels[labels.length - 1]}` : ''}</p>
        {data.length === 0 ? <p className="small">За выбранный период проверок нет.</p> :
          <div className="chart" role="img" aria-label="Динамика проверок по дням">{data.map((v, i) => <div key={i}><b className="small">{v}</b><i style={{ height: `${(v / max) * 7.5}rem` }} /><span className="small">{labels[i]}</span></div>)}</div>}</div>
      <div className="card"><h3>По вердиктам</h3>{VERDICTS.map(([k]) => <p key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Badge v={k} /><span><b>{cnt(k)}</b> <span className="small">· {total ? pct(cnt(k) / total) : '0,0'}%</span></span></p>)}</div>
    </div>
    {live ? <div className="card"><h3>Источники</h3>{(sum?.topSources.length ?? 0) === 0 ? <p className="small">Данных по источникам пока нет.</p> :
      <table><thead><tr><th>Источник</th><th>Проверок</th><th>Недостоверных</th><th>Средний риск</th><th>Доверие</th></tr></thead><tbody>
        {sum!.topSources.map(x => <tr key={x.source}><td><b>{x.source}</b></td><td>{x.checks}</td><td>{x.fakes}</td><td>{x.avgRisk.toFixed(2)}</td><td>{x.trust.toFixed(2)}</td></tr>)}</tbody></table>}</div>
      : <div className="card"><h3>Кампании</h3>
        <table><thead><tr><th>Группа материалов</th><th>Материалов</th><th>Источников</th></tr></thead><tbody>
          <tr><td><b>Тарифы на транспорт вырастут вдвое</b></td><td>31</td><td>6</td></tr>
          <tr><td><b>Повторяющийся текст в отзывах «ГородДоставка»</b></td><td>15</td><td>9</td></tr></tbody></table></div>}
  </>;
}
