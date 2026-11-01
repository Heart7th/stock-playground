#!/usr/bin/env node
// ---- core.js ----
/* 股市游乐场 · core：随机数、格式化、存储、音效、界面小工具、吉祥物 */
(function (root) {
  'use strict';
  const App = root.App || (root.App = {});

  // ---------- 可复现随机数（每日同题靠它） ----------
  function hashStr(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }

  function makeRng(seed) {
    let a = (typeof seed === 'number' ? seed : hashStr(String(seed))) >>> 0;
    const next = function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const rng = () => next();
    rng.range = (lo, hi) => lo + (hi - lo) * next();
    rng.int = (lo, hi) => lo + Math.floor((hi - lo + 1) * next());
    rng.pick = (arr) => arr[Math.floor(next() * arr.length)];
    rng.chance = (p) => next() < p;
    rng.sign = () => (next() < 0.5 ? -1 : 1);
    rng.normal = () => {
      let u = 0;
      while (u === 0) u = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
    };
    rng.shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
      return arr;
    };
    rng.weighted = (pairs) => {
      let total = 0;
      for (const p of pairs) total += p[0];
      let x = next() * total;
      for (const p of pairs) { x -= p[0]; if (x <= 0) return p[1]; }
      return pairs[pairs.length - 1][1];
    };
    return rng;
  }

  // ---------- 数学与格式化 ----------
  const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const round2 = (x) => Math.round(x * 100) / 100;

  function fmtPct(p, d = 2) {
    if (!isFinite(p)) return '--';
    const v = Number(p.toFixed(d));
    if (v === 0) return (0).toFixed(d) + '%';
    return (v > 0 ? '+' : '') + v.toFixed(d) + '%';
  }
  function fmtMoney(x, d = 0) {
    if (!isFinite(x)) return '--';
    const neg = x < -1e-9;
    const s = Math.abs(x).toFixed(d);
    const parts = s.split('.');
    const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + '¥' + int + (parts[1] ? '.' + parts[1] : '');
  }
  function fmtWan(x) {
    if (x >= 1e8) return (x / 1e8).toFixed(2) + '亿';
    if (x >= 1e4) return (x / 1e4).toFixed(1) + '万';
    return String(Math.max(0, Math.round(x)));
  }
  const cls = (p) => (p > 0.0001 ? 'up' : p < -0.0001 ? 'down' : 'flat');
  function dateKey(d = new Date()) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dayNumber(d = new Date()) {
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  }
  const dateLabel = (d = new Date()) => (d.getMonth() + 1) + '月' + d.getDate() + '日';

  App.makeRng = makeRng;
  App.hashStr = hashStr;
  App.U = { clamp, lerp, smooth, round2, fmtPct, fmtMoney, fmtWan, cls, dateKey, dayNumber, dateLabel };

  // 画布配色（红涨绿跌）
  App.C = {
    up: '#f5474b', down: '#17b26a', gold: '#ffb31a', blue: '#5b8cff', text: '#e9ecf3', sub: '#8a93a8', dim: '#5d6579',
    grid: 'rgba(255,255,255,0.055)', bg: '#10131a',
    font: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
    num: '"DIN Alternate", "Bahnschrift", "Roboto Mono", "SF Mono", monospace',
  };

  // ---------- 本地存储 ----------
  const PREFIX = 'gpy1_';
  App.store = {
    get(k, def) {
      try { const v = root.localStorage.getItem(PREFIX + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    set(k, v) { try { root.localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) { /* 隐私模式 */ } },
    clearAll() {
      try { Object.keys(root.localStorage).filter((k) => k.indexOf(PREFIX) === 0).forEach((k) => root.localStorage.removeItem(k)); } catch (e) { /* ignore */ }
    },
  };

  // ---------- 合成音效（无需音频文件） ----------
  App.sfx = (function () {
    let ctx = null;
    let enabled = App.store.get('sound', true);
    function ensure() {
      if (!enabled) return null;
      if (!ctx) {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        try { ctx = new AC(); } catch (e) { return null; }
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(freq, dur, opt) {
      opt = opt || {};
      const c = ensure();
      if (!c) return;
      const t0 = c.currentTime + (opt.delay || 0);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = opt.type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (opt.to) o.frequency.exponentialRampToValueAtTime(opt.to, t0 + dur);
      const vol = opt.vol == null ? 0.07 : opt.vol;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t0); o.stop(t0 + dur + 0.03);
    }
    return {
      unlock: ensure,
      get enabled() { return enabled; },
      toggle() { enabled = !enabled; App.store.set('sound', enabled); if (enabled) ensure(); return enabled; },
      buy() { tone(523, 0.09, { type: 'triangle' }); tone(784, 0.12, { type: 'triangle', delay: 0.06 }); },
      sell() { tone(659, 0.09, { type: 'triangle' }); tone(440, 0.12, { type: 'triangle', delay: 0.06 }); },
      tap() { tone(880, 0.05, { vol: 0.04 }); },
      tick() { tone(1250, 0.03, { vol: 0.025 }); },
      news() { tone(1046, 0.07, { type: 'square', vol: 0.025 }); tone(1318, 0.09, { type: 'square', vol: 0.025, delay: 0.08 }); },
      alarm() { tone(880, 0.12, { type: 'sawtooth', vol: 0.035 }); tone(660, 0.16, { type: 'sawtooth', vol: 0.035, delay: 0.13 }); },
      good() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.15, { type: 'triangle', delay: i * 0.07 })); },
      bad() { [392, 330, 262].forEach((f, i) => tone(f, 0.22, { delay: i * 0.11, vol: 0.06 })); },
      count() { tone(660, 0.08, { vol: 0.05 }); },
      go() { tone(990, 0.2, { type: 'triangle', vol: 0.07 }); },
    };
  })();
  App.buzz = (ms) => { try { if (root.navigator && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ } };

  // ---------- DOM 小工具 ----------
  App.el = function (html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };
  App.show = (node) => node && node.classList.add('show');
  App.hide = (node) => node && node.classList.remove('show');
  App.setText = (node, txt) => { if (node && node.textContent !== txt) node.textContent = txt; };
  App.setClass = (node, c) => { if (node && node.className !== c) node.className = c; };

  let toastWrap = null;
  App.toast = function (msg, kind, ms) {
    const app = document.getElementById('app');
    if (!toastWrap || !toastWrap.isConnected) { toastWrap = App.el('<div class="toast-wrap"></div>'); app.appendChild(toastWrap); }
    const t = App.el('<div class="toast ' + (kind || '') + '"></div>');
    t.innerHTML = msg;
    toastWrap.appendChild(t);
    while (toastWrap.children.length > 3) toastWrap.firstChild.remove();
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 260); }, ms || 1700);
  };

  App.fitCanvas = function (canvas) {
    const dpr = Math.min(root.devicePixelRatio || 1, 3);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h, dpr };
  };

  // ---------- 页面切换 ----------
  const screens = {};
  App.register = (id, mod) => { screens[id] = mod; };
  App.go = function (id, arg) {
    const prev = App.current;
    if (prev && screens[prev] && screens[prev].leave) screens[prev].leave();
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'scr-' + id));
    App.current = id;
    if (screens[id] && screens[id].enter) screens[id].enter(arg);
  };

  // ---------- 分享 / 复制 ----------
  App.share = async function (text) {
    const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (navigator.share && mobile) {
      try { await navigator.share({ text }); return true; } catch (e) { if (e && e.name === 'AbortError') return false; }
    }
    try {
      if (navigator.clipboard && root.isSecureContext) { await navigator.clipboard.writeText(text); App.toast('成绩已复制，去粘贴给朋友吧', 'ok'); return true; }
    } catch (e) { /* fall through */ }
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    if (ok) { App.toast('成绩已复制，去粘贴给朋友吧', 'ok'); return true; }
    const ov = App.el('<div class="overlay center show"><div class="dialog"><div class="dialog-title">长按复制成绩</div><textarea class="share-ta" readonly></textarea><button class="btn">好的</button></div></div>');
    ov.querySelector('textarea').value = text;
    ov.querySelector('button').onclick = () => ov.remove();
    document.getElementById('app').appendChild(ov);
    return false;
  };

  App.confirm = function (title, text, okText, onOk) {
    const ov = App.el('<div class="overlay center show"><div class="dialog"><div class="dialog-title"></div><div class="dialog-text"></div>' +
      '<button class="btn" data-k="ok"></button><button class="btn ghost" data-k="no">再想想</button></div></div>');
    ov.querySelector('.dialog-title').textContent = title;
    ov.querySelector('.dialog-text').innerHTML = text;
    ov.querySelector('[data-k=ok]').textContent = okText;
    ov.addEventListener('click', (e) => {
      const k = e.target.getAttribute('data-k');
      if (k === 'ok') { ov.remove(); onOk(); } else if (k === 'no' || e.target === ov) ov.remove();
    });
    document.getElementById('app').appendChild(ov);
  };

  App.confetti = function (host) {
    const box = App.el('<div class="confetti"></div>');
    const colors = ['#ffb31a', '#f5474b', '#ffd36b', '#ff8a4c', '#ffffff', '#5b8cff'];
    for (let i = 0; i < 70; i++) {
      const p = document.createElement('i');
      p.style.left = (Math.random() * 100) + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = (1.6 + Math.random() * 1.8) + 's';
      p.style.animationDelay = (Math.random() * 0.5) + 's';
      p.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
      box.appendChild(p);
    }
    (host || document.getElementById('app')).appendChild(box);
    setTimeout(() => box.remove(), 4200);
  };

  // ---------- 吉祥物：小韭菜（涨了支棱，跌了蔫掉） ----------
  let mascotId = 0;
  App.mascot = function (mood) {
    mood = mood || 'happy';
    const id = 'mg' + (++mascotId);
    const perky = [
      'M44 68 Q36 40 27 8 Q44 36 52 68 Z',
      'M46 68 Q47 30 53 2 Q57 30 56 68 Z',
      'M50 68 Q63 40 78 12 Q64 46 58 68 Z',
    ];
    const droopy = [
      'M44 68 Q28 34 8 58 Q32 44 52 68 Z',
      'M46 68 Q49 34 70 34 Q56 42 56 68 Z',
      'M50 68 Q74 40 94 62 Q70 50 58 68 Z',
    ];
    const leaves = (mood === 'sad' ? droopy : perky)
      .map((d) => '<path d="' + d + '" fill="#3cc46e" stroke="#1f8f4c" stroke-width="1.6" stroke-linejoin="round"/>').join('');
    let face;
    if (mood === 'happy') {
      face = '<path d="M38 88 Q42 82 46 88" stroke="#2b2b2b" stroke-width="2.8" fill="none" stroke-linecap="round"/>' +
        '<path d="M54 88 Q58 82 62 88" stroke="#2b2b2b" stroke-width="2.8" fill="none" stroke-linecap="round"/>' +
        '<path d="M44 95 Q50 103 56 95 Z" fill="#c2413a"/>';
    } else if (mood === 'sad') {
      face = '<circle cx="42" cy="89" r="3.2" fill="#2b2b2b"/><circle cx="58" cy="89" r="3.2" fill="#2b2b2b"/>' +
        '<path d="M44 101 Q50 94 56 101" stroke="#2b2b2b" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
        '<path d="M69 70 Q74 79 69 82 Q64 79 69 70 Z" fill="#7cc7ff"/>';
    } else if (mood === 'shock') {
      face = '<circle cx="42" cy="87" r="3.6" fill="#2b2b2b"/><circle cx="58" cy="87" r="3.6" fill="#2b2b2b"/>' +
        '<ellipse cx="50" cy="99" rx="4" ry="5" fill="#2b2b2b"/>';
    } else {
      face = '<circle cx="42" cy="88" r="3.2" fill="#2b2b2b"/><circle cx="58" cy="88" r="3.2" fill="#2b2b2b"/>' +
        '<path d="M45 98 L55 98" stroke="#2b2b2b" stroke-width="2.6" stroke-linecap="round"/>';
    }
    const blush = mood === 'sad' ? '' : '<ellipse cx="35" cy="96" rx="4.5" ry="2.6" fill="#ff8fa3" opacity="0.65"/><ellipse cx="65" cy="96" rx="4.5" ry="2.6" fill="#ff8fa3" opacity="0.65"/>';
    const sparkle = mood === 'happy' ? '<path d="M84 20 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2 Z" fill="#ffd36b"/>' : '';
    return '<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3f6d4"/><stop offset="0.35" stop-color="#fbfbf3"/><stop offset="1" stop-color="#f3eedf"/></linearGradient></defs>' +
      leaves + sparkle +
      '<rect x="27" y="62" width="46" height="52" rx="21" fill="url(#' + id + ')" stroke="#d6cfba" stroke-width="1.6"/>' +
      blush + face + '</svg>';
  };
})(typeof window !== 'undefined' ? window : globalThis);

