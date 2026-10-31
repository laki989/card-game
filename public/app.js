const { useState, useEffect, useRef, useMemo, useContext, createContext } = React;

// ============================================================================
// CONSTANTS & HELPERS
// ============================================================================

const SUIT_IMG = {
  hearts: 'img/h-symbol.png',
  bells: 'img/b-symbol.png',
  leaves: 'img/l-symbol.png',
  acorns: 'img/a-symbol.png'
};
const SUIT_ORDER = ['hearts', 'bells', 'leaves', 'acorns'];
const RANK_ORDER = { A: 7, K: 6, Q: 5, J: 4, '10': 3, '9': 2, '8': 1, '7': 0 };
const LORA_SEQ = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const GAMES = {
  mexico: { name: 'Mexico', players: 3, desc: 'mexicoDesc', suits: ['hearts', 'bells'] },
  lorum: { name: 'Lorum', players: 4, desc: 'lorumDesc', suits: ['leaves', 'acorns'] }
};

const THEMES = [
  { id: 'felt', label: 'themeFelt' },
  { id: 'kafana', label: 'themeKafana' },
  { id: 'wood', label: 'themeWood' }
];
const LANGS = ['en', 'sr'];

function sortHand(hand) {
  return [...hand].sort((a, b) => {
    const s = SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit);
    return s !== 0 ? s : RANK_ORDER[b.rank] - RANK_ORDER[a.rank];
  });
}

const cardKey = c => `${c.suit}-${c.rank}`;

function getCardImagePath(card) {
  const suitPrefix = { hearts: 'H', bells: 'B', leaves: 'L', acorns: 'A' };
  const rankSuffix = { A: 'A', K: 'K', Q: 'Q', J: 'J', '10': '10', '9': '09', '8': '08', '7': '07' };
  return `img/${suitPrefix[card.suit]}-${rankSuffix[card.rank]}.webp`;
}

function nextRank(rank) {
  return LORA_SEQ[(LORA_SEQ.indexOf(rank) + 1) % 8];
}

function loraSequence(start) {
  const i = LORA_SEQ.indexOf(start);
  return [...LORA_SEQ.slice(i), ...LORA_SEQ.slice(0, i)];
}

function canPlayLora(gs, card) {
  if (!gs.loraStartRank) return true;
  const pile = gs.loraLayout[card.suit];
  if (pile.length === 0) return card.rank === gs.loraStartRank;
  return card.rank === nextRank(pile[pile.length - 1].rank);
}

// Must follow suit; in Mexico, if you can't, you must trump when you can.
function isLegalPlay(hand, trick, card, trump) {
  if (!trick || trick.length === 0) return true;
  const led = trick[0].card.suit;
  if (card.suit === led) return true;
  if (hand.some(c => c.suit === led)) return false;
  if (trump) {
    if (card.suit === trump) return true;
    if (hand.some(c => c.suit === trump)) return false;
  }
  return true;
}

const initial = name => (name || '?').trim().charAt(0).toUpperCase();
const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).catch(() => copyFallback(text));
  }
  return copyFallback(text);
}
function copyFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) { /* ignore */ }
  document.body.removeChild(ta);
  return Promise.resolve();
}

function loadPref(key, fallback) {
  try { return localStorage.getItem(`cardgames.${key}`) || fallback; } catch (e) { return fallback; }
}
function savePref(key, value) {
  try { localStorage.setItem(`cardgames.${key}`, value); } catch (e) { /* ignore */ }
}

// The seat token lets a player take their seat back after a reload or a killed app
const SESSION_KEY = 'cardgames.session';
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
}
function saveSession(sess) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(sess)); } catch (e) { /* ignore */ }
}
function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
}

// ============================================================================
// LANGUAGE
// ============================================================================

function makeI18n(lang) {
  const dict = window.I18N[lang] || window.I18N.en;
  const t = (key, vars) => {
    let s = dict[key] ?? window.I18N.en[key] ?? key;
    if (vars) for (const k in vars) s = s.split(`{${k}}`).join(vars[k]);
    return s;
  };
  // "3 cards" / "3 karte" / "5 karata"
  const pl = (n, noun) => {
    const f = window.I18N_NOUNS[lang][noun];
    if (lang === 'sr') {
      const m10 = n % 10, m100 = n % 100;
      const i = m10 === 1 && m100 !== 11 ? 0 : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 1 : 2;
      return `${n} ${f[i]}`;
    }
    return `${n} ${n === 1 ? f[0] : f[1]}`;
  };
  const suit = s => window.I18N_SUITS[lang][s];
  const contract = id => {
    const c = window.I18N_CONTRACTS[lang][id - 1];
    return c ? { id, name: c[0], rule: c[1] } : null;
  };
  const serverMsg = m => {
    if (lang !== 'sr') return m;
    const more = /^Waiting for (\d+) more player/.exec(m);
    if (more) return `Čeka se još ${pl(Number(more[1]), 'player')}`;
    const back = /^Waiting for (.+) to reconnect$/.exec(m);
    if (back) return t('waitingForReconnect', { name: back[1] });
    return window.I18N_SERVER_SR[m] || m;
  };
  return { lang, t, pl, suit, contract, serverMsg };
}

function defaultLang() {
  const saved = loadPref('lang', '');
  if (LANGS.includes(saved)) return saved;
  const nav = (navigator.language || '').toLowerCase();
  return /^(sr|hr|bs|me|sh)/.test(nav) ? 'sr' : 'en';
}

// ============================================================================
// DONATION (NBS IPS QR)
// ============================================================================

const DONATE = window.DONATE_CONFIG;

// "170-1037514000-85" -> "170000103751400085" (3 + 13 + 2 digits)
function account18(acc) {
  const p = String(acc).split('-');
  if (p.length === 3) return p[0] + p[1].padStart(13, '0') + p[2];
  return String(acc).replace(/\D/g, '');
}
function accountValid(acc) {
  const a = account18(acc);
  if (!/^\d{18}$/.test(a)) return false;
  return 98 - Number((BigInt(a.slice(0, 16)) * 100n) % 97n) === Number(a.slice(16));
}
if (!accountValid(DONATE.account)) {
  console.warn('[donate] The account number in config.js does not pass the bank check digits. Banking apps may reject the QR code.');
}

const fmtRsd = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fmtEur = (rsd, lang) => {
  const v = (rsd / DONATE.eurRate).toFixed(2);
  return lang === 'sr' ? `≈ ${v.replace('.', ',')} €` : `≈ €${v}`;
};
const fmtAmountLine = (rsd, lang) => (lang === 'sr' ? `${fmtRsd(rsd)},00 RSD` : `${fmtRsd(rsd)}.00 RSD`);

function ipsPayload(amount) {
  return [
    'K:PR', 'V:01', 'C:1',
    `R:${account18(DONATE.account)}`,
    `N:${DONATE.name}`,
    `I:RSD${Math.round(amount)},00`,
    `SF:${DONATE.paymentCode}`,
    `S:${DONATE.purpose}`
  ].join('|');
}

// Draws the QR on a canvas and returns a PNG data URL
function qrPng(text, px = 560) {
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const margin = 2;
  const cell = Math.floor(px / (n + margin * 2));
  const size = cell * (n + margin * 2);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#1a1a1a';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) g.fillRect((k + margin) * cell, (r + margin) * cell, cell, cell);
  return c.toDataURL('image/png');
}

// ============================================================================
// APP CONTEXT (layout, table, language, donation)
// ============================================================================

const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);
const useLayout = useApp;
const useI18n = useApp;

function useViewport() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [v, setV] = useState(read);
  useEffect(() => {
    const on = () => setV(read());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on); };
  }, []);
  return v;
}

// Phones, and narrow portrait tablets, get the stacked layout
const isMobileViewport = ({ w, h }) => w < 720 || (w < 900 && h > w);

// ============================================================================
// SHARED PIECES
// ============================================================================

function SuitIcon({ suit, size = 24, className = '' }) {
  const { suit: suitName } = useI18n();
  return <img className={`suit-icon ${className}`} src={SUIT_IMG[suit]} alt={suitName(suit)} width={size} height={size} draggable={false} />;
}

