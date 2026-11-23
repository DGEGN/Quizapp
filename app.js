import { createStore, createLocalStore, fetchSeed } from "./store.js?v=3";
import CONFIG from "./firebase-config.js";

/* ---------- Hilfen ---------- */
const COLORS = [["#FFC933", "Gelb"], ["#19C3F5", "Cyan"], ["#FF5CA8", "Pink"], ["#35D07F", "Grün"], ["#B47CFF", "Violett"]];
const LETTERS = ["A", "B", "C", "D"];
const MAX_CATS = 6;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n) => Number(n).toLocaleString("de-DE");
const nonEmpty = (s) => String(s).trim().length > 0;
const clone = (o) => JSON.parse(JSON.stringify(o));
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function uid(title) {
  const slug = String(title || "quiz").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "quiz";
  return slug + "-" + Math.random().toString(36).slice(2, 6);
}
function titleParts(t) {
  const p = String(t || "").split("|");
  return [p[0].trim(), p.slice(1).join(" ").trim()];
}
const plainTitle = (t) => String(t || "").replace(/\s*\|\s*/g, " ").trim();

/* ---------- Datenmodell ---------- */
function normQuestion(x, i, cats) {
  const o = Array.isArray(x.o) ? x.o.map(String) : [];
  while (o.length < 4) o.push("");
  const catOk = cats.some(c => c.id === x.cat);
  return { id: +x.id || i + 1, cat: catOk ? x.cat : cats[0].id, lvl: [1, 2, 3, 4].includes(+x.lvl) ? +x.lvl : 1,
    q: String(x.q || ""), o: o.slice(0, 4), why: String(x.why || ""), hint: String(x.hint || ""), check: !!x.check };
}
function normQuiz(x) {
  let cats = Array.isArray(x.categories) ? x.categories.filter(c => c && c.id).map(c => ({ id: String(c.id), name: String(c.name || "") })) : [];
  if (!cats.length) cats = [{ id: "A", name: "Kategorie 1" }];
  const defLv = [["Leicht", 100], ["Mittel", 200], ["Schwer", 300], ["Experte", 500]];
  const lv = [];
  for (let i = 0; i < 4; i++) {
    const l = (x.levels && x.levels[i]) || {};
    lv.push({ name: String(l.name || defLv[i][0]), points: Math.max(0, Math.round(+l.points || defLv[i][1])) });
  }
  const qs = (Array.isArray(x.questions) ? x.questions : []).map((q, i) => normQuestion(q, i, cats));
  return { id: String(x.id || uid(x.title)), title: String(x.title || "Neues Quiz"), subtitle: String(x.subtitle || ""),
    color: COLORS.some(c => c[0] === x.color) ? x.color : COLORS[0][0], sort: +x.sort || 0, categories: cats, levels: lv, questions: qs };
}
const playable = (q) => nonEmpty(q.q) && nonEmpty(q.o[0]) && q.o.slice(1).filter(nonEmpty).length >= 2;

function newQuiz() {
  return normQuiz({ id: uid("neues-quiz"), title: "Neues Quiz", subtitle: "", sort: Date.now(),
    categories: [{ id: "A", name: "Kategorie 1" }],
    questions: [{ id: 1, cat: "A", lvl: 1, q: "", o: ["", "", "", ""], why: "", hint: "", check: false }] });
}

/* ---------- Zustand ---------- */
const S = {
  store: null, admin: false, quizzes: [], loadErr: "", loading: true,
  screen: "home", quiz: null, draft: null, dirty: false, msg: "", open: {},
  names: ["Team Blau", "Team Pink"], teamCount: 2, nAns: 3, sound: true,
  teams: [], turn: 0, done: {}, log: [], cur: null, afterLogin: null, toast: ""
};
const root = $("#app");
let timer = null;
let toastTimer = null;

function findQuiz(id) { return S.quizzes.find(q => q.id === id) || null; }
function findQ(id) { return S.quiz.questions.find(q => q.id === id) || null; }
function catName(quiz, id) { const c = quiz.categories.find(x => x.id === id); return c ? c.name : ""; }
function lvlPts(q) { return S.quiz.levels[q.lvl - 1].points; }

