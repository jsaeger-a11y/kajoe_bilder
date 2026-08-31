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

---

# Galerie (Phase 2b)

| Adresse | was |
|---|---|
| `/` | Übersicht: Zahlen je Jahr, je Herkunft, Platte |
| `/galerie` | Gitter, nach Jahr und Monat, neueste zuerst |
| `/bild/<nr>` | Einzelansicht mit Angaben und Blättern |
| `/datei/<nr>/<art>` | liefert `vorschau`, `ansicht` oder `wiedergabe` |
| `/api/bild/<nr>/wiedergabe` | erzeugt die abspielbare Fassung (POST) |

## Ausliefern der Ableitungen

**Nicht aus `public/`.** Was dort liegt, liefert Next an jeden aus, der die
Adresse kennt. Die Ableitungen liegen unter `/data/kajoe_bilder/abgeleitet/`
und gehen nur an Angemeldete – geprüft bei **jeder** Anfrage, nicht nur beim
Aufbau der Galerie. Ein Lesezeichen überlebt das Abmelden.

**Der Pfad kommt nie aus der Adresse.** Aus der Adresse kommt eine Nummer; den
Pfad baut `src/lib/dateien.ts` aus Jahr, Monat und `sha256` der zugehörigen
Zeile. Damit gibt es keinen Weg über `../..` und keinen Weg zum Original: die
Art wird gegen eine Liste von genau drei Werten geprüft, bevor überhaupt in die
Datenbank gesehen wird.

`Cache-Control: private, max-age=31536000, immutable` – `private`, weil die
Datei einer angemeldeten Person gehört und in keinem gemeinsamen
Zwischenspeicher landen darf; `immutable`, weil der Dateiname der `sha256` des
Inhalts ist und sich nie ändert.

Videos werden mit **Range-Unterstützung** ausgeliefert (206 und
`Content-Range`). Ohne sie springt der Betrachter beim Spulen nicht, sondern
lädt von vorn.

## Bewusst `<img>` statt `next/image`

Der Bildzuschnitt von Next holt die Datei serverseitig **ohne** das
Sitzungscookie und liefe damit gegen unsere 401. Die Vorschau ist ohnehin schon
in Phase 1b auf 300 px gerechnet – es gibt nichts mehr zu optimieren.

## Filter

Der Filterzustand steht **in der Adresse**, nicht im Browser: sonst lässt sich
eine Ansicht nicht wiederfinden und der Zurück-Knopf tut nicht, was er soll.
`suchtext()` in `src/lib/galerie.ts` baut ihn, `filterAusSuche()` liest ihn
zurück und prüft dabei jeden Wert.

**Vorgabe ist `herkunft=iphone`.** Damit das kein stiller Filter ist, steht
über der Leiste immer „665 von 922 Aufnahmen – es wird gefiltert" samt Link auf
alles. Zu jedem Filterwert steht die Trefferzahl, jeweils unter den *übrigen*
Filtern – deshalb `bedingung(filter, ausser)`.

Gitter, Trefferzahlen und das Blättern in der Einzelansicht benutzen dieselbe
`bedingung()`. Zwei Fassungen derselben Bedingung laufen früher oder später
auseinander, und dann springt man beim Blättern aus der Auswahl heraus.

Geblättert wird über den Schlüssel `(aufnahme_lokal, id)` statt über `OFFSET`:
das bleibt richtig, auch wenn zwei Aufnahmen dieselbe Sekunde tragen.

`SEITENGROESSE` steht an einer Stelle (60). Bei 922 Zeilen fällt das nicht auf,
bei 14.000 schon.

## Woher das Datum kommt

Bei `zeitquelle != 'exif'` ist das Datum eine Herleitung und keine Messung. Die
Einzelansicht schreibt das dazu, mit dem jeweiligen Grund – bei
`dateiname` also auch, dass der Name die UTC-Zeit trägt und nach
`Europe/Berlin` umgerechnet wurde. Betroffen sind 114 der 922 Aufnahmen
(12,4 %). Wer im Kalender einen Monat falsch erwischt, soll die Möglichkeit
gehabt haben, es zu sehen.

## Videos abspielen

Die Wiedergabefassung entsteht **beim ersten Aufruf**. Gerechnet wird nicht in
Node, sondern über `tools/wiedergeben.sh` → `ingest/ableitung.py` aus Phase 1b:
zwei Fassungen derselben ffmpeg-Zeile laufen auseinander, und die eine ist
gemessen und geprüft.

Solange gerechnet wird, sagt die Seite das mit einer mitlaufenden
Sekundenanzeige. Gemessen an einem Video von 361 s: **32 Sekunden über VAAPI**,
danach steht `wiedergabe_erzeugt` auf `TRUE` und der zweite Aufruf antwortet in
10 ms.

Zwei Betrachter, die dasselbe Video öffnen, lösen **einen** ffmpeg-Lauf aus;
der zweite hängt sich über eine `Map` von Versprechen an den ersten.

**Die Fassung ist groß.** Bei `VAAPI_QP = 26` wurden aus 333 MB HEVC 378 MB
H.264 – rund 8,4 Mbit/s. Für einen Tunnel ist das viel; `qp 28` wären rund
5,9 Mbit/s. Die Zahl steht in `ingest/ableitung.py` an einer Stelle.

## Mobil

Mobil zuerst gebaut: zwei Spalten auf dem Telefon, mehr sobald Platz da ist
(`grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))`). Keine festen
Pixelbreiten, Tippziele mindestens 2,5 rem hoch, breite Tabellen scrollen in
sich selbst statt die Seite breit zu machen.

