/**
 * Die Gitterzelle der Karte – an EINER Stelle.
 *
 * Die Karte gruppiert Aufnahmeorte in einem Gitter; ein Klick auf eine Gruppe
 * fuehrt in die Galerie, die genau dieselben Aufnahmen zeigen soll. Beide
 * rechnen deshalb aus dieser Datei, nicht jede fuer sich.
 *
 * **Warum das kein Beiwerk ist:** das Gitter liegt in Mercator-Koordinaten und
 * nicht in Grad (siehe CLAUDE.md). Wer den Ausschnitt in der Galerie als
 * Rechteck in Grad nachbaut, bekommt einen leicht anderen – und 43 Punkte auf
 * der Karte gegen 44 Bilder in der Galerie sieht aus wie ein Fehler, auch wenn
 * beide fuer sich richtig rechnen. Zwei Fassungen derselben Rechnung sind hier
 * nicht "etwas doppelt", sondern eine stille Abweichung.
 *
 * Nicht die Bildkennungen wandern in die Adresse: hinter einer Gruppe koennen
 * ueber zweitausend Aufnahmen liegen, die passen in keine Adresse. Es wandert
 * die Zelle: `zelle=<stufe>:<zeile>:<spalte>`.
 */

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

/**
 * Die beiden SQL-Ausdruecke, die eine Zeile ihrer Zelle zuordnen.
 *
 * `weite` ist der Platzhalter, unter dem die Zellweite gebunden ist – also
 * etwa `"$5"`. Sie stehen hier, damit die Karte beim Gruppieren und die
 * Galerie beim Filtern buchstaeblich denselben Ausdruck benutzen.
 */
export function zeileSql(weite: string): string {
  return `floor(ln(tan(pi()/4 + radians(lat)/2)) / ${weite})`;
}

export function spalteSql(weite: string): string {
  return `floor(radians(lon) / ${weite})`;
}

export interface Zelle {
  stufe: number;
  zeile: number;
  spalte: number;
}

export function zelleText(z: Zelle): string {
  return `${z.stufe}:${z.zeile}:${z.spalte}`;
}

/**
 * `<stufe>:<zeile>:<spalte>` einlesen – oder `null`.
 *
 * Alles, was nicht genau so aussieht, faellt weg; eine unbrauchbare Angabe
 * ergibt einen fehlenden Filter und keine Fehlerseite. Zeile und Spalte werden
 * grob begrenzt: die Welt hat auf Stufe z rund 3,6 * 2^z Zellen je Richtung,
 * alles weit darueber ist Unfug und braucht die Datenbank nicht zu belasten.
 */
export function zelleAusText(wert: string | null): Zelle | null {
  if (!wert) return null;
  const teile = wert.split(":");
  if (teile.length !== 3) return null;
  const [s, ze, sp] = teile.map((t) => Number(t));
  if (!Number.isInteger(s) || s < ZOOM_MIN || s > ZOOM_MAX) return null;
  if (!Number.isInteger(ze) || !Number.isInteger(sp)) return null;
  const grenze = 4 * 2 ** s;
  if (Math.abs(ze) > grenze || Math.abs(sp) > grenze) return null;
  return { stufe: s, zeile: ze, spalte: sp };
}

export interface Zellbedingung {
  text: string;
  werte: unknown[];
}

/**
 * WHERE-Teil fuer genau die Aufnahmen einer Zelle.
 *
 * `gps_status = 'ok'` steht mit drin und nicht daneben. Ohne die Bedingung
 * kaemen auch Zeilen mit `unplausibel` durch: die behalten ihre Koordinaten,
 * sie sind nur als unbrauchbar erkannt. Auf der Karte sind sie nicht zu sehen,
 * in der Galerie waeren sie es dann – und niemand kaeme darauf, warum.
 *
 * `ab` ist die Nummer des ersten freien Platzhalters.
 */
export function zellbedingung(z: Zelle, ab: number): Zellbedingung {
  const w = `$${ab}`;
  return {
    text:
      `gps_status = 'ok' AND ${zeileSql(w)} = $${ab + 1} AND ${spalteSql(w)} = $${ab + 2}`,
    werte: [zellweite(z.stufe), z.zeile, z.spalte],
  };
}

/**
 * Die Mitte einer Zelle in Grad – fuer den Weg zurueck auf die Karte.
 *
 * Die Umkehrung der Mercator-Rechnung. So braucht der Verweis zurueck keine
 * zusaetzlichen Angaben in der Adresse: die Zelle sagt bereits, wo die Karte
 * stand und wie weit sie gezoomt war.
 */
export function zellmitte(z: Zelle): { lat: number; lon: number; zoom: number } {
  const w = zellweite(z.stufe);
  const y = (z.zeile + 0.5) * w;
  const lat = ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;
  const lon = (((z.spalte + 0.5) * w) * 180) / Math.PI;
  return { lat, lon, zoom: z.stufe };
}
