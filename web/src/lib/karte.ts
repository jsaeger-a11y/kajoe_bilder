/**
 * Die Karte: Gruppierung der Aufnahmeorte, auf dem Server gerechnet.
 *
 * Der naheliegende Weg waere, alle Punkte in den Browser zu laden und dort zu
 * gruppieren. Bei 15.083 verorteten Aufnahmen traegt das nicht – erst recht
 * nicht auf einem Telefon, und das ist der wichtigere Fall. Stattdessen meldet
 * der Browser Ausschnitt und Zoomstufe, und der Server antwortet mit den
 * Gruppen fuer genau diesen Ausschnitt. Was ueber die Leitung geht, ist damit
 * nicht mehr an die Bestandsgroesse gebunden, sondern an die Bildschirmflaeche:
 * mehr Zellen als auf den Schirm passen, kann es nicht geben.
 *
 * KEIN PostGIS. Eine Gitterrechnung ueber gerundete Koordinaten genuegt und
 * kommt ohne Erweiterung aus; der Teilindex `bild_gps_idx` ist vorhanden.
 *
 * Gefiltert wird mit DERSELBEN Bedingung wie in der Galerie – `bedingung()`
 * aus `galerie.ts`, nicht mit einer zweiten Fassung davon. Zwei Formulierungen
 * laufen auseinander, und dann zeigt die Karte etwas anderes als die Galerie.
 */

import "server-only";

import { abfrage, eineZeile } from "./db";
import { bedingung, suchtext, type Filter } from "./galerie";

/**
 * Zoomstufen. 2 zeigt die ganze Welt, 19 ist die feinste Stufe, fuer die es
 * OpenStreetMap-Kacheln gibt. Die Grenzen stehen hier und werden an die
 * Leaflet-Karte durchgereicht, damit Browser und Server nicht getrennt
 * voneinander entscheiden, wie weit hineingezoomt werden darf.
 */
export const ZOOM_MIN = 2;
export const ZOOM_MAX = 19;

/**
 * Kantenlaenge einer Gitterzelle in Bildschirmpunkten.
 *
 * 72 Punkte sind etwas mehr als ein Markerdurchmesser (44 Punkte, die uebliche
 * Mindestgroesse fuer einen Fingertipp). Damit stehen die Marker auseinander,
 * ohne dass die Karte leer wirkt.
 */
const ZELLE_PUNKTE = 72;

/** Eine Kachel ist 256 Punkte breit – daraus ergibt sich der Massstab. */
const KACHEL_PUNKTE = 256;

/**
 * Bis zu so vielen Aufnahmen im Ausschnitt wird nicht gruppiert, sondern jede
 * einzeln gezeigt.
 *
 * Das ist die einzige Regel fuer den Uebergang von Gruppen zu Einzelaufnahmen,
 * und sie haengt bewusst an der Anzahl und nicht an der Zoomstufe. Eine Regel
 * "ab Stufe 19 einzeln" waere an genau einer Stelle falsch: dort, wo 2.767
 * Aufnahmen auf zwanzig Metern liegen. Umgekehrt zerfaellt so jede Gruppe
 * irgendwann beim Hineinzoomen von selbst, ohne Sonderfall.
 */
export const EINZELN_BIS = 150;

/**
 * Notbremse fuer die Zellzahl.
 *
 * Im Normalfall unerreichbar: mehr Zellen als Bildschirmflaeche gibt es nicht.
 * Ein selbstgebauter Aufruf mit weltweitem Rahmen und Stufe 19 kaeme aber
 * darauf, und ohne Grenze rechnete der Server dann Millionen Zellen zusammen.
 */
const HOECHSTENS_ZELLEN = 2000;

/**
 * Kantenlaenge einer Zelle im Mercator-Bogenmass.
 *
 * Gerechnet wird NICHT in Grad. Ein Gitter aus gleichen Gradzahlen ist auf dem
 * Bildschirm kein Quadrat: bei 54 Grad Nord deckt ein Breitengrad rund
 * anderthalbmal so viele Bildpunkte ab wie ein Laengengrad, die Zellen waeren
 * also hochkant und die Gruppen wuerden senkrecht staerker zusammenfallen als
 * waagerecht. In Mercator-Koordinaten – genau denen, in denen die Karte
 * gezeichnet wird – ist die Zelle auf jeder Breite quadratisch.
 *
 * Die Welt ist auf Stufe z genau KACHEL_PUNKTE * 2^z Punkte breit und umfasst
 * 2*pi im Bogenmass. Daraus folgt die Umrechnung unmittelbar.
 */