function Icon({ name, size = 18 }) {
  const paths = {
    menu: <><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></>,
    x: <><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></>,
    scroll: <><path d="M8 21h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8" /><path d="M8 3a2 2 0 0 0-2 2v14a2 2 0 0 1-2 2" /><line x1="10" y1="8" x2="16" y2="8" /><line x1="10" y1="12" x2="16" y2="12" /></>,
    chart: <><line x1="6" y1="20" x2="6" y2="12" /><line x1="12" y1="20" x2="12" y2="5" /><line x1="18" y1="20" x2="18" y2="9" /></>,
    chat: <path d="M21 11.5a8.4 8.4 0 0 1-12.2 7.5L3 21l2-5.5A8.4 8.4 0 1 1 21 11.5z" />,
    copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
    check: <polyline points="5 12 10 17 19 7" />,
    back: <><line x1="19" y1="12" x2="5" y2="12" /><polyline points="11 6 5 12 11 18" /></>,
    crown: <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />,
    trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4" /><path d="M16 6h3a3 3 0 0 1-3 4" /><line x1="12" y1="13" x2="12" y2="17" /><line x1="8" y1="20" x2="16" y2="20" /></>,
    userPlus: <><circle cx="10" cy="8" r="4" /><path d="M3 21a7 7 0 0 1 14 0" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="16" y1="11" x2="22" y2="11" /></>,
    send: <><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>,
    refresh: <><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
    beer: <><path d="M17 11h1a3 3 0 0 1 0 6h-1" /><path d="M9 12v6" /><path d="M13 12v6" /><path d="M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5Z" /><path d="M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8" /></>,
    coffee: <><path d="M10 2v2" /><path d="M14 2v2" /><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" /><path d="M6 2v2" /></>,
    package: <><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" /><path d="M12 22V12" /><path d="m3.3 7 7.7 4.73a2 2 0 0 0 2 0L20.7 7" /><path d="m7.5 4.27 9 5.15" /></>,
    heartHand: <><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /><path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66" /><path d="m18 15-2-2" /><path d="m15 18-2-2" /></>,
    landmark: <><line x1="3" y1="22" x2="21" y2="22" /><line x1="6" y1="18" x2="6" y2="11" /><line x1="10" y1="18" x2="10" y2="11" /><line x1="14" y1="18" x2="14" y2="11" /><line x1="18" y1="18" x2="18" y2="11" /><polygon points="12 2 20 7 4 7" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    globe: <><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></>,
    languages: <><path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="m22 22-5-10-5 10" /><path d="M14 18h6" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
    info: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>
  };
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

// Drawn face, used only if the illustrated image for a card is missing
function CardFace({ card, w }) {
  const small = w < 80;
  return (
    <div className={`card-face ${small ? 'card-face--small' : ''}`}>
      <div className="card-face__corner">
        <span>{card.rank}</span>
        <SuitIcon suit={card.suit} size={small ? 11 : 14} />
      </div>
      <SuitIcon suit={card.suit} size={Math.round(w * 0.4)} className="card-face__pip" />
      <div className="card-face__corner card-face__corner--br">
        <span>{card.rank}</span>
        <SuitIcon suit={card.suit} size={small ? 11 : 14} />
      </div>
    </div>
  );
}

function Card({ card, w = 96, onClick, dim, selected, className = '', style }) {
  const { suit } = useI18n();
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [card.suit, card.rank]);
  const interactive = !!onClick;
  return (
    <div
      className={`card ${interactive ? 'card--active' : ''} ${dim ? 'card--dim' : ''} ${selected ? 'card--selected' : ''} ${className}`}
      style={{ width: w, height: Math.round(w * 1.5), ...style }}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      aria-label={`${card.rank} ${suit(card.suit)}`}
    >
      {broken ? <CardFace card={card} w={w} /> : (
        <img src={getCardImagePath(card)} alt="" draggable={false} onError={() => setBroken(true)} />
      )}
    </div>
  );
}

// Uses your back.webp; falls back to a drawn back if it's missing
function CardBack({ w = 44 }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="card-back" style={{ width: w, height: Math.round(w * 1.5) }}>
      {broken ? (
        <div className="card-back__pattern"><div className="card-back__emblem" /></div>
      ) : (
        <img src="img/back.webp" alt="" draggable={false} onError={() => setBroken(true)} />
      )}
    </div>
  );
}

function BackFan({ count, w = 44, step = 14 }) {
  return (
    <div className="back-fan">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ marginLeft: i ? step - w : 0 }}><CardBack w={w} /></div>
      ))}
    </div>
  );
}

function Seat({ name, stats, turn, badge, compact }) {
  const { t } = useI18n();
  return (
    <div className={`seat ${compact ? 'seat--compact' : ''} ${turn ? 'seat--turn' : ''}`}>
      <div className="seat__avatar">{initial(name)}</div>
      <div className="seat__info">
        <div className="seat__name">
          <span>{name}</span>
          {turn && <span className="seat__dot" aria-label={t('theirTurn')} />}
        </div>
        <div className="seat__stats">{stats}</div>
      </div>
      {badge}
    </div>
  );
}

function Tag({ children, gold }) {
  return <div className={`tag ${gold ? 'tag--gold' : ''}`}>{children}</div>;
}

function Button({ children, variant = 'primary', className = '', ...props }) {
  return <button type="button" className={`btn btn--${variant} ${className}`} {...props}>{children}</button>;
}

function IconButton({ icon, label, className = '', ...props }) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} {...props}>
      <Icon name={icon} size={18} />
    </button>
  );
}

function LangSwitch({ compact }) {
  const { lang, setLang } = useApp();
  return (
    <div className={`lang-switch ${compact ? 'lang-switch--compact' : ''}`} role="group" aria-label="Language">
      {!compact && <span className="lang-switch__globe"><Icon name="globe" size={14} /></span>}
      {LANGS.map(l => (
        <button type="button" key={l} className={lang === l ? 'is-on' : ''} aria-pressed={lang === l} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// Scales a fixed 1440×900 design to fit the window (desktop)
function Stage({ children }) {
  const { vw } = useLayout();
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1440, window.innerHeight / 900));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [vw]);
  return (
    <div className="stage-wrap" onScroll={e => e.currentTarget.scrollTo(0, 0)}>
      <div className="stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>{children}</div>
    </div>
  );
}

// Desktop table: oval felt, or a square-cornered cloth / wood top
function Table({ top = 130 }) {
  const { theme } = useLayout();
  return <div className={`table table--${theme}`} style={{ top }}><div className={`table__surface surface-${theme}`} /></div>;
}

// Phone table: fills the middle of the screen, content flows inside
function MobileTable({ children }) {
  const { theme } = useLayout();
  return (
    <div className={`m-table m-table--${theme}`}>
      <div className={`m-table__surface surface-${theme}`}>{children}</div>
    </div>
  );
}

function CodePill({ code }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="code-pill"
      title={t('copyCode')}
      onClick={() => copyText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); })}
    >
      {copied ? t('copied') : code}
    </button>
  );
}

function StatusPart({ children, strong }) {
  return <span className={strong ? 'status-pill__strong' : 'status-pill__dim'}>{children}</span>;
}
const StatusSep = () => <span className="status-pill__sep" />;

function BuyRoundButton() {
  const { t, mobile, openDonate } = useApp();
  if (mobile) return <IconButton icon="beer" label={t('buyRound')} className="icon-btn--gold" onClick={openDonate} />;
  return <button type="button" className="scores-btn scores-btn--gold" onClick={openDonate}><Icon name="beer" size={15} />{t('buyRound')}</button>;
}

