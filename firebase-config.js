/* Einstellungen der Quizwelt.
 *
 * Ohne Firebase-Angaben oder ohne adminEmail läuft die Seite im lokalen Modus (Quizze aus data/quizzes.json).
 * Wie du Firebase einrichtest, steht in der README.md.
 */
export default {
  // Name oben links auf jeder Seite
  siteTitle: "Quizwelt",

  // Firebase-Konfiguration aus der Firebase-Konsole
  firebase: {
    apiKey: "AIzaSyChY-tmV2kjg9mRqLCcXYWXIHdDMnWr4GA",
    authDomain: "quizplatform-db-fernverkehr.firebaseapp.com",
    projectId: "quizplatform-db-fernverkehr",
    storageBucket: "quizplatform-db-fernverkehr.firebasestorage.app",
    messagingSenderId: "644801430379",
    appId: "1:644801430379:web:c1ebf2dc37ae2af5a5822e"
  },

  // E-Mail-Adresse des Bearbeiter-Kontos, das du in Firebase unter Authentication > Nutzer angelegt hast.
  // Im Bearbeiten-Modus gibst du dann nur das Passwort dieses Kontos ein. Solange das Feld leer ist,
  // läuft die Seite im lokalen Modus.
  adminEmail: "pascal_leon_schneider@web.de",

  // Nur für den lokalen Modus: SHA-256 des Passworts. Voreingestellt ist "quizwelt".
  adminPasswordSha256: "df9270d84c507c0e550ac253e0a935d66e663965df037fc37200a33e11b16b09"
};
