import { useEffect, useState } from 'react';
import { API, check, checkMany, fetchHistory, getSession, login, logout, parseBatch, sendFeedback, setOnUnauthorized, T1, T2, type BatchItem, type CheckResult, type Kind, type Role, type User, type Verdict } from './api';
import { Badge } from './ui';
import { Expert, Analytics } from './Screens';


function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [name, setName] = useState(''); const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const go = async () => { setBusy(true); setError(''); try { onLogin(await login(name.trim(), pwd)); } catch (e) { setError((e as Error).message); } setBusy(false); };
  return <div className="login"><form className="card" onSubmit={e => { e.preventDefault(); if (name && pwd && !busy) void go(); }}>
    <h2>Войти в МедиаФильтр</h2><p className="small">Продолжите работу с проверками и источниками.</p>
    <label htmlFor="e">Логин</label><input id="e" autoComplete="username" value={name} onChange={e => setName(e.target.value)} />
    <label htmlFor="p">Пароль</label><input id="p" type="password" autoComplete="current-password" value={pwd} onChange={e => setPwd(e.target.value)} />
    {error && <div className="err">{error}</div>}
    <p><button className="btn" type="submit" style={{ width: '100%' }} disabled={!name || !pwd || busy}>{busy ? 'Входим…' : 'Войти'}</button></p>
    {!API && <p className="small">Демо-режим: сервер не подключён, подойдут любые данные.</p>}
  </form></div>;
}