// ---- bag-engine.js ----
/* ⑧ 谁是接盘侠 · 行情与对手引擎（不碰 DOM，测试脚本可以直接跑）
 * 房间里的人都炒同一只股票：谁买谁推高，谁卖谁砸低。场外资金会把价格慢慢拉回“本来的价值”，
 * 大家的钱总有花完的时候。收盘还拿着的，第二天按“一日游”价结算；收盘封死涨停，第二天还有一个高开。 */
(function (root) {
  'use strict';
  const App = root.App;
  const DT = 0.1, DUR = 90, TICKS = Math.round(DUR / DT);
  const P0 = 10, UP = 12, DOWN = 8;
  const XUP = Math.log(UP / P0), XDN = Math.log(DOWN / P0);
  const CASH0 = 100000, LOT = 2000;
  const PUSH = 0.35;         // 全场所有人同时满仓，股价对数涨幅（决定每股冲击）
  const TAU = 30;            // 场外资金把溢价拉回去的时间常数（秒）
  const NOISE = 0.0045;      // 场外随机波动（每 √秒）
  const TREND = 0.42;        // 场外跟风强度

  const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
  const priceOf = (x) => P0 * Math.exp(x);
  const avgPx = (x0, x1) => (Math.abs(x1 - x0) < 1e-12 ? priceOf(x0) : (P0 * (Math.exp(x1) - Math.exp(x0))) / (x1 - x0));
  const lot100 = (q) => Math.floor(q / 100) * 100;

  // ---------- 随机数（状态存在局面里，克隆局面就能预演未来） ----------
  function rnd(S) {
    S.rs = (S.rs + 0x6D2B79F5) | 0;
    let t = Math.imul(S.rs ^ (S.rs >>> 15), 1 | S.rs);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rr = (S, lo, hi) => lo + (hi - lo) * rnd(S);
  const rpick = (S, arr) => arr[Math.floor(rnd(S) * arr.length)];
  function rnorm(S) { let u = 0; while (u === 0) u = rnd(S); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd(S)); }

  // ---------- 角色 ----------
  const CAST = [
    { key: 'wang', name: '老王', emoji: '🧔', type: 'momentum', tag: '追涨' },
    { key: 'ayi', name: '王阿姨', emoji: '👵', type: 'diamond', tag: '死扛' },
    { key: 'li', name: '小李', emoji: '👦', type: 'scalper', tag: '短线' },
    { key: 'zhang', name: '张总', emoji: '🤵', type: 'follower', tag: '听消息' },
    { key: 'dav', name: '股神大V', emoji: '😎', type: 'influencer', tag: '喊单' },
    { key: 'dip', name: '抄底哥', emoji: '🎣', type: 'dip', tag: '抄底' },
    { key: 'liu', name: '胆小刘', emoji: '😰', type: 'panicky', tag: '一跌就跑' },
    { key: 'stu', name: '学生党', emoji: '🧒', type: 'herd', tag: '跟风' },
    { key: 'zhou', name: '老周', emoji: '👴', type: 'steady', tag: '稳健' },
    { key: 'mom', name: '宝妈', emoji: '👩', type: 'follower', tag: '听群里' },
    { key: 'jie', name: '阿杰', emoji: '🤓', type: 'quant', tag: '量化' },
    { key: 'rich', name: '富二代', emoji: '🤑', type: 'whale', tag: '梭哈' },
    { key: 'dog', name: '赌狗', emoji: '🐶', type: 'gambler', tag: '随缘' },
    { key: 'fund', name: '基金经理', emoji: '🧐', type: 'fund', tag: '抱团' },
    { key: 'cat', name: '猫姐', emoji: '🐱', type: 'herd', tag: '跟风' },
  ];
  // lot: 每次下单占可用资金比例；maxPos: 最多几成仓；tp/sl: 止盈/止损；dd: 从最高点回撤多少就跑；
  // panic: 怕跌程度；cred: 多容易信别人喊单；exitT: 几秒开始离场；holdSeal: 收盘封涨停时愿意拿着过夜的概率
  const ARCH = {
    momentum: { reentry: 1, lot: 0.28, maxPos: 1, tp: [0.09, 0.15], sl: -0.04, dd: 0.04, panic: 0.55, cred: 0.35, news: 0.5, exitT: [68, 84], holdSeal: 0.35, think: [0.5, 1.0], shout: 0.12 },
    diamond: { reentry: 0, lot: 0.3, maxPos: 1, tp: [0.5, 0.6], sl: -0.22, dd: 0.3, panic: 0.04, cred: 0.3, news: 0.1, exitT: [150, 150], holdSeal: 1, think: [0.8, 1.6], shout: 0.12 },
    scalper: { reentry: 4, lot: 0.22, maxPos: 0.6, tp: [0.016, 0.028], sl: -0.012, dd: 0.015, panic: 0.45, cred: 0.12, news: 0.7, exitT: [74, 86], holdSeal: 0.15, think: [0.35, 0.7], shout: 0.05 },
    follower: { reentry: 1, lot: 0.28, maxPos: 1, tp: [0.1, 0.18], sl: -0.07, dd: 0.07, panic: 0.4, cred: 0.95, news: 0.9, exitT: [79, 88], holdSeal: 0.65, think: [0.6, 1.2], shout: 0.08 },
    influencer: { reentry: 1, lot: 0.35, maxPos: 0.8, tp: [0.05, 0.08], sl: -0.05, dd: 0.06, panic: 0.25, cred: 0.1, news: 0.6, exitT: [70, 82], holdSeal: 0.3, think: [0.5, 0.9], shout: 0.5 },
    dip: { reentry: 2, lot: 0.3, maxPos: 0.8, tp: [0.04, 0.07], sl: -0.07, dd: 0.08, panic: 0.15, cred: 0.2, news: 0.4, exitT: [80, 87], holdSeal: 0.3, think: [0.6, 1.1], shout: 0.07 },
    panicky: { reentry: 1, lot: 0.25, maxPos: 0.6, tp: [0.05, 0.08], sl: -0.02, dd: 0.02, panic: 1.0, cred: 0.7, news: 1.0, exitT: [58, 74], holdSeal: 0.1, think: [0.4, 0.8], shout: 0.18 },
    herd: { reentry: 1, lot: 0.28, maxPos: 1, tp: [0.12, 0.2], sl: -0.05, dd: 0.05, panic: 0.7, cred: 0.6, news: 0.6, exitT: [80, 89], holdSeal: 0.5, think: [0.5, 1.0], shout: 0.06 },
    steady: { reentry: 0, lot: 0.25, maxPos: 0.5, tp: [0.035, 0.055], sl: -0.03, dd: 0.035, panic: 0.3, cred: 0.08, news: 0.6, exitT: [64, 80], holdSeal: 0.2, think: [0.8, 1.4], shout: 0.04 },
    quant: { reentry: 2, lot: 0.35, maxPos: 0.9, tp: [0.25, 0.3], sl: -0.03, dd: 0.025, panic: 0.3, cred: 0.04, news: 0.3, exitT: [82, 88], holdSeal: 0.5, think: [0.4, 0.7], shout: 0.03 },
    whale: { reentry: 1, lot: 0.4, maxPos: 1, tp: [0.12, 0.2], sl: -0.045, dd: 0.04, panic: 0.6, cred: 0.7, news: 0.6, exitT: [80, 88], holdSeal: 0.7, think: [0.6, 1.2], shout: 0.12 },
    gambler: { reentry: 2, lot: 0.45, maxPos: 1, tp: [0.05, 0.25], sl: -0.09, dd: 0.09, panic: 0.3, cred: 0.5, news: 0.4, exitT: [84, 89], holdSeal: 0.5, think: [0.7, 1.5], shout: 0.12 },
    fund: { reentry: 1, lot: 0.3, maxPos: 0.9, tp: [0.16, 0.25], sl: -0.045, dd: 0.045, panic: 0.4, cred: 0.3, news: 0.7, exitT: [86, 89], holdSeal: 0.9, think: [0.6, 1.1], shout: 0.06 },
  };

  // ---------- 喊单 ----------
  // sent：对别人买卖意愿的影响（正 = 想买，负 = 想卖）；human: 玩家能喊的
  const SHOUTS = {
    pump: { sent: 1, human: '🚀 冲！拉涨停！', lines: ['冲冲冲！', '拉涨停！', '格局打开！', '上车上车！'] },
    hold: { sent: 0.8, human: '💪 别卖，封死涨停！', lines: ['兄弟们别卖！', '封死涨停！', '明天还有一个板！', '拿住别下车！'] },
    target: { sent: 0.9, human: '📢 目标 15 块！', lines: ['主力在扫货！', '目标 15 块！', '大资金进场了！', '这是主升浪！'] },
    run: { sent: -1, human: '😱 快跑！要崩了！', lines: ['快跑！', '顶了顶了！', '要崩了！', '先跑为敬！'] },
    banker: { sent: -0.9, human: '🕵️ 庄家在出货！', lines: ['庄家在出货！', '有人在砸盘！', '主力跑了！'] },
    leek: { sent: -0.5, human: '🥬 我是韭菜，我先撤了', lines: ['我先撤了', '见好就收', '落袋为安～'] },
    cry: { sent: -0.3, lines: ['我的钱！！', '又站岗了……', '割了割了', '怎么又跌了'] },
    gloat: { sent: -0.2, lines: ['早跑了 😎', '吃到肉了', '谢谢接盘～'] },
    diamond: { sent: 0.4, lines: ['拿住！不卖！', '跌了正好补仓', '我就不卖'] },
  };
  const HUMAN_SHOUTS = ['pump', 'hold', 'target', 'run', 'banker', 'leek'];

  const NEWS = {
    open: ['传闻：{s} 要发布 AI 大模型', '{s} 被曝拿下大单', '{s} 进军低空经济', '{s} 宣布布局机器人'],
    bad: ['{s} 澄清公告：没有相关业务', '{s} 大股东公告减持', '{s} 收到交易所问询函'],
    good: ['机构席位大举买入 {s}', '{s} 业绩预增 300%'],
  };
  const STOCKS = ['韭菜科技', '画饼控股', '割肉传媒', '接盘股份', '泡沫智能', '套牢电子', '站岗生物', '空气能源'];

  // ---------- 开局 ----------
  // opts: { seed, n0（含真人）, lateJoin, mode: 'plain' | 'banker' | 'me',
  //         humans: [{ name, emoji }]（联机时有多个真人，单机默认就是“你”）, bankerPool: 'bots' | 'all'（庄家从谁里面挑） }
  function create(opts) {
    const seed = opts.seed != null ? opts.seed : Date.now();
    const S = {
      seed, rs: App.hashStr('bag-' + seed) | 0, t: 0, x: 0, f: 0, fear: 0,
      mode: opts.mode || 'plain', pl: [], buyQ: [], sellQ: [], hx: [0], recent: [], log: [], feed: [], shoutLog: [],
      seal: null, sealHist: [], dumped: false, dumpT: -1, bankerId: -1, inForecast: false, over: false,
    };
    const humans = opts.humans && opts.humans.length ? opts.humans.slice(0, 12) : [{ name: '你', emoji: '🥬', solo: true }];
    const H = humans.length;
    const n0 = clamp(Math.round(Math.max(opts.n0 || 6, H)), Math.max(3, H), 12);
    const B = n0 - H; // 电脑股民补的座位
    const joins = opts.lateJoin ? clamp(Math.round(n0 * 0.4), 1, 4) : 0;
    const total = n0 + joins;
    S.cfg = { n0, joins, lambda: PUSH / (total * (CASH0 / P0)), capTotal: total * (CASH0 / P0) };
    S.cfg.sealHold = 0.04 * S.cfg.capTotal;
    S.stock = rpick(S, STOCKS);
    S.code = String(300000 + Math.floor(rnd(S) * 9000));
    S.headline = rpick(S, NEWS.open).replace('{s}', S.stock);
    // 开盘传闻先发酵、再降温：场外资金眼里的“价值”先升后落
    S.hype = { h: rr(S, 0.03, 0.075), peak: rr(S, 24, 44), fade: rr(S, 28, 40) };
    // 选人：先保证有带头冲的和死拿的，其余随机；中途进场的偏向跟风型
    const pool = CAST.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd(S) * (i + 1)); const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp; }
    const take = (pred) => { const i = pool.findIndex(pred); return i >= 0 ? pool.splice(i, 1)[0] : pool.shift(); };
    const seats = [];
    if (B >= 1) seats.push(take((c) => c.type === 'influencer' || c.type === 'whale' || c.type === 'momentum'));
    if (B >= 2) seats.push(take((c) => c.type === 'diamond' || c.type === 'follower' || c.type === 'fund'));
    while (seats.length < B) seats.push(pool.shift());
    const late = [];
    for (let k = 0; k < joins; k++) late.push(take((c) => c.type === 'herd' || c.type === 'follower' || c.type === 'whale' || c.type === 'gambler'));
    humans.forEach((h, i) => addPlayer(S, h.solo ? { key: 'me', name: '你', emoji: '🥬', type: 'human', tag: '你' } : { key: 'h' + i, name: h.name, emoji: h.emoji, type: 'human', tag: '玩家' }, true, 0));
    seats.forEach((c) => addPlayer(S, c, false, 0));
    late.forEach((c) => addPlayer(S, c, false, rr(S, 8, 50)));
    // 庄家：单机庄家局在电脑股民里挑，“我当庄家”就是你；联机庄家局从所有人里随机挑（可能是真人）
    const pool2 = opts.bankerPool || 'bots';
    if (S.mode === 'banker') S.bankerId = pool2 === 'all' || B < 1 ? Math.floor(rnd(S) * n0) : H + Math.floor(rnd(S) * B);
    if (S.mode === 'me') S.bankerId = 0;
    if (S.bankerId >= 0) {
      const b = S.pl[S.bankerId];
      b.banker = true; b.hidden = b.hidden0 = lot100(0.2 * S.cfg.capTotal);
    }
    // 盘中消息：六成概率有一条，利空居多
    if (rnd(S) < 0.6) {
      const bad = rnd(S) < 0.65;
      S.news = { t: Math.round(rr(S, 38, 72) / DT), sign: bad ? -1 : 1, df: bad ? -rr(S, 0.08, 0.14) : rr(S, 0.03, 0.06),
        text: rpick(S, bad ? NEWS.bad : NEWS.good).replace('{s}', S.stock) };
    }
    return S;
  }

  // 联机时真人中途进场：带着 10 万现金，马上能交易
  function addHuman(S, h) {
    const p = addPlayer(S, { key: 'h' + S.pl.length, name: h.name, emoji: h.emoji, type: 'human', tag: '玩家' }, true, S.t * DT);
    p.active = true; p.peak = priceOf(S.x);
    pushFeed(S, { kind: 'join', id: p.id });
    return p.id;
  }

  function addPlayer(S, c, human, joinT) {
    const A = ARCH[c.type];
    const p = {
      id: S.pl.length, key: c.key, name: c.name, emoji: c.emoji, type: c.type, tag: c.tag, human, banker: false,
      cash: CASH0, shares: 0, cost: 0, hidden: 0, hidden0: 0, hidCash: 0, resCash: 0, qBuy: 0, qSell: 0,
      joinT, active: joinT <= 0, urge: 0, trust: {}, peak: P0, nextThink: 0, newsAt: -1, newsSign: 0,
      lastShout: null, busted: 0, realized: 0, phase: 'wait', entries: 0, target: 0, readyT: 0, reentryAt: 0,
    };
    if (A) {
      p.tp = rr(S, A.tp[0], A.tp[1]);
      p.exitT = rr(S, A.exitT[0], A.exitT[1]);
      p.holdRoll = rnd(S);
      p.nextThink = Math.round((joinT + rr(S, 0.3, 2.2)) / DT);
      p.readyT = c.type === 'influencer' ? rr(S, 1, 5) : c.type === 'gambler' ? rr(S, 5, 55) : rr(S, 2, 28);
    }
    S.pl.push(p);
    return p;
  }

  // ---------- 撮合 ----------
  const qSum = (Q) => { let s = 0; for (const o of Q) s += o.q; return s; };
  function logTrade(S, pl, side, q, px, kind) {
    if (q <= 0) return;
    if (pl) {
      S.log.push({ t: S.t, id: pl.id, side, q, px, kind });
      if (kind !== 'qfill') S.recent.push({ t: S.t, id: pl.id, side, q });
    }
  }
  function credit(pl, side, q, px, hidden) {
    if (!pl || q <= 0) return;
    if (side === 'buy') { pl.cash -= q * px; pl.shares += q; pl.cost += q * px; return; }
    pl.cash += q * px;
    if (hidden) { pl.hidden -= q; pl.hidCash += q * px; return; } // 底仓砸出去的钱单独记，不算进明仓
    const avg = pl.shares > 0 ? pl.cost / pl.shares : px;
    pl.realized += (px - avg) * q;
    pl.cost -= avg * q; pl.shares -= q;
    if (pl.shares <= 0) { pl.shares = 0; pl.cost = 0; }
  }
  // 吃掉对面排队的单（涨停时卖给排队买的人，跌停时买排队卖的人），价格不动
  function eatQueue(S, Q, side, q, px, taker, hidden) {
    let left = q;
    while (left > 0 && Q.length) {
      const o = Q[0], m = Math.min(left, o.q), maker = S.pl[o.id];
      if (side === 'sell') { // 吃排队买单：maker 买入
        maker.resCash -= m * px; maker.qBuy -= m;
        maker.shares += m; maker.cost += m * px;
        logTrade(S, maker, 'buy', m, px, 'qfill');
      } else { // 吃排队卖单：maker 卖出
        maker.qSell -= m;
        maker.cash += m * px;
        if (o.h) { maker.hidden -= m; maker.hidCash += m * px; }
        else { const avg = maker.shares > 0 ? maker.cost / maker.shares : px; maker.realized += (px - avg) * m; maker.cost -= avg * m; maker.shares -= m; if (maker.shares <= 0) { maker.shares = 0; maker.cost = 0; } }
        logTrade(S, maker, 'sell', m, px, o.h ? 'dump' : 'qfill');
      }
      o.q -= m; left -= m;
      if (o.q <= 0) Q.shift();
    }
    const done = q - left;
    if (taker && done > 0) { credit(taker, side, done, px, !!hidden); logTrade(S, taker, side, done, px, hidden ? 'dump' : 'mkt'); }
    return done;
  }
  function cancelSide(S, pl, side) {
    if (side === 'buy' && pl.qBuy > 0) {
      S.buyQ = S.buyQ.filter((o) => o.id !== pl.id);
      pl.cash += pl.resCash; pl.resCash = 0; pl.qBuy = 0;
    }
    if (side === 'sell' && pl.qSell > 0) {
      S.sellQ = S.sellQ.filter((o) => o.id !== pl.id);
      pl.qSell = 0;
    }
  }

  // 市价单。id = -1 是场外资金（钱和股票无限，不排队）。返回 { q 成交, px 均价, queued 排队 }
  function order(S, id, side, want, hidden) {
    const pl = id >= 0 ? S.pl[id] : null;
    let q = Math.max(0, Math.floor(want));
    const lam = S.cfg.lambda;
    let filled = 0, value = 0, queued = 0;
    const take = (n, px) => { filled += n; value += n * px; };
    if (pl) {
      if (!pl.active) return { q: 0, px: 0, queued: 0 };
      if (side === 'buy') {
        if (pl.qSell > 0) cancelSide(S, pl, 'sell');
      } else {
        if (pl.qBuy > 0) cancelSide(S, pl, 'buy');
        const avail = hidden ? pl.hidden - pl.qSell : pl.shares - pl.qSell;
        q = Math.min(q, Math.max(0, avail));
      }
      if (q <= 0) return { q: 0, px: 0, queued: 0 };
    }
    if (side === 'buy') {
      // 1) 跌停时先买排队卖的
      if (S.sellQ.length) {
        const n = Math.min(q, pl ? lot100(pl.cash / DOWN) : q);
        const got = eatQueue(S, S.sellQ, 'buy', n, DOWN, pl);
        take(got, DOWN); q -= got;
      }
      // 2) 推高价格
      if (q > 0 && S.x < XUP - 1e-12) {
        const room = (XUP - S.x) / lam;
        let n = Math.min(q, room);
        if (pl) { const aff = (Math.log(Math.exp(S.x) + (pl.cash * lam) / P0) - S.x) / lam; if (aff < n) n = lot100(aff); } // 钱不够时按整手（100 股）买
        n = Math.floor(n);
        const hit = n >= Math.floor(room) && q > n; // 买到涨停：价格贴住涨停价，剩下的去排队
        if (n > 0 || hit) {
          const x1 = hit ? XUP : Math.min(XUP, S.x + lam * n), px = avgPx(S.x, x1);
          S.x = x1; credit(pl, 'buy', n, px, false); logTrade(S, pl, 'buy', n, px, 'mkt'); take(n, px); q -= n;
        }
      }
      // 3) 涨停了就排队
      if (q > 0 && pl && S.x >= XUP - 1e-9) {
        const n = Math.min(q, lot100(pl.cash / UP));
        if (n > 0) { pl.cash -= n * UP; pl.resCash += n * UP; pl.qBuy += n; S.buyQ.push({ id: pl.id, q: n }); queued = n; }
      }
    } else {
      if (S.buyQ.length) { const got = eatQueue(S, S.buyQ, 'sell', q, UP, pl, hidden); take(got, UP); q -= got; }
      if (q > 0 && S.x > XDN + 1e-12) {
        const room = (S.x - XDN) / lam;
        const n = Math.floor(Math.min(q, room));
        const hit = n >= Math.floor(room) && q > n;
        if (n > 0 || hit) {
          const x1 = hit ? XDN : Math.max(XDN, S.x - lam * n), px = avgPx(x1, S.x);
          S.x = x1; credit(pl, 'sell', n, px, hidden); logTrade(S, pl, 'sell', n, px, hidden ? 'dump' : 'mkt'); take(n, px); q -= n;
        }
      }
      if (q > 0 && pl && S.x <= XDN + 1e-9) { pl.qSell += q; S.sellQ.push({ id: pl.id, q, h: !!hidden }); queued = q; }
    }
    if (pl && filled > 0) checkBust(S, pl, side, filled);
    return { q: filled, px: filled ? value / filled : 0, queued };
  }

  // 喊多以后马上卖（或喊空以后马上买）：被大家识破，之后喊单没人信
  function checkBust(S, pl, side, q) {
    const ls = pl.lastShout;
    const big = q >= 2000 || q >= 0.4 * (pl.shares + q);
    if (!ls || !big || S.t - ls.t > 50) return;
    const s = SHOUTS[ls.key].sent;
    if ((s >= 0.5 && side === 'sell') || (s <= -0.5 && side === 'buy')) {
      pl.lastShout = null; pl.busted++;
      for (const o of S.pl) if (o.id !== pl.id) o.trust[pl.id] = (o.trust[pl.id] == null ? 0.7 : o.trust[pl.id]) * 0.35;
      pushFeed(S, { kind: 'bust', id: pl.id, key: ls.key });
    }
  }

  function shout(S, id, key) {
    const sp = S.pl[id], sh = SHOUTS[key];
    if (!sp || !sh) return false;
    sp.lastShout = { t: S.t, key };
    for (const o of S.pl) {
      if (o.id === id || o.human || !o.active) continue;
      const A = ARCH[o.type];
      const tr = o.trust[id] == null ? 0.7 : o.trust[id];
      o.urge = clamp(o.urge + sh.sent * A.cred * tr, -1.5, 1.5);
    }
    const text = sp.human ? sh.human.replace(/^\S+\s/, '') : rpick(S, sh.lines); // 预演里也要抽，保证随机数顺序一致
    if (!S.inForecast) {
      S.shoutLog.push({ t: S.t, id, key, text });
      pushFeed(S, { kind: 'shout', id, key, text });
    }
    return true;
  }
  function pushFeed(S, ev) { if (!S.inForecast) { ev.t = S.t; S.feed.push(ev); } }

  // 庄家的底仓一次性砸出去（匿名）
  function dump(S, id) {
    const b = S.pl[id];
    if (!b || !b.banker || S.dumped || b.hidden <= 0) return null;
    S.dumped = true; S.dumpT = S.t;
    const before = priceOf(S.x);
    const r = order(S, id, 'sell', b.hidden, true);
    pushFeed(S, { kind: 'dump', id, q: b.hidden0, from: before, to: priceOf(S.x) });
    return r;
  }

  // ---------- 盘面特征（所有人都看得到的东西） ----------
  function features(S) {
    const hx = S.hx, n = hx.length - 1, x = S.x;
    const at = (k) => hx[Math.max(0, n - k)];
    let hi10 = -9, lo10 = 9;
    for (let i = Math.max(0, n - 100); i <= n; i++) { if (hx[i] > hi10) hi10 = hx[i]; if (hx[i] < lo10) lo10 = hx[i]; }
    let buys3 = 0, sells3 = 0;
    for (const r of S.recent) { if (r.q < 300) continue; if (r.side === 'buy') buys3++; else sells3++; }
    const sealQ = S.x >= XUP - 1e-9 ? qSum(S.buyQ) : 0;
    const prevSeal = S.sealHist.length > 20 ? S.sealHist[S.sealHist.length - 21] : 0;
    let inv = 0, eqs = 0;
    for (const p of S.pl) { if (!p.active) continue; const v = p.shares * priceOf(x); inv += v; eqs += p.cash - p.hidCash + p.resCash + v; }
    return {
      p: priceOf(x), m1: x - at(15), m3: x - at(40), m10: x - at(100), fromHi10: x - hi10, atHi10: x >= hi10 - 0.002,
      buys3, sells3, sealUp: S.x >= XUP - 1e-9 && S.buyQ.length > 0, sealQ, sealTrend: prevSeal > 0 ? sealQ / prevSeal - 1 : 0,
      sealDown: S.x <= XDN + 1e-9 && S.sellQ.length > 0, crowd: eqs > 0 ? inv / eqs : 0,
    };
  }

  // ---------- 对手怎么想 ----------
  function act(S, b, side, q) {
    q = lot100(q);
    if (q < 100) return null;
    const r = order(S, b.id, side, q);
    return r.q > 0 || r.queued > 0 ? side : null;
  }
  // 每个人一局大致是“等机会 → 分几笔进场 → 拿着 → 分几笔离场”，少数类型会再进一次
  function think(S, b, F) {
    const A = ARCH[b.type], t = S.t * DT, p = F.p;
    if (b.banker) return bankerThink(S, b, F);
    const eqv = b.cash + b.resCash + b.shares * p;
    const pos = (b.shares * p) / eqv;
    const free = b.shares - b.qSell;
    const ret = b.shares > 0 ? p / (b.cost / b.shares) - 1 : 0;
    b.peak = b.shares > 0 ? Math.max(b.peak, p) : p;
    const dd = p / b.peak - 1;
    // 涨停排队的买单：封单在减少、或者快收盘了，就撤
    if (b.qBuy > 0 && (F.sealTrend < -0.25 || t > b.exitT - 2) && rnd(S) < 0.4 + A.panic * 0.4) cancelSide(S, b, 'buy');
    let did = null, why = '';
    // ---- 离场 ----
    if (free >= 100) {
      let frac = 0;
      // 刚喊完多，先不好意思卖；听信了别人喊“别卖”的，也会多拿一会儿
      const honest = S.t < (b.honestUntil || 0) || (b.urge > 0.3 && rnd(S) < b.urge * A.cred);
      if (t >= b.exitT) {
        const keep = F.sealUp && F.sealQ >= S.cfg.sealHold && b.holdRoll < A.holdSeal;
        if (!keep) { frac = rr(S, 0.45, 1); why = 'exit'; }
      }
      if (!frac && ret <= A.sl && rnd(S) < 0.7) { frac = b.type === 'diamond' ? 0.5 : rr(S, 0.6, 1); why = 'stop'; }
      if (!frac && dd <= -A.dd && rnd(S) < 0.6) { frac = rr(S, 0.5, 1); why = 'trail'; }
      if (!frac && S.fear * A.panic > 0.35 + rnd(S) * 0.6) { frac = rr(S, 0.4, 0.9); why = 'fear'; }
      if (!frac && b.newsAt >= 0 && S.t >= b.newsAt && b.newsSign < 0 && rnd(S) < A.news) { frac = rr(S, 0.5, 1); why = 'news'; }
      if (!frac && !honest && b.urge < -0.3 && rnd(S) < -b.urge * A.cred) { frac = rr(S, 0.3, 0.7); why = 'urge'; }
      if (!frac && !honest && ret >= b.tp && rnd(S) < 0.6) { frac = rr(S, 0.4, 0.75); why = 'tp'; b.tp *= 1.4; }
      if (!frac && !honest) {
        if (b.type === 'momentum' && F.m3 < -0.009 && rnd(S) < 0.6) { frac = rr(S, 0.5, 1); why = 'mom'; }
        if (b.type === 'herd' && F.sells3 - F.buys3 >= 3 && rnd(S) < 0.6) { frac = rr(S, 0.5, 1); why = 'herd'; }
        if (b.type === 'fund' && S.sealHist.length && b.wasSealed && !F.sealUp && F.fromHi10 < -0.015 && rnd(S) < 0.5) { frac = rr(S, 0.6, 1); why = 'break'; }
        if (b.type === 'influencer' && ret >= b.tp * 0.7 && F.buys3 >= 1 && rnd(S) < 0.5) { frac = rr(S, 0.4, 0.7); why = 'bluff'; }
        if (b.type === 'gambler' && rnd(S) < 0.06) { frac = rr(S, 0.5, 1); why = 'yolo'; }
      }
      if (frac) {
        did = act(S, b, 'sell', Math.max(100, free * frac));
        if (did && b.shares - b.qSell < 100) { b.phase = 'out'; b.reentryAt = S.t + Math.round(rr(S, 6, 12) / DT); }
      }
    }
    if (F.sealUp && b.shares > 0) b.wasSealed = true;
    if (b.newsAt >= 0 && S.t >= b.newsAt) {
      if (!did && b.newsSign > 0 && pos < A.maxPos && rnd(S) < A.news * 0.6 && t < b.exitT - 8) did = act(S, b, 'buy', (b.cash / p) * A.lot);
      b.newsAt = -1;
    }
    // ---- 进场 ----
    if (!did && t < b.exitT - 8 && t < 82) {
      if (b.phase === 'wait' || (b.phase === 'out' && S.t >= (b.reentryAt || 1e9) && b.entries < A.reentry + 1)) {
        let go = false;
        switch (b.type) {
          case 'influencer': go = b.entries === 0 ? t >= b.readyT : F.fromHi10 < -0.05 && t < 66; break;
          case 'diamond': case 'steady': go = t >= b.readyT && F.m10 > -0.02; break;
          case 'momentum': go = t > 3 && F.m3 > 0.006; break;
          case 'follower': go = b.urge > 0.35 || F.m10 > 0.045; break;
          case 'herd': go = F.buys3 - F.sells3 >= 2 || F.m10 > 0.06; break;
          case 'whale': go = (p >= P0 * 1.05 && F.m3 > 0.003) || b.urge > 0.6; break;
          case 'scalper': go = F.m1 > 0.002; break;
          case 'dip': go = F.fromHi10 < -0.045 && F.m1 > -0.002; break;
          case 'panicky': go = t < 40 && F.m3 > 0.005; break;
          case 'quant': go = t > 5 && F.atHi10 && F.m3 > 0.004; break;
          case 'gambler': go = t >= b.readyT; break;
          case 'fund': go = F.sealUp || F.m10 > 0.05; break;
          default: break;
        }
        if (b.joinT > 0 && b.entries === 0 && t - b.joinT < 8 && p >= P0 * 0.98) go = go || rnd(S) < 0.8; // 刚进场的人最上头
        if (b.urge > 0.45 && rnd(S) < b.urge * A.cred) go = true; // 被喊单带进场
        if (go && rnd(S) < 0.85) { b.phase = 'in'; b.entries++; b.target = A.maxPos * rr(S, 0.6, 1); }
      }
      if (b.phase === 'in') {
        if (pos >= b.target - 0.04 || b.cash < p * 100) b.phase = 'hold';
        else if (F.m3 < -0.008 && b.type !== 'dip' && b.type !== 'diamond') { /* 正在跌，先等等 */ }
        else if (rnd(S) < 0.75) {
          const room = Math.max(0, b.target - pos) * eqv / p;
          did = act(S, b, 'buy', Math.min(room, (b.cash / p) * A.lot * rr(S, 0.8, 1.3) * (b.joinT > 0 && b.entries === 1 ? 1.4 : 1)));
          if (!did && S.x >= XUP - 1e-9 && b.type !== 'steady' && b.type !== 'scalper') did = null;
        }
      }
    }
    botShout(S, b, F, did, ret, why);
    return did;
  }

  function botShout(S, b, F, did, ret, why) {
    const A = ARCH[b.type];
    if (b.lastSpoke != null && S.t - b.lastSpoke < 70) return;
    let key = null;
    const pr = A.shout;
    if (b.type === 'influencer') {
      if (did === 'sell' && rnd(S) < 0.8) key = rpick(S, ['pump', 'hold', 'target']); // 嘴上喊冲，手上在卖
      else if (did === 'buy' && rnd(S) < 0.6) key = rpick(S, ['pump', 'target']);
      else if (b.shares === 0 && F.m3 < -0.02 && rnd(S) < 0.25) key = 'gloat';
    } else if (did === 'buy' && rnd(S) < pr) key = rpick(S, ['pump', 'target', 'hold']);
    else if (did === 'sell' && rnd(S) < pr * 1.2) key = why === 'tp' && F.m3 >= 0 ? 'leek' : 'run';
    else if (b.shares > 0 && F.sealUp && rnd(S) < pr * 0.6) key = b.type === 'diamond' ? 'diamond' : 'hold';
    else if (b.shares > 0 && F.m1 < -0.012 && rnd(S) < pr) key = b.type === 'diamond' ? 'diamond' : 'cry';
    else if (b.shares === 0 && b.realized > 1500 && F.m3 < -0.015 && rnd(S) < pr * 0.8) key = 'gloat';
    if (!key) return;
    b.lastSpoke = S.t;
    if (SHOUTS[key].sent >= 0.5 && b.type !== 'influencer' && b.type !== 'gambler') b.honestUntil = S.t + 50;
    shout(S, b.id, key);
  }

  // 庄家：能看到未来 5 秒（假设自己不动），拉高、先卖明仓、再匿名砸底仓，跌深了再接回来
  function bankerThink(S, b, F) {
    if (S.inForecast) return null;
    const t = S.t * DT, p = F.p;
    const fc = forecast(S, 50, b.id);
    let hi = -9, lo = 9;
    for (const v of fc) { if (v > hi) hi = v; if (v < lo) lo = v; }
    const up = hi - S.x, dn = lo - S.x, end = fc[fc.length - 1] - S.x;
    const eqv = b.cash + b.resCash + b.shares * p, pos = (b.shares * p) / eqv, free = b.shares - b.qSell;
    let did = null;
    if (!S.dumped) {
      const peakish = p >= P0 * 1.07 && t > 25 && (dn < -0.02 || up < 0.003);
      if (peakish || t > 74) {
        if (free >= 100) { did = act(S, b, 'sell', free); if (did && rnd(S) < 0.5) { b.lastSpoke = S.t; shout(S, b.id, rpick(S, ['hold', 'pump'])); } b.dumpAt = S.t + Math.round(rr(S, 1.5, 6) / DT); }
        else if (S.t >= (b.dumpAt || 0)) { dump(S, b.id); did = 'dump'; }
      } else if (t < 55 && pos < 0.85 && end > -0.004 && p < P0 * 1.12) {
        did = act(S, b, 'buy', (b.cash / p) * 0.3);
        if (did && (b.lastSpoke == null || S.t - b.lastSpoke > 60) && rnd(S) < 0.45) { b.lastSpoke = S.t; shout(S, b.id, rpick(S, ['pump', 'target'])); }
      }
    } else {
      const ret = b.shares > 0 ? p / (b.cost / b.shares) - 1 : 0;
      if (free >= 100 && (dn < -0.015 || t >= 84 || ret > 0.05)) did = act(S, b, 'sell', free);
      else if (t < 82 && p <= P0 * 0.97 && end > 0.01 && pos < 0.5) did = act(S, b, 'buy', (b.cash / p) * 0.35);
      if ((b.lastSpoke == null || S.t - b.lastSpoke > 50) && S.t - S.dumpT < 40 && rnd(S) < 0.25) { b.lastSpoke = S.t; shout(S, b.id, rpick(S, ['run', 'banker'])); }
    }
    return did;
  }

  // ---------- 推进一格（0.1 秒） ----------
  function step(S) {
    if (S.t >= TICKS) return false;
    S.t++;
    const t = S.t * DT;
    // 中途进场
    for (const p of S.pl) {
      if (p.active || p.joinT <= 0) continue;
      if (t >= p.joinT) {
        if (S.x < -0.03 && t < 60) { p.joinT += 5; continue; } // 正在跌，晚点再来
        p.active = true; p.peak = priceOf(S.x); p.nextThink = S.t + Math.round(rr(S, 0.3, 1.2) / DT);
        pushFeed(S, { kind: 'join', id: p.id });
      }
    }
    // 盘中消息
    if (S.news && S.t === S.news.t) {
      S.f += S.news.df;
      pushFeed(S, { kind: 'news', sign: S.news.sign, text: S.news.text });
      for (const p of S.pl) if (!p.human && p.active) { p.newsAt = S.t + Math.round(rr(S, 0.6, 3.5) / DT); p.newsSign = S.news.sign; }
    }
    // 场外资金：拉回价值 + 一点跟风 + 随机
    const hx = S.hx, n = hx.length - 1;
    const m3 = S.x - hx[Math.max(0, n - 40)];
    const H = S.hype, tt = S.t * DT;
    const bump = tt <= H.peak ? Math.sin((Math.PI / 2) * (tt / H.peak)) : Math.max(0, Math.cos((Math.PI / 2) * Math.min(1, (tt - H.peak) / H.fade)));
    const fNow = S.f + H.h * bump;
    const dx = (-(S.x - fNow) / TAU + TREND * (m3 / 4)) * DT + NOISE * Math.sqrt(DT) * rnorm(S);
    const qOut = Math.abs(dx) / S.cfg.lambda;
    if (qOut >= 1) order(S, -1, dx > 0 ? 'buy' : 'sell', qOut);
    // 恐慌：价格跌得越快越怕，慢慢消退
    const m1 = S.x - hx[Math.max(0, n - 15)];
    S.fear = Math.max(0, S.fear * Math.exp(-DT / 2.5) + Math.max(0, -m1 - 0.006) * 2.2);
    // 对手决策
    const F = features(S);
    for (const p of S.pl) {
      if (p.human || !p.active || S.t < p.nextThink) continue;
      if (S.inForecast && p.id === S.passiveId) { p.nextThink = S.t + 5; continue; }
      think(S, p, F);
      const A = ARCH[p.type];
      p.nextThink = S.t + Math.max(1, Math.round(rr(S, A.think[0], A.think[1]) / DT));
    }
    // 喊单效果衰减，信任慢慢恢复
    const decay = Math.exp(-DT / 3.5);
    for (const p of S.pl) {
      p.urge *= decay;
      for (const k in p.trust) if (p.trust[k] < 0.7) p.trust[k] = Math.min(0.7, p.trust[k] + 0.004);
    }
    // 封板 / 炸板
    const st = S.x >= XUP - 1e-9 && S.buyQ.length ? 'up' : S.x <= XDN + 1e-9 && S.sellQ.length ? 'down' : null;
    if (st !== S.seal) {
      if (st) pushFeed(S, { kind: 'seal', dir: st });
      else if (S.seal) pushFeed(S, { kind: 'break', dir: S.seal });
      S.seal = st;
    }
    S.sealHist.push(S.x >= XUP - 1e-9 ? qSum(S.buyQ) : 0);
    if (S.sealHist.length > 60) S.sealHist.shift();
    while (S.recent.length && S.t - S.recent[0].t > 30) S.recent.shift();
    hx.push(S.x);
    if (S.t >= TICKS) S.over = true;
    return true;
  }

  // ---------- 预演未来（庄家的“透视”） ----------
  function cloneState(S) {
    const C = Object.assign({}, S);
    C.pl = S.pl.map((p) => Object.assign({}, p, { trust: Object.assign({}, p.trust), lastShout: p.lastShout ? Object.assign({}, p.lastShout) : null }));
    C.buyQ = S.buyQ.map((o) => Object.assign({}, o));
    C.sellQ = S.sellQ.map((o) => Object.assign({}, o));
    C.hx = S.hx.slice(-120);
    C.recent = S.recent.slice();
    C.sealHist = S.sealHist.slice();
    C.log = []; C.feed = []; C.shoutLog = [];
    return C;
  }
  function forecast(S, ticks, passiveId) {
    const C = cloneState(S);
    C.inForecast = true; C.passiveId = passiveId == null ? -1 : passiveId;
    const out = [];
    for (let k = 0; k < ticks && C.t < TICKS; k++) { step(C); out.push(C.x); }
    if (!out.length) out.push(S.x);
    return out;
  }

  // ---------- 收盘结算 ----------
  function settle(S) {
    const pClose = priceOf(S.x);
    const upQ = S.x >= XUP - 1e-9 ? qSum(S.buyQ) : 0, dnQ = S.x <= XDN + 1e-9 ? qSum(S.sellQ) : 0;
    for (const p of S.pl) { cancelSide(S, p, 'buy'); cancelSide(S, p, 'sell'); }
    let next, kind;
    if (upQ >= S.cfg.sealHold) { kind = 'board'; next = UP * (1 + 0.03 + 0.07 * Math.min(1, upQ / (0.2 * S.cfg.capTotal))); }
    else if (dnQ >= S.cfg.sealHold) { kind = 'down'; next = DOWN * (1 - 0.03 - 0.07 * Math.min(1, dnQ / (0.2 * S.cfg.capTotal))); }
    else { kind = 'fade'; next = P0 * Math.exp(S.f + 0.2 * (S.x - S.f) + 0.015 * rnorm(S)); }
    next = Math.round(next * 100) / 100;
    let hiT = 0, loT = 0;
    for (let i = 1; i < S.hx.length; i++) { if (S.hx[i] > S.hx[hiT]) hiT = i; if (S.hx[i] < S.hx[loT]) loT = i; }
    const res = { close: pClose, next, kind, sealUpQ: upQ, sealDownQ: dnQ, hi: priceOf(S.hx[hiT]), hiT, lo: priceOf(S.hx[loT]), loT, players: [] };
    for (const p of S.pl) {
      const start = CASH0 + p.hidden0 * P0;
      const fin = p.cash + (p.shares + p.hidden) * next;
      res.players.push({ id: p.id, pnl: fin - start, pct: (fin - start) / start * 100, held: p.shares, start, fin, visPnl: p.cash - p.hidCash + p.shares * next - CASH0 });
    }
    res.clues = clues(S, res);
    S.result = res;
    return res;
  }

  // 线索：卖点准不准、砸盘前有没有先跑、喊多又卖几次
  function clues(S, res) {
    const out = {};
    const pAt = (tk) => priceOf(S.hx[Math.min(S.hx.length - 1, Math.max(0, tk))]);
    for (const p of S.pl) {
      const mine = S.log.filter((r) => r.id === p.id && r.kind !== 'dump');
      let edge = 0, w = 0, topSells = 0, preDump = 0, sold = 0, bought = 0;
      for (const r of mine) {
        const later = pAt(r.t + 50), chg = later / r.px - 1;
        edge += (r.side === 'sell' ? -chg : chg) * r.q; w += r.q;
        if (r.side === 'sell') { sold += r.q; if (r.px >= res.hi * 0.975) topSells += r.q; if (S.dumpT >= 0 && r.t <= S.dumpT && r.t >= S.dumpT - 80) preDump += r.q; }
        else bought += r.q;
      }
      out[p.id] = { edge: w ? (edge / w) * 100 : 0, topSells, preDump, busted: p.busted, sold, bought, trades: mine.length };
    }
    return out;
  }

  // ---------- 投票揪庄家 ----------
  // humanVote：你投的人（你当庄家时传 null）。返回每个人的票、被揪出的人、庄家是谁、分钱结果
  // humanVote：单机传你投的人（你当庄家时传 null）；联机传 { 玩家id: 投给谁 }，没投的真人算弃权
  function vote(S, humanVote) {
    const hv = humanVote != null && typeof humanVote === 'object' ? humanVote : { 0: humanVote };
    const res = S.result, C = res.clues;
    const voters = S.pl.filter((p) => p.active || p.joinT <= DUR);
    const cand = S.pl;
    const visPnl = {};
    for (const r of res.players) visPnl[r.id] = r.visPnl;
    const pnls = cand.map((p) => visPnl[p.id]);
    const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
    const sd = Math.sqrt(pnls.reduce((a, b) => a + (b - mean) * (b - mean), 0) / pnls.length) || 1;
    // 每个人看重的线索不一样：有人只看谁赚得多，有人盯着砸盘前谁先跑，有人记仇喊单骗人的
    const sus = (p, w) => {
      const c = C[p.id];
      return w[0] * ((visPnl[p.id] - mean) / sd) + 0.15 * c.edge + (c.preDump > 0 ? w[1] * (1 + Math.min(0.8, c.preDump / 8000)) : 0) + w[2] * c.busted + (c.topSells > 0 ? 0.35 : 0) +
        (p.type === 'diamond' && c.sold > 0 && c.topSells > 0 ? 0.5 : 0);
    };
    const tally = {};
    const ballots = [];
    for (const v of voters) {
      let pick = null;
      if (v.human) { pick = hv[v.id]; if (pick == null || pick === v.id || !S.pl[pick]) pick = null; }
      else {
        let best = -1e9;
        const w = [rr(S, 0, 0.8), rr(S, 0.3, 1.8), rr(S, 0.1, 1.1)];
        for (const c of cand) {
          if (c.id === v.id) continue;
          let s = sus(c, w) + rnorm(S) * (1.1 + 0.9 * (ARCH[v.type] ? ARCH[v.type].cred : 0.5));
          if (v.banker && c.banker) s = -1e9;
          if (v.banker && c.human) s += 0.6; // 庄家想甩锅给你
          if (s > best) { best = s; pick = c.id; }
        }
      }
      if (pick == null) continue;
      ballots.push({ from: v.id, to: pick });
      tally[pick] = (tally[pick] || 0) + 1;
    }
    let top = -1, topN = 0, tie = false;
    for (const k in tally) { if (tally[k] > topN) { topN = tally[k]; top = +k; tie = false; } else if (tally[k] === topN) tie = true; }
    const caught = !tie && top === S.bankerId;
    const out = { ballots, tally, accused: tie ? -1 : top, caught, tie, bankerId: S.bankerId, split: 0, seized: 0 };
    const bk = res.players.find((r) => r.id === S.bankerId);
    if (caught && bk && bk.pnl > 0) {
      const retail = res.players.filter((r) => r.id !== S.bankerId);
      out.seized = bk.pnl; out.split = bk.pnl / retail.length;
      bk.pnl = 0; bk.pct = 0;
      for (const r of retail) { r.pnl += out.split; r.pct = (r.pnl / r.start) * 100; }
    }
    res.vote = out;
    return out;
  }

  // 名次：按盈亏排，最后一名戴韭菜头套
  function ranking(S) {
    return S.result.players.slice().sort((a, b) => b.pnl - a.pnl);
  }

  App.BagEngine = {
    DT, DUR, TICKS, P0, UP, DOWN, XUP, XDN, CASH0, LOT, CAST, ARCH, SHOUTS, HUMAN_SHOUTS,
    create, addHuman, step, order, cancelSide, shout, dump, forecast, settle, vote, ranking, features, priceOf, qSum,
  };
})(typeof window !== 'undefined' ? window : globalThis);