function withTimeout(p, ms, msg) {
  let id;
  const t = new Promise((_, rej) => { id = setTimeout(() => rej(new Error(msg)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(id));
}
function explainError(e) {
  const code = e && e.code ? String(e.code) : "";
  if (/permission-denied/.test(code)) return "Keine Leseberechtigung. Bitte die Firestore-Regeln prüfen und veröffentlichen.";
  if (/unavailable|failed-precondition|not-found/.test(code)) return "Firestore ist nicht erreichbar. Wurde die Datenbank in der Firebase-Konsole angelegt?";
  return (e && e.message) ? e.message : String(e);
}
async function loadAll() {
  try {
    const list = await withTimeout(S.store.list(), 12000, "Zeitüberschreitung: Firestore antwortet nicht. Ist die Datenbank angelegt, und sind die Regeln veröffentlicht?");
    S.quizzes = list.map(normQuiz).sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
    S.loadErr = "";
  } catch (e) {
    S.loadErr = "Die Quizze konnten nicht geladen werden: " + explainError(e);
  }
}

/* ---------- Navigation ---------- */
function go(hash) {
  if (S.screen === "edit" && S.dirty) {
    ask("Es gibt ungespeicherte Änderungen. Trotzdem verlassen?", [{ label: "Bleiben" }, { label: "Verlassen", primary: true, fn: () => { S.dirty = false; nav(hash); } }]);
    return;
  }
  nav(hash);
}
function nav(hash) {
  if (location.hash === hash) route(); else location.hash = hash;
}
function route() {
  clearTimeout(timer);
  const p = location.hash.replace(/^#\/?/, "").split("/");
  const a = p[0], b = decodeURIComponent(p[1] || "");
  S.cur = null; S.msg = "";
  if (a === "quiz" && b) {
    const q = findQuiz(b);
    if (q) { S.quiz = q; S.screen = "start"; S.names = ["Team Blau", "Team Pink"]; render(); window.scrollTo(0, 0); return; }
  }
  if (a === "edit" && b) {
    if (!S.admin) { S.screen = "home"; render(); openLogin(() => nav("#/edit/" + b)); return; }
    const q = (S.draft && S.draft.id === b && S.dirty) ? S.draft : findQuiz(b);
    if (q) { S.draft = (q === S.draft) ? q : clone(q); S.screen = "edit"; render(); window.scrollTo(0, 0); return; }
  }
  S.screen = "home"; S.quiz = null; render(); window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
window.addEventListener("beforeunload", (e) => { if (S.screen === "edit" && S.dirty) { e.preventDefault(); e.returnValue = ""; } });

/* ---------- Dialoge ---------- */
function ask(msg, buttons) {
  const dlg = $("#dlg");
  $("#dlgMsg").textContent = msg;
  const box = $("#dlgBtns"); box.innerHTML = "";
  buttons.forEach(b => {
    const el = document.createElement("button");
    el.className = "btn" + (b.primary ? " primary" : ""); el.textContent = b.label;
    el.addEventListener("click", () => { dlg.close(); if (b.fn) b.fn(); });
    box.appendChild(el);
  });
  dlg.showModal();
}
function showToast(m) {
  S.toast = m; render();
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { S.toast = ""; render(); }, 2500);
}
function openLogin(next) {
  S.afterLogin = next || null;
  $("#loginMsg").textContent = ""; $("#loginPw").value = "";
  $("#login").showModal(); setTimeout(() => $("#loginPw").focus(), 0);
}
async function doLogin() {
  const btn = $("#loginOk"); btn.disabled = true;
  try {
    await S.store.login($("#loginPw").value);
    S.admin = S.store.isAdmin();
    $("#login").close();
    const n = S.afterLogin; S.afterLogin = null;
    render(); if (n) n();
  } catch (e) {
    $("#loginMsg").textContent = (e && e.message) || "Passwort falsch.";
  } finally { btn.disabled = false; }
}
$("#loginOk").addEventListener("click", doLogin);
$("#loginCancel").addEventListener("click", () => $("#login").close());
$("#loginPw").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doLogin(); } });

/* ---------- Ton ---------- */
let ac = null;
function tone(seq) {
  if (!S.sound) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.resume) ac.resume();
    let t = ac.currentTime;
    seq.forEach(s => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = s[2] || "sine"; o.frequency.value = s[0];
      g.gain.setValueAtTime(s[3] || 0.07, t); g.gain.exponentialRampToValueAtTime(0.0001, t + s[1]);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + s[1]); t += s[1] * 0.85;
    });
  } catch (e) { /* kein Ton */ }
}
const SND = { pick: [[520, .08, "triangle"]], lock: [[330, .12, "triangle"], [330, .12, "triangle"]],
  ok: [[523, .14], [659, .14], [784, .14], [1046, .3]], bad: [[196, .3, "sawtooth", .05], [147, .5, "sawtooth", .05]], joker: [[880, .08, "square", .04], [1175, .12, "square", .04]] };

/* ---------- Spiellogik ---------- */
function startGame() {
  clearTimeout(timer);
  S.teams = [];
  for (let i = 0; i < S.teamCount; i++) {
    const n = (S.names[i] || "").trim() || ("Team " + (i + 1));
    S.teams.push({ name: n, score: 0, tip: false, half: false });
  }
  S.turn = 0; S.done = {}; S.log = []; S.cur = null; S.screen = "board"; render(); window.scrollTo(0, 0);
}
const openTiles = () => S.quiz.questions.filter(q => playable(q) && !S.done[q.id]);
function openQ(id) {
  const q = findQ(id); if (!q || S.done[id]) return;
  const wrongs = q.o.slice(1).filter(nonEmpty);
  const pick = S.nAns === 3 ? shuffle(wrongs).slice(0, 2) : wrongs.slice(0, 3);
  const opts = shuffle([{ t: q.o[0], ok: true }].concat(pick.map(t => ({ t, ok: false }))));
  S.cur = { q, opts, actor: S.turn, steal: false, phase: "choose", sel: null, wrong: [], removed: [], hint: null, outcome: null };
  S.screen = "play"; render(); window.scrollTo(0, 0);
}
function randomQ() { const o = openTiles(); if (o.length) openQ(o[Math.floor(Math.random() * o.length)].id); }
const actorTeam = () => S.teams[S.cur.actor];
function curPts() { const p = lvlPts(S.cur.q); return S.cur.steal ? Math.round(p / 2) : p; }
function choose(i) {
  const c = S.cur; if (!c || (c.phase !== "choose" && c.phase !== "confirm")) return;
  if (i >= c.opts.length || c.removed.includes(i) || c.wrong.includes(i)) return;
  c.sel = i; c.phase = "confirm"; tone(SND.pick); render();
}
function lockIn() {
  const c = S.cur; if (!c || c.phase !== "confirm") return;
  c.phase = "wait"; tone(SND.lock); render();
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  timer = setTimeout(resolve, reduce ? 300 : 1400);
}
function resolve() {
  const c = S.cur; if (!c) return;
  if (c.opts[c.sel].ok) {
    const p = curPts(); actorTeam().score += p;
    c.outcome = { team: c.actor, pts: p, steal: c.steal }; c.phase = "reveal"; tone(SND.ok);
  } else {
    c.wrong.push(c.sel);
    if (!c.steal && S.teams.length === 2) { c.steal = true; c.actor = 1 - c.actor; c.sel = null; c.phase = "choose"; tone(SND.bad); }
    else { c.outcome = { team: -1, pts: 0, steal: c.steal }; c.phase = "reveal"; tone(SND.bad); }
  }
  render();
}
function wrongLeft() { const c = S.cur; return c.opts.filter((o, i) => !o.ok && !c.removed.includes(i) && !c.wrong.includes(i)).length; }
function joker(kind) {
  const c = S.cur; if (!c || c.phase !== "choose") return;
  const t = actorTeam(); if (t[kind]) return;
  t[kind] = true; tone(SND.joker);
  if (kind === "tip") c.hint = c.q.hint || "Dazu gibt es keinen Hinweis.";
  if (kind === "half") {
    const rem = []; c.opts.forEach((o, i) => { if (!o.ok && !c.removed.includes(i) && !c.wrong.includes(i)) rem.push(i); });
    const n = Math.max(Math.min(S.nAns === 4 ? 2 : 1, rem.length - 1), 0);
    c.removed = c.removed.concat(shuffle(rem).slice(0, n));
  }
  render();
}
function nextAfter() {
  const c = S.cur; if (!c || c.phase !== "reveal") return;
  S.done[c.q.id] = { team: c.outcome.team, pts: c.outcome.pts, steal: c.outcome.steal };
  S.log.push({ id: c.q.id, team: c.outcome.team });
  if (S.teams.length === 2) S.turn = 1 - S.turn;
  S.cur = null; S.screen = openTiles().length === 0 ? "end" : "board";
  render(); window.scrollTo(0, 0);
}

