/** Zahlen fuer die Uebersicht. */

import "server-only";

import { readdir, stat, statfs } from "node:fs/promises";
import { join } from "node:path";

import { abfrage, eineZeile } from "./db";
import { ABGELEITET, DATEN } from "./dateien";
import { eingeschraenkt, sichtbar, type Sicht } from "./sichtbar";

export interface Ueberblick {
  gesamt: number;
  jeJahr: { jahr: number; anzahl: number; bilder: number; videos: number }[];
  jeHerkunft: { herkunft: string; anzahl: number }[];
  bilder: number;
  videos: number;
  mitOrt: number;
  ohneExifZeit: number;
  originalBytes: number;
  /**
   * Groesse der Ableitungen und Plattenbelegung – `null`, sobald jemand auf
   * einzelne Jahrgaenge eingeschraenkt ist. Diese Zahlen lassen sich nicht je
   * Jahr trennen: sie zaehlen Dateien auf der Platte, nicht Zeilen. Sie
   * unveraendert anzuzeigen hiesse, den Umfang des ganzen Bestands zu
   * verraten – auch den der gesperrten Jahrgaenge.
   */
  abgeleitetBytes: number | null;
  platteGesamt: number | null;
  platteFrei: number | null;
  wiedergabeErzeugt: number;
  /** Sagt der Anzeige, dass die Zahlen nicht den ganzen Bestand meinen. */
  jahreEingeschraenkt: boolean;
}

// Der Durchlauf ueber abgeleitet/ kostet bei 1.844 Dateien nichts, bei 28.000
// schon etwas. Zehn Minuten Gedaechtnis reichen: die Zahl aendert sich nur,
// wenn ein Ingest gelaufen ist.
let gemerkt: { zeitpunkt: number; bytes: number } | null = null;
const GEDAECHTNIS_MS = 10 * 60 * 1000;

/**
 * Nur die drei Arten, die der Ingest und die Ableitung wirklich anlegen.
 *
 * Gezaehlt wird nach Namensmuster und nicht einfach alles im Ordner: liegt dort
 * versehentlich etwas anderes – beim Schreiben dieser Zeilen waren es 8.486
 * Originale aus einer Uebertragung, die im falschen Verzeichnis landete –,
 * meldet die Uebersicht sonst 35 GB Ableitungen statt 400 MB.
 */
const ABLEITUNG = /-(vorschau|ansicht)\.jpg$|-wiedergabe\.mp4$/;

async function ordnergroesse(wurzel: string): Promise<number> {
  let summe = 0;
  const zu_tun = [wurzel];
  while (zu_tun.length) {
    const ordner = zu_tun.pop()!;
    let eintraege;
    try {
      eintraege = await readdir(ordner, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of eintraege) {
      const pfad = join(ordner, e.name);
      if (e.isDirectory()) zu_tun.push(pfad);
      else if (e.isFile() && ABLEITUNG.test(e.name)) {
        try {
          summe += (await stat(pfad)).size;
        } catch {
          /* verschwunden – zaehlt nicht */
        }
      }
    }
  }
  return summe;
}

/** Nach einer neuen Wiedergabefassung stimmt der gemerkte Wert nicht mehr. */
export function vergissAbgeleitetGroesse(): void {
  gemerkt = null;
}

async function abgeleitetGroesse(): Promise<number> {
  if (gemerkt && Date.now() - gemerkt.zeitpunkt < GEDAECHTNIS_MS) return gemerkt.bytes;
  const bytes = await ordnergroesse(ABGELEITET);
  gemerkt = { zeitpunkt: Date.now(), bytes };
  return bytes;
}

export async function ueberblick(sicht: Sicht): Promise<Ueberblick> {
  const s = sichtbar(sicht);
  const knapp = eingeschraenkt(sicht);

  const [jahre, herkuenfte, summen, platte, abgeleitet] = await Promise.all([
    abfrage<{ jahr: number; anzahl: string; bilder: string; videos: string }>(
      `SELECT jahr, count(*) AS anzahl,
              count(*) FILTER (WHERE typ = 'bild')  AS bilder,
              count(*) FILTER (WHERE typ = 'video') AS videos
         FROM bild WHERE ${s.text} GROUP BY jahr ORDER BY jahr DESC`,
      s.werte,
    ),
    abfrage<{ herkunft: string; anzahl: string }>(
      `SELECT herkunft, count(*) AS anzahl FROM bild WHERE ${s.text}
        GROUP BY herkunft ORDER BY count(*) DESC`,
      s.werte,
    ),
    eineZeile<{
      gesamt: string; bilder: string; videos: string; mit_ort: string;
      ohne_exif_zeit: string; original_bytes: string; wiedergabe: string;
    }>(
      `SELECT count(*)                                        AS gesamt,
              count(*) FILTER (WHERE typ = 'bild')            AS bilder,
              count(*) FILTER (WHERE typ = 'video')           AS videos,
              count(*) FILTER (WHERE gps_status = 'ok')       AS mit_ort,
              count(*) FILTER (WHERE zeitquelle <> 'exif')    AS ohne_exif_zeit,
              coalesce(sum(dateigroesse), 0)                  AS original_bytes,
              count(*) FILTER (WHERE wiedergabe_erzeugt)      AS wiedergabe
         FROM bild WHERE ${s.text}`,
      s.werte,
    ),
    knapp ? null : statfs(DATEN),
    knapp ? null : abgeleitetGroesse(),
  ]);

  return {
    gesamt: Number(summen?.gesamt ?? 0),
    jeJahr: jahre.map((j) => ({
      jahr: j.jahr, anzahl: Number(j.anzahl),
      bilder: Number(j.bilder), videos: Number(j.videos),
    })),
    jeHerkunft: herkuenfte.map((h) => ({ herkunft: h.herkunft, anzahl: Number(h.anzahl) })),
    bilder: Number(summen?.bilder ?? 0),
    videos: Number(summen?.videos ?? 0),
    mitOrt: Number(summen?.mit_ort ?? 0),
    ohneExifZeit: Number(summen?.ohne_exif_zeit ?? 0),
    originalBytes: Number(summen?.original_bytes ?? 0),
    abgeleitetBytes: abgeleitet,
    platteGesamt: platte ? platte.blocks * platte.bsize : null,
    platteFrei: platte ? platte.bavail * platte.bsize : null,
    wiedergabeErzeugt: Number(summen?.wiedergabe ?? 0),
    jahreEingeschraenkt: knapp,
  };
}

/** Deutsche Schreibweise: Komma als Dezimalzeichen, Punkt als Tausendertrenner. */
export function zahl(wert: number, stellen = 0): string {
  return wert.toLocaleString("de-DE", {
    minimumFractionDigits: stellen, maximumFractionDigits: stellen,
  });
}

export function gb(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${zahl(bytes / 1024 ** 3, 1)} GB`;
  return `${zahl(bytes / 1024 ** 2, 0)} MB`;
}