// ---- bag-server.js ----
/* ⑧ 谁是接盘侠 · 联机房间服务器（Node.js 18+，零依赖）
 * 每个房间在服务器上跑一局现成的行情引擎：价格、撮合、电脑股民、投票都在这里算；手机只发指令、收推送。
 * 庄家身份、底仓和“未来 5 秒”只发给庄家本人，砸盘对所有人匿名。
 * 启动：PORT=8788 node bag-server.cjs        健康检查：GET /health        实时连接：路径以 /ws 结尾的 WebSocket
 * 测试加速：TICK_MS=10（默认 100，即 0.1 秒一格） */
'use strict';
const http = require('http');
const crypto = require('crypto');
if (!globalThis.App || !globalThis.App.BagEngine) { require('./core.js'); require('./bag-engine.js'); }
const E = globalThis.App.BagEngine;

const PORT = +(process.env.PORT || 8788);
const TICK_MS = Math.max(5, +(process.env.TICK_MS || 100));
const MAX_ROOMS = 300, MAX_PEOPLE = 12, JOIN_LIVE_SEC = 60, VOTE_SEC = 25, COUNT_MS = 3000;
const EMOJIS = ['🥬', '🐂', '🐻', '🦊', '🐼', '🐯', '🐸', '🐵', '🐔', '🐧', '🦁', '🐰'];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------- 最小 WebSocket（RFC 6455，只用文本帧） ----------
function wsAccept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return null; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  const c = { socket, buf: Buffer.alloc(0), frags: [], closed: false, seen: Date.now(), msgs: 0, win: Date.now(), onmsg: null, onclose: null };
  socket.on('data', (d) => { c.seen = Date.now(); c.buf = c.buf.length ? Buffer.concat([c.buf, d]) : d; parseFrames(c); });
  socket.on('close', () => kill(c));
  socket.on('error', () => kill(c));
  return c;
}
function parseFrames(c) {
  while (!c.closed && c.buf.length >= 2) {
    const b0 = c.buf[0], b1 = c.buf[1], fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f, off = 2;
    if (len === 126) { if (c.buf.length < 4) return; len = c.buf.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (c.buf.length < 10) return; if (c.buf.readUInt32BE(2)) { kill(c); return; } len = c.buf.readUInt32BE(6); off = 10; }
    if (len > 65536 || !masked) { kill(c); return; } // 客户端必须加掩码；单条消息不超过 64KB
    const need = off + 4 + len;
    if (c.buf.length < need) return;
    const mask = c.buf.subarray(off, off + 4), data = Buffer.from(c.buf.subarray(off + 4, need));
    for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
    c.buf = c.buf.subarray(need);
    if (op === 0x8) { frame(c, 0x8, Buffer.alloc(0)); kill(c); return; }
    if (op === 0x9) { frame(c, 0xA, data); continue; }
    if (op === 0xA) continue;
    if (op === 0x1 || op === 0x0) {
      c.frags.push(data);
      if (!fin) continue;
      const text = Buffer.concat(c.frags).toString('utf8');
      c.frags = [];
      // 简单限流：每秒最多 40 条
      const now = Date.now();
      if (now - c.win > 1000) { c.win = now; c.msgs = 0; }
      if (++c.msgs > 40) continue;
      if (c.onmsg) { try { c.onmsg(JSON.parse(text)); } catch (e) { /* 坏消息直接丢掉 */ } }
      continue;
    }
    c.frags = []; // 二进制帧不用
  }
}
function frame(c, op, payload) {
  if (c.closed) return;
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeUInt32BE(0, 2); head.writeUInt32BE(len, 6); }
  if (c.socket.writableLength > 1 << 20) { kill(c); return; } // 对方卡死了
  try { c.socket.write(Buffer.concat([head, payload])); } catch (e) { kill(c); }
}
function kill(c) {
  if (c.closed) return;
  c.closed = true;
  try { c.socket.destroy(); } catch (e) { /* ignore */ }
  if (c.onclose) c.onclose();
}
const send = (c, obj) => { if (c && !c.closed) frame(c, 0x1, Buffer.from(JSON.stringify(obj))); };