/* ---------- Ansichten: Rahmen ---------- */
function topbar() {
  const inGame = ["board", "play", "end"].includes(S.screen);
  let h = '<div class="top"><button class="logo" data-a="world"><span class="q">?</span><span>' + esc(CONFIG.siteTitle || "Quizwelt") + '<small>Alle Quizze</small></span></button><div class="spacer"></div>';
  if (S.admin) h += '<span class="chip">Bearbeiten-Modus</span><button class="ghost" data-a="logout">Abmelden</button>';
  else if (S.screen === "home" || S.screen === "start") h += '<button class="ghost" data-a="login">Bearbeiten</button>';
  if (inGame) h += '<button class="ghost" data-a="tostart">Neues Spiel</button>';
  h += '<button class="ghost" data-a="sound" aria-pressed="' + S.sound + '">Ton: ' + (S.sound ? "an" : "aus") + '</button><button class="ghost" data-a="full">Vollbild</button></div>';
  return h;
}
const toastHtml = () => S.toast ? '<div class="toast" role="status">' + esc(S.toast) + '</div>' : "";

/* ---------- Ansichten: Quizwelt ---------- */
function homeView() {
  let h = topbar() + '<div class="wrap"><div class="worldhero"><h1>Willkommen in der <em>' + esc(CONFIG.siteTitle || "Quizwelt") + '</em></h1><p>Wähle ein Quiz und tritt mit deinem Team an.</p></div>';
  if (S.store.notice) h += '<div class="banner">' + esc(S.store.notice) + '</div>';
  if (S.loadErr) h += '<div class="banner">' + esc(S.loadErr) + '</div>';
  if (S.admin) {
    h += '<div class="adminbar"><button class="btn primary sm" data-a="newquiz">Neues Quiz</button>' +
      '<button class="btn sm" data-a="importfile">Quiz aus Datei laden</button>' +
      '<button class="btn sm" data-a="exportall">Alle Quizze exportieren</button>';
    if (S.store.mode === "firebase" && S.quizzes.length === 0) h += '<button class="btn sm" data-a="seed">Beispielquiz hochladen</button>';
    if (S.store.mode === "local") h += '<button class="btn sm warn" data-a="resetrepo">Auf Stand im Repo zurücksetzen</button>';
    h += '</div>';
    if (S.store.mode === "local") h += '<p class="note" style="text-align:center;margin:6px auto 0;font-size:14px;color:var(--muted);max-width:70ch">Lokaler Modus: Änderungen bleiben in diesem Browser. Mit „Alle Quizze exportieren“ erhältst du die Datei quizzes.json, die du im Repo unter data/ ablegst, damit alle sie sehen.</p>';
  }
  if (!S.quizzes.length) h += '<div class="empty">Noch kein Quiz vorhanden.' + (S.admin ? " Lege oben ein neues an." : "") + '</div>';
  else {
    h += '<div class="cards">';
    S.quizzes.forEach(q => {
      const np = q.questions.filter(playable).length;
      h += '<article class="card"><div class="strip" style="background:' + q.color + '"></div><div class="cbody"><h2>' + esc(plainTitle(q.title)) + '</h2>' +
        (q.subtitle ? '<div class="sub">' + esc(q.subtitle) + '</div>' : '') +
        '<div class="chips"><span class="chip">' + np + ' Fragen</span><span class="chip">' + q.categories.length + ' Kategorien</span></div></div>' +
        '<div class="acts"><button class="btn primary sm" data-a="play" data-id="' + esc(q.id) + '">Spielen</button>' +
        (S.admin ? '<button class="btn sm" data-a="edit" data-id="' + esc(q.id) + '">Bearbeiten</button><button class="btn sm" data-a="dup" data-id="' + esc(q.id) + '">Duplizieren</button><button class="btn sm warn" data-a="delquiz" data-id="' + esc(q.id) + '">Löschen</button>' : '') +
        '</div></article>';
    });
    h += '</div>';
  }
  return h + '</div>' + toastHtml();
}

