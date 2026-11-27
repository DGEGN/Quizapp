# Quizwelt

Eine Seite für mehrere Quizshows im Stil einer Fernseh-Wissensshow. Zwei Teams wählen abwechselnd Fragen vom Spielbrett, falsche Antworten dürfen geklaut werden. Die Seite besteht nur aus statischen Dateien und läuft auf GitHub Pages.

## 1. Auf GitHub veröffentlichen

1. Auf github.com ein neues Repository anlegen und alle Dateien dieses Ordners hochladen (auch den Ordner `data` und die Datei `.nojekyll`).
2. Im Repository: **Settings > Pages > Build and deployment**. Bei „Source“ **Deploy from a branch** wählen, Branch `main`, Ordner `/ (root)`, speichern.
3. Nach ein bis zwei Minuten ist die Seite unter `https://DEIN-NAME.github.io/REPO-NAME/` erreichbar.

## 2. Passwort für den Bearbeiten-Modus

Oben rechts steht „Bearbeiten“. Dort gibst du das Passwort ein. Voreingestellt ist `quizwelt`, bitte ändere es:

1. Öffne `hash.html` (lokal im Browser oder auf der veröffentlichten Seite) und gib dein neues Passwort ein.
2. Kopiere den Hash in `firebase-config.js` bei `adminPasswordSha256`.

Das gilt für den lokalen Modus. Mit Firebase (Abschnitt 4) gilt stattdessen das Passwort des Firebase-Kontos.

## 3. Quizze verwalten ohne Firebase (lokaler Modus)

* Die Quizze stehen in `data/quizzes.json`. Das Beispielquiz zur BR 408 ist schon enthalten.
* Im Bearbeiten-Modus legst du neue Quizze an, änderst Titel, Kategorien, Punkte und Fragen. „Speichern“ sichert im Browser, das sieht nur dein Browser.
* Damit alle die Änderungen sehen: Auf der Startseite **Alle Quizze exportieren**, die erzeugte `quizzes.json` im Repository nach `data/` hochladen und die alte Datei ersetzen. Einzelne Quizze lassen sich im Editor exportieren und auf der Startseite mit **Quiz aus Datei laden** wieder einlesen.
* **Auf Stand im Repo zurücksetzen** verwirft deine lokalen Änderungen und lädt wieder `data/quizzes.json`.

## 4. Optional: Quizze in Firebase speichern

Dann erscheinen Änderungen sofort für alle, ohne Export. Das Bearbeiten ist durch eine echte Anmeldung geschützt.

1. Auf console.firebase.google.com ein Projekt anlegen, dann eine Web-App hinzufügen. Die angezeigte Konfiguration (`apiKey`, `authDomain`, `projectId`, `appId`) trägst du in `firebase-config.js` unter `firebase` ein.
2. **Build > Firestore Database** erstellen (Produktionsmodus, Standort in Europa).
3. **Build > Authentication > Anmeldemethode**: E-Mail/Passwort aktivieren. Unter „Nutzer“ ein Konto mit deiner Wunsch-E-Mail und einem starken Passwort anlegen. Diese E-Mail trägst du in `firebase-config.js` bei `adminEmail` ein.
4. **Firestore > Regeln**: den Inhalt von `firestore.rules` einfügen, die Adresse durch deine `adminEmail` ersetzen und veröffentlichen.
5. **Authentication > Einstellungen > Autorisierte Domains**: `DEIN-NAME.github.io` hinzufügen.
6. Seite aufrufen, über „Bearbeiten“ mit dem Passwort des Kontos anmelden und auf der Startseite **Beispielquiz hochladen** wählen.

## 5. Zur Sicherheit

* Mit Firebase schützen die Firestore-Regeln die Daten wirklich: Lesen darf jeder, Schreiben nur das Konto mit deiner E-Mail. Die Firebase-Konfiguration in `firebase-config.js` ist nicht geheim und darf öffentlich im Repository stehen.
* Im lokalen Modus ist das Passwort nur eine Sperre gegen versehentliches Bearbeiten. Eine reine Webseite kann ohne Server nichts wirklich verbergen, die Daten in `data/quizzes.json` sind öffentlich. Wirklich verändern können sie aber nur Personen mit Schreibrecht auf das Repository.

## Dateien

| Datei | Zweck |
| --- | --- |
| `index.html`, `style.css`, `app.js` | Die Seite |
| `store.js` | Speicher (lokal oder Firebase) und Anmeldung |
| `firebase-config.js` | Seitentitel, Firebase-Angaben, Passwort-Hash |
| `data/quizzes.json` | Quizze im lokalen Modus |
| `firestore.rules` | Regeln für Firestore |
| `hash.html` | Erzeugt den Passwort-Hash |

Hinweis: Die Datei muss über `https://` oder `http://localhost` geöffnet werden. Ein Doppelklick auf `index.html` funktioniert nicht, weil Browser Module von `file://` blockieren. Zum lokalen Testen im Ordner `python3 -m http.server` starten.

## 6. Barrierefreiheit

Die App ist für Screenreader (NVDA, JAWS, VoiceOver, TalkBack) und die reine Tastaturbedienung ausgelegt:

* Es gibt einen Link „Zum Inhalt springen“, sinnvolle Überschriften und beschriftete Schaltflächen, Gruppen und Dialoge.
* Beim Wechsel der Ansicht springt der Fokus auf die Überschrift. Sie nennt bei Fragen Nummer, Kategorie, Stufe, Punkte und das Team am Zug.
* Nach einer Antwort liegt der Fokus auf „Weiter“. Die Erklärung wird mit vorgelesen (Beschreibung der Schaltfläche).
* Tipp, 50:50 und Hinweise im Wissenstest werden über einen unsichtbaren Live-Bereich angesagt.
* Tasten: A bis D wählen eine Antwort, Enter bestätigt bzw. geht weiter.
* Bewegung wird bei „reduzierte Bewegung“ im Betriebssystem abgeschaltet, die Seite lässt sich vergrößern.

## 7. Quizze sichtbar oder unsichtbar machen

Im Bearbeiten-Modus hat jede Karte den Knopf „Unsichtbar machen“ bzw. „Sichtbar machen“. Im Quiz-Editor gibt es dafür den Haken „Quiz ist für Besucher sichtbar“. Unsichtbare Quizze tauchen für Besucher weder auf der Startseite noch im Wissenstest auf. Im JSON steht dafür `"hidden": true`.

Hinweis: Das ist nur ein Ausblenden in der App. Die Daten selbst (Repo oder Datenbank) bleiben öffentlich lesbar und sind kein Geheimnis.

## 8. Bis zu vier Teams

Beim Spielstart kannst du Solo, zwei, drei oder vier Teams wählen. Bei einer falschen Antwort bekommt das nächste Team in der Reihenfolge eine Klau-Chance (halbe Punkte, die falsche Antwort ist raus). Danach folgen die weiteren Teams, bis jemand richtig liegt oder alle es versucht haben. Die Reihenfolge der Fragen wechselt reihum. Bei Gleichstand an der Spitze gibt es kein einzelnes Siegerteam.