// ---------- 房间 ----------
const rooms = new Map();
const r4 = (v) => Math.round(v * 10000) / 10000;
const r2 = (v) => Math.round(v * 100) / 100;
function newCode() { for (let i = 0; i < 80; i++) { const c = String(1000 + crypto.randomInt(9000)); if (!rooms.has(c)) return c; } return null; }
function cleanName(s) {
  s = String(s || '').replace(/[<>&"'`\\]/g, '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, '').trim();
  return Array.from(s).slice(0, 8).join('') || '韭菜' + crypto.randomInt(100);
}
function makeRoom() {
  const code = newCode();
  if (!code) return null;
  const room = { code, cfg: { n0: 6, lateJoin: true, mode: 'plain' }, people: [], phase: 'lobby', S: null, hostTok: null, touched: Date.now(),
    orders: [], votes: {}, voteEnd: 0, startAt: 0, acc: 0, last: 0, logIdx: 0, feedIdx: 0, round: 0 };
  rooms.set(code, room);
  log('room', code, 'created');
  return room;
}
const online = (room) => room.people.filter((p) => p.conn && !p.conn.closed);
function lobbyMsg(room, me) {
  return { t: 'lobby', code: room.code, cfg: room.cfg, phase: room.phase, round: room.round,
    people: room.people.map((p) => ({ name: p.name, emoji: p.emoji, host: p.tok === room.hostTok, online: !!(p.conn && !p.conn.closed), me: p === me, playing: p.pid >= 0 })) };
}
function broadcastLobby(room) { for (const p of room.people) send(p.conn, lobbyMsg(room, p)); }
function pickHost(room) {
  if (room.people.some((p) => p.tok === room.hostTok && p.conn && !p.conn.closed)) return;
  const next = online(room)[0] || room.people[0];
  room.hostTok = next ? next.tok : null;
}

// 游戏里的公开信息
function publicPlayers(S) {
  return S.pl.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, tag: p.tag, human: p.human, active: p.active, joinT: Math.round(p.joinT * 10) / 10 }));
}
function startMsg(room, person) {
  const S = room.S, me = S.pl[person.pid];
  return { t: 'start', code: room.code, round: room.round, phase: room.phase, startIn: Math.max(0, room.startAt - Date.now()),
    game: { mode: S.mode, stock: S.stock, code: S.code, headline: S.headline, cfg: { n0: S.cfg.n0, joins: S.cfg.joins }, players: publicPlayers(S) },
    you: person.pid, banker: !!me.banker, hidden0: me.banker ? me.hidden0 : 0,
    snap: S.t > 0 ? { k: S.t, hx: S.hx.map(r4), feed: S.feed.slice(-40).map((f) => pubEvent(f, S)), log: S.log.filter((l) => l.kind !== 'dump' && (l.id === person.pid || l.q >= 400)).slice(-200).map(pubTrade), dumped: S.dumped, dumpT: S.dumpT } : null };
}
const pubTrade = (l) => [l.t, l.id, l.side === 'buy' ? 1 : -1, l.q, r2(l.px), l.kind === 'qfill' ? 1 : 0];
function pubEvent(f, S) {
  const e = Object.assign({}, f);
  if (e.kind === 'dump') delete e.id; // 匿名
  if (e.kind === 'join' && S && S.pl[e.id]) { const p = S.pl[e.id]; e.p = { name: p.name, emoji: p.emoji, tag: p.tag, human: p.human, joinT: Math.round(p.joinT * 10) / 10 }; }
  if (e.from != null) e.from = r2(e.from);
  if (e.to != null) e.to = r2(e.to);
  return e;
}
function account(p) { return [Math.round(p.cash * 100) / 100, p.shares, Math.round(p.cost * 100) / 100, p.qBuy, p.qSell, p.hidden, Math.round(p.resCash * 100) / 100, Math.round(p.hidCash * 100) / 100, p.busted]; }

