/* Einstellungen der Quizwelt.
 *
 * Ohne Firebase-Angaben läuft die Seite im lokalen Modus (Quizze aus data/quizzes.json).
 * Wie du Firebase einrichtest, steht in der README.md.
 */
export default {
  // Name oben links auf jeder Seite
  siteTitle: "Quizwelt",

  // Firebase (optional). Die Werte findest du in der Firebase-Konsole unter
  // Projekteinstellungen > Allgemein > Meine Apps > SDK-Konfiguration.
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    appId: ""
  },

  // Firebase-Modus: E-Mail-Adresse des Bearbeiter-Kontos. Im Bearbeiten-Modus gibst du nur das Passwort ein.
  adminEmail: "",

  // Lokaler Modus: SHA-256 des Passworts. Voreingestellt ist das Passwort "quizwelt".
  // Einen neuen Wert erzeugst du mit der Datei hash.html. Bitte ändern!
  adminPasswordSha256: "df9270d84c507c0e550ac253e0a935d66e663965df037fc37200a33e11b16b09"
};