**Auf einem echten Telefon ist das nicht geprüft** – dafür fehlt hier das
Gerät. Geprüft sind nur die Voraussetzungen: Viewport-Angabe, keine festen
Breiten, Umbruch der Kopfleiste, Größe der Tippziele.

---

# Markieren, Listen, Löschen (Phase 3a)

| Adresse | was |
|---|---|
| `/galerie?w=1` | Auswahlmodus: Kacheln markieren, Sammelaktionen |
| `/listen` | eigene Listen, freigegebene fremde, neue anlegen |
| `/listen/<nr>` | Inhalt, umbenennen, freigeben, löschen |
| `/vorgemerkt` | zum Löschen vorgemerkt, mit Restzeit und Zurückholen |
| `/api/vorgemerkt` | dasselbe als JSON – nur mit dem Recht `loeschen` |

## Rechte

`benutzer.rechte` ist eine **Textliste**, obwohl zunächst nur `loeschen` darin
steht: ein zweiter Fall ist bereits bekannt (ob die Karte allen sichtbar sein
soll, ist in `CLAUDE.md` offen). Eine Spalte `darf_loeschen` müsste dann eine
zweite bekommen, und die dritte käme bestimmt auch noch.

Die Kennungen stehen in `src/lib/rechte.ts` und **nicht** als Datenbankregel:
eine `CHECK`-Bedingung über einer Liste zwingt zu einer Migration, sobald ein
Recht dazukommt.

`darf(wer, recht)` in `src/lib/zugriff.ts` ist die einzige Stelle, die das
entscheidet – **ein Verwalter darf ohnehin alles**, das steht dort vorn und
nicht als Sonderfall an fünf Aufrufstellen. Dazu `verlangeRecht()` für Seiten,
`aktionRecht()` für Server Actions, `routeRecht()` für Routen.

Die Rechte kommen bei **jedem** Aufruf frisch aus der Datenbank, nicht aus dem
Cookie: ein entzogenes Recht wirkt sofort, so wie ein abgeschaltetes Konto.

## Markieren: die `defaultChecked`-Falle

Der naheliegende Weg wäre ein angehaktes Kästchen je Kachel. **Er trägt nicht.**
React setzt beim Aktualisieren nur das Attribut `defaultChecked`; die
tatsächliche Ankreuzung des Feldes – und nur die wird abgeschickt – entsteht
allein beim ersten Aufbau. Nach einem vollen Seitenaufbau stimmt es, nach einem
Klick auf einen Verweis nicht mehr: man blättert auf Seite 2, kommt zurück und
schickt die Hälfte ab, ohne dass irgendwo etwas zu sehen wäre.

Deshalb trägt jede Kachel im Auswahlmodus einen **Verweis**, der die Kennung
der Adresse hinzufügt oder aus ihr entfernt (`src/lib/markierung.ts`). Was in
der Adresse steht, überlebt jedes Blättern.

Nachgemessen: Filter Juni 2026 (185 Treffer), „alle 185 wählen“, dann auf
Seite 2 geblättert – das Formular auf Seite 2 trug **185** Kennungen, obwohl
dort nur 60 Kacheln stehen.

**Wieviel gemeint war, reist als eigenes Feld mit** (`anzahl`). Kommt weniger
an, wird das gesagt, statt stillschweigend weniger zu verarbeiten – bei
fünfhundert Kennungen zählt das niemand nach. Gegengeprobt mit einem auf 50
gekürzten Feld: „Es sollten 185 Bilder sein, angekommen sind 50. Nichts
geändert.“

**Die Sammelauswahl gibt es nur mit gesetztem Filter.** Ohne Einschränkung
träfe sie den ganzen Bestand; statt eines Schalters, der nichts tut, steht dort
der Satz, was noch fehlt.

`HOECHSTENS_JE_VORGANG = 500` greift schon beim Markieren: der Link heißt dann
„alle 500 Treffer wählen (von 922)“, nicht erst das Abschicken scheitert.

## Listen

Besitzerprüfung **in der Abfrage**, nicht daneben: `listeZumSehen()` nimmt
eigene und freigegebene, `listeZumAendern()` nur eigene. Die Kennung kommt aus
der Sitzung, nie aus der Adresse – auch ein Verwalter sieht fremde Listen
nicht, außer sie sind freigegeben. Eine Auswahlliste ist etwas Privates, keine
Verwaltungssache.

Nachgeprüft: B sieht A's Liste nicht (404 auch bei direktem Aufruf); nach der
Freigabe sieht B sie, aber Umbenennen und Löschen weist die Server Action ab –
und zwar auch dann, wenn B das Formular von A holt und mit dem eigenen Cookie
abschickt. Gegenprobe mit demselben Formular als A: geht durch.

**Kein Knopf heißt wie etwas, das er nicht tut.** „Umbenennen …“ öffnet das
Feld, gespeichert wird mit „Neuen Namen speichern“; „Löschen …“ öffnet die
Rückfrage – mit dem Namen darin und dem Satz, dass die Bilder selbst bleiben.
Beide Zwischenschritte stehen in der Adresse (`?tun=umbenennen`), nicht im
Browser.

Grenzen im Code: 500 Bilder je Liste, 50 Listen je Benutzer.

## Löschen

Zweistufig. **Vormerken** setzt `geloescht_am`; das Bild verschwindet aus
Galerie, Listen und Dateiauslieferung, die Datei bleibt. Nach **30 Tagen**
entfernt `tools/aufraeumen.sh` Original und Ableitungen.