function startGame(room) {
  const humans = online(room);
  if (!humans.length) return;
  room.round++;
  room.people.forEach((p) => { p.pid = -1; });
  const S = E.create({ seed: crypto.randomInt(2147483647), n0: Math.max(room.cfg.n0, humans.length), lateJoin: room.cfg.lateJoin, mode: room.cfg.mode,
    humans: humans.map((h) => ({ name: h.name, emoji: h.emoji })), bankerPool: 'all' });
  humans.forEach((h, i) => { h.pid = i; h.lastShout = -1e9; });
  room.S = S; room.phase = 'count'; room.startAt = Date.now() + COUNT_MS; room.orders = []; room.votes = {}; room.logIdx = 0; room.feedIdx = 0; room.acc = 0;
  for (const p of room.people) { if (p.pid >= 0) send(p.conn, startMsg(room, p)); else send(p.conn, { t: 'wait', phase: 'count', left: 90 }); }
  broadcastLobby(room);
  log('room', room.code, 'round', room.round, 'start', humans.length, 'humans', S.pl.length, 'seats', S.mode);
}

function roomTick(room) {
  const S = room.S;
  // 这 0.1 秒里收到的单子随机排序后一起撮合：网速快几十毫秒不占便宜
  const batch = room.orders;
  room.orders = [];
  for (let i = batch.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); const tmp = batch[i]; batch[i] = batch[j]; batch[j] = tmp; }
  const fills = {};
  for (const o of batch) {
    const p = S.pl[o.pid];
    if (!p) continue;
    if (o.shout) { E.shout(S, o.pid, o.shout); continue; }
    if (o.dump) { if (p.banker && !S.dumped) E.dump(S, o.pid); continue; }
    let r;
    if (o.side === 'buy') r = E.order(S, o.pid, 'buy', E.LOT);
    else {
      const had = p.qBuy;
      if (had) E.cancelSide(S, p, 'buy');
      const want = o.side === 'all' ? p.shares : E.LOT;
      r = want > 0 && p.shares - p.qSell >= 100 ? E.order(S, o.pid, 'sell', want) : { q: 0, px: 0, queued: 0 };
      r.cancelled = had;
    }
    (fills[o.pid] || (fills[o.pid] = [])).push([o.side, r.q, r2(r.px), r.queued, r.cancelled || 0,
      r.queued ? (o.side === 'buy' ? E.qSum(S.buyQ) - p.qBuy : E.qSum(S.sellQ) - p.qSell) : 0]);
  }
  // 掉线的人：快收盘时电脑帮他清仓
  if (S.t * E.DT >= 82 && S.t % 10 === 0) {
    for (const h of room.people) {
      if (h.pid < 0 || (h.conn && !h.conn.closed)) continue;
      const p = S.pl[h.pid];
      if (p.shares - p.qSell >= 100) E.order(S, h.pid, 'sell', p.shares);
    }
  }
  E.step(S);
  // 推送
  const tr = [];
  for (; room.logIdx < S.log.length; room.logIdx++) { const l = S.log[room.logIdx]; if (l.kind !== 'dump') tr.push(pubTrade(l)); }
  const ev = [];
  for (; room.feedIdx < S.feed.length; room.feedIdx++) ev.push(pubEvent(S.feed[room.feedIdx], S));
  const F = E.features(S);
  const pub = [Math.round(F.crowd * 100), F.sealUp ? F.sealQ : 0, F.sealDown ? E.qSum(S.sellQ) : 0, S.pl.filter((p) => p.active).length];
  let pos = null;
  if (S.t % 5 === 0) {
    const px = F.p;
    pos = S.pl.map((p) => { const ev2 = p.cash - p.hidCash + p.resCash + p.shares * px; return [ev2 > 0 ? Math.round(((p.shares * px) / ev2) * 20) * 5 : 0, p.qBuy > 0 ? 1 : p.qSell > 0 ? 2 : 0]; });
  }
  const base = { t: 'k', k: S.t, x: r4(S.x), tr, ev, pub };
  if (pos) base.pos = pos;
  let fc = null;
  for (const h of room.people) {
    if (!h.conn || h.conn.closed) continue;
    const m = Object.assign({}, base);
    if (h.pid >= 0) {
      const p = S.pl[h.pid];
      m.me = account(p);
      if (fills[h.pid]) m.f = fills[h.pid];
      if (p.banker && !S.over && S.t % 5 === 0) { if (!fc) fc = E.forecast(S, 50).map(r4); m.fc = fc; }
    }
    send(h.conn, m);
  }
  if (S.over) endRound(room);
}