function Check({ onDone, onBatch }: { onDone: (r: CheckResult) => void; onBatch: (rs: CheckResult[]) => void }) {
  const [kind, setKind] = useState<Kind>('news'); const [mode, setMode] = useState<'url' | 'text'>('url');
  const [url, setUrl] = useState(''); const [text, setText] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [batch, setBatch] = useState<{ name: string; items: BatchItem[] } | null>(null); const [berr, setBerr] = useState(''); const [bmsg, setBmsg] = useState('');
  const urlOk = /^https?:\/\/\S+\.\S+$/.test(url); const short = mode === 'text' && text.length > 0 && text.length < 50;
  const ready = mode === 'url' ? urlOk : text.length >= 50;
  const run = async () => { setBusy(true); setError(''); try { onDone(await check(kind, mode === 'text' ? text : '', mode === 'url' ? url : undefined)); } catch (e) { setError((e as Error).message); } setBusy(false); };
  const pick = async (f?: File) => {
    if (!f) return; setBmsg('');
    try { if (f.size > 10 * 1024 * 1024) throw new Error(); const items = parseBatch(f.name, await f.text()); if (!items.length || items.length > 500) throw new Error(); setBatch({ name: f.name, items }); setBerr(''); }
    catch { setBatch(null); setBerr('Не удалось прочитать файл. Проверьте формат CSV или JSON и повторите загрузку.'); }
  };
  const runBatch = async () => { setBusy(true); setBerr(''); try { const rs = await checkMany(batch!.items); onBatch(rs); setBmsg(`Обработано записей: ${rs.length}. Результаты сохранены в истории.`); setBatch(null); } catch (e) { setBerr((e as Error).message); } setBusy(false); };
  return <>
    <div><div className="eyebrow">Рабочее пространство</div><h1>Новая проверка</h1><p className="small">Добавьте ссылку или текст. Мы покажем риск, маркеры и найденные источники.</p></div>
    <div className="card"><h3>Что проверяем?</h3>
      <div className="seg" role="tablist">{(['news', 'review'] as Kind[]).map(k => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{k === 'news' ? 'Новость' : 'Отзыв'}</button>)}</div>
      <p style={{ display: 'flex', gap: 16 }}>{(['url', 'text'] as const).map(m => <a href="#" key={m} style={{ fontWeight: mode === m ? 600 : 400 }} onClick={e => { e.preventDefault(); setMode(m); }}>{m === 'url' ? 'По ссылке' : 'Вставить текст'}</a>)}</p>
      {mode === 'url' ? <><label htmlFor="u" style={{ marginTop: 0 }}>Ссылка на материал</label><input id="u" value={url} placeholder="https://news.example/transport" aria-invalid={url.length > 0 && !urlOk} onChange={e => setUrl(e.target.value)} />
        {url && !urlOk ? <div className="err">Введите полный URL, включая https://</div> : urlOk ? <div className="small" style={{ color: 'var(--ok)' }}>✓ Ссылка имеет корректный формат</div> : <div className="small">Полный URL, включая https://</div>}</>
        : <><label htmlFor="t" style={{ marginTop: 0 }}>Текст материала</label><textarea id="t" rows={5} maxLength={20000} value={text} aria-invalid={short} onChange={e => setText(e.target.value)} />
          {short ? <div className="err">Текст короче 50 символов</div> : <div className="small">{text.length} символов · минимум 50, максимум 20 000</div>}</>}
      {error && <div className="err">{error}</div>}
      <p><button className="btn" disabled={!ready || busy} onClick={run}>{busy ? 'Проверяем…' : 'Проверить материал'}</button></p>
    </div>
    <div className="card"><h3>Несколько материалов</h3>
      <p className="small">CSV: столбцы type, url, text. JSON: массив объектов с теми же полями. Допустимый тип: news или review.</p>
      <label className="drop" style={{ display: 'block', cursor: 'pointer' }}><input type="file" accept=".csv,.json" hidden onChange={e => pick(e.target.files?.[0])} /><b>Загрузить CSV или JSON</b><div className="small">До 10 МБ · до 500 записей</div></label>
      {berr && <div className="err">{berr}</div>}
      {batch && <p className="okbox">✓ <b>{batch.name}</b><br />{batch.items.length} записей · {batch.items.filter(i => i.type === 'news').length} новостей · {batch.items.filter(i => i.type === 'review').length} отзывов<br />Формат проверен. Готово к отправке.</p>}
      {bmsg && <p className="okbox">✓ {bmsg}</p>}
      <p><button className="btn" disabled={!batch || busy} onClick={runBatch}>{busy ? 'Проверяем…' : 'Проверить пакет'}</button></p></div></>;
}

function Result({ r, onBack }: { r: CheckResult; onBack: () => void }) {
  const [state, setState] = useState(''); const [ferr, setFerr] = useState('');
  const vote = async (d: 'agree' | 'disagree') => { setFerr(''); try { if (API) await sendFeedback(r.id, d); setState(d === 'agree' ? 'ok' : 'no'); } catch (e) { setFerr((e as Error).message); } };
  return <>
    <div><div className="eyebrow">Рабочее пространство</div><h1>Результат проверки</h1><p className="small">Проверка № {r.id} · {r.kind === 'news' ? 'Новость' : 'Отзыв'} · {r.createdAt}</p></div>
    <div className="card"><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><h3>{r.title}</h3><Badge v={r.verdict} p={r.isPreliminary ? 'Предварительно' : undefined} /></div>
      {r.isPreliminary && <p className="small">Сервис анализа не ответил вовремя, оценка предварительная и основана только на данных об источнике. Повторите проверку позже.</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="small">Риск недостоверности</span><b>{r.risk.toFixed(2)}</b></div>
      <div className="bar"><i style={{ left: `${r.risk * 100}%` }} /></div>
      <div className="scale small"><span>0</span><span>{T1.toFixed(2)}</span><span>{T2.toFixed(2)}</span><span>1</span></div>
      <p className="small">0–&lt;0,40: достоверно; 0,40–&lt;0,75: подозрительно; 0,75–1: недостоверно. Оценка риска не заменяет экспертную проверку.</p>
      {state ? <div className={`badge ${state === 'ok' ? 'reliable' : 'fake'}`}>{state === 'ok' ? 'Вердикт подтверждён. Результат сохранён в истории.' : 'Вердикт оспорен. Запись передана эксперту.'}</div>
        : <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="btn" onClick={() => void vote('agree')}>✓ Подтвердить</button><button className="btn danger" onClick={() => void vote('disagree')}>✕ Оспорить</button><button className="btn sec" onClick={() => window.print()}>Экспорт PDF</button></div>}
      {ferr && <div className="err">{ferr}</div>}
    </div>
    <div className="grid2">
      <div><h3>Маркеры манипуляции · {r.markers.length}</h3>{r.markers.map((m, i) => <div className="card" key={i} style={{ marginTop: 8 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><h4>{m.type}</h4><b style={{ color: 'var(--warn)' }}>{m.weight.toFixed(2)}</b></div><p>«{m.quote}»</p><span className="small">{m.note}</span></div>)}</div>
      <div><h3>Найденные факты · {r.facts.length}</h3>{r.facts.map((f, i) => <div className="card" key={i} style={{ marginTop: 8 }}><h4>{f.claim}</h4><p><a href="#">{f.source}</a></p><span className="small">Сходство {Math.round(f.similarity * 100)}%</span></div>)}</div>
    </div>
    <div><button className="btn sec" onClick={onBack}>Новая проверка</button></div></>;
}

function History({ items, open }: { items: CheckResult[]; open: (r: CheckResult) => void }) {
  const [f, setF] = useState<'all' | Verdict>('all');
  const rows = items.filter(i => f === 'all' || i.verdict === f);
  return <>
    <div><div className="eyebrow">Рабочее пространство</div><h1>История проверок</h1><p className="small">{items.length} материалов · все ваши проверки в одном месте.</p></div>
    <div className="card"><label htmlFor="f" style={{ marginTop: 0 }}>Вердикт</label>
      <select id="f" value={f} onChange={e => setF(e.target.value as 'all' | Verdict)} style={{ maxWidth: '16rem' }}><option value="all">Все статусы</option><option value="reliable">Достоверно</option><option value="suspicious">Подозрительно</option><option value="fake">Недостоверно</option></select></div>
    <div className="card">{rows.length === 0 ? <p className="small">Проверок пока нет.</p> :
      <table><thead><tr><th>Материал / тип</th><th>Вердикт</th><th>Риск</th><th>Дата</th><th /></tr></thead><tbody>
        {rows.map(r => <tr key={r.id}><td><b>{r.title}</b><div className="small">{r.kind === 'news' ? 'Новость' : 'Отзыв'}</div></td><td><Badge v={r.verdict} /></td><td>{r.risk.toFixed(2)}</td><td className="small">{r.createdAt}</td><td><a href="#" onClick={e => { e.preventDefault(); open(r); }}>Открыть</a></td></tr>)}
      </tbody></table>}</div></>;
}

type Page = 'check' | 'history' | 'expert' | 'analytics';
const NAV: [Page, string, Role[]][] = [['check', 'Проверка', ['user', 'analyst', 'expert', 'admin']], ['history', 'История', ['user', 'analyst', 'expert', 'admin']],
  ['expert', 'Экспертиза', ['expert', 'admin']], ['analytics', 'Аналитика', ['analyst', 'admin']]];

export default function App() {
  const [user, setUser] = useState<User | null>(() => (API ? getSession()?.user ?? null : null));
  const [page, setPage] = useState<Page>('check');
  const [items, setItems] = useState<CheckResult[]>([]); const [cur, setCur] = useState<CheckResult | null>(null);
  useEffect(() => { setOnUnauthorized(() => setUser(null)); return () => setOnUnauthorized(null); }, []);
  useEffect(() => { // история с сервера после входа
    if (!API || !user) return;
    let off = false; fetchHistory().then(h => { if (!off) setItems(h); }).catch(() => { /* ошибка покажется при следующем действии */ });
    return () => { off = true; };
  }, [user]);
  if (!user) return <Login onLogin={u => { setPage('check'); setUser(u); }} />;
  const go = (p: Page) => { setCur(null); setPage(p); };
  const out = () => { logout(); setItems([]); setCur(null); setUser(null); };
  const nav = NAV.filter(n => n[2].includes(user.role));
  return <><header><div><span className="logo">🛡 МедиаФильтр</span>
    <nav>{nav.map(([p, t]) => <button key={p} className={page === p ? 'on' : ''} onClick={() => go(p)}>{t}</button>)}</nav>
    <button className="btn sec" onClick={out}>Выйти</button></div></header>
    <main>{cur ? <Result r={cur} onBack={() => go('check')} />
      : page === 'check' ? <Check onDone={r => { setItems(it => [r, ...it.filter(x => x.id !== r.id)]); setCur(r); }} onBatch={rs => setItems(it => [...rs, ...it])} />
      : page === 'history' ? <History items={items} open={setCur} />
      : page === 'expert' ? <Expert /> : <Analytics />}</main></>;
}