/* ---------- Ansichten: Quiz-Start ---------- */
function startView() {
  const q = S.quiz, np = q.questions.filter(playable).length;
  const [l1, l2] = titleParts(q.title);
  return topbar() + '<div class="wrap"><div class="heroq"><h1>' + esc(l1) + (l2 ? '<em>' + esc(l2) + '</em>' : '') + '</h1>' +
    '<p>' + (q.subtitle ? esc(q.subtitle) + ' · ' : '') + np + ' Fragen</p></div>' +
    '<div class="opts"><span><span class="optlabel">Teams</span><span class="seg"><button data-a="tc" data-v="2" aria-pressed="' + (S.teamCount === 2) + '">Zwei Teams</button><button data-a="tc" data-v="1" aria-pressed="' + (S.teamCount === 1) + '">Solo</button></span></span>' +
    '<span><span class="optlabel">Antworten</span><span class="seg"><button data-a="na" data-v="3" aria-pressed="' + (S.nAns === 3) + '">3 pro Frage</button><button data-a="na" data-v="4" aria-pressed="' + (S.nAns === 4) + '">4 pro Frage</button></span></span></div>' +
    '<div class="setup" style="' + (S.teamCount === 1 ? "grid-template-columns:1fr" : "") + '">' +
    '<div class="pult t1"><label for="nm0">Name Team 1</label><input id="nm0" data-a="name" data-v="0" type="text" maxlength="24" value="' + esc(S.names[0]) + '"></div>' +
    (S.teamCount === 2 ? '<div class="pult t2"><label for="nm1">Name Team 2</label><input id="nm1" data-a="name" data-v="1" type="text" maxlength="24" value="' + esc(S.names[1]) + '"></div>' : '') + '</div>' +
    '<div class="cta"><button class="btn primary big" id="btnStart" data-a="start"' + (np ? "" : " disabled") + '>Spiel starten</button>' +
    (S.admin ? '<button class="btn big" data-a="edit" data-id="' + esc(q.id) + '">Quiz bearbeiten</button>' : '') +
    '<button class="btn big" data-a="world">Alle Quizze</button></div></div>';
}