function endRound(room) {
  const S = room.S;
  const res = E.settle(S);
  const visPnl = {};
  for (const r of res.players) visPnl[r.id] = Math.round(r.visPnl);
  const pubRes = { close: r2(res.close), next: res.next, kind: res.kind, hi: r2(res.hi), hiT: res.hiT, lo: r2(res.lo), loT: res.loT, sealUpQ: res.sealUpQ, sealDownQ: res.sealDownQ,
    clues: res.clues, visPnl, dumpT: S.dumpT, dumpQ: S.dumped && S.bankerId >= 0 ? S.pl[S.bankerId].hidden0 : 0 };
  if (S.mode === 'banker') {
    room.phase = 'vote';
    room.voteEnd = Date.now() + VOTE_SEC * 1000;
    for (const h of room.people) send(h.conn, { t: 'settle', res: pubRes, vote: true, voteSec: VOTE_SEC, voters: room.people.filter((p) => p.pid >= 0).length });
  } else {
    for (const h of room.people) send(h.conn, { t: 'settle', res: pubRes, vote: false });
    finishRound(room);
  }
}
function finishRound(room) {
  const S = room.S;
  if (S.mode === 'banker' && !S.result.vote) {
    const hv = {};
    for (const h of room.people) if (h.pid >= 0 && room.votes[h.pid] != null) hv[h.pid] = room.votes[h.pid];
    E.vote(S, hv);
  }
  room.phase = 'result';
  const msg = { t: 'result', res: { players: S.result.players.map((r) => ({ id: r.id, pnl: Math.round(r.pnl), pct: Math.round(r.pct * 100) / 100, held: r.held, visPnl: Math.round(r.visPnl), start: r.start })), vote: S.result.vote || null },
    bankerId: S.bankerId, hidden0: S.bankerId >= 0 ? S.pl[S.bankerId].hidden0 : 0, busted: S.pl.map((p) => p.busted), log: S.log.map(pubTrade).concat(S.log.filter((l) => l.kind === 'dump').map((l) => [l.t, l.id, -1, l.q, r2(l.px), 2])) };
  for (const h of room.people) send(h.conn, msg);
  broadcastLobby(room);
  log('room', room.code, 'round', room.round, 'end', S.result.kind, 'next', S.result.next);
}
function liveMsg(room, h) {
  // 重连进来时补上当前阶段
  if (room.phase === 'lobby' || h.pid < 0) return;
  send(h.conn, startMsg(room, h));
}

