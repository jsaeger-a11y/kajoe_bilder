# web – Weboberflaeche (Phase 2a)

Next.js 16 mit App Router und TypeScript, hoert auf **`127.0.0.1:3000`** –
nicht auf `0.0.0.0`. Davor kommt in Phase 5 der Cloudflare Tunnel.

In Phase 2a gibt es Anmeldung, Benutzerverwaltung und eine Uebersichtsseite,
die Name und Rolle zeigt. Galerie, Auswahllisten und Download folgen.

```bash
cd web
npm install
npm run build
npm start          # oder: systemctl --user start kajoe-web.service
npm run typen      # tsc --noEmit
```

Konten entstehen ueber `tools/benutzer.sh`, nie ueber eine Webseite.

---

## Sitzungen: eigene Tabelle statt JWT

Auth.js kann beim Credentials-Provider **keine** Datenbanksitzungen, sondern
nur JWT. Damit standen zwei Wege zur Wahl. Es ist die eigene, sehr kleine
Sitzungsverwaltung geworden, aus vier Gruenden:

**Ein JWT laesst sich nicht zurueckziehen.** `benutzer.aktiv = FALSE` wuerde
eine laufende Sitzung nicht beenden – das Wertpapier im Cookie bleibt gueltig,
bis es ablaeuft. Ein abgeschaltetes Konto soll aber genau das sein: draussen,
sofort. Nachgemessen: das Abschalten loescht die Sitzung, der naechste
Seitenaufruf desselben Browsers landet auf der Anmeldung.

**Wer das mit einem JWT haben will, gibt dessen Vorteil auf.** Man muesste bei
jeder Anfrage doch in der Datenbank nachsehen, ob das Konto noch aktiv ist –
dann traegt man die Umstaende des JWT ohne seinen Nutzen.

**Der Umfang steht in keinem Verhaeltnis.** Die ganze Anmeldung besteht aus
einem Formular, einem Cookie und einer Abmeldung. `src/lib/sitzung.ts` sind
rund 130 Zeilen; Auth.js waere eine grosse Abhaengigkeit mit eigener
Versionspflege fuer drei Benutzer.

**Der Auftrag verlangt ohnehin eine Tabelle.** "Abgelaufene Sitzungen im
vorhandenen Aufraeumlauf entfernen" setzt voraus, dass es sie gibt.

Gespeichert wird **nicht die Kennung aus dem Cookie, sondern ihr SHA-256**.
Wer eine Sicherung der Datenbank in die Haende bekommt, haelt damit keine
gueltigen Sitzungen in der Hand. Das kostet nichts: die Kennung ist ohnehin ein
Zufallswert (32 Byte aus `randomBytes`) und muss nicht zurueckgerechnet werden
koennen.

Laufzeit 30 Tage, **absolut**, ohne Nachschieben – ein Ablauf, der nie
eintritt, ist keiner. `zuletzt_gesehen` wird hoechstens einmal je Stunde
nachgefuehrt; bei drei Benutzern braucht niemand einen Schreibvorgang je
Seitenaufruf.

---

## Wo geprueft wird

`src/lib/zugriff.ts` ist die **eine** Stelle:

| Aufruf | fuer | bei fehlender Berechtigung |
|---|---|---|
| `verlangeAnmeldung()` | Seiten | Weiterleitung auf `/anmelden` |
| `verlangeVerwalter()` | Seiten | **404** |
| `aktionAngemeldet()` / `aktionVerwalter()` | Server Actions | wirft `ZugriffFehler` |
| `routeVerwalter()` | Route Handler | 401 bzw. 403 als Antwort |

Verwaltungsseiten antworten mit **404 statt 403**: wer nicht hineindarf, soll
auch nicht erfahren, dass es die Seite gibt.

**Es gibt bewusst keine `middleware.ts`.** Eine Middleware sieht aus wie Schutz,
laeuft aber nicht vor jeder Server Action und nicht vor jedem Datenzugriff; wer
sich auf sie verlaesst, prueft an der falschen Stelle. Geprueft wird dort, wo
die Daten herausgegeben werden – in jeder Seite, jeder Action, jeder Route.

Der Menuepunkt "Benutzer" wird Betrachtern nicht angezeigt. Das ist
Bequemlichkeit, **keine** Pruefung.

---

## Die Falle mit `Secure`

`Secure` am Cookie heisst: nur ueber HTTPS. Im lokalen Netz laeuft die
Anwendung ueber `http://webspace:3000`, und dann kommt das Cookie **nie** an –
die Anmeldung schlaegt scheinbar grundlos fehl. `localhost` gilt als sicherer
Kontext, ein Hostname im LAN nicht.

Deshalb:

* Vorgabe im Code ist **an** (`src/lib/umgebung.ts`, `COOKIE_SICHER`).
* Abschaltbar ueber `COOKIE_SECURE=0` in der `.env` der Projektwurzel.
* `src/instrumentation.ts` schreibt beim Start eine deutliche Warnung ins Log,
  wenn ohne `Secure` gelaufen wird – sonst bleibt die Einstellung nach dem
  Tunnel still aus, und das merkt niemand.