`NICHT_GELOESCHT` steht in `src/lib/sichtbar.ts` und wird **nirgends neu
formuliert** – nicht in der Galerie, nicht in den Listen, nicht beim
Ausliefern, nicht beim Zählen.

**Die Sammellöschung überspringt Bilder, die in einer Auswahlliste stehen** –
und sagt, wie viele. Was jemand ausdrücklich gesammelt hat, darf kein
Stapellauf stillschweigend mitnehmen. Beim Einzellöschen steht stattdessen der
Hinweis, in wie vielen Listen das Bild steht; dort entscheidet die Person, die
es vor sich hat.

Nach dem Vormerken aus der Einzelansicht wird **zwingend weitergeleitet**: das
Bild hat die Seite gerade verlassen, und ohne die Weiterleitung baut Next
dieselbe Ansicht neu auf, findet es nicht mehr und zeigt eine 404 – als wäre
etwas schiefgegangen, obwohl alles richtig lief.

## Eine `"use server"`-Datei darf nur Funktionen ausführen

`export const GRENZE = 500` in einer Datei mit `"use server"` übersetzt sich
anstandslos und scheitert erst zur Laufzeit mit *A "use server" file can only
export async functions, found number*. Weder `tsc` noch `next build` finden
das. Konstanten gehören nach `src/lib/`.

---

# Herunterladen (Phase 3b)

| Adresse | was |
|---|---|
| `/herunterladen/bild/<nr>?art=jpeg` | vollauflösendes JPEG, Qualität 95, 4:4:4, sRGB, mit EXIF |
| `/herunterladen/bild/<nr>?art=original` | die Datei, wie sie hereinkam |
| `POST /herunterladen/paket` | ZIP aus einer Liste (`liste`) oder aus der Sammelauswahl (`ids`) |

Gerechnet und gepackt wird in `ingest/herunterladen.py`; Node prüft, wer was
darf, setzt die Kopfzeilen und reicht die Standardausgabe des Unterprozesses
unverändert an die Antwort weiter.

## Drei Regeln, wann das Original durchgereicht wird

* **Videos gehen immer als Original.** Die Wiedergabefassung ist zum Ansehen
  im Browser gedacht, nicht zum Behalten – sie ist teils größer als das
  Original und schlechter.
* **Ein JPEG-Original wird unverändert ausgeliefert**, auch unter „JPEG". Ein
  zweites Kodieren wäre eine weitere Generation ohne jeden Gewinn. Das betrifft
  1.595 der 17.524 Zeilen. Nachgeprüft: der Download ist `sha256`-gleich mit
  der Datei auf der Platte.
* Alles andere wird umgewandelt.

Die Regel steht in `ingest/herunterladen.py` (`unveraendert`) und **noch einmal**
in `web/src/lib/herunterladen.ts` – Node braucht sie, um den Dateinamen in die
Kopfzeile zu schreiben, bevor der Strom läuft. Damit die beiden nicht
auseinanderlaufen, gibt es `herunterladen.py name` und eine Gegenprobe darüber.

## Dateinamen

`2023-07-15_142305.jpg` aus Aufnahmedatum und Uhrzeit – der `sha256` sagt
niemandem etwas. Keine Umlaute, keine Sonderzeichen, keine Leerzeichen.

**Zwei Aufnahmen aus derselben Sekunde bekommen einen Zusatz** (`-2`, `-3`).
Das kommt bei Serienbildern vor; im Bestand gibt es Sekunden mit vier
Aufnahmen. Ein Paket mit zwei gleichnamigen Einträgen packt mancher Entpacker
stillschweigend übereinander – dann fehlt hinterher ein Bild und niemand weiß,
welches.

## Das Paket

**Im Datenstrom, nicht im Speicher und nicht auf der Platte.** Python schreibt
das ZIP direkt nach `stdout`, Datei für Datei: umwandeln, hineinschreiben,
wegwerfen. Node reicht den Strom durch.

* `allowZip64=True` – über 4 GB ist ein ZIP ohne ZIP64 stillschweigend
  beschädigt.
* `ZIP_STORED` statt `DEFLATE` – JPEG, HEIC und MP4 lassen sich nicht mehr
  zusammendrücken. Das spart die gesamte Rechenzeit.
* Das UTF-8-Kennzeichen (Flag 0x800) setzt Pythons `zipfile` selbst, sobald ein
  Name nicht reines ASCII ist; nachgesehen in den Einträgen. Ohne das zeigt
  Windows Kraut statt Umlauten.
* `Content-Disposition` trägt den Namen zweimal: als ASCII-Notnagel und als
  `filename*=UTF-8''…` nach RFC 5987.