export function zellweite(zoom: number): number {
  return (ZELLE_PUNKTE * 2 * Math.PI) / (KACHEL_PUNKTE * 2 ** zoom);
}

export interface Rahmen {
  sued: number;
  nord: number;
  west: number;
  ost: number;
}

export interface Gruppe {
  /** Schwerpunkt, NICHT die Zellmitte – sonst stehen die Punkte sichtbar auf einem Raster. */
  lat: number;
  lon: number;
  anzahl: number;
  /** Eine Aufnahme aus der Gruppe, fuer das Vorschaubild. */
  beispiel: number;
  /** Tatsaechliche Ausdehnung der Gruppe – daraufhin zoomt der Klick. */
  rahmen: Rahmen;
}

export interface Aufnahme {
  id: number;
  lat: number;
  lon: number;
  typ: string;
  /** Fertig gesetzter Text, damit der Browser die Zeitzonenfalle nicht wiederholt. */
  wann: string;
}

export interface Ausschnittsantwort {
  zoom: number;
  imAusschnitt: number;
  gruppen: Gruppe[];
  aufnahmen: Aufnahme[];
  /** Nur bei der Notbremse wahr; dann fehlen Zellen in der Antwort. */
  abgeschnitten: boolean;
}

/** Ganzzahl aus einem Suchwert, sonst der Ersatzwert. */
function ganz(wert: string | null, von: number, bis: number, ersatz: number): number {
  const n = Number(wert);
  if (!Number.isFinite(n)) return ersatz;
  return Math.min(bis, Math.max(von, Math.round(n)));
}

function kommazahl(wert: string | null, von: number, bis: number): number | null {
  if (wert === null || wert === "") return null;
  const n = Number(wert);
  if (!Number.isFinite(n) || n < von || n > bis) return null;
  return n;
}

type Suchwerte = Record<string, string | string[] | undefined>;

function eins(wert: string | string[] | undefined): string | null {
  if (Array.isArray(wert)) return wert[0] ?? null;
  return wert ?? null;
}

export function zoomAusSuche(suche: Suchwerte): number {
  return ganz(eins(suche.z), ZOOM_MIN, ZOOM_MAX, ZOOM_MIN);
}

/**
 * Mitte und Zoomstufe aus der Adresse.
 *
 * Ausschnitt und Zoomstufe gehoeren in die Adresse, wie die Filter in der
 * Galerie: sonst laesst sich eine Ansicht nicht wiederfinden, und der
 * Zurueck-Knopf aus der Einzelansicht landet auf einer Karte, die irgendwo
 * steht. Gespeichert wird die MITTE und nicht der Rahmen – der Rahmen haengt
 * an der Fenstergroesse, und dieselbe Adresse auf dem Telefon zeigte sonst
 * einen anderen Ort als auf dem Rechner.
 */
export function mitteAusSuche(
  suche: Suchwerte,
): { lat: number; lon: number; zoom: number } | null {
  const lat = kommazahl(eins(suche.lat), -85, 85);
  const lon = kommazahl(eins(suche.lon), -180, 180);
  if (lat === null || lon === null) return null;
  return { lat, lon, zoom: zoomAusSuche(suche) };
}

/**
 * Der Kartenteil einer Adresse, aus beliebigen Suchwerten zurueckgewonnen.
 *
 * Gebraucht in der Einzelansicht, um zur Karte zurueckzufuehren. Uebernommen
 * werden AUSSCHLIESSLICH lat, lon und z, und auch die nur nach Pruefung –
 * alles andere aus der Adresse bleibt draussen. Der Ortsfilter faellt weg,
 * weil die Karte ihn nicht kennt.
 */
export function karteAusschnitt(suche: Suchwerte, filter: Filter): string {
  const mitte = mitteAusSuche(suche);
  const zusatz = mitte
    ? [`lat=${mitte.lat}`, `lon=${mitte.lon}`, `z=${mitte.zoom}`]
    : [];
  return suchtext({ ...filter, ort: "alle", seite: 1 }, {}, zusatz);
}

/**
 * Rahmen aus den Suchwerten einer Kartenabfrage.
 *
 * Leaflet liefert beim Ueberschreiten des 180. Laengengrades Werte ausserhalb
 * von -180..180. Statt den Sonderfall zu behandeln, wird auf den gueltigen
 * Bereich beschnitten: der Bestand liegt zwischen -15,8 und 14,8 Grad Ost, und
 * eine Karte, die um die halbe Welt gezogen wurde, zeigt danach ohnehin nur
 * leere Flaeche.
 */