Gemessen am ausgelieferten Header:

```
COOKIE_SECURE=1   sitzung=…; Path=/; Expires=…; Secure; HttpOnly; SameSite=lax
COOKIE_SECURE=0   sitzung=…; Path=/; Expires=…;         HttpOnly; SameSite=lax
```

**Zurzeit steht `COOKIE_SECURE=0` in der `.env`**, damit die Oberflaeche im
LAN benutzbar ist. Mit dem Tunnel gehoert dort wieder `1` hin.

---

## Passwoerter

argon2id ueber `@node-rs/argon2`, Parameter nach OWASP: 19 MiB Speicher, zwei
Durchgaenge, ein Strang. Rund 14 ms je Hash auf dieser Maschine.

**`Algorithm.Argon2id` darf man nicht schreiben.** @node-rs/argon2 deklariert
die Aufzaehlung als `const enum`; TypeScript loescht sie beim Uebersetzen, zur
Laufzeit ist `Algorithm` ein leeres Objekt, und mit `isolatedModules` – das
Next voraussetzt – laesst sie sich gar nicht erst lesen. Wer es doch tut,
bekommt `undefined` uebergeben. In `src/lib/passwort.ts` steht deshalb die
Zahl mit Begruendung daneben.

Die Mindestlaenge steht an einer Stelle (`PASSWORT_MINDESTLAENGE`), die
Sperrschwelle ebenfalls (`FEHLVERSUCHE_BIS_SPERRE` in `src/lib/anmeldung.ts`).

---

## Anmeldeversuche

Jeder Ausgang wird vermerkt, der erfolgreiche mit – sonst bliebe die eine Frage
offen, ob am Ende doch jemand durchkam. Auch ein Versuch mit einem
Benutzernamen, den es gar nicht gibt: sonst sieht man das Absuchen nicht.

**Passwoerter kommen dort nie hin** – nicht gekuerzt, nicht gehasht, nicht in
eine Fehlermeldung, nicht in ein Log.

Die Adresse kommt aus `CF-Connecting-IP`, ersatzweise aus dem **ersten**
Eintrag von `X-Forwarded-For`; dort haengt jeder Proxy hinten an. Wer den
letzten nimmt, protokolliert die Adresse des eigenen Proxys. Nachgemessen mit
`X-Forwarded-For: 198.51.100.9, 10.0.0.1, 172.16.0.1` – protokolliert wurde
198.51.100.9.

**Die Fehlermeldung unterscheidet nicht** zwischen "Benutzer gibt es nicht",
"Passwort falsch" und "Konto abgeschaltet". Sonst laesst sich von aussen
herausfinden, welche Konten existieren. Auch die Laufzeit verraet nichts: ohne
Konto wird gegen einen Hash geprueft, den es nicht gibt, damit der Fehlschlag
ungefaehr gleich lang dauert.

Einzige Ausnahme ist die Sperre nach zu vielen Fehlversuchen – die muss
sichtbar sein, sonst sucht jemand den Fehler beim Passwort.

---

## Proxy und Adressen

Im Code stehen **ausschliesslich relative Pfade**, nie eine absolute URL mit
Hostnamen. Damit laeuft dieselbe Anwendung unter `127.0.0.1:3000` und hinter
dem Tunnel gleichermassen, ohne dass irgendwo ein Hostname konfiguriert werden
muesste.

`X-Forwarded-For`, `CF-Connecting-IP` und `X-Forwarded-Proto` werden dort
ausgewertet, wo sie gebraucht werden: in `src/lib/anfrage.ts`.

---

## Aufbau

```
web/
├── next.config.ts           Kopfzeilen, kein poweredBy, noindex
├── src/
│   ├── instrumentation.ts   Warnung beim Start, wenn ohne Secure
│   ├── lib/
│   │   ├── umgebung.ts      .env der Projektwurzel, COOKIE_SICHER
│   │   ├── db.ts            pg-Vorrat
│   │   ├── passwort.ts      argon2id, Mindestlaenge
│   │   ├── anfrage.ts       IP aus den Proxy-Kopfzeilen
│   │   ├── sitzung.ts       Cookie, Sitzungstabelle
│   │   ├── anmeldung.ts     Anmelden, Fehlversuche, Sperre
│   │   └── zugriff.ts       DIE Zugriffspruefung
│   └── app/
│       ├── layout.tsx       neutraler Titel
│       ├── page.tsx         Übersicht
│       ├── anmelden/        Anmeldeseite und Actions
│       ├── konto/           eigenes Passwort aendern
│       ├── verwaltung/benutzer/
│       └── api/verwaltung/benutzer/route.ts
└── werkzeug/benutzer.ts     Konten von der Kommandozeile
```
