/* Speicherschicht der Quizwelt.
 *
 * Zwei Betriebsarten mit derselben Schnittstelle:
 *  - "firebase": Quizze liegen in Firestore, der Bearbeiten-Modus ist eine echte Anmeldung (Firebase Auth).
 *  - "local":    Quizze kommen aus data/quizzes.json im Repo. Änderungen bleiben im Browser (localStorage)
 *                und lassen sich exportieren, um sie ins Repo zu legen. Das Passwort ist hier nur eine Sperre.
 */

const FB_VERSION = "10.12.2";
const FB_BASE = "https://www.gstatic.com/firebasejs/" + FB_VERSION + "/";
const LOCAL_KEY = "quizwelt.quizzes.v1";
const ADMIN_KEY = "quizwelt.admin";

export async function fetchSeed() {
  try {
    const r = await fetch("data/quizzes.json", { cache: "no-cache" });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j) ? j : (j.quizzes || []);
  } catch (e) {
    return [];
  }
}

async function sha256Hex(text) {
  if (!window.crypto || !crypto.subtle) {
    throw new Error("Die Passwortprüfung braucht https oder localhost.");
  }
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function firebaseConfigured(cfg) {
  const f = cfg && cfg.firebase;
  return !!(f && f.apiKey && f.projectId && cfg.adminEmail);
}

export async function createStore(cfg) {
  if (firebaseConfigured(cfg)) {
    try {
      return await firebaseStore(cfg);
    } catch (e) {
      console.warn("Firebase nicht verfügbar:", e);
      const s = await localStore(cfg);
      s.notice = "Firebase war nicht erreichbar. Die Seite läuft im lokalen Modus.";
      return s;
    }
  }
  return localStore(cfg);
}

/* ---------- Lokaler Modus ---------- */
async function localStore(cfg) {
  let data = null;
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) data = JSON.parse(raw);
  } catch (e) { data = null; }
  if (!Array.isArray(data)) data = await fetchSeed();

  const listeners = [];
  const persist = () => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); } catch (e) {} };
  const isAdmin = () => { try { return sessionStorage.getItem(ADMIN_KEY) === "1"; } catch (e) { return false; } };
  const emit = () => listeners.forEach(f => f(isAdmin()));

  return {
    mode: "local",
    notice: "",
    async list() { return JSON.parse(JSON.stringify(data)); },
    async save(quiz) {
      const q = JSON.parse(JSON.stringify(quiz));
      const i = data.findIndex(x => x.id === q.id);
      if (i > -1) data[i] = q; else data.push(q);
      persist();
    },
    async remove(id) { data = data.filter(x => x.id !== id); persist(); },
    isAdmin,
    onAuth(f) { listeners.push(f); },
    async login(pw) {
      const want = String(cfg.adminPasswordSha256 || "").toLowerCase();
      const got = await sha256Hex(pw);
      if (!want || got !== want) throw new Error("Passwort falsch.");
      try { sessionStorage.setItem(ADMIN_KEY, "1"); } catch (e) {}
      emit();
    },
    async logout() { try { sessionStorage.removeItem(ADMIN_KEY); } catch (e) {} emit(); },
    async resetToRepo() {
      try { localStorage.removeItem(LOCAL_KEY); } catch (e) {}
      data = await fetchSeed();
    }
  };
}

/* ---------- Firebase-Modus ---------- */
async function firebaseStore(cfg) {
  const [appM, fsM, authM] = await Promise.all([
    import(FB_BASE + "firebase-app.js"),
    import(FB_BASE + "firebase-firestore.js"),
    import(FB_BASE + "firebase-auth.js")
  ]);
  const app = appM.initializeApp(cfg.firebase);
  const db = fsM.getFirestore(app);
  const auth = authM.getAuth(app);
  const adminMail = String(cfg.adminEmail).toLowerCase();

  let admin = false;
  const listeners = [];
  let firstAuth;
  const authReady = new Promise(res => { firstAuth = res; });
  authM.onAuthStateChanged(auth, user => {
    admin = !!(user && user.email && user.email.toLowerCase() === adminMail);
    listeners.forEach(f => f(admin));
    firstAuth();
  });
  await Promise.race([authReady, new Promise(res => setTimeout(res, 6000))]);

  return {
    mode: "firebase",
    notice: "",
    async list() {
      const snap = await fsM.getDocs(fsM.collection(db, "quizzes"));
      return snap.docs.map(d => Object.assign({}, d.data(), { id: d.id }));
    },
    async save(quiz) {
      const q = JSON.parse(JSON.stringify(quiz));
      await fsM.setDoc(fsM.doc(db, "quizzes", q.id), q);
    },
    async remove(id) { await fsM.deleteDoc(fsM.doc(db, "quizzes", id)); },
    isAdmin: () => admin,
    onAuth(f) { listeners.push(f); },
    async login(pw) {
      try {
        await authM.signInWithEmailAndPassword(auth, cfg.adminEmail, pw);
      } catch (e) {
        const code = e && e.code ? String(e.code) : "";
        if (/too-many/.test(code)) throw new Error("Zu viele Versuche. Bitte später noch einmal probieren.");
        if (/network/.test(code)) throw new Error("Keine Verbindung zu Firebase.");
        throw new Error("Passwort falsch.");
      }
    },
    async logout() { await authM.signOut(auth); },
    async resetToRepo() {}
  };
}