// ---------- 消息 ----------
function onConn(c) {
  let room = null, me = null;
  c.onmsg = (m) => {
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'ping') { send(c, { t: 'pong', c: m.c }); return; }
    if (!me) {
      if (m.t === 'create') {
        if (rooms.size >= MAX_ROOMS) { send(c, { t: 'error', msg: '服务器房间满了，稍后再试' }); return; }
        room = makeRoom();
        if (!room) { send(c, { t: 'error', msg: '开房间失败，再试一次' }); return; }
      } else if (m.t === 'join') {
        room = rooms.get(String(m.code || ''));
        if (!room) { send(c, { t: 'error', msg: '没有这个房间，检查一下房间码', code: 'NOROOM' }); return; }
      } else return;
      const old = m.tok && room.people.find((p) => p.tok === m.tok);
      if (old) {
        if (old.conn && old.conn !== c) { send(old.conn, { t: 'error', msg: '你在另一个页面进了这个房间，这里先断开', code: 'REPLACED' }); old.conn.onclose = null; kill(old.conn); }
        me = old; me.conn = c;
      } else {
        if (room.people.length >= MAX_PEOPLE) { send(c, { t: 'error', msg: '房间满了（最多 12 个真人）' }); return; }
        me = { tok: crypto.randomBytes(12).toString('hex'), name: cleanName(m.name), emoji: EMOJIS[(+m.emoji >>> 0) % EMOJIS.length], conn: c, pid: -1, lastShout: -1e9 };
        room.people.push(me);
        if (!room.hostTok) room.hostTok = me.tok;
        // 开盘 60 秒内还能直接进场
        if (room.phase === 'live' && room.S && room.S.t * E.DT < JOIN_LIVE_SEC) { me.pid = E.addHuman(room.S, { name: me.name, emoji: me.emoji }); log('room', room.code, me.name, 'joined live'); }
      }
      room.touched = Date.now();
      pickHost(room);
      send(c, { t: 'welcome', code: room.code, tok: me.tok, name: me.name, emoji: me.emoji });
      broadcastLobby(room);
      if (me.pid >= 0 && room.S) liveMsg(room, me);
      else if (room.phase !== 'lobby') send(c, { t: 'wait', phase: room.phase, left: room.S ? Math.max(0, Math.ceil(E.DUR - room.S.t * E.DT)) : 0 });
      if (room.phase === 'vote' || room.phase === 'result') resendEnd(room, me);
      return;
    }
    room.touched = Date.now();
    const isHost = me.tok === room.hostTok;
    switch (m.t) {
      case 'cfg':
        if (!isHost || room.phase !== 'lobby') return;
        room.cfg = { n0: Math.max(3, Math.min(12, Math.max(online(room).length, Math.round(+m.n0 || 6)))), lateJoin: !!m.lateJoin, mode: m.mode === 'banker' ? 'banker' : 'plain' };
        broadcastLobby(room);
        break;
      case 'start':
        if (isHost && room.phase === 'lobby') startGame(room);
        break;
      case 'again':
        if (isHost && room.phase === 'result') { room.phase = 'lobby'; room.S = null; room.people.forEach((p) => { p.pid = -1; }); room.people = room.people.filter((p) => p.conn && !p.conn.closed); pickHost(room); broadcastLobby(room); }
        break;
      case 'order':
        if (room.phase === 'live' && me.pid >= 0 && (m.side === 'buy' || m.side === 'sell' || m.side === 'all')) room.orders.push({ pid: me.pid, side: m.side });
        break;
      case 'shout': {
        if (room.phase !== 'live' || me.pid < 0 || E.HUMAN_SHOUTS.indexOf(m.key) < 0) return;
        const now = Date.now();
        if (now - me.lastShout < 3500) return;
        me.lastShout = now;
        room.orders.push({ pid: me.pid, shout: m.key });
        break;
      }
      case 'dump':
        if (room.phase === 'live' && me.pid >= 0) room.orders.push({ pid: me.pid, dump: true });
        break;
      case 'vote': {
        if (room.phase !== 'vote' || me.pid < 0) return;
        const pick = Math.round(+m.pick);
        if (!room.S.pl[pick] || pick === me.pid) return;
        room.votes[me.pid] = pick;
        const need = room.people.filter((p) => p.pid >= 0 && p.conn && !p.conn.closed);
        const got = need.filter((p) => room.votes[p.pid] != null).length;
        for (const h of room.people) send(h.conn, { t: 'voted', got, need: need.length });
        if (got >= need.length) finishRound(room);
        break;
      }
      case 'leave':
        room.people = room.people.filter((p) => p !== me);
        me = null; kill(c);
        pickHost(room);
        broadcastLobby(room);
        break;
      default: break;
    }
  };
  c.onclose = () => {
    if (!room || !me) return;
    me.conn = null;
    if (room.phase === 'lobby') {
      // 大厅里断线 30 秒还没回来，就把座位让出来
      const gone = me;
      setTimeout(() => { if (!gone.conn && room.phase === 'lobby') { room.people = room.people.filter((p) => p !== gone); pickHost(room); broadcastLobby(room); } }, 30000);
    }
    pickHost(room);
    broadcastLobby(room);
  };
}
function resendEnd(room, h) {
  const S = room.S;
  if (!S || !S.result) return;
  // 重连时重放结算：先 settle，再（如果已经结束）result
  const res = S.result, visPnl = {};
  for (const r of res.players) visPnl[r.id] = Math.round(r.visPnl);
  send(h.conn, { t: 'settle', res: { close: r2(res.close), next: res.next, kind: res.kind, hi: r2(res.hi), hiT: res.hiT, lo: r2(res.lo), loT: res.loT, sealUpQ: res.sealUpQ, sealDownQ: res.sealDownQ, clues: res.clues, visPnl, dumpT: S.dumpT, dumpQ: S.dumped && S.bankerId >= 0 ? S.pl[S.bankerId].hidden0 : 0 },
    vote: S.mode === 'banker' && room.phase === 'vote', voteSec: Math.max(1, Math.round((room.voteEnd - Date.now()) / 1000)), voters: room.people.filter((p) => p.pid >= 0).length, again: true });
  if (room.phase === 'result') {
    send(h.conn, { t: 'result', res: { players: res.players.map((r) => ({ id: r.id, pnl: Math.round(r.pnl), pct: Math.round(r.pct * 100) / 100, held: r.held, visPnl: Math.round(r.visPnl), start: r.start })), vote: res.vote || null },
      bankerId: S.bankerId, hidden0: S.bankerId >= 0 ? S.pl[S.bankerId].hidden0 : 0, busted: S.pl.map((p) => p.busted), log: S.log.map(pubTrade).concat(S.log.filter((l) => l.kind === 'dump').map((l) => [l.t, l.id, -1, l.q, r2(l.px), 2])) });
  }
}