/* ---------- Ansichten: Spiel ---------- */
function scoreView() {
  let h = '<div class="score' + (S.teams.length === 1 ? " solo" : "") + '">';
  const active = S.cur ? S.cur.actor : S.turn;
  S.teams.forEach((t, i) => {
    const on = S.teams.length > 1 && i === active && S.screen !== "end";
    h += '<div class="pod t' + (i + 1) + (on ? " on" : "") + '"><div><div class="nm">' + esc(t.name) + '</div><div class="jk"><span class="' + (t.tip ? "used" : "") + '">Tipp</span><span class="' + (t.half ? "used" : "") + '">50:50</span></div></div><div class="pts">' + fmt(t.score) + '</div></div>';
    if (i === 0 && S.teams.length === 2) h += '<div class="mid">gegen</div>';
  });
  if (S.teams.length === 1) h += '<div class="mid">' + openTiles().length + ' offen</div>';
  return h + '</div>';
}
function boardView() {
  const qz = S.quiz;
  let cols = "";
  qz.categories.forEach(c => {
    const list = qz.questions.filter(q => q.cat === c.id && playable(q)).sort((a, b) => a.lvl - b.lvl || a.id - b.id);
    let tiles = "";
    list.forEach(q => {
      const d = S.done[q.id], pts = qz.levels[q.lvl - 1].points;
      if (d) {
        const cls = d.team === -1 ? "none" : "t" + (d.team + 1);
        tiles += '<button class="tile done ' + cls + '" disabled><span class="v">' + fmt(pts) + '</span><span class="n">Frage ' + q.id + '<br>' + (d.team === -1 ? "ungelöst" : esc(S.teams[d.team].name)) + '</span></button>';
      } else {
        tiles += '<button class="tile" data-a="open" data-id="' + q.id + '"><span class="v">' + fmt(pts) + '</span><span class="n">Frage ' + q.id + '<br>' + esc(qz.levels[q.lvl - 1].name) + '</span></button>';
      }
    });
    cols += '<div class="col"><div class="cat">' + esc(c.name) + '</div>' + tiles + '</div>';
  });
  const t = S.teams[S.turn], left = openTiles().length, total = qz.questions.filter(playable).length;
  return topbar() + '<div class="wrap">' + scoreView() +
    '<div class="boardhead"><h2>' + (S.teams.length === 2 ? esc(t.name) + ', wählt eine Frage' : 'Wähle eine Frage') + '</h2><span class="info">' + left + ' von ' + total + ' Fragen offen</span><span style="flex:1"></span>' +
    '<button class="btn sm" data-a="rnd">Zufällige Frage</button><button class="btn sm warn" data-a="endgame">Spiel beenden</button></div>' +
    '<div class="board" style="--cols:' + qz.categories.length + '">' + cols + '</div></div>';
}
function playView() {
  const c = S.cur, q = c.q, qz = S.quiz;
  const busy = c.phase === "wait" || c.phase === "reveal";
  let ans = "";
  c.opts.forEach((o, i) => {
    const k = ["ans"], gone = c.removed.includes(i), wasWrong = c.wrong.includes(i);
    if (gone) k.push("gone");
    if (c.phase === "confirm" && c.sel === i) k.push("sel");
    if (c.phase === "wait" && c.sel === i) k.push("sel", "wait");
    if (wasWrong && c.phase !== "wait") k.push("bad");
    if (c.phase === "reveal") { if (o.ok) k.push("ok"); else if (!wasWrong) k.push("dim"); }
    ans += '<button class="' + k.join(" ") + '" data-a="pick" data-i="' + i + '" ' + ((busy || gone || wasWrong) ? "disabled" : "") + '><span class="l">' + LETTERS[i] + '</span><span>' + esc(o.t) + '</span></button>';
  });
  let aux = "";
  if (c.hint) aux += '<div class="panel"><h3>Tipp</h3><p style="margin:0">' + esc(c.hint) + '</p></div>';
  if (c.phase === "confirm") aux += '<div class="confirm"><strong>' + esc(actorTeam().name) + ': Ist ' + LETTERS[c.sel] + ' eure endgültige Antwort?</strong><button class="btn" data-a="back">Andere wählen</button><button class="btn primary" id="btnLock" data-a="lock">Endgültig</button></div>';
  if (c.phase === "reveal") {
    const o = c.outcome, good = o.team > -1, right = c.opts.find(x => x.ok).t;
    const head = good ? (S.teams.length === 2 ? esc(S.teams[o.team].name) + " holt " + fmt(o.pts) + " Punkte" + (o.steal ? " (geklaut)" : "") : "Richtig! +" + fmt(o.pts)) : "Leider nicht gelöst";
    aux += '<div class="explain ' + (good ? "" : "fail") + '"><div class="verdict">' + head + '</div>' + (good ? "" : '<p><strong>Richtig wäre gewesen:</strong> ' + esc(right) + '</p>') +
      (q.why ? '<p>' + esc(q.why) + '</p>' : '') + (q.check ? '<span class="tag">Unterlage prüfen</span>' : '') +
      '<div><button class="btn primary" id="btnNext" data-a="next">Zurück zum Spielbrett</button></div></div>';
  }
  const t = actorTeam(), canJ = c.phase === "choose";
  const tools = '<div class="tools"><button class="btn sm" data-a="j" data-k="tip" ' + ((!canJ || t.tip || !c.hint) ? "disabled" : "") + '>Tipp</button>' +
    '<button class="btn sm" data-a="j" data-k="half" ' + ((!canJ || t.half || wrongLeft() < 2) ? "disabled" : "") + '>50:50</button><span class="spacer"></span>' +
    '<button class="btn sm warn" data-a="cancel" ' + ((c.phase === "choose" && !c.steal) ? "" : "disabled") + '>Frage zurücklegen</button></div>';
  const stealMsg = (c.steal && c.phase !== "reveal") ? '<div class="steal">Klau-Chance für ' + esc(actorTeam().name) + ': nur halbe Punkte (' + fmt(curPts()) + '), die falsche Antwort ist raus.</div>' : "";
  return topbar() + '<div class="wrap">' + scoreView() +
    '<div class="qhead"><span class="chip">' + esc(catName(qz, q.cat)) + '</span><span class="chip">Frage ' + q.id + ' · ' + esc(qz.levels[q.lvl - 1].name) + '</span><span class="prize">' + fmt(curPts()) + ' Punkte</span></div>' +
    stealMsg + '<h2 class="question">' + esc(q.q) + '</h2><div class="answers">' + ans + '</div><div class="aux">' + aux + '</div>' + tools + '</div>';
}
function endView() {
  let title, sub = "";
  if (S.teams.length === 1) { title = "Geschafft!"; sub = fmt(S.teams[0].score) + " Punkte für " + esc(S.teams[0].name); }
  else {
    const a = S.teams[0], b = S.teams[1];
    if (a.score === b.score) { title = "Unentschieden!"; sub = fmt(a.score) + " zu " + fmt(b.score); }
    else { const w = a.score > b.score ? a : b; title = esc(w.name) + " gewinnt!"; sub = fmt(a.score) + " zu " + fmt(b.score) + " Punkte"; }
  }
  let list = "";
  S.log.forEach(l => {
    const q = findQ(l.id); if (!q) return;
    const cls = l.team === -1 ? "none" : "t" + (l.team + 1), who = l.team === -1 ? "ungelöst" : esc(S.teams[l.team].name);
    list += '<details class="rev ' + cls + '"><summary>Frage ' + q.id + ': ' + esc(q.q) + ' (' + who + ')</summary><div class="body"><p><strong>Richtig:</strong> ' + esc(q.o[0]) + '</p>' + (q.why ? '<p>' + esc(q.why) + '</p>' : '') + (q.check ? '<span class="tag">Unterlage prüfen</span>' : '') + '</div></details>';
  });
  return topbar() + '<div class="wrap">' + scoreView() + '<div class="winner"><h1>' + title + '</h1><p style="font-size:22px;color:var(--muted);margin:8px 0 18px">' + sub + '</p>' +
    '<div class="cta"><button class="btn primary big" id="btnAgain" data-a="start">Neue Runde</button><button class="btn big" data-a="world">Alle Quizze</button></div></div>' +
    (list ? '<h2 style="font-size:30px;margin-top:12px">Rückblick</h2><div class="revlist">' + list + '</div>' : '') + '</div>';
}