export function rahmenAusSuche(suche: Suchwerte): Rahmen {
  const sued = kommazahl(eins(suche.s), -90, 90) ?? -85;
  const nord = kommazahl(eins(suche.n), -90, 90) ?? 85;
  const west = kommazahl(eins(suche.w), -180, 180) ?? -180;
  const ost = kommazahl(eins(suche.o), -180, 180) ?? 180;
  return {
    sued: Math.min(sued, nord),
    nord: Math.max(sued, nord),
    west: Math.min(west, ost),
    ost: Math.max(west, ost),
  };
}

/**
 * Die Kartenbedingung: der Galeriefilter plus Ort vorhanden.
 *
 * `ausser: "ort"` laesst den Ortsfilter der Galerie weg. Auf der Karte waere
 * er sinnlos – "ohne Ort" ergaebe eine leere Karte – und `gps_status = 'ok'`
 * steht ohnehin fest. `bedingung()` bringt `geloescht_am IS NULL` mit; eine
 * vorgemerkte Aufnahme verschwindet damit von der Karte, ohne dass es hier
 * noch einmal jemand hinschreiben muss.
 */
function kartenbedingung(filter: Filter): { text: string; werte: unknown[] } {
  const b = bedingung(filter, "ort");
  return { text: `${b.text} AND gps_status = 'ok'`, werte: [...b.werte] };
}

interface Zellzeile {
  anzahl: number;
  lat: number;
  lon: number;
  lat_min: number;
  lat_max: number;
  lon_min: number;
  lon_max: number;
  beispiel: number;
  im_ausschnitt: string;
  zellen: number;
}

interface Bildzeile {
  id: number;
  lat: number;
  lon: number;
  typ: string;
  aufnahme_lokal: Date;
}

/**
 * `aufnahme_lokal` ist ein TIMESTAMP ohne Zeitzone – die Wanduhr am
 * Aufnahmeort. Der Treiber macht daraus ein Date; weil der Dienst und der
 * Verbindungsvorrat auf UTC stehen, stecken die gemeinten Werte in den
 * UTC-Feldern. Genau wie in der Galerie wird deshalb mit getUTC* gelesen.
 */