// ---------- 时钟 ----------
let lastLoop = Date.now();
setInterval(() => {
  const now = Date.now();
  lastLoop = now;
  for (const room of rooms.values()) {
    if (room.phase === 'count' && now >= room.startAt) {
      room.phase = 'live'; room.last = now; room.acc = 0;
      for (const h of room.people) send(h.conn, { t: 'phase', phase: 'live' });
    }
    if (room.phase === 'live') {
      room.acc += now - room.last; room.last = now;
      let n = 0;
      while (room.acc >= TICK_MS && n < 5 && room.phase === 'live') { roomTick(room); room.acc -= TICK_MS; n++; }
      if (room.acc > TICK_MS * 10) room.acc = 0;
    }
    if (room.phase === 'vote' && now >= room.voteEnd) finishRound(room);
  }
}, Math.min(20, TICK_MS));
// 心跳和清理
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    for (const p of room.people) {
      if (!p.conn || p.conn.closed) continue;
      if (now - p.conn.seen > 45000) kill(p.conn); else frame(p.conn, 0x9, Buffer.alloc(0));
    }
    if (!online(room).length && now - room.touched > 180000 && room.phase !== 'live') { rooms.delete(room.code); log('room', room.code, 'closed'); }
  }
}, 15000);

const server = http.createServer((req, res) => {
  if (req.url.split('?')[0].endsWith('/health')) {
    let people = 0;
    for (const r of rooms.values()) people += online(r).length;
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, online: people, tickMs: TICK_MS, uptime: Math.round(process.uptime()) }));
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('谁是接盘侠联机服务器：请用 WebSocket 连接 /ws');
});
server.on('upgrade', (req, socket) => {
  if (!req.url.split('?')[0].endsWith('/ws')) { socket.destroy(); return; }
  const c = wsAccept(req, socket);
  if (c) onConn(c);
});
server.listen(PORT, () => log('bag-server listening on', PORT, 'tick', TICK_MS + 'ms'));
process.on('SIGTERM', () => { log('bye'); process.exit(0); });