/* ---------- Ansichten: Editor ---------- */
function edCard(q, d) {
  const bad = !playable(q);
  const sel1 = '<select data-s="q" data-id="' + q.id + '" data-f="cat" aria-label="Kategorie">' + d.categories.map(c => '<option value="' + esc(c.id) + '"' + (q.cat === c.id ? " selected" : "") + '>' + esc(c.name || "(ohne Namen)") + '</option>').join("") + '</select>';
  const sel2 = '<select data-s="q" data-id="' + q.id + '" data-f="lvl" aria-label="Stufe">' + d.levels.map((l, i) => '<option value="' + (i + 1) + '"' + (q.lvl === i + 1 ? " selected" : "") + '>' + esc(l.name) + ' (' + fmt(l.points) + ' Punkte)</option>').join("") + '</select>';
  const f = (name, val) => 'data-s="q" data-id="' + q.id + '" data-f="' + name + '"';
  return '<details class="qe" data-id="' + q.id + '"' + (S.open[q.id] ? " open" : "") + '><summary><span class="num">' + q.id + '</span><span class="sumtxt" data-sum="' + q.id + '">' + esc(q.q || "(leere Frage)") + '</span>' +
    '<span class="pill' + (bad ? " warn" : "") + '" data-pill="' + q.id + '">' + pillText(q, d) + '</span></summary><div class="qf">' +
    '<label>Frage<textarea ' + f("q") + ' rows="2">' + esc(q.q) + '</textarea></label>' +
    '<label class="right">Richtige Antwort<input type="text" ' + f("o0") + ' value="' + esc(q.o[0]) + '"></label>' +
    '<div class="row wrong">' + [1, 2, 3].map(i => '<label>Falsche Antwort ' + i + (i === 3 ? " (optional)" : "") + '<input type="text" ' + f("o" + i) + ' value="' + esc(q.o[i]) + '"></label>').join("") + '</div>' +
    '<label>Erklärung nach der Antwort<textarea ' + f("why") + ' rows="3">' + esc(q.why) + '</textarea></label>' +
    '<label>Tipp<input type="text" ' + f("hint") + ' value="' + esc(q.hint) + '"></label>' +
    '<div class="row"><label>Kategorie' + sel1 + '</label><label>Stufe' + sel2 + '</label><label class="chk"><input type="checkbox" ' + f("check") + (q.check ? " checked" : "") + '> Vermerk „Unterlage prüfen“ anzeigen</label></div>' +
    '<div class="acts"><button class="btn sm warn" data-a="delq" data-id="' + q.id + '">Frage löschen</button></div></div></details>';
}
function pillText(q, d) {
  if (!playable(q)) return "unvollständig";
  const c = d.categories.find(x => x.id === q.cat);
  return (c ? c.name : "") + " · " + fmt(d.levels[q.lvl - 1].points);
}
function editView() {
  const d = S.draft, np = d.questions.filter(playable).length;
  const colorOpts = COLORS.map(c => '<option value="' + c[0] + '"' + (d.color === c[0] ? " selected" : "") + '>' + c[1] + '</option>').join("");
  const cats = d.categories.map((c, i) => '<div class="listrow"><label>Kategorie ' + (i + 1) + '<input type="text" data-s="cat" data-i="' + i + '" value="' + esc(c.name) + '"></label>' +
    '<button class="btn sm warn" data-a="delcat" data-i="' + i + '" ' + (d.categories.length < 2 ? "disabled" : "") + '>Entfernen</button></div>').join("");
  const lvls = d.levels.map((l, i) => '<div class="lvlrow"><label>Stufe ' + (i + 1) + '<input type="text" data-s="lvl" data-i="' + i + '" data-k="name" value="' + esc(l.name) + '"></label>' +
    '<label>Punkte<input type="number" min="0" step="10" data-s="lvl" data-i="' + i + '" data-k="points" value="' + l.points + '"></label></div>').join("");
  const modeNote = S.store.mode === "local" ? "Lokaler Modus: „Speichern“ sichert im Browser. Zum Veröffentlichen exportierst du das Quiz und legst die Datei im Repo ab (siehe README)." : "Speichern schreibt das Quiz in die Firebase-Datenbank.";
  return topbar() + '<div class="wrap"><div class="edhead"><h1>Quiz bearbeiten</h1><span class="chip">' + d.questions.length + ' Fragen, ' + np + ' spielbar</span><span class="spacer"></span>' +
    '<button class="btn primary sm" data-a="save"' + (S.saving ? " disabled" : "") + '>Speichern</button><button class="btn sm" data-a="export">Exportieren</button><button class="btn sm" data-a="world">Zurück</button></div>' +
    '<div class="edmsg" id="edMsg" role="status">' + esc(S.msg || (S.dirty ? "Ungespeicherte Änderungen." : modeNote)) + '</div>' +
    '<section class="sect"><h2>Quizdaten</h2><div class="metagrid">' +
    '<label class="full">Titel<input type="text" data-s="meta" data-f="title" value="' + esc(d.title) + '"><span class="hintline">Mit | trennst du den Titel in zwei Zeilen. Die zweite Zeile erscheint gelb.</span></label>' +
    '<label>Untertitel<input type="text" data-s="meta" data-f="subtitle" value="' + esc(d.subtitle) + '"></label>' +
    '<label>Farbe der Karte<select data-s="meta" data-f="color">' + colorOpts + '</select></label></div></section>' +
    '<section class="sect"><h2>Kategorien (Spalten im Spielbrett)</h2>' + cats + (d.categories.length < MAX_CATS ? '<button class="btn sm" data-a="addcat">Kategorie hinzufügen</button>' : '') + '</section>' +
    '<section class="sect"><h2>Stufen und Punkte</h2>' + lvls + '</section>' +
    '<div class="qhead2"><h2>Fragen</h2><span class="spacer"></span><button class="btn sm" data-a="add">Neue Frage</button></div>' +
    d.questions.map(q => edCard(q, d)).join("") + '</div>' + toastHtml();
}