function Menu({ onNewGame, onLeave }) {
  const { theme, setTheme, t, openDonate } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <IconButton icon="menu" label={t('menu')} onClick={() => setOpen(o => !o)} aria-expanded={open} />
      {open && (
        <div className="menu__dropdown">
          {onNewGame && (
            <button type="button" className="menu__item" onClick={() => { setOpen(false); onNewGame(); }}>
              <Icon name="refresh" size={17} /><span className="menu__item-text">{t('newGame')}</span>
            </button>
          )}
          <button type="button" className="menu__item menu__item--gold" onClick={() => { setOpen(false); openDonate(); }}>
            <Icon name="beer" size={17} /><span className="menu__item-text">{t('buyCreatorRound')}</span>
            <span className="menu__tag">100+ RSD</span>
          </button>
          <div className="menu__item menu__item--static">
            <Icon name="languages" size={17} /><span className="menu__item-text">{t('language')}</span>
            <LangSwitch compact />
          </div>
          <div className="menu__sep" />
          <div className="menu__label">{t('table')}</div>
          {THEMES.map(th => (
            <button type="button" key={th.id} className={`menu__item ${theme === th.id ? 'is-on' : ''}`} onClick={() => setTheme(th.id)} aria-pressed={theme === th.id}>
              <span className={`swatch surface-${th.id}`} />
              <span className="menu__item-text">{t(th.label)}</span>
              {theme === th.id && <Icon name="check" size={15} />}
            </button>
          ))}
          <div className="menu__sep" />
          <button type="button" className="menu__item menu__item--danger" onClick={() => { setOpen(false); onLeave(); }}>
            <Icon name="logout" size={17} /><span className="menu__item-text">{t('leaveTable')}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function Modal({ title, subtitle, onClose, children, width = 600, className = '', head }) {
  const { mobile, t } = useApp();
  useEffect(() => {
    if (!onClose) return;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={`scrim ${mobile ? 'scrim--sheet' : ''}`} onClick={onClose}>
      <div className={`modal ${mobile ? 'modal--sheet' : ''} ${className}`} style={mobile ? undefined : { width }} onClick={e => e.stopPropagation()} role="dialog" aria-label={title}>
        {mobile && <div className="modal__handle" />}
        {head || (
          <div className="modal__head">
            <div>
              <h2 className="modal__title">{title}</h2>
              {subtitle && <div className="modal__sub">{subtitle}</div>}
            </div>
            {onClose && <IconButton icon="x" label={t('close')} onClick={onClose} />}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function Totals({ players, scores, leader, deltas }) {
  const { t } = useI18n();
  return (
    <div className="totals">
      {players.map((p, i) => (
        <div key={i} className={`total ${i === leader ? 'total--lead' : ''}`}>
          <div className="total__top">
            <span>{p.name}</span>
            {i === leader && <Icon name="crown" size={14} />}
          </div>
          <div className="total__score">{scores[i]}</div>
          {deltas && <div className={`total__delta ${deltas[i] > 0 ? 'is-bad' : deltas[i] < 0 ? 'is-good' : ''}`}>{t('thisDeal', { x: signed(deltas[i]) })}</div>}
        </div>
      ))}
    </div>
  );
}

// Final standings with a nudge to support the game
function GameOver({ gs, me, isHost, lowestWins, onPlayAgain, onLeave }) {
  const { t, openDonate } = useApp();
  const order = gs.players.map((p, i) => i).sort((a, b) => (lowestWins ? gs.scores[a] - gs.scores[b] : gs.scores[b] - gs.scores[a]));
  const winner = order[0];
  const gameName = GAMES[gs.gameType].name;
  const head = (
    <div className="gameover__head">
      <div className="gameover__trophy"><Icon name="trophy" size={24} /></div>
      <h2 className="modal__title">{t('winsGame', { name: gs.players[winner]?.name, game: gameName })}</h2>
      <div className="modal__sub">{t(lowestWins ? 'lorumWinSub' : 'mexicoWinSub', { s: gs.scores[winner] })}</div>
    </div>
  );
  return (
    <Modal title={t('gameOver')} width={560} className="gameover" head={head}>
      <div className="standings">
        {order.map((idx, place) => (
          <div key={idx} className={`standing ${place === 0 ? 'standing--win' : ''}`}>
            <span className="standing__rank">{place + 1}</span>
            <span className="standing__avatar">{initial(gs.players[idx].name)}</span>
            <span className="standing__name">{idx === me ? t('youTag', { name: gs.players[idx].name }) : gs.players[idx].name}</span>
            <span className="standing__score">{gs.scores[idx]}</span>
          </div>
        ))}
      </div>
      <div className="gameover__actions">
        <Button variant="secondary" onClick={onLeave}>{t('leaveTable')}</Button>
        {isHost
          ? <Button onClick={onPlayAgain}>{t('playAgain')}</Button>
          : <span className="gameover__wait">{t('waitingRestart', { name: gs.players[gs.hostIndex]?.name })}</span>}
      </div>
      <button type="button" className="nudge" onClick={openDonate}>
        <Icon name="beer" size={22} />
        <span className="nudge__text">
          <b>{t('nudgeTitle')}</b>
          <span>{t('nudgeSub')}</span>
        </span>
        <Icon name="chevron" size={18} />
      </button>
    </Modal>
  );
}

// ---------- Things that sit on the table (desktop: placed; phone: stacked) ----------

const usePaper = () => useLayout().theme !== 'felt';

function CenterPanel({ top, wide, children }) {
  const { mobile } = useLayout();
  const paper = usePaper();
  const inner = paper ? <div className="paper">{children}</div> : children;
  if (mobile) return <div className={`m-center ${paper ? 'm-center--paper' : ''}`}>{inner}</div>;
  return <div className={`center-panel ${wide ? 'center-panel--wide' : ''} ${paper ? 'center-panel--paper' : ''}`} style={{ top }}>{inner}</div>;
}

// Short prompt on the table: plain text on felt, a menu card / plate on cloth and wood
function TableNote({ top, eyebrow, title, children }) {
  const { mobile } = useLayout();
  const paper = usePaper();
  const body = (
    <>
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      {title && <div className="table-note__title">{title}</div>}
      {children && <div className="table-note__sub">{children}</div>}
    </>
  );
  if (mobile) return <div className={paper ? 'plate' : 'm-note'}>{body}</div>;
  return <div className="table-note" style={{ top }}>{paper ? <div className="paper paper--note">{body}</div> : body}</div>;
}

function WinnerBanner({ top, text, extra }) {
  const { mobile } = useLayout();
  const banner = (
    <div className="banner">
      <Icon name="trophy" size={16} />{text}{extra && <span className="banner__chip">{extra}</span>}
    </div>
  );
  if (mobile) return banner;
  return <div className="banner-row" style={{ top }}>{banner}</div>;
}

function TurnHint({ top, children }) {
  const { mobile } = useLayout();
  const hint = <div className="turn-hint">{children}</div>;
  if (mobile) return hint;
  return <div className="turn-hint-row" style={{ top }}>{hint}</div>;
}

// Trick cards fan out left to right in play order, close enough to read every corner
const FAN = {
  desk: { w: 116, step: 46, pad: 28, ys: [20, 12, 17, 10], h: 212 },
  mob: { w: 84, step: 32, pad: 22, ys: [16, 10, 14, 8], h: 156 }
};
const FAN_TILT = { 3: [6, 0, -6], 4: [7, 2, -3, -8] };

function TrickFan({ trick, players, top }) {
  const { mobile } = useLayout();
  const f = mobile ? FAN.mob : FAN.desk;
  const width = f.pad * 2 + f.w + f.step * (players - 1);
  const fan = (
    <div className="fan" style={{ width, height: f.h }}>
      {trick.map(({ card }, i) => (
        <Card
          key={cardKey(card)}
          card={card}
          w={f.w}
          className="fan__card"
          style={{ left: f.pad + i * f.step, top: f.ys[i], transform: `rotate(${-FAN_TILT[players][i]}deg)` }}
        />
      ))}
    </div>
  );
  if (mobile) return fan;
  return <div className="fan-row" style={{ top }}>{fan}</div>;
}

// ---------- Hand ----------

function HandRow({ cards, renderCard, top }) {
  const { mobile, vw } = useLayout();
  const w = mobile ? 64 : 96;
  const room = Math.min(vw, 480) - 32;
  const step = mobile ? Math.min(42, Math.floor((room - w) / Math.max(1, cards.length - 1))) : 58;
  const slots = cards.map((c, i) => renderCard(c, w, i ? { marginLeft: step - w } : undefined));
  if (mobile) return <div className="m-hand"><div className="hand">{slots}</div></div>;
  return <div className="hand-row" style={{ top }}><div className="hand">{slots}</div></div>;
}

// ---------- The game screen: one description, two layouts ----------

function DesktopOpponent({ pos, top, count, seat, tag }) {
  return (
    <div className={`opponent opponent--${pos}`} style={{ top }}>
      {pos === 'top' ? <><Seat {...seat} /><BackFan count={count} /></> : <><BackFan count={count} /><Seat {...seat} /></>}
      {tag && <div className="opponent__tag">{tag}</div>}
    </div>
  );
}

function MobileOpponent({ count, seat, tag, small }) {
  const w = small ? 22 : 26;
  return (
    <div className="m-opp">
      <div className="m-opp__backs"><BackFan count={count} w={w} step={7} />{tag}</div>
      <Seat compact {...seat} />
    </div>
  );
}

function GameShell({ title, code, status, actions, opponents, center, below, hand, me, overlays, desk }) {
  const { mobile, theme } = useLayout();
  if (mobile) {
    const order = ['left', 'top', 'right'];
    const opps = [...opponents].sort((a, b) => order.indexOf(a.pos) - order.indexOf(b.pos));
    return (
      <div className={`m-game theme-${theme}`} onScroll={e => e.currentTarget.scrollTo(0, 0)}>
        <div className="m-game__bg" />
        <div className="m-header">
          <div className="m-header__left"><span className="header__game">{title}</span><CodePill code={code} /></div>
          <div className="m-header__right">{actions}</div>
        </div>
        <div className="m-phase"><div className="status-pill">{status}</div></div>
        <div className="m-opponents">
          {opps.map(o => <MobileOpponent key={o.pos} count={o.count} seat={o.mseat || o.seat} tag={o.tag} small={opponents.length > 2} />)}
        </div>
        <div className="m-table-area"><MobileTable>{center}</MobileTable></div>
        {below && <div className="m-below">{below}</div>}
        <HandRow cards={hand.cards} renderCard={hand.render} />
        <div className="m-bottom"><Seat compact {...me.seat} />{me.tag}</div>
        {overlays}
      </div>
    );
  }
  return (
    <Stage>
      <div className="stage__bg" />
      <Table top={desk.tableTop} />
      <div className="header">
        <div className="header__left"><span className="header__game">{title}</span><CodePill code={code} /></div>
        <div className="status-pill">{status}</div>
        <div className="header__right">{actions}</div>
      </div>
      {opponents.map(o => (
        <DesktopOpponent key={o.pos} pos={o.pos} top={o.pos === 'top' ? desk.topTop : desk.sideTop} count={o.count} seat={o.seat} tag={o.tag} />
      ))}
      {center}
      <HandRow cards={hand.cards} renderCard={hand.render} top={desk.handTop} />
      <div className="me-row" style={{ top: desk.meTop }}><Seat {...me.seat} />{me.tag}</div>
      {overlays}
    </Stage>
  );
}

// ============================================================================
// SUPPORT THE GAME (donation receipt with a live QR code)
// ============================================================================

function Donate({ onClose }) {
  const { t, lang, mobile } = useApp();
  const tiers = [
    { key: 'tierCoffee', sr: 'kafa', icon: ['coffee'], rsd: DONATE.tiers[0] },
    { key: 'tierBeer', sr: 'pivo', icon: ['beer'], rsd: DONATE.tiers[1] },
    { key: 'tierTwoBeers', sr: 'dva piva', icon: ['beer', 'beer'], rsd: DONATE.tiers[2] },
    { key: 'tierCase', sr: 'gajba', icon: ['package'], custom: true }
  ];
  const [sel, setSel] = useState(1);
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const customValue = Math.min(Number(custom.replace(/\D/g, '')) || 0, DONATE.maxAmount);
  const amount = tiers[sel].custom ? customValue : tiers[sel].rsd;
  const qr = useMemo(() => (amount > 0 ? qrPng(ipsPayload(amount)) : null), [amount]);
  const fileName = `donacija-${amount}-rsd.png`;

  // Phones can hand the QR image to the bank app through the share sheet; elsewhere it downloads
  const canShareFile = useMemo(() => {
    try { return mobile && !!navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] }); } catch (e) { return false; }
  }, [mobile]);

  const flash = msg => { setNote(msg); setTimeout(() => setNote(null), 1800); };
  const copyDetails = () => {
    copyText(t('detailsText', { name: DONATE.name, account: DONATE.account, amount: fmtAmountLine(amount, lang), purpose: DONATE.purpose }))
      .then(() => flash(t('copiedDetails')));
  };
  const saveOrShare = async () => {
    if (!qr) return;
    if (canShareFile) {
      try {
        const blob = await (await fetch(qr)).blob();
        await navigator.share({ files: [new File([blob], fileName, { type: 'image/png' })], title: t('supportTitle') });
        return;
      } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = qr;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const onCustom = e => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 7);
    setCustom(digits ? fmtRsd(Math.min(Number(digits), DONATE.maxAmount)) : '');
    setSel(3);
  };

  return (
    <div className={`donate ${mobile ? 'donate--mobile' : ''}`} onClick={onClose}>
      <div className="donate__wrap" onClick={e => e.stopPropagation()}>
        <button type="button" className="donate__close" aria-label={t('close')} onClick={onClose}><Icon name="x" size={18} /></button>
        <div className="receipt" role="dialog" aria-label={t('supportTitle')}>
          <div className="receipt__head">
            <span className="receipt__mark"><Icon name="heartHand" size={28} /></span>
            <h2 className="receipt__title">{t('supportTitle')}</h2>
            <p className="receipt__lead">{t('supportLead')}</p>
          </div>
          <div className="receipt__dashes" />
          <div className="receipt__label"><b>{t('pickRound')}</b><span>{t('anyAmount')}</span></div>
          <div className="receipt__items" role="radiogroup" aria-label={t('pickRound')}>
            {tiers.map((tier, i) => {
              const on = sel === i;
              const rsd = tier.custom ? (customValue || DONATE.customPlaceholder) : tier.rsd;
              return (
                <div key={tier.key} className={`tier ${on ? 'tier--on' : ''}`} role="radio" aria-checked={on} tabIndex={0}
                  onClick={() => { setSel(i); if (tier.custom) setTimeout(() => inputRef.current?.focus(), 0); }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(i); } }}>
                  <span className="tier__radio"><span /></span>
                  <span className="tier__icons">{tier.icon.map((ic, k) => <Icon key={k} name={ic} size={tier.icon.length > 1 ? 15 : 18} />)}</span>
                  <span className="tier__text">
                    <span className="tier__name">{t(tier.key)}</span>
                    {lang !== 'sr' && <span className="tier__sr">{tier.sr}</span>}
                  </span>
                  <span className="tier__price">
                    {tier.custom ? (
                      <label className="tier__input" onClick={e => e.stopPropagation()}>
                        <input ref={inputRef} inputMode="numeric" value={custom} placeholder={fmtRsd(DONATE.customPlaceholder)}
                          onChange={onCustom} onFocus={() => setSel(3)} aria-label={t('tierCase')} />
                        <b>RSD</b>
                      </label>
                    ) : <b>{fmtRsd(tier.rsd)} RSD</b>}
                    <span className="tier__eur">{fmtEur(rsd, lang)}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="receipt__dashes" />
          <div className="receipt__total">
            <b className="receipt__total-label">{t('total')}</b>
            <span className="receipt__total-amount">
              <span>{amount > 0 ? `${fmtRsd(amount)} RSD` : '— RSD'}</span>
              {amount > 0 && <small>{fmtEur(amount, lang)}</small>}
            </span>
          </div>
          <div className="receipt__pay">
            <div className="receipt__qr">
              {qr ? <img src={qr} alt={`QR · ${fmtRsd(amount)} RSD`} /> : <span>{t('enterAmount')}</span>}
            </div>
            <div className="receipt__details">
              <b>{t('scanBank')}</b>
              <span>{t('payTo', { v: DONATE.name })}</span>
              <span>{t('payAccount', { v: DONATE.account })}</span>
              <span>{t('payAmount', { v: amount > 0 ? fmtAmountLine(amount, lang) : '—' })}</span>
              <span>{t('payFor', { v: t('payPurpose') })}</span>
            </div>
          </div>
          <div className="receipt__actions">
            <button type="button" className="receipt__btn" onClick={copyDetails} disabled={!amount}>
              <Icon name="copy" size={14} />{t('copyDetails')}
            </button>
            <button type="button" className="receipt__btn receipt__btn--red" onClick={saveOrShare} disabled={!qr}>
              <Icon name={canShareFile ? 'landmark' : 'download'} size={14} />{canShareFile ? t('openBank') : t('saveQr')}
            </button>
          </div>
          <div className="receipt__thanks">{note || t('thanks')}</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CHAT (fixed on top of everything so it stays readable)
// ============================================================================

function Chat({ messages, me, onSend, unread, open, setOpen, placement }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const endRef = useRef(null);
  useEffect(() => { if (open) endRef.current?.scrollIntoView({ block: 'end' }); }, [messages, open]);
  const send = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  };
  const time = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div className={`chat chat--${placement}`}>
      {open && (
        <div className="chat__panel">
          <div className="chat__head">
            <span>{t('tableChat')}</span>
            <IconButton icon="x" label={t('closeChat')} onClick={() => setOpen(false)} />
          </div>
          <div className="chat__messages">
            {messages.length === 0 && <div className="chat__empty">{t('noMessages')}</div>}
            {messages.map((m, i) => (
              <div key={i} className={`chat__msg ${m.playerIndex === me ? 'chat__msg--own' : ''}`}>
                <div className="chat__meta"><b>{m.playerName}</b><span>{time(m.timestamp)}</span></div>
                <div className="chat__text">{m.message}</div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="chat__input">
            <input
              value={text}
              maxLength={200}
              placeholder={t('messagePlaceholder')}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send(); }}
              autoFocus
            />
            <button type="button" className="chat__send" onClick={send} disabled={!text.trim()} aria-label={t('send')}>
              <Icon name="send" size={16} />
            </button>
          </div>
        </div>
      )}
      {!open && (
        <button type="button" className="chat__pill" onClick={() => setOpen(true)}>
          <Icon name="chat" size={16} />
          <span>{t('chat')}</span>
          {unread > 0 && <span className="chat__badge">{unread}</span>}
        </button>
      )}
    </div>
  );
}

// ============================================================================
// HOME
// ============================================================================

function PasswordPrompt({ host, wrong, onSubmit, onClose }) {
  const { t } = useApp();
  const [pw, setPw] = useState('');
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="prompt" onClick={onClose}>
      <form className="modal prompt__box" role="dialog" aria-label={t('passwordTitle')} onClick={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); if (pw.trim()) onSubmit(pw.trim()); }}>
        <div className="modal__head">
          <div>
            <h2 className="modal__title">{t('passwordTitle')}</h2>
            <div className="modal__sub">{host ? t('passwordSub', { name: host }) : t('passwordSubAnon')}</div>
          </div>
          <IconButton icon="x" label={t('close')} type="button" onClick={onClose} />
        </div>
        <label className="field">
          <span className="field__label">{t('passwordField')}</span>
          <input className={`input ${wrong ? 'input--error' : ''}`} value={pw} maxLength={32} autoFocus autoComplete="off" spellCheck="false"
            onChange={e => setPw(e.target.value)} />
          {wrong && <span className="field__error">{t('wrongPassword')}</span>}
        </label>
        <div className="modal__actions">
          <Button variant="secondary" type="button" onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" disabled={!pw.trim()}>{t('join')}</Button>
        </div>
      </form>
    </div>
  );
}

function TablesPanel({ tables, variant, onPick }) {
  const { t } = useApp();
  const [filter, setFilter] = useState('all');
  const shown = filter === 'all' ? tables : tables.filter(x => x.gameType === filter);
  return (
    <section className={`tables tables--${variant}`} aria-label={t('openTables')}>
      <div className="tables__head">
        <div className="tables__title">
          <span className="tables__live" aria-hidden="true" />
          <h2>{t('openTables')}</h2>
          <span className="tables__count">{tables.length}</span>
        </div>
        <div className="tables__filter" role="group" aria-label={t('game')}>
          {['all', 'mexico', 'lorum'].map(f => (
            <button type="button" key={f} className={filter === f ? 'is-on' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? t('filterAll') : GAMES[f].name}
            </button>
          ))}
        </div>
      </div>
      <div className="tables__scroll">
        {shown.length === 0 ? (
          <div className="tables__empty">{filter === 'all' ? t('noTables') : t('noTablesFor', { game: GAMES[filter].name })}</div>
        ) : (
          <div className="tables__list">
            {shown.map(tb => {
              const g = GAMES[tb.gameType];
              return (
                <button type="button" key={tb.id} className="table-row" onClick={() => onPick(tb)}>
                  <span className="table-row__suits">{g.suits.map(s => <SuitIcon key={s} suit={s} size={20} />)}</span>
                  <span className="table-row__main">
                    <b>{g.name}</b>
                    <span title={`${t('hostedBy', { name: tb.host })}${tb.mode ? ` · ${t(tb.mode === 'choice' ? 'firstChooses' : 'fixedOrder')}` : ''}`}>{t('hostedBy', { name: tb.host })}{tb.mode ? ` · ${t(tb.mode === 'choice' ? 'firstChooses' : 'fixedOrder')}` : ''}</span>
                  </span>
                  <span className={`table-row__lock ${tb.locked ? '' : 'is-off'}`} title={tb.locked ? t('lockedTable') : undefined}><Icon name="lock" size={15} /></span>
                  <span className="table-row__seats">
                    <span className="seat-dots" aria-hidden="true">{Array.from({ length: tb.max }).map((_, i) => <i key={i} className={i < tb.seats ? 'is-on' : ''} />)}</span>
                    <span className="table-row__count">{tb.seats}/{tb.max}</span>
                  </span>
                  <span className="table-row__join">{t('join')}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="tables__foot"><Icon name="info" size={14} /><span>{t('tablesHint')}</span></div>
    </section>
  );
}

function Home({ tables, invite, denied, onDismissInvite, onCreate, onJoin }) {
  const { mobile, vw, t, openDonate } = useApp();
  const narrow = vw <= 900; // matches the CSS breakpoint: one column, panel inside it
  const [name, setName] = useState(loadPref('name', ''));
  const [game, setGame] = useState('mexico');
  const [mode, setMode] = useState('fixed');
  const [password, setPassword] = useState('');
  const [nameError, setNameError] = useState(false);
  const [prompt, setPrompt] = useState(null); // { id, wrong, n }

  // The server asks for a password (invite link) or says the one given was wrong
  useEffect(() => {
    if (denied) setPrompt({ id: denied.gameId, wrong: denied.reason === 'wrong_password', n: denied.ts });
  }, [denied]);

  const withName = fn => {
    if (!name.trim()) { setNameError(true); return; }
    savePref('name', name.trim());
    fn(name.trim());
  };
  const joinTable = tb => withName(n => (tb.locked ? setPrompt({ id: tb.id, wrong: false, n: Date.now() }) : onJoin(tb.id, n)));
  const promptTable = prompt && tables.find(x => x.id === prompt.id);

  const fan = [['A', 'hearts', -28], ['K', 'bells', -14], ['Q', 'leaves', 0], ['J', 'acorns', 14], ['10', 'hearts', 28]];
  const spread = mobile ? 30 : 74;
  const drop = mobile ? 6 : 14;

  return (
    <div className="home">
      <div className="home__lang"><LangSwitch /></div>
      {narrow && (
        <div className="home__fan" aria-hidden="true">
          <div className="home__glow" />
          {fan.map(([r, s, rot], i) => (
            <Card key={i} card={{ rank: r, suit: s }} w={mobile ? 64 : 120} className="home__fan-card"
              style={{ transform: `translateX(${(i - 2) * spread}px) translateY(${Math.abs(i - 2) * drop}px) rotate(${rot}deg)` }} />
          ))}
        </div>
      )}

      <div className="home__content">
        <div className="home__heading">
          <div className="eyebrow">{t('eyebrow')}</div>
          <h1 className="home__title">{t('homeTitle')}</h1>
          <p className="home__lead">{t('homeLead')}</p>
        </div>

        <label className="field">
          <span className="field__label">{t('yourName')}</span>
          <input
            className={`input ${nameError ? 'input--error' : ''}`}
            value={name}
            maxLength={20}
            placeholder={t('namePlaceholder')}
            onChange={e => { setName(e.target.value); setNameError(false); }}
          />
          {nameError && <span className="field__error">{t('nameMissing')}</span>}
        </label>

        {invite && (
          <div className="invite">
            <div className="invite__text">
              <b>{t('invitedTitle')}</b>
              <span>{t('invitedSub', { code: invite })}</span>
            </div>
            <Button onClick={() => withName(n => onJoin(invite, n))}>{t('joinTable')}</Button>
            <IconButton icon="x" label={t('close')} onClick={onDismissInvite} />
          </div>
        )}

        {narrow && <TablesPanel tables={tables} variant="inline" onPick={joinTable} />}

        <div className="field">
          <span className="field__label">{t('game')}</span>
          <div className="tiles">
            {Object.entries(GAMES).map(([id, g]) => (
              <button type="button" key={id} className={`tile ${game === id ? 'tile--on' : ''}`} onClick={() => setGame(id)} aria-pressed={game === id}>
                <div className="tile__top">
                  <div className="tile__suits">{g.suits.map(s => <SuitIcon key={s} suit={s} size={22} />)}</div>
                  <span className="tile__players">{t(mobile ? 'playersShort' : 'playersN', { n: g.players })}</span>
                </div>
                <div className="tile__name">{g.name}</div>
                <div className="tile__desc">{t(g.desc)}</div>
              </button>
            ))}
          </div>
        </div>

        {game === 'lorum' && (
          <div className="field">
            <span className="field__label">{t('contractOrder')}</span>
            <div className="segmented">
              <button type="button" className={mode === 'fixed' ? 'is-on' : ''} onClick={() => setMode('fixed')}>{t('fixedOrder')}</button>
              <button type="button" className={mode === 'choice' ? 'is-on' : ''} onClick={() => setMode('choice')}>{t('firstChooses')}</button>
            </div>
          </div>
        )}

        <label className="field">
          <span className="field__label">{t('passwordOptional')}</span>
          <input className="input" value={password} maxLength={32} autoComplete="off" spellCheck="false"
            placeholder={t('passwordPlaceholder')} onChange={e => setPassword(e.target.value)} />
        </label>

        <div className="home__actions">
          <Button className="home__create" onClick={() => withName(n => onCreate(n, { gameType: game, contractMode: game === 'lorum' ? mode : null, password: password.trim() || undefined }))}>
            {t('createTable', { game: GAMES[game].name })}
          </Button>
        </div>

        <button type="button" className="home__donate" onClick={openDonate}>
          <Icon name="beer" size={15} />
          <span>{t('enjoying')}</span>
          <b>{t('buyCreatorRound')}</b>
        </button>
      </div>

      {!narrow && <TablesPanel tables={tables} variant="side" onPick={joinTable} />}

      {prompt && (
        <PasswordPrompt key={prompt.n} host={promptTable?.host} wrong={prompt.wrong}
          onClose={() => setPrompt(null)}
          onSubmit={pw => withName(n => onJoin(prompt.id, n, pw))} />
      )}
    </div>
  );
}

// ============================================================================
// LOBBY
// ============================================================================

function Lobby({ gs, me, onReady, onStart, onLeave }) {
  const { mobile, t, pl } = useApp();
  const paper = usePaper();
  const [copied, setCopied] = useState(false);
  const max = gs.maxPlayers;
  const isHost = me === gs.hostIndex;
  const n = gs.players.length;
  const notReady = gs.players.filter(p => !p.ready);
  const allIn = n === max;
  const away = gs.players.filter(p => p.connected === false);
  const canStart = allIn && notReady.length === 0 && away.length === 0;
  const myReady = gs.players[me]?.ready;

  let hint;
  if (!allIn) hint = t('hintShare', { more: pl(max - n, 'player') });
  else if (away.length) hint = t('waitingForReconnect', { name: away[0].name });
  else if (notReady.length) hint = t('hintReady', { names: notReady.map(p => p.name).join(', ') });
  else hint = isHost ? t('hintHostGo') : t('hintGuestGo', { host: gs.players[gs.hostIndex].name });

  const statusOf = idx => (idx === gs.hostIndex ? 'host' : gs.players[idx].connected === false ? 'reconnectingShort' : gs.players[idx].ready ? 'ready' : 'notReady');
  const mode = gs.gameType === 'lorum' ? t(gs.contractMode === 'choice' ? 'modeChoice' : 'modeFixed') : t('lobbyWord');
  const nameOf = idx => (idx === me ? t('youTag', { name: gs.players[idx].name }) : gs.players[idx].name);

  const centerBody = (
    <>
      <div className="eyebrow">{GAMES[gs.gameType].name} · {mode}</div>
      <h1 className="lobby-center__title">{allIn ? t('everyoneHere') : t('seatedOf', { n, max })}</h1>
      <div className="code-box">
        <span className="code-box__value">{gs.gameId}</span>
        <button type="button" className="code-box__copy" onClick={() => copyText(`${window.location.origin}/?join=${gs.gameId}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); })}>
          <Icon name={copied ? 'check' : 'copy'} size={14} />{copied ? t('copied') : t('copyLink')}
        </button>
      </div>
      <div className="lobby-center__hint">{hint}</div>
    </>
  );

  const action = isHost ? (
    <Button onClick={onStart} disabled={!canStart}>{t('startGame')}</Button>
  ) : (
    <Button variant={myReady ? 'secondary' : 'primary'} onClick={() => onReady(!myReady)}>
      {myReady ? t('notReady') : t('imReady')}
    </Button>
  );

  if (mobile) {
    return (
      <div className="m-lobby">
        <div className="m-game__bg" />
        <div className="m-lobby__top">
          <button type="button" className="back-link back-link--inline" onClick={onLeave}><Icon name="back" size={16} /> {t('leaveTable')}</button>
        </div>
        <div className="m-lobby__table">
          <MobileTable>
            <div className={`m-lobby__center ${paper ? 'paper' : ''}`}>{centerBody}</div>
          </MobileTable>
        </div>
        <div className="m-lobby__seats">
          <div className="m-lobby__label"><span className="eyebrow">{t('atTheTable')}</span><span className="m-lobby__count">{n} / {max}</span></div>
          {Array.from({ length: max }).map((_, idx) => {
            const p = gs.players[idx];
            if (!p) {
              return (
                <div key={idx} className="m-seat-row m-seat-row--open">
                  <div className="m-seat-row__avatar m-seat-row__avatar--open"><Icon name="userPlus" size={16} /></div>
                  <span className="m-seat-row__name">{t('openSeat')}</span>
                  <span className="m-seat-row__status m-seat-row__status--wait">{t('waitingDots')}</span>
                </div>
              );
            }
            const st = statusOf(idx);
            return (
              <div key={idx} className="m-seat-row">
                <div className="m-seat-row__avatar">{initial(p.name)}</div>
                <span className="m-seat-row__name">{nameOf(idx)}</span>
                <span className="m-seat-row__status"><span className={`dot ${st === 'ready' ? 'dot--good' : st === 'host' ? 'dot--gold' : 'dot--off'}`} />{t(st)}</span>
              </div>
            );
          })}
          <div className="m-lobby__action">{action}</div>
        </div>
      </div>
    );
  }

  const positions = max === 4 ? ['bottom', 'right', 'top', 'left'] : ['bottom', 'left', 'right'];
  const seatAt = pos => {
    const idx = (me + positions.indexOf(pos)) % max;
    const p = gs.players[idx];
    // Seats are filled in join order, so an index past the end is an open seat
    if (!p || idx >= n) {
      return (
        <div className="seat seat--open">
          <div className="seat__avatar seat__avatar--open"><Icon name="userPlus" size={18} /></div>
          <div className="seat__info"><div className="seat__name seat__name--dim">{t('openSeat')}</div></div>
        </div>
      );
    }
    return (
      <Seat
        name={nameOf(idx)}
        stats={t(statusOf(idx))}
        badge={p.ready ? <span className="seat__check"><Icon name="check" size={13} /></span> : null}
      />
    );
  };

  return (
    <Stage>
      <div className="stage__bg" />
      <Table top={190} />
      <button type="button" className="back-link" onClick={onLeave}><Icon name="back" size={16} /> {t('leaveTable')}</button>
      <div className="lobby-menu"><Menu onLeave={onLeave} /></div>
      <div className="lobby-center">
        {paper ? <div className="paper">{centerBody}{action}</div> : <>{centerBody}{action}</>}
      </div>
      {positions.filter(p => p !== 'bottom').map(pos => (
        <div key={pos} className={`lobby-seat lobby-seat--${pos}`}>{seatAt(pos)}</div>
      ))}
      <div className="lobby-seat lobby-seat--bottom">{seatAt('bottom')}</div>
    </Stage>
  );
}

// ============================================================================
// MEXICO (3 players)
// ============================================================================

function MexicoGame({ socket, gs, me, isHost, onLeave }) {
  const { mobile, t, suit } = useApp();
  const [discards, setDiscards] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const code = gs.gameId;
  const emit = (ev, data = {}) => socket.emit(ev, { gameId: code, ...data });

  useEffect(() => { if (gs.state !== 'talon_reveal') setDiscards([]); }, [gs.state]);

  const positions = ['bottom', 'left', 'right'];
  const idxAt = pos => (me + positions.indexOf(pos)) % 3;
  const name = i => gs.players[i]?.name || '';
  const myTurn = gs.currentPlayer === me;
  const bidLabel = bid => (bid === 'pass' ? t('pass').toUpperCase() : bid === 'betl' ? 'BETL' : bid === 'mexico' ? 'MEXICO' : String(bid));

  // Bidding rules (mirrors the server)
  const bids = gs.bids || [null, null, null];
  const numeric = bids.filter(b => b !== null && b !== 'pass' && b !== 'betl').map(b => (b === 'mexico' ? 20 : parseInt(b, 10)));
  const highest = numeric.length ? Math.max(...numeric) : 0;
  const highestIdx = bids.findIndex(b => b !== null && b !== 'pass' && b !== 'betl' && (b === 'mexico' ? 20 : parseInt(b, 10)) === highest);
  const isFirstBid = bids.every(b => b === null);
  const hasBetl = bids.includes('betl');
  const iAmFirst = me === (gs.currentDealer + 1) % 3;
  const canBid = n => {
    if (isFirstBid) return n >= 5;
    if (n === 5) return false;
    if (hasBetl) return n >= 7;
    return n > highest;
  };

  const contractText = () => {
    if (gs.bidWinner === null || gs.bidWinner === undefined) return null;
    const b = bids[gs.bidWinner];
    const who = gs.bidWinner === me ? t('you') : name(gs.bidWinner);
    if (b === 'betl') return t('betlBy', { who });
    if (b === 'mexico') return t('mexicoBy', { who });
    return t('contractBy', { bid: b, who });
  };

  const phaseKey = {
    bidding: 'bidding', talon_reveal: 'talon', trump_selection: 'choosingTrump',
    playing: 'playing', trick_complete: 'playing', finished: 'gameOver'
  }[gs.state];

  const turnOf = i => {
    if (gs.state === 'bidding' || gs.state === 'playing') return gs.currentPlayer === i;
    if (gs.state === 'talon_reveal' || gs.state === 'trump_selection') return gs.bidWinner === i;
    return false;
  };
  const showTricks = ['playing', 'trick_complete'].includes(gs.state);
  const stats = i => `${t('scoreN', { n: gs.scores[i] })}${showTricks ? ` · ${t('tricksN', { n: gs.tricksTaken[i] })}` : ''}`;
  const shortStats = i => (showTricks ? t('tricksN', { n: gs.tricksTaken[i] }) : t('scoreN', { n: gs.scores[i] }));
  const tagFor = i => (gs.state === 'bidding' && bids[i] !== null ? <Tag gold={i === highestIdx}>{bidLabel(bids[i])}</Tag> : null);

  const hand = sortHand(gs.hand || []);
  const discarding = gs.state === 'talon_reveal' && gs.bidWinner === me;
  const playing = gs.state === 'playing' && myTurn;
  const toggleDiscard = c => setDiscards(d => (d.some(x => cardKey(x) === cardKey(c)) ? d.filter(x => cardKey(x) !== cardKey(c)) : d.length < 2 ? [...d, c] : d));

  const renderCard = (c, w, style) => {
    const selected = discards.some(x => cardKey(x) === cardKey(c));
    if (discarding) {
      return (
        <div key={cardKey(c)} className={`hand__slot ${selected ? 'hand__slot--up' : ''}`} style={style}>
          {selected && <div className="discard-tag">{t('discard')}</div>}
          <Card card={c} w={w} selected={selected} onClick={() => toggleDiscard(c)} />
        </div>
      );
    }
    const legal = playing && isLegalPlay(gs.hand, gs.currentTrick, c, gs.trump);
    return (
      <div key={cardKey(c)} className="hand__slot" style={style}>
        <Card card={c} w={w} onClick={legal ? () => emit('play_card', { card: c }) : undefined} dim={playing && !legal} />
      </div>
    );
  };

  // ----- what's on the table -----
  let center = null;
  if (gs.state === 'bidding') {
    center = (
      <CenterPanel top={220}>
        <div className="center-panel__current">
          <div className="eyebrow">{t(isFirstBid ? 'openingBid' : 'highestBid')}</div>
          <div className="center-panel__big">
            {isFirstBid ? t('noBidsYet') : hasBetl && highest < 7 ? t('betlByName', { name: name(bids.indexOf('betl')) }) : t('bidBy', { bid: highest === 20 ? 'Mexico' : highest, name: name(highestIdx) })}
          </div>
        </div>
        {myTurn && !gs.passedPlayers[me] ? (
          <>
            <div className="center-panel__prompt">{t(iAmFirst && isFirstBid ? 'youOpen' : 'yourTurnBid')}</div>
            <div className="bid-row">
              {[5, 6, 7, 8, 9, 10].map(n => (
                <button type="button" key={n} className="bid-chip" disabled={!canBid(n)} onClick={() => emit('bid', { bid: n })}>{n}</button>
              ))}
            </div>
            <div className="bid-row">
              <button type="button" className="pill pill--outline" disabled={!isFirstBid && highest >= 7} onClick={() => emit('bid', { bid: 'betl' })}>Betl</button>
              <button type="button" className="pill pill--red" onClick={() => emit('bid', { bid: 'mexico' })}>Mexico</button>
              <button type="button" className="pill pill--soft" disabled={isFirstBid && iAmFirst} onClick={() => emit('bid', { bid: 'pass' })}>{t('pass')}</button>
            </div>
          </>
        ) : (
          <div className="center-panel__prompt">{gs.passedPlayers[me] ? t('youPassed') : ''}{t('waitingBid', { name: name(gs.currentPlayer) })}</div>
        )}
      </CenterPanel>
    );
  } else if (gs.state === 'talon_reveal') {
    center = (
      <CenterPanel top={196}>
        <div className="eyebrow">{t(discarding ? 'talonYours' : 'theTalon')}</div>
        <div className="talon">{(gs.talon || []).map(c => <Card key={cardKey(c)} card={c} w={mobile ? 64 : 96} />)}</div>
        {discarding ? (
          <>
            <div className="center-panel__prompt">{t('talonHint')}</div>
            <div className="bid-row bid-row--stack">
              <span className="counter">{t('selectedN', { n: discards.length })}</span>
              <Button disabled={discards.length !== 2} onClick={() => emit('take_talon', { discards })}>{t('discard2')}</Button>
            </div>
          </>
        ) : (
          <div className="center-panel__prompt">{t('theyDiscard', { name: name(gs.bidWinner) })}</div>
        )}
      </CenterPanel>
    );
  } else if (gs.state === 'trump_selection') {
    center = gs.bidWinner === me ? (
      <CenterPanel top={222}>
        <div className="eyebrow">{t('callTrumps')}</div>
        <div className="center-panel__big">{t('whichSuit')}</div>
        <div className="bid-row">
          {SUIT_ORDER.map(s => (
            <button type="button" key={s} className="suit-choice" onClick={() => emit('select_trump', { trump: s })}>
              <SuitIcon suit={s} size={mobile ? 34 : 52} />
              <span>{suit(s)}</span>
            </button>
          ))}
        </div>
      </CenterPanel>
    ) : (
      <TableNote top={300} eyebrow={t('callTrumps')} title={t('theyChoosing', { name: name(gs.bidWinner) })}>{t('winnerPicksTrump')}</TableNote>
    );
  } else if (gs.state === 'playing' || gs.state === 'trick_complete') {
    center = (
      <>
        {gs.currentTrick.length > 0 && <TrickFan trick={gs.currentTrick} players={3} top={250} />}
        {gs.state === 'playing' && gs.currentTrick.length === 0 && (
          <TableNote top={320} title={myTurn ? t('yourLead') : t('theyLead', { name: name(gs.currentPlayer) })}>
            {gs.trump ? t('suitTrumps', { suit: suit(gs.trump) }) : bids[gs.bidWinner] === 'betl' ? t('betlNoTrumps') : t('noTrumps')}
          </TableNote>
        )}
        {gs.state === 'trick_complete' && gs.lastTrickWinner !== null && (
          <WinnerBanner top={478} text={gs.lastTrickWinner === me ? t('youTake') : t('theyTake', { name: name(gs.lastTrickWinner) })} />
        )}
      </>
    );
  }

  const history = gs.gameHistory || [];
  const leader = gs.scores.indexOf(Math.max(...gs.scores));

  const overlays = (
    <>
      {showHistory && (
        <Modal title={t('roundHistory')} onClose={() => setShowHistory(false)} width={620}>
          <Totals players={gs.players} scores={gs.scores} leader={leader} />
          {history.length === 0 ? <div className="empty">{t('noRounds')}</div> : (
            <div className="score-table score-table--scroll">
              <div className="score-table__row score-table__row--head">
                <span className="c-num">#</span><span className="c-name">{t('colContract')}</span><span className="c-suit">{t('colTrump')}</span>
                {gs.players.map((p, i) => <span key={i} className="c-val">{p.name}</span>)}
              </div>
              {[...history].reverse().map((r, k) => {
                const n = history.length - k;
                const b = r.bids[r.bidWinner];
                const label = b === 'betl' ? 'Betl' : b === 'mexico' ? 'Mexico' : b;
                return (
                  <div key={n} className="score-table__row">
                    <span className="c-num">{n}</span>
                    <span className="c-name">{label} · {gs.players[r.bidWinner]?.name}</span>
                    <span className="c-suit">{r.trump ? <SuitIcon suit={r.trump} size={18} /> : '—'}</span>
                    {r.roundScores.map((s, i) => <span key={i} className={`c-val ${s > 0 ? 'is-good' : s < 0 ? 'is-bad' : ''}`}>{signed(s)}</span>)}
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}
      {gs.state === 'finished' && (
        <GameOver gs={gs} me={me} isHost={isHost} lowestWins={false} onPlayAgain={() => emit('reset_game')} onLeave={onLeave} />
      )}
    </>
  );

  return (
    <GameShell
      title="Mexico"
      code={code}
      status={<>
        <StatusPart>{contractText() || t('roundN', { n: history.length + 1 })}</StatusPart>
        <StatusSep />
        <StatusPart strong>{phaseKey ? t(phaseKey) : ''}</StatusPart>
        {gs.trump && <><StatusSep />{!mobile && <StatusPart>{t('trump')}</StatusPart>}<SuitIcon suit={gs.trump} size={mobile ? 16 : 20} /></>}
      </>}
      actions={<>
        <BuyRoundButton />
        <IconButton icon="scroll" label={t('roundHistory')} onClick={() => setShowHistory(true)} />
        <Menu onNewGame={isHost ? () => { if (confirm(t('confirmNewGame'))) emit('reset_game'); } : null} onLeave={onLeave} />
      </>}
      opponents={['left', 'right'].map(pos => {
        const i = idxAt(pos);
        return {
          pos,
          count: gs.handCounts?.[i] ?? 0,
          seat: { name: name(i), stats: stats(i), turn: turnOf(i) },
          mseat: { name: name(i), stats: shortStats(i), turn: turnOf(i) },
          tag: tagFor(i)
        };
      })}
      center={center}
      hand={{ cards: hand, render: renderCard }}
      me={{ seat: { name: t('youTag', { name: name(me) }), stats: stats(me), turn: turnOf(me) }, tag: tagFor(me) }}
      overlays={overlays}
      desk={{ tableTop: 130, sideTop: 300, handTop: discarding ? 586 : 612, meTop: 790 }}
    />
  );
}

// ============================================================================
// LORUM (4 players)
// ============================================================================

function LoraBoard({ gs, top }) {
  const { mobile, t } = useApp();
  const w = mobile ? 64 : 76;
  return (
    <div className={`lora ${mobile ? 'lora--mobile' : ''}`} style={mobile ? undefined : { top }}>
      <div className="lora__label">
        {gs.loraStartRank ? t('startedOn', { r: gs.loraStartRank, seq: loraSequence(gs.loraStartRank).join(' ') }) : t('firstCardSets')}
      </div>
      <div className="lora__cols">
        {SUIT_ORDER.map(s => {
          const pile = gs.loraLayout[s];
          const need = !gs.loraStartRank ? null : pile.length ? (pile.length < 8 ? nextRank(pile[pile.length - 1].rank) : null) : gs.loraStartRank;
          return (
            <div key={s} className="lora__col">
              <SuitIcon suit={s} size={mobile ? 18 : 30} />
              <div className="lora__stack">
                {pile.length === 0 ? (
                  <div className="lora__empty" style={{ width: w, height: w * 1.5 }}>{gs.loraStartRank || ''}</div>
                ) : pile.map(c => <Card key={cardKey(c)} card={c} w={w} className="lora__card" />)}
              </div>
              {need && <div className="lora__next">{t('nextR', { r: need })}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LorumGame({ socket, gs, me, isHost, onLeave }) {
  const { mobile, t, pl, contract: contractOf } = useApp();
  const [showScores, setShowScores] = useState(false);
  const code = gs.gameId;
  const emit = (ev, data = {}) => socket.emit(ev, { gameId: code, ...data });

  // Play goes counterclockwise: the next player sits on your right
  const positions = ['bottom', 'right', 'top', 'left'];
  const idxAt = pos => (me + positions.indexOf(pos)) % 4;
  const name = i => gs.players[i]?.name || '';
  const myTurn = gs.currentPlayer === me;
  const contract = contractOf(gs.currentContract);
  const isLora = gs.state === 'lora_playing';
  const inTricks = gs.state === 'playing' || gs.state === 'trick_complete';
  const choosing = gs.state === 'contract_selection';
  const iChoose = choosing && gs.contractSelector === me;

  const turnOf = i => {
    if (choosing) return gs.contractSelector === i;
    if (gs.state === 'playing' || isLora) return gs.currentPlayer === i;
    return false;
  };
  const detail = i => {
    if (isLora) {
      const p = gs.loraPasses[i];
      return `${pl(gs.handCounts[i], 'card')}${p ? ` · ${pl(p, 'pass')}` : ''}`;
    }
    if (inTricks) {
      const r = gs.runningScores?.[i] || 0;
      return `${pl(gs.tricksTaken[i], 'trick')}${r ? ` · ${signed(r)}` : ''}`;
    }
    return null;
  };
  const stats = i => { const d = detail(i); return `${t('scoreN', { n: gs.scores[i] })}${d ? ` · ${d}` : ''}`; };
  // Phone seats are narrow: opponents show just their cards left in Lora (passes are in the scoreboard)
  const shortStats = i => (isLora ? pl(gs.handCounts[i], 'card') : detail(i) || t('scoreN', { n: gs.scores[i] }));

  const hand = sortHand(gs.hand || []);
  const renderCard = (c, w, style) => {
    let legal = false;
    if (myTurn && gs.state === 'playing') legal = isLegalPlay(gs.hand, gs.currentTrick, c, null);
    if (myTurn && isLora) legal = canPlayLora(gs, c);
    const active = myTurn && (gs.state === 'playing' || isLora);
    return (
      <div key={cardKey(c)} className="hand__slot" style={style}>
        <Card card={c} w={w}
          onClick={legal ? () => emit(isLora ? 'play_lora_card' : 'play_lorum_card', { card: c }) : undefined}
          dim={active && !legal} />
      </div>
    );
  };

  // What the last trick cost, for the banner
  const trickCost = () => {
    const tr = gs.currentTrick;
    switch (gs.currentContract) {
      case 3: { const q = tr.filter(p => p.card.rank === 'Q').length; return q ? [pl(q, 'queen'), `+${q * 2}`] : null; }
      case 4: { const h = tr.filter(p => p.card.suit === 'hearts').length; return h ? [pl(h, 'heart'), `+${h}`] : null; }
      case 5: return tr.some(p => p.card.suit === 'acorns' && p.card.rank === 'J') ? [contractOf(5).name, '+4 / +4'] : null;
      case 6: return tr.some(p => p.card.suit === 'hearts' && p.card.rank === 'K') ? [contractOf(6).name, '+8'] : null;
      default: return null;
    }
  };

  const contractTiles = [1, 2, 3, 4, 5, 6, 7].map(id => {
    const c = contractOf(id);
    const used = gs.usedContracts[id - 1];
    return (
      <button type="button" key={id} className={`contract ${used ? 'contract--used' : ''}`} disabled={used || !iChoose}
        onClick={() => emit('select_contract', { contractId: id })}>
        <div className="contract__top"><span className="contract__num">{id}</span><span className="contract__name">{c.name}</span></div>
        <div className="contract__rule">{used ? t('played') : c.rule}</div>
      </button>
    );
  });
  const contractsLeft = gs.usedContracts.filter(u => !u).length;

  const myLoraOptions = isLora ? (gs.hand || []).filter(c => canPlayLora(gs, c)) : [];
  const loraHint = isLora && (
    <TurnHint top={600}>
      {myTurn ? (
        myLoraOptions.length ? <span>{t(gs.loraStartRank ? 'turnHighlighted' : 'turnLeadAny')}</span> : (
          <><span>{t('turnNoCard')}</span><button type="button" className="pill pill--red pill--sm" onClick={() => emit('pass_lora')}>{t('pass')} <span className="pill__extra">+1</span></button></>
        )
      ) : <span>{t('waitingFor', { name: name(gs.currentPlayer) })}</span>}
    </TurnHint>
  );

  // ----- what's on the table -----
  let center = null;
  let below = null;
  if (choosing) {
    if (mobile) {
      center = (
        <TableNote eyebrow={iChoose ? t('youLeadFirst') : t('theyLeadFirst', { name: name(gs.contractSelector) })} title={iChoose ? t('yourCall') : t('choosing')}>
          {iChoose ? `${t('pickOneLeft', { n: contractsLeft })}${contractsLeft > 2 ? t('swipeMore') : ''}` : t('theyPickDeal')}
        </TableNote>
      );
      below = (
        <div className="m-picker">
          <div className="m-picker__label">
            <span className="eyebrow">{t(iChoose ? 'pickContract' : 'contracts')}</span>
            <span className="m-picker__count">{t('leftOf7', { n: contractsLeft })}</span>
          </div>
          <div className="m-picker__strip">{contractTiles}</div>
        </div>
      );
    } else {
      center = (
        <CenterPanel top={262} wide>
          <div className="eyebrow">{iChoose ? t('youLeadPick') : t('theyPicking', { name: name(gs.contractSelector) })}</div>
          <div className="contracts">{contractTiles}</div>
        </CenterPanel>
      );
    }
  } else if (inTricks) {
    const cost = gs.state === 'trick_complete' ? trickCost() : null;
    center = (
      <>
        {gs.currentTrick.length > 0 && <TrickFan trick={gs.currentTrick} players={4} top={318} />}
        {gs.state === 'playing' && gs.currentTrick.length === 0 && (
          <TableNote top={330} title={`${contract?.name} · ${contract?.rule}`}>
            {myTurn ? t('yourLead') : t('theyLead', { name: name(gs.currentPlayer) })}
          </TableNote>
        )}
        {gs.state === 'trick_complete' && gs.lastTrickWinner !== null && (
          <WinnerBanner top={556}
            text={`${gs.lastTrickWinner === me ? t('youTake') : t('theyTake', { name: name(gs.lastTrickWinner) })}${cost ? ` · ${cost[0]}` : ''}${gs.dealOver ? ` · ${t('dealEnds')}` : ''}`}
            extra={cost ? cost[1] : null} />
        )}
      </>
    );
  } else if (isLora) {
    center = <><LoraBoard gs={gs} top={222} />{!mobile && loraHint}</>;
    if (mobile) below = <div className="m-below__hint">{loraHint}</div>;
  }

  const history = gs.contractScores || [];
  const leader = gs.scores.indexOf(Math.min(...gs.scores));
  const dealNo = Math.min(gs.currentDeal + 1, 28);

  const overlays = (
    <>
      {showScores && (
        <Modal title={t('scoreboard')} subtitle={t('lowestWins')} onClose={() => setShowScores(false)} width={660}>
          <div className="progress">
            <div className="progress__labels"><b>{t('dealOf', { n: dealNo })}</b><span>{contract && !choosing ? t('nowContract', { c: contract.name }) : ''}</span></div>
            <div className="progress__bar"><div style={{ width: `${(Math.min(gs.currentDeal, 28) / 28) * 100}%` }} /></div>
          </div>
          <Totals players={gs.players} scores={gs.scores} leader={leader} deltas={inTricks ? gs.runningScores : null} />
          {history.length === 0 ? <div className="empty">{t('noDeals')}</div> : (
            <div className="score-table score-table--scroll">
              <div className="score-table__row score-table__row--head">
                <span className="c-num">#</span><span className="c-name">{t('colContract')}</span>
                {gs.players.map((p, i) => <span key={i} className="c-val">{p.name}</span>)}
              </div>
              {[...history].reverse().map(d => (
                <div key={d.deal} className="score-table__row">
                  <span className="c-num">{d.deal + 1}</span>
                  <span className="c-name">{contractOf(d.contract)?.name}</span>
                  {d.scores.map((s, i) => <span key={i} className={`c-val ${s < 0 ? 'is-good' : s > 0 ? 'is-bad' : ''}`}>{signed(s)}</span>)}
                </div>
              ))}
            </div>
          )}
          <div className="legend">{t('legend')}</div>
        </Modal>
      )}
      {gs.state === 'finished' && (
        <GameOver gs={gs} me={me} isHost={isHost} lowestWins onPlayAgain={() => emit('reset_game')} onLeave={onLeave} />
      )}
    </>
  );

  return (
    <GameShell
      title="Lorum"
      code={code}
      status={<>
        <StatusPart>{t(mobile ? 'dealShort' : 'dealN', { n: dealNo })} · {gs.currentDealer === me ? t('youDeal') : t('theyDeal', { name: name(gs.currentDealer) })}</StatusPart>
        <StatusSep />
        <StatusPart strong>{choosing ? t('choosingContract') : gs.state === 'finished' ? t('gameOver') : contract?.name}</StatusPart>
      </>}
      actions={<>
        <BuyRoundButton />
        {mobile
          ? <IconButton icon="chart" label={t('scores')} onClick={() => setShowScores(true)} />
          : <button type="button" className="scores-btn" onClick={() => setShowScores(true)}><Icon name="chart" size={15} />{t('scores')}</button>}
        <Menu onNewGame={isHost ? () => { if (confirm(t('confirmNewGame'))) emit('reset_game'); } : null} onLeave={onLeave} />
      </>}
      opponents={['left', 'top', 'right'].map(pos => {
        const i = idxAt(pos);
        return {
          pos,
          count: gs.handCounts[i],
          seat: { name: name(i), stats: stats(i), turn: turnOf(i) },
          mseat: { name: name(i), stats: shortStats(i), turn: turnOf(i) }
        };
      })}
      center={center}
      below={below}
      hand={{ cards: hand, render: renderCard }}
      me={{ seat: { name: t('youTag', { name: name(me) }), stats: iChoose ? `${t('scoreN', { n: gs.scores[me] })} · ${t('yourPick')}` : stats(me), turn: turnOf(me) } }}
      overlays={overlays}
      desk={{ tableTop: 150, sideTop: 330, topTop: 74, handTop: isLora ? 650 : inTricks ? 652 : 634, meTop: 808 }}
    />
  );
}

// ============================================================================
// APP
// ============================================================================

function App() {
  const viewport = useViewport();
  const mobile = isMobileViewport(viewport);
  const [theme, setThemeState] = useState(() => {
    const th = loadPref('table', 'felt');
    return THEMES.some(x => x.id === th) ? th : 'felt';
  });
  const setTheme = th => { setThemeState(th); savePref('table', th); };
  const [lang, setLangState] = useState(defaultLang);
  const setLang = l => { setLangState(l); savePref('lang', l); };
  const i18n = useMemo(() => makeI18n(lang), [lang]);
  const [donateOpen, setDonateOpen] = useState(false);
  const [tables, setTables] = useState([]);
  const [denied, setDenied] = useState(null);
  // /?join=CODE opens the start screen ready to join that table
  const [invite, setInvite] = useState(() => {
    try {
      const c = new URLSearchParams(window.location.search).get('join');
      return (c && c.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)) || null;
    } catch (e) { return null; }
  });
  const dismissInvite = () => {
    setInvite(null);
    try { window.history.replaceState(null, '', window.location.pathname); } catch (e) { /* ignore */ }
  };

  const [socket, setSocket] = useState(null);
  const [gs, setGs] = useState(null);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [connected, setConnected] = useState(true);
  const chatOpenRef = useRef(false);
  const errorTimer = useRef(null);

  useEffect(() => { chatOpenRef.current = chatOpen; if (chatOpen) setUnread(0); }, [chatOpen]);
  useEffect(() => { document.body.classList.toggle('is-mobile', mobile); }, [mobile]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => { if (gs && invite) dismissInvite(); }, [gs]);

  // The start screen shows the open tables live; stop listening once seated
  useEffect(() => {
    if (!socket || gs) return undefined;
    const subscribe = () => socket.emit('lobby_subscribe');
    subscribe();
    socket.on('connect', subscribe);
    return () => {
      socket.off('connect', subscribe);
      socket.emit('lobby_unsubscribe');
    };
  }, [socket, !!gs]);

  const showError = msg => {
    setError(msg);
    clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 3200);
  };

  useEffect(() => {
    const s = io();
    setSocket(s);
    // On every (re)connect, take back the saved seat: page reload, app reopened, or Wi-Fi back
    const rejoin = () => {
      const sess = loadSession();
      if (sess && sess.gameId && sess.token) s.emit('rejoin_game', { gameId: sess.gameId, token: sess.token });
    };
    const onVisible = () => { if (document.visibilityState === 'visible' && !s.connected) s.connect(); };
    let displaced = false; // another tab took this seat; this page must not take it back
    s.on('connect', () => { setConnected(true); if (!displaced) rejoin(); });
    s.on('disconnect', () => setConnected(false));
    s.on('seat_taken', () => {
      displaced = true;
      setGs(null);
      showError('Your seat is now used in another tab');
    });
    s.on('game_created', d => { displaced = false; saveSession({ gameId: d.gameId, token: d.token }); });
    s.on('game_joined', d => { displaced = false; saveSession({ gameId: d.gameId, token: d.token }); });
    s.on('game_state', state => {
      if (state.state === 'abandoned') clearSession();
      setGs(state);
    });
    s.on('rejoin_failed', () => {
      clearSession();
      setGs(null);
      showError('That table is no longer open');
    });
    s.on('lobby_list', list => setTables(list));
    s.on('join_denied', d => setDenied({ ...d, ts: Date.now() }));
    s.on('error', ({ message }) => showError(message));
    s.on('chat_message', m => {
      setMessages(prev => [...prev, m]);
      if (!chatOpenRef.current) setUnread(u => u + 1);
    });
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      s.close();
    };
  }, []);

  const backHome = () => {
    clearSession();
    setGs(null);
    setMessages([]);
    setUnread(0);
    setChatOpen(false);
  };
  const leave = () => {
    if (gs && socket) socket.emit('leave_game', { gameId: gs.gameId });
    backHome();
  };
  const confirmLeave = () => {
    if (confirm(i18n.t('confirmLeave'))) leave();
  };

  const away = gs ? gs.players.filter(p => p.connected === false) : [];
  const notices = [
    !connected && i18n.t('reconnecting'),
    ...away.map(p => i18n.t('playerReconnecting', { name: p.name }))
  ].filter(Boolean);

  const ctx = { mobile, vw: viewport.w, theme, setTheme, setLang, openDonate: () => setDonateOpen(true), ...i18n };

  if (!socket) return null;

  let screen;
  if (!gs) {
    screen = <Home tables={tables} invite={invite} denied={denied} onDismissInvite={dismissInvite}
      onCreate={(playerName, gameConfig) => socket.emit('create_game', { playerName, gameConfig })}
      onJoin={(gameId, playerName, password) => socket.emit('join_game', { gameId, playerName, password })} />;
  } else if (gs.state === 'abandoned') {
    screen = (
      <div className="home home--center">
        <div className="notice">
          <div className="eyebrow">{i18n.t('tableClosed')}</div>
          <h1 className="home__title">{i18n.t('leftTitle', { name: gs.leftPlayer })}</h1>
          <p className="home__lead">{i18n.t('leftLead')}</p>
          <Button onClick={backHome}>{i18n.t('backToStart')}</Button>
        </div>
      </div>
    );
  } else if (gs.state === 'lobby') {
    screen = <Lobby gs={gs} me={gs.playerIndex}
      onReady={ready => socket.emit('set_ready', { gameId: gs.gameId, ready })}
      onStart={() => socket.emit('start_game', { gameId: gs.gameId })}
      onLeave={leave} />;
  } else if (gs.gameType === 'lorum') {
    screen = <LorumGame socket={socket} gs={gs} me={gs.playerIndex} isHost={gs.playerIndex === gs.hostIndex} onLeave={confirmLeave} />;
  } else {
    screen = <MexicoGame socket={socket} gs={gs} me={gs.playerIndex} isHost={gs.playerIndex === gs.hostIndex} onLeave={confirmLeave} />;
  }

  const chatPlacement = mobile ? (gs && gs.state === 'lobby' ? 'mobile-top' : 'mobile') : 'desktop';

  return (
    <AppCtx.Provider value={ctx}>
      {screen}
      {gs && gs.state !== 'abandoned' && !donateOpen && (
        <Chat messages={messages} me={gs.playerIndex} unread={unread} open={chatOpen} setOpen={setChatOpen} placement={chatPlacement}
          onSend={message => socket.emit('chat_message', { gameId: gs.gameId, message })} />
      )}
      {donateOpen && <Donate onClose={() => setDonateOpen(false)} />}
      {error && <div className="toast" role="alert">{i18n.serverMsg(error)}</div>}
      {notices.length > 0 && <div className="toast toast--warn">{notices.join(' · ')}</div>}
    </AppCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