function wanntext(d: Date): string {
  const t = new Date(d);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${z(t.getUTCDate())}.${z(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}, ${z(t.getUTCHours())}:${z(t.getUTCMinutes())}`;
}

async function aufnahmenZu(
  filter: Filter,
  /** Bekommt die Nummer des ERSTEN freien Platzhalters – sonst raet der
      Aufrufer, wie viele Werte die Filterbedingung schon belegt hat. */
  zusatz: (ab: number) => string,
  zusatzWerte: unknown[],
  grenze: number,
): Promise<Aufnahme[]> {
  const b = kartenbedingung(filter);
  const werte = [...b.werte, ...zusatzWerte];
  const zeilen = await abfrage<Bildzeile>(
    `SELECT id::int AS id, lat, lon, typ, aufnahme_lokal
       FROM bild
      WHERE ${b.text} AND ${zusatz(b.werte.length + 1)}
      ORDER BY aufnahme_lokal DESC, id DESC
      LIMIT ${grenze}`,
    werte,
  );
  return zeilen.map((z) => ({
    id: Number(z.id),
    lat: z.lat,
    lon: z.lon,
    typ: z.typ,
    wann: wanntext(z.aufnahme_lokal),
  }));
}

/**
 * Gruppen (oder Einzelaufnahmen) fuer einen Ausschnitt.
 *
 * Die Gruppierung passiert in der Datenbank, nicht in Node: heraus kommt eine
 * Zeile je Zelle, nicht eine je Aufnahme. `sum(count(*)) OVER ()` zaehlt dabei
 * den ganzen Ausschnitt zusammen, bevor die Notbremse greift – die Zahl unter
 * der Karte stimmt also auch dann, wenn nicht alle Zellen ausgeliefert wurden.
 */
export async function ausschnitt(
  filter: Filter,
  rahmen: Rahmen,
  zoom: number,
): Promise<Ausschnittsantwort> {
  const b = kartenbedingung(filter);
  const n = b.werte.length;
  const werte = [...b.werte, rahmen.sued, rahmen.nord, rahmen.west, rahmen.ost, zellweite(zoom)];
  const imRahmen =
    `lat BETWEEN $${n + 1} AND $${n + 2} AND lon BETWEEN $${n + 3} AND $${n + 4}`;
  const w = `$${n + 5}`;

  const zellen = await abfrage<Zellzeile>(
    `SELECT count(*)::int              AS anzahl,
            avg(lat)                   AS lat,
            avg(lon)                   AS lon,
            min(lat)                   AS lat_min,
            max(lat)                   AS lat_max,
            min(lon)                   AS lon_min,
            max(lon)                   AS lon_max,
            min(id)::int               AS beispiel,
            sum(count(*)) OVER ()      AS im_ausschnitt,
            (count(*)     OVER ())::int AS zellen
       FROM bild
      WHERE ${b.text} AND ${imRahmen}
      GROUP BY floor(ln(tan(pi()/4 + radians(lat)/2)) / ${w}),
               floor(radians(lon) / ${w})
      ORDER BY anzahl DESC
      LIMIT ${HOECHSTENS_ZELLEN}`,
    werte,
  );

  const imAusschnitt = Number(zellen[0]?.im_ausschnitt ?? 0);
  const abgeschnitten = Number(zellen[0]?.zellen ?? 0) > HOECHSTENS_ZELLEN;

  // Wenige genug: jede Aufnahme einzeln, ohne Gruppen. Damit zerfaellt beim
  // Hineinzoomen irgendwann jede Gruppe, und auf der feinsten Stufe stehen
  // Aufnahmen und keine Gruppen mit der Zahl 1.
  if (imAusschnitt > 0 && imAusschnitt <= EINZELN_BIS) {
    const aufnahmen = await aufnahmenZu(
      filter,
      (ab) => `lat BETWEEN $${ab} AND $${ab + 1} AND lon BETWEEN $${ab + 2} AND $${ab + 3}`,
      [rahmen.sued, rahmen.nord, rahmen.west, rahmen.ost],
      EINZELN_BIS,
    );
    return { zoom, imAusschnitt, gruppen: [], aufnahmen, abgeschnitten: false };
  }

  const gruppen: Gruppe[] = [];
  const einzelne: number[] = [];
  for (const z of zellen) {
    if (z.anzahl === 1) {
      einzelne.push(Number(z.beispiel));
      continue;
    }
    gruppen.push({
      lat: z.lat,
      lon: z.lon,
      anzahl: z.anzahl,
      beispiel: Number(z.beispiel),
      rahmen: { sued: z.lat_min, nord: z.lat_max, west: z.lon_min, ost: z.lon_max },
    });
  }

  // Eine Gruppe mit genau einer Aufnahme ist keine Gruppe. Die Einzelnen
  // bekommen deshalb ihre Daten nachgereicht und werden wie Aufnahmen gezeigt.
  const aufnahmen = einzelne.length
    ? await aufnahmenZu(filter, (ab) => `id = ANY($${ab}::bigint[])`, [einzelne], einzelne.length)
    : [];

  return { zoom, imAusschnitt, gruppen, aufnahmen, abgeschnitten };
}

/**
 * Wie viele Aufnahmen unter diesem Filter einen Ort haben – und wie viele nicht.
 *
 * Die zweite Zahl gehoert sichtbar auf die Seite. Wer sie nicht kennt, haelt
 * die Karte fuer den ganzen Bestand und sucht ein Bild, das dort nie
 * erscheinen wird.
 */
export async function ortszahlen(
  filter: Filter,
): Promise<{ mitOrt: number; ohneOrt: number; gesamt: number }> {
  const b = bedingung(filter, "ort");
  const zeile = await eineZeile<{ mit: string; ohne: string }>(
    `SELECT count(*) FILTER (WHERE gps_status = 'ok')  AS mit,
            count(*) FILTER (WHERE gps_status <> 'ok') AS ohne
       FROM bild WHERE ${b.text}`,
    b.werte,
  );
  const mitOrt = Number(zeile?.mit ?? 0);
  const ohneOrt = Number(zeile?.ohne ?? 0);
  return { mitOrt, ohneOrt, gesamt: mitOrt + ohneOrt };
}

/**
 * Der Bereich, in dem unter diesem Filter ueberhaupt Aufnahmen liegen.
 *
 * Damit oeffnet die Karte ohne Ausschnitt in der Adresse so, dass alles zu
 * sehen ist – statt auf einer festen Mitte, die bei einem Urlaubsfilter neben
 * der Sache laege.
 */
export async function startbereich(filter: Filter): Promise<Rahmen | null> {
  const b = kartenbedingung(filter);
  const zeile = await eineZeile<{
    sued: number | null; nord: number | null; west: number | null; ost: number | null;
  }>(
    `SELECT min(lat) AS sued, max(lat) AS nord, min(lon) AS west, max(lon) AS ost
       FROM bild WHERE ${b.text}`,
    b.werte,
  );
  if (!zeile || zeile.sued === null || zeile.west === null) return null;
  return {
    sued: zeile.sued, nord: zeile.nord as number,
    west: zeile.west, ost: zeile.ost as number,
  };
}