`HOECHSTENS_JE_PAKET = 200` steht an einer Stelle. Eine Liste darf 500 Bilder
fassen – ist sie größer als ein Paket, zeigt die Seite mehrere Knöpfe
(„Teil 1: Aufnahmen 1–200"), und der Hinweis steht **vor** dem Auslösen.

**Vorher sagen, was kommt:** Anzahl und geschätzte Größe stehen über den
Knöpfen. Geschätzt wird mit 0,27 Byte je Bildpunkt – gemessen an zwölf
Aufnahmen waren es 0,266. Bei 55 Bildern hieß die Schätzung 204 MB, geliefert
wurden 209 MB.

## Ein abgebrochener Download muss den Unterprozess mitnehmen

Das war ein echter Fehler und er ist teuer: `except Exception` um die
Schreibschleife schluckte den `BrokenPipeError`, wenn der Abnehmer wegging.
Der Prozess rechnete den Rest des Pakets für niemanden weiter, lief in die
volle Rohrleitung und blieb dort **für immer** stehen – gemessen an einem Paket
von zweihundert Bildern.

Jetzt zweifach abgesichert:

* Python reicht `BrokenPipeError` und `EPIPE` durch, statt sie zu den
  überspringbaren Dateifehlern zu zählen.
* Node umschließt den Strom, damit `cancel()` den Unterprozess wirklich
  erwischt (`strom()` in `src/lib/herunterladen.ts`).

Nachgemessen: Download nach zwölf Sekunden abgebrochen → nach einer Sekunde
läuft kein Unterprozess mehr, und im Journal steht die Zeile dazu.

## Zugriff

Die Anmeldung wird bei jeder Anfrage geprüft, auch beim Paket. Aus einer
**fremden, freigegebenen** Liste darf heruntergeladen werden – sehen und
herunterladen gehören zusammen; aus einer nicht freigegebenen nicht, auch nicht
über die Route direkt, und auch nicht als Verwalter. Vorgemerkt gelöschte
Aufnahmen fallen aus Liste und Paket heraus, weil `bilderDerListe()` sie über
`NICHT_GELOESCHT` ausschließt.

---

# Verarbeitung anstoßen (Phase 4)

`/verarbeiten` – nur für Verwalter. Nicht wegen Missbrauch, sondern weil ein
versehentlicher Klick Stunden Rechenzeit auslöst.

**Die Anwendung startet keinen Prozess.** Sie schreibt
`/data/kajoe_bilder/.anstoss`, und `kajoe-verarbeiten.path` erledigt den Rest.
Ein Kindprozess aus Node hinge am Webdienst: bei jedem Neustart stirbt er mit
oder bleibt als Waise zurück.

Nachgemessen: während eines Laufs über 8.002 Dateien den Webdienst neu
gestartet – derselbe Ingest-Prozess (PID unverändert) lief weiter.

## Was die Seite zeigt

Vor dem Anstoßen: **Anzahl und Größe** dessen, was in `eingang/` liegt, samt
Beispielen. Genau der Abgleich, der am 31.08.2026 einen ganzen Jahrgang im
falschen Verzeichnis sichtbar gemacht hätte.

**Warnung bei laufender Übertragung:** eine `.filepart` liegt vor, oder die
jüngste Datei ist keine Minute alt. Als *Hinweis*, nicht als Sperre – der
Mensch weiß besser als die Heuristik, ob er gerade eine einzelne Datei
nachgelegt hat.

Ist `eingang/` leer, erscheint kein Knopf, sondern der Satz, dass nichts da
ist. Läuft etwas, erscheint kein Knopf, sondern der Fortschritt.

## Restzeit: gemessen, nicht geraten

`tempo()` liest die Takte der letzten zwei Minuten aus `verarbeitung_takt` und
rechnet daraus Dateien je Sekunde. Ein fester Wert je Datei taugt nicht: HEIC
dauert länger als PNG, und ein Lauf, der gerade an Videos arbeitet, ist
langsamer als sein Mittelwert vermuten lässt. Bis zwei Messpunkte da sind,
steht die Schätzung als vorläufig gekennzeichnet.

Gemessen an einem echten Lauf: „einlesen 7.500 von 8.002 (94 %) · läuft seit
4 min 50 s · noch etwa 19 s (26,1 Dateien/s, gemessen über die letzten
1 min 55 s)".

## Die Seite hält keine Anfrage offen

`Selbstauffrischung` ruft alle fünf Sekunden `router.refresh()` – eine kurze
Anfrage, danach ist Ruhe. Kein Long Polling, kein offener Strom. Der Lauf hängt
nicht an der Seite: Browser schließen, Telefon weglegen, später nachsehen.

Nachgemessen: 150 Sekunden lang rührte kein Klient die Anwendung an; danach
zeigte ein frisch angemeldeter Klient den Lauf bei 7.500 von 8.002 – dieselbe
Zahl wie die Datenbank.

## Zweiter Anstoß

Drei Riegel, jeder für sich ausreichend:

1. Die Seite zeigt während eines Laufs keinen Knopf.
2. Die Server Action prüft `laufend()` und schreibt keine Datei.
3. `tools/verarbeiten.sh` hält ein `flock` und meldet „Es läuft bereits ein
   Vorgang".

Geprüft: während eines Laufs die Server Action direkt angesprochen – es
entstand keine Auslösedatei und keine zweite Zeile in `verarbeitung`. Ein
Betrachter bekommt an derselben Stelle `ZugriffFehler`.

**Was die Anzeige nicht kann:** wird die Aktion abgewiesen, während ein Lauf
aktiv ist, sieht der Aufrufer keine Meldung – der Knopf samt seiner
Fehleranzeige wird in diesem Zustand gar nicht gerendert. Über die Oberfläche
kommt man nie dorthin; abgewiesen wird trotzdem.

---

# Karte (Phase 5)

`/karte` zeigt die Aufnahmeorte. Je weiter herausgezoomt, desto gröber die
Gruppierung; beim Hineinzoomen zerfallen die Gruppen und schließlich stehen
einzelne Aufnahmen da.

## Wer sie sehen darf

**Ein eigenes Recht `karte`, kein Selbstläufer.** In `CLAUDE.md` steht, dass
GPS auf privaten Fotos hinter einem öffentlich erreichbaren Tunnel heißt: die
Wohnadresse steht in den Daten – die Karte sei deshalb „im Zweifel nur für
Verwalter". Genau so ist es umgesetzt: Verwalter dürfen ohnehin alles, ein
Betrachter sieht die Karte erst, wenn ein Verwalter ihm das Recht in
`/verwaltung/benutzer` gibt. Die Vorgabe bleibt damit „nein", ohne dass eine
Meinungsänderung eine Codeänderung braucht.

Wie berechtigt die Sorge ist, zeigt der Bestand: **5.247 der 15.083 verorteten
Aufnahmen liegen in einem Umkreis von fünfzig Metern um denselben Punkt.** Wer
die Karte aufmacht und einmal hineinzoomt, liest die Hausnummer.

Geprüft: Betrachter ohne Recht → Seite 404, `/api/karte` 403, Menüpunkt fehlt.
Recht in der Verwaltung erteilt → Seite 200, API 200, Menüpunkt da. Wieder
entzogen → wieder 404/403. Ohne Anmeldung: Seite 307 zur Anmeldung, API 401.

## Gruppiert wird auf dem Server

Alle Punkte in den Browser zu laden und dort zu gruppieren (etwa mit
Leaflet.markercluster) trägt bei 15.083 Punkten nicht, erst recht nicht auf
einem Telefon. Stattdessen meldet der Browser Ausschnitt und Zoomstufe,
`/api/karte` antwortet mit den Gruppen für genau diesen Ausschnitt. Was über
die Leitung geht, hängt damit an der Bildschirmfläche und nicht an der
Bestandsgröße – für ganz Deutschland sind es **4 kB für 11.436 Aufnahmen**.

**Kein PostGIS.** Eine Gitterrechnung genügt; der Teilindex `bild_gps_idx`
(`(lat, lon) WHERE gps_status = 'ok'`) ist seit Migration 001 da und wird
benutzt.

### Das Gitter liegt in Mercator-Koordinaten, nicht in Grad

Ein Gitter aus gleichen Gradzahlen ist auf dem Bildschirm kein Quadrat: bei
54 Grad Nord deckt ein Breitengrad rund anderthalbmal so viele Bildpunkte ab
wie ein Längengrad. Die Zellen wären hochkant, und die Gruppen fielen senkrecht
stärker zusammen als waagerecht. Gruppiert wird deshalb über
`ln(tan(pi()/4 + radians(lat)/2))` und `radians(lon)` – in genau den
Koordinaten, in denen die Karte gezeichnet wird.

Die Zellweite hängt an einer Stelle (`zellweite()` in `src/lib/karte.ts`) und
folgt aus der Zoomstufe: die Welt ist auf Stufe z genau 256·2^z Punkte breit
und umfasst 2π im Bogenmaß, eine Zelle soll 72 Punkte haben.

### Der Marker sitzt auf dem Schwerpunkt

`avg(lat), avg(lon)` der Gruppe, nicht die Zellmitte – sonst stünden die Punkte
sichtbar auf einem Raster statt dort, wo fotografiert wurde.

**Der Preis dafür:** zwei benachbarte Zellen können ihre Schwerpunkte dicht
beieinander haben, und dann überdecken sich die Kreise teilweise. Deshalb
sinken große Gruppen nach unten (`zIndexOffset`), einzelne Aufnahmen liegen
ganz oben: ein kleiner Kreis kann einen großen nie ganz verdecken, umgekehrt
schon. Wer den verdeckten trotzdem nicht trifft, klickt den davorliegenden –
auch der zoomt hinein, und eine Stufe weiter stehen beide getrennt.

### Eine Gruppe mit einer Aufnahme ist keine Gruppe

Zellen mit `count(*) = 1` kommen als Aufnahme zurück, mit Datum und
Vorschaubild, nicht als Kreis mit der Zahl 1. Geprüft über alle Stufen von 4
bis 19 über Norderstedt: **0 Gruppen mit genau einer Aufnahme.**

### Ab 150 Aufnahmen im Ausschnitt wird gar nicht mehr gruppiert

Das ist die einzige Regel für den Übergang, und sie hängt an der Anzahl, nicht
an der Zoomstufe. „Ab Stufe 19 einzeln" wäre an genau einer Stelle falsch:
dort, wo 2.767 Aufnahmen auf zwanzig Metern liegen. So zerfällt umgekehrt jede
Gruppe beim Hineinzoomen irgendwann von selbst, ohne Sonderfall.

**Eine Sackgasse bleibt:** über dem dichtesten Punkt steht auf der feinsten
Stufe (19) immer noch eine Gruppe von 2.121. Enger liegen die Koordinaten
beieinander, als OpenStreetMap-Kacheln auflösen. Ein Klick darauf sagt das –
„2.121 Aufnahmen an nahezu derselben Stelle. Weiter zerfällt diese Gruppe
nicht" – und zeigt eine Aufnahme daraus, statt ins Leere zu führen.

## Filter: dieselbe Bedingung wie in der Galerie

`bedingung()` aus `src/lib/galerie.ts`, mit `ausser: "ort"`, plus
`gps_status = 'ok'`. Keine zweite Fassung – zwei Formulierungen laufen
auseinander, und dann zeigt die Karte etwas anderes als die Galerie.
`geloescht_am IS NULL` bringt `bedingung()` mit.

Der Ortsfilter der Galerie fällt weg: „ohne Ort" wäre auf der Karte kein
Filter, sondern eine leere Fläche. Ein `ort=ohne` aus der Galerie wird beim
Betreten der Karte zurückgesetzt und taucht in keiner Kartenadresse auf.

Geprüft, Karte gegen Datenbank gegen Galerie:

| Filter | Karte | Datenbank | Galerie „mit Ort" |
|---|---|---|---|
| ohne Einschränkung | 15.083 | 15.083 | 15.083 |
| `jahr=2026` | 607 | 607 | 607 |
| `jahr=2025` | 1.801 | 1.801 | 1.801 |
| `typ=video` | 709 | 709 | 709 |
| `jahr=2026&monat=7` | 82 | 82 | – |
| `typ=bild&jahr=2024` | 2.885 | 2.885 | – |
| `herkunft=fremd` | 0 | 0 | – |

Und: eine Aufnahme vorgemerkt → sie verschwindet sofort von der Karte
(15.083 → 15.082), Vormerkung zurückgenommen → sie ist wieder da.

## Wie viele Aufnahmen keinen Ort haben, steht auf der Seite

Unter der Karte, mit der Zahl des aktuellen Filters und einem Verweis in die
Galerie. Ohne diese Zeile hält man die Karte für vollständig und sucht ein
Bild, das dort nie erscheinen wird. Ohne Filter sind es **1.149 von 16.232
(7 %)**: 410 ohne Koordinate in der Datei, 739 mit einer Koordinate, die beim
Einlesen als unplausibel verworfen wurde.

## Ausschnitt und Zoomstufe stehen in der Adresse

`lat`, `lon`, `z` – die **Mitte**, nicht der Rahmen: der Rahmen hängt an der
Fenstergröße, und dieselbe Adresse zeigte auf dem Telefon sonst einen anderen
Ort als auf dem Rechner. Geschrieben wird mit `history.replaceState`, nicht mit
`pushState`: ein Verlaufseintrag je Kartenbewegung machte den Zurück-Knopf
unbrauchbar.

Geprüft: Karte irgendwohin gezoomt, Adresse in ein zweites Fenster kopiert –
derselbe Ausschnitt, dieselben 43 Punkte. Aus der Einzelansicht führt „zurück
zur Karte" auf die Stelle zurück, von der man kam; der Zurück-Knopf des
Browsers ebenso.

**Filterklicks behalten den Ausschnitt.** Die Filterleiste wird auf dem Server
gerendert, mit dem Ausschnitt, der beim Seitenaufruf in der Adresse stand –
danach verschiebt die Karte die Adresse fortlaufend. `Ausschnittverweise`
vervollständigt den Verweis deshalb erst beim Klicken. Ohne JavaScript
funktioniert er weiterhin, nur ohne Ausschnitt; ohne JavaScript gibt es aber
ohnehin keine Karte.

## Kein Rückwärtssuchen nach Ortsnamen

Zu jeder Gruppe „Wien" oder „Norderstedt" anzuzeigen wäre verlockend. Es hieße
aber, private Aufnahmekoordinaten – darunter die eigene Wohnung – einzeln an
einen fremden Dienst zu schicken. Es gibt deshalb **keinen** Aufruf mit
Koordinaten nach außen. Die Kachelschicht fragt Bilder nach Zoomstufe, Spalte
und Zeile; daraus ist ablesbar, welcher Ausschnitt betrachtet wird, mehr nicht.

Die Namensnennung von OpenStreetMap hängt an der Kachelschicht und ist damit
da, solange die Karte da ist.

## Nicht bei jeder Bewegung nachladen

350 ms nach dem letzten `moveend`, und der vorige Zug wird abgebrochen
(`AbortController`) statt abgewartet – sonst kann eine alte Antwort eine neue
überschreiben und die Karte zeigt Punkte eines Ausschnitts, der nicht mehr zu
sehen ist.

Nachgemessen im Browser:

| Bedienung | Anfragen an `/api/karte` |
|---|---|
| Seite laden | 1 |
| ein Zug über 40 Zwischenschritte (2,3 s) | 1 |
| fünf Züge schnell hintereinander | 1 |
| sechs Zoomschritte hintereinander | 1 |

## Antwortzeiten

Zehn Messungen je Ausschnitt, nach drei Aufwärmläufen, Median:

| Ausschnitt | Zeit | Inhalt | JSON |
|---|---|---|---|
| ganz Europa, Stufe 4 | 11,8 ms | 15.083 → 7 Gruppen | 1,3 kB |
| ganz Deutschland, Stufe 6 | 11,9 ms | 11.436 → 22 Gruppen + 1 einzeln | 4,0 kB |
| ganz Deutschland, Stufe 9 | 12,1 ms | 11.436 → 54 Gruppen + 5 einzeln | 10,1 kB |
| Norderstedt, Stufe 14 | 9,1 ms | 7.523 → 40 Gruppen + 9 einzeln | 8,0 kB |
| eine Straße, Stufe 19 | 9,5 ms | 5.388 → 22 Gruppen + 7 einzeln | 4,6 kB |
| Weltrahmen + Stufe 19 (von Hand gebaut) | 27,2 ms | Notbremse bei 2.000 Zellen | 302 kB |

Die Zusammenfassung passiert in der Datenbank, nicht in Node: für ganz
Deutschland kommt **eine Zeile je Zelle** heraus, 23 statt 11.436
(`HashAggregate` über einem `Seq Scan` – bei 65 % Trefferquote der richtige
Plan). Für einen Straßenzug greift der Teilindex: `Bitmap Index Scan on
bild_gps_idx`, 4,4 ms.

Die Notbremse (`HOECHSTENS_ZELLEN = 2000`) ist im Betrieb unerreichbar – mehr
Zellen als Bildschirmfläche gibt es nicht. Sie fängt den von Hand gebauten
Aufruf ab und sagt es in der Antwort (`abgeschnitten`).

## Mobil

Gemessen mit 390 × 844 und Toucheingabe (Chromium-Emulation, **kein echtes
Telefon** – ich habe keins):

- kein waagerechter Überlauf
- die Karte beginnt bei 230 px und ist 524 px hoch – ganz im Bild, samt der
  Namensnennung unten rechts
- Zoomknöpfe 42 × 42 statt Leaflets 30 × 30. Der zusätzliche Vorfahre in der
  CSS-Regel ist nötig: Leaflet bringt dieselbe Regel mit, sie hat dieselbe
  Spezifität und steht im gebauten Stylesheet dahinter
- Marker 38 bis 52 px
- Bedienelemente oben links und unten rechts, die Daumenmitte unten bleibt frei
- der Maßstab entfällt auf schmalen Schirmen: er sitzt unten links und
  überlappte die Namensnennung
- die Filterleiste ist zugeklappt, sonst bliebe für die Karte nichts übrig
- die Kopfleiste ist auf schmalen Schirmen enger gesetzt; mit dem neuen
  Menüpunkt umbrach sie sonst in drei Zeilen und schob die Karte aus dem Bild

**Nicht geprüft:** Zoomen mit zwei Fingern auf echter Hardware. Die Emulation
kennt kein Pinch; `touchZoom` steht auf Leaflets Vorgabe.

---

# Jahresfreischaltung je Benutzer (Phase 6)

Ein Konto sieht nur die Jahrgänge, die für es freigeschaltet sind. Anlass: für den
Kalender bekommt jemand von außen Zugriff auf genau das Jahr, aus dem der Kalender
entsteht.

`benutzer.jahre` (Migration **006**, nicht 005 – die Nummer war beim Schreiben des
Auftrags schon von der Verarbeitung belegt):

| Wert | Bedeutung |
|---|---|
| `NULL` | alle Jahre, **auch künftige** – Vorgabe und Normalfall |
| `{2025,2026}` | genau diese |
| `{}` | keines |

**Der Unterschied zwischen `NULL` und einer Liste aller heutigen Jahre ist der ganze
Punkt.** Bei `NULL` erscheint ein neuer Jahrgang von selbst, sobald die ersten Bilder
daraus eingelesen sind. Nachgemessen mit einer Attrappe aus 2027: bei `NULL` stand
`2027 1` sofort im Jahresfilter, bei `{2025,2026}` nicht, beim Verwalter wieder ja.

**Ein Verwalter ist nie eingeschränkt**, unabhängig vom Feld. Das entscheidet
`sichtVon()` und niemand sonst. Geprüft mit einem Verwalterkonto, in dessen Feld
`{2019}` steht: es sieht alle 16.232 Aufnahmen und alle acht Jahrgänge.

## Durchgesetzt an einer Stelle – und der Übersetzer hat dabei geholfen

`src/lib/sichtbar.ts` hatte bisher zwei exportierte Zeichenketten, `NICHT_GELOESCHT`
und `VORGEMERKT`. Die sind jetzt modulintern; nach außen gibt es nur noch
`sichtbar(sicht)` und `vorgemerktSichtbar(sicht)`, beide mit einem Argument, das nur
hat, wer weiß, für wen die Abfrage läuft. Ebenso `bedingung(filter, sicht, ausser)` in
`galerie.ts`.

Das war kein Stilentscheid: **solange die Konstante frei herumlag, konnte jede neue
Abfrage sie einsetzen und die Jahresfreischaltung daneben vergessen.** Beim Umbau hat
`tsc` die zwanzig betroffenen Stellen in zwölf Dateien selbst aufgezählt, statt dass
jemand sie suchen musste.

Alle Wege zu einem Bild laufen jetzt darüber:

| Weg | geprüft mit einem Konto, das nur `{2025}` hat |
|---|---|
| `/datei/<id>/vorschau` aus 2024 | **404** (2025: 200) |
| `/datei/<id>/ansicht` aus 2024 | **404** (2025: 200) |
| `/datei/<id>/wiedergabe` aus 2024 | **404** |
| `/bild/<id>` aus 2024 | **404** (2025: 200) |
| `/herunterladen/bild/<id>` aus 2024 | **404** (2025: 200) |
| `POST /api/bild/<id>/wiedergabe`, Video aus 2024 | **404**, ohne ffmpeg anzuwerfen |
| `/api/karte` | 1.801 – genau die verorteten Aufnahmen aus 2025 |
| Galerie | 1.884 – genau der Bestand 2025, Jahresfilter bietet nur 2025 an |
| Übersicht | „Für dich freigeschaltet sind 1.884 Aufnahmen", Tabelle nur mit 2025 |

**Der wichtigste Ort ist `/datei/…`**, nicht die Galerie. Alles andere verbirgt Bilder
in einer Anzeige; dort gehen sie über die Leitung.

**Vormerken und Zurückholen zählen mit dazu.** Was jemand nicht sehen darf, darf er
auch nicht löschen. Nachgemessen: auf der Einzelansicht eines erlaubten Bildes das
versteckte Feld `bild` auf eine Kennung aus 2024 umgeschrieben und abgeschickt – die
Action lief, `geloescht_am` blieb `NULL`. Dasselbe Formular unverändert auf dem
erlaubten Bild hat gesetzt; die Abweisung lag also an der Bedingung und nicht an einem
kaputten Formular.

## Plattenzahlen fallen weg, nicht nur Bildzahlen

Die Übersicht nennt sonst die Größe der Ableitungen und die Belegung von
`/data/kajoe_bilder`. Diese Zahlen zählen Dateien und lassen sich nicht je Jahrgang
trennen – wer nur 2025 sehen darf, läse daran den Umfang des ganzen Bestands ab.
Sie entfallen deshalb, sobald jemand eingeschränkt ist. Geprüft: der Abschnitt
„Platte" fehlt bei einem eingeschränkten Konto.

## Auswahllisten: die Bilder bleiben drin, und die Liste sagt es

Wird ein Jahr gesperrt, verschwinden seine Bilder aus der Anzeige und aus dem Paket –
aus `auswahl_bild` verschwindet nichts. Nach der Freischaltung sind sie wieder da.

Deshalb trägt `Liste` zwei Zahlen: `anzahl` (alles, was drinsteht und nicht vorgemerkt
ist) und `verfuegbar` (was diese Person davon sehen darf). Beide kommen aus derselben
Abfrage, `nurJahre()` steckt nur im zweiten Teilzähler.

Geprüft mit einer Liste aus 12 Bildern von 2024 und 43 von 2025, Konto auf `{2025}`:

- Listenansicht: „**55 Bilder, davon 12 derzeit nicht verfügbar.**"
- 43 Kacheln
- Paketzeile: „43 Aufnahmen in dieser Liste … **12 weitere** stehen in der Liste, sind
  aber derzeit nicht freigeschaltet und kommen nicht mit ins Paket."
- Das heruntergeladene ZIP: **43 Einträge, alle mit `2025-` im Dateinamen**, 374 MB
- Listenübersicht: „55 (12 gesperrt)"

## Bedienung

Eine aufklappbare Zeile je Konto in `/verwaltung/benutzer`, mit einem Schalter
**„Alle Jahre, auch künftige"** und darunter einem Kästchen je Jahr. Die Jahre kommen
aus `SELECT DISTINCT jahr FROM bild`, mit der Anzahl daneben – nicht aus einer Liste im
Code, die jemand nachführen müsste.

**Welche Zeile offen ist, steht in der Adresse** (`?jahre=15#b15`), nicht in einem
`<details>`, das der Server nachträglich aufziehen müsste. In der Tabelle steht bei
einem eingeschränkten Konto, **welche** Jahre es sind, nicht nur „eingeschränkt".

### Die `defaultChecked`-Falle, zum zweiten Mal

React setzt beim Aktualisieren nur das **Attribut** `defaultChecked`, nicht die
tatsächliche Ankreuzung des Feldes. Bleibt dasselbe Formular stehen, zeigt es nach dem
Übernehmen weiter die alten Haken – etwa, wenn „Alle Jahre" die einzeln angekreuzten
überstimmt hat. Das Formular trägt deshalb einen Schlüssel, in dem der gespeicherte
Wert steckt (`j15-2019_2023_2025` bzw. `j15-alle`): ändert er sich, wirft React die
Felder weg und baut sie neu.

Nachgemessen im Browser, mit einer Gegenprobe in der Datenbank nach jedem Schritt:

| Schritt | Anzeige | Datenbank |
|---|---|---|
| Ausgangslage | „2025" | `{2025}` |
| 2023 und 2019 dazu | „2019, 2023, 2025" | `{2019,2023,2025}` |
| „Alle Jahre" an | „alle, auch künftige" | `NULL` |
| Kästchen danach | **alle leer**, Schalter an | – |
| alles abwählen | „keine" | `{}` |
| wieder 2025 | „2025" | `{2025}` |

Ohne den Schlüssel hätten in der vierten Zeile noch 2019, 2023 und 2025 angehakt
dagestanden, obwohl sie nichts mehr bedeuten.

## Wirkt sofort, ohne Neuanmeldung

Die Jahrgänge kommen bei **jedem** Aufruf frisch aus der Datenbank, wie die Rechte und
wie `aktiv`. Gemessen in ein und derselben Sitzung, ohne dazwischen neu anzumelden:

| gesetzt auf | Karte | `/datei` 2024 | `/datei` 2025 | `/bild` 2024 |
|---|---|---|---|---|
| `{2025}` | 1.801 | 404 | 200 | 404 |
| `{2024,2025}` | 4.807 | 200 | 200 | 200 |
| `{}` | 0 | 404 | 404 | 404 |
| `NULL` | 15.083 | 200 | 200 | 200 |
| `{2025}` | 1.801 | 404 | 200 | 404 |

## Kein Jahrgang freigeschaltet ist kein Fehler

`{}` ist ein gültiger Zustand: das Konto darf sich anmelden und sieht nichts. Ohne
Hinweis stünde dort „Zu diesen Filtern gibt es nichts", und die Person suchte am Filter
herum. Stattdessen steht auf Übersicht, Galerie und Karte ein eigener Satz
(`src/app/keinjahr.tsx`). Alle drei Seiten antworten dabei mit **200**, keine
Fehlerseite.

## Von der Kommandozeile

    tools/benutzer.sh jahre <name> alle          # NULL: alle Jahre, auch künftige
    tools/benutzer.sh jahre <name> 2024,2025
    tools/benutzer.sh jahre <name> keine

`tools/benutzer.sh liste` zeigt die Spalte mit. Der Weg für den Alltag ist die
Benutzerverwaltung; dieser hier ist der Rückweg, wenn niemand mehr hineinkommt – so wie
das erste Konto auch dort und nirgends sonst entsteht. Ein Jahr, das es im Bestand noch
nicht gibt, wird angenommen und nur angemerkt: einen kommenden Jahrgang vorab
freizuschalten ist sinnvoll.