function render() {
  const y = window.scrollY;
  let h;
  if (S.loading) h = '<p style="padding:40px;text-align:center">Lade Quizwelt …</p>';
  else if (S.screen === "home") h = homeView();
  else if (S.screen === "start") h = startView();
  else if (S.screen === "board") h = boardView();
  else if (S.screen === "play") h = playView();
  else if (S.screen === "end") h = endView();
  else if (S.screen === "edit") h = editView();
  root.innerHTML = h;
  if (S.screen === "play" && S.cur && S.cur.phase === "reveal") { const b = $("#btnNext"); if (b) b.focus({ preventScroll: true }); }
  window.scrollTo(0, y);
}

/* ---------- Editor-Aktionen ---------- */
function setMsg(m) { S.msg = m; const el = $("#edMsg"); if (el) el.textContent = m; }
function dirty() { S.dirty = true; if (S.msg) { S.msg = ""; const el = $("#edMsg"); if (el) el.textContent = "Ungespeicherte Änderungen."; } }
function draftQ(id) { return S.draft.questions.find(q => q.id === id) || null; }
function addQuestion() {
  const d = S.draft, id = d.questions.reduce((m, q) => Math.max(m, q.id), 0) + 1;
  d.questions.push({ id, cat: d.categories[0].id, lvl: 1, q: "", o: ["", "", "", ""], why: "", hint: "", check: false });
  S.open[id] = true; dirty(); render();
  const el = document.querySelector('.qe[data-id="' + id + '"]'); if (el) el.scrollIntoView({ block: "center" });
}
function onEditInput(t, final) {
  const d = S.draft, s = t.getAttribute("data-s");
  if (s === "meta") {
    const f = t.getAttribute("data-f"); d[f] = t.value; dirty();
  } else if (s === "cat") {
    d.categories[+t.getAttribute("data-i")].name = t.value; dirty(); if (final) render();
  } else if (s === "lvl") {
    const l = d.levels[+t.getAttribute("data-i")], k = t.getAttribute("data-k");
    if (k === "points") l.points = Math.max(0, Math.round(+t.value || 0)); else l.name = t.value;
    dirty(); if (final) render();
  } else if (s === "q") {
    const q = draftQ(+t.getAttribute("data-id")); if (!q) return;
    const f = t.getAttribute("data-f");
    if (f === "q") q.q = t.value; else if (f === "why") q.why = t.value; else if (f === "hint") q.hint = t.value;
    else if (f === "cat") q.cat = t.value; else if (f === "lvl") q.lvl = +t.value; else if (f === "check") q.check = t.checked;
    else if (/^o[0-3]$/.test(f)) q.o[+f.charAt(1)] = t.value;
    dirty();
    const sm = document.querySelector('[data-sum="' + q.id + '"]'); if (sm) sm.textContent = q.q || "(leere Frage)";
    const p = document.querySelector('[data-pill="' + q.id + '"]');
    if (p) { p.textContent = pillText(q, d); p.className = "pill" + (playable(q) ? "" : " warn"); }
  }
}
async function saveDraft() {
  const d = S.draft;
  if (!nonEmpty(d.title)) { setMsg("Bitte gib dem Quiz einen Titel."); return; }
  if (d.categories.some(c => !nonEmpty(c.name))) { setMsg("Bitte gib jeder Kategorie einen Namen."); return; }
  S.saving = true; setMsg("Speichere …");
  try {
    const out = normQuiz(d);
    await S.store.save(out);
    await loadAll();
    S.draft = clone(findQuiz(out.id) || out);
    S.dirty = false; S.saving = false;
    render(); setMsg("Gespeichert.");
  } catch (e) {
    S.saving = false; render();
    setMsg("Speichern fehlgeschlagen: " + ((e && e.message) || e));
  }
}
function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- Ereignisse ---------- */
root.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-a]"); if (!t || t.disabled) return;
  const a = t.getAttribute("data-a"), id = t.getAttribute("data-id");
  switch (a) {
    case "name": return;
    case "world": go("#/"); break;
    case "play": go("#/quiz/" + encodeURIComponent(id)); break;
    case "edit": go("#/edit/" + encodeURIComponent(id)); break;
    case "login": openLogin(); break;
    case "logout": await S.store.logout(); S.admin = S.store.isAdmin(); if (S.screen === "edit") { S.dirty = false; go("#/"); } else render(); break;
    case "tostart": clearTimeout(timer); S.cur = null; S.screen = "start"; render(); break;
    case "tc": S.teamCount = +t.getAttribute("data-v"); render(); break;
    case "na": S.nAns = +t.getAttribute("data-v"); render(); break;
    case "start": startGame(); break;
    case "open": openQ(+id); break;
    case "rnd": randomQ(); break;
    case "endgame": ask("Spiel jetzt beenden und Ergebnis anzeigen?", [{ label: "Weiterspielen" }, { label: "Beenden", primary: true, fn: () => { S.screen = "end"; render(); window.scrollTo(0, 0); } }]); break;
    case "pick": choose(+t.getAttribute("data-i")); break;
    case "back": S.cur.sel = null; S.cur.phase = "choose"; render(); break;
    case "lock": lockIn(); break;
    case "next": nextAfter(); break;
    case "j": joker(t.getAttribute("data-k")); break;
    case "cancel": S.cur = null; S.screen = "board"; render(); break;
    case "sound": S.sound = !S.sound; render(); break;
    case "full":
      try { if (document.fullscreenElement) document.exitFullscreen(); else { const p = document.documentElement.requestFullscreen(); if (p && p.catch) p.catch(() => {}); } } catch (err) { /* ignorieren */ }
      break;
    /* Quizwelt verwalten */
    case "newquiz": S.draft = newQuiz(); S.dirty = true; S.open = { 1: true }; nav("#/edit/" + encodeURIComponent(S.draft.id)); break;
    case "dup": {
      const src = findQuiz(id); if (!src) break;
      const c = clone(src); c.id = uid(c.title); c.title = c.title + " (Kopie)"; c.sort = Date.now();
      try { await S.store.save(normQuiz(c)); await loadAll(); showToast("Quiz dupliziert."); } catch (err) { showToast("Fehlgeschlagen: " + (err.message || err)); }
      break;
    }
    case "delquiz": {
      const src = findQuiz(id); if (!src) break;
      ask("Quiz „" + plainTitle(src.title) + "“ endgültig löschen?", [{ label: "Abbrechen" }, { label: "Löschen", primary: true, fn: async () => {
        try { await S.store.remove(id); await loadAll(); showToast("Quiz gelöscht."); } catch (err) { showToast("Fehlgeschlagen: " + (err.message || err)); }
      } }]);
      break;
    }
    case "exportall": download("quizzes.json", JSON.stringify(S.quizzes, null, 1)); break;
    case "importfile": $("#fileIn").click(); break;
    case "seed": {
      const seed = await fetchSeed();
      if (!seed.length) { showToast("Keine Beispieldaten in data/quizzes.json gefunden."); break; }
      try { for (const q of seed) await S.store.save(normQuiz(q)); await loadAll(); showToast("Beispielquiz hochgeladen."); } catch (err) { showToast("Fehlgeschlagen: " + (err.message || err)); }
      break;
    }
    case "resetrepo":
      ask("Lokale Änderungen verwerfen und den Stand aus data/quizzes.json laden?", [{ label: "Abbrechen" }, { label: "Zurücksetzen", primary: true, fn: async () => { await S.store.resetToRepo(); await loadAll(); showToast("Zurückgesetzt."); } }]);
      break;
    /* Editor */
    case "save": saveDraft(); break;
    case "export": download("quiz-" + S.draft.id + ".json", JSON.stringify([normQuiz(S.draft)], null, 1)); break;
    case "add": addQuestion(); break;
    case "delq": {
      const qid = +id;
      ask("Frage " + qid + " wirklich löschen?", [{ label: "Abbrechen" }, { label: "Löschen", primary: true, fn: () => { S.draft.questions = S.draft.questions.filter(q => q.id !== qid); dirty(); render(); } }]);
      break;
    }
    case "addcat": {
      const d = S.draft; let n = 1; while (d.categories.some(c => c.id === "K" + n)) n++;
      d.categories.push({ id: "K" + n, name: "Kategorie " + (d.categories.length + 1) }); dirty(); render();
      break;
    }
    case "delcat": {
      const d = S.draft, i = +t.getAttribute("data-i"), gone = d.categories[i];
      ask("Kategorie „" + gone.name + "“ entfernen? Ihre Fragen wandern in die erste Kategorie.", [{ label: "Abbrechen" }, { label: "Entfernen", primary: true, fn: () => {
        d.categories.splice(i, 1); d.questions.forEach(q => { if (q.cat === gone.id) q.cat = d.categories[0].id; }); dirty(); render();
      } }]);
      break;
    }
  }
});
root.addEventListener("input", (e) => {
  const t = e.target;
  if (t.getAttribute("data-a") === "name") { S.names[+t.getAttribute("data-v")] = t.value; return; }
  if (S.screen === "edit" && t.getAttribute("data-s")) onEditInput(t, false);
});
root.addEventListener("change", (e) => {
  const t = e.target;
  if (S.screen === "edit" && t.getAttribute("data-s")) onEditInput(t, true);
});
root.addEventListener("toggle", (e) => {
  const d = e.target; if (d.classList && d.classList.contains("qe")) S.open[+d.getAttribute("data-id")] = d.open;
}, true);
$("#fileIn").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = async () => {
    try {
      const j = JSON.parse(r.result);
      const arr = Array.isArray(j) ? j : (j.quizzes || [j]);
      if (!arr.length) throw new Error("leer");
      for (const x of arr) {
        const q = normQuiz(x);
        if (findQuiz(q.id)) { q.id = uid(q.title); q.title += " (importiert)"; }
        q.sort = Date.now();
        await S.store.save(q);
      }
      await loadAll(); showToast(arr.length + " Quiz geladen.");
    } catch (err) { showToast("Die Datei konnte nicht gelesen werden."); }
    e.target.value = "";
  };
  r.readAsText(f);
});
document.addEventListener("keydown", (e) => {
  if ($("#dlg").open || $("#login").open) return;
  if (S.screen !== "play" || !S.cur) return;
  const k = e.key.toLowerCase();
  if (["a", "b", "c", "d"].includes(k) && !e.ctrlKey && !e.metaKey && !e.altKey) choose(k.charCodeAt(0) - 97);
  else if (k === "enter" && S.cur.phase === "confirm") { e.preventDefault(); lockIn(); }
});

/* ---------- Start ---------- */
(async function init() {
  try {
    S.store = await withTimeout(createStore(CONFIG), 20000, "Zeitüberschreitung beim Laden von Firebase.");
  } catch (e) {
    S.store = await createLocalStore(CONFIG);
    S.store.notice = "Firebase konnte nicht gestartet werden (" + explainError(e) + "). Die Seite läuft im lokalen Modus.";
  }
  try {
    S.admin = S.store.isAdmin();
    S.store.onAuth((v) => { S.admin = v; render(); });
    await loadAll();
  } catch (e) {
    S.loadErr = "Start fehlgeschlagen: " + explainError(e);
  }
  S.loading = false;
  route();
})();
