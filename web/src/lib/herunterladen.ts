/**
 * Herunterladen – einzeln und als Paket.
 *
 * Gerechnet und gepackt wird in `ingest/herunterladen.py`; hier steht nur, wer
 * was darf, wie die Kopfzeilen aussehen und wie gross das Paket ungefaehr
 * wird.
 *
 * **Im Datenstrom, nicht im Speicher.** Ein Paket aus zweihundert Vollbildern
 * ist gut ein halbes Gigabyte; wer es erst zusammensetzt, wirft den Dienst bei
 * zwei gleichzeitigen Anfragen um. Node reicht die Standardausgabe des
 * Unterprozesses unveraendert an die Antwort weiter.
 */

import "server-only";

import { spawn } from "node:child_process";
import { join } from "node:path";
import { Readable } from "node:stream";

import { PROJEKTWURZEL } from "./umgebung";

/**
 * Obergrenze je Paket, an EINER Stelle.
 *
 * "Zweihundert Vollbilder sind gut ein Gigabyte" steht in CLAUDE.md; gemessen
 * sind es bei diesem Bestand rund 3,2 MB je Bild, also etwa 640 MB. Eine
 * Auswahlliste darf 500 Bilder fassen – die holt man dann in drei Teilen.
 */
export const HOECHSTENS_JE_PAKET = 200;

export type Art = "jpeg" | "original";

export function istArt(wert: string): wert is Art {
  return wert === "jpeg" || wert === "original";
}

/**
 * Gemessen an zwoelf iPhone-Aufnahmen: 0,266 Byte je Bildpunkt bei Qualitaet
 * 95 und 4:4:4, also rund das Doppelte des HEIC-Originals. Aufgerundet, weil
 * eine zu kleine Schaetzung aergerlicher ist als eine zu grosse.
 */
const BYTES_JE_PIXEL = 0.27;

export interface Groessenzeile {
  dateityp: string;
  typ: string;
  dateigroesse: string | number;
  breite: number | null;
  hoehe: number | null;
}

/**
 * Wird die Originaldatei unveraendert durchgereicht?
 *
 * **Diese Regel steht auch in `ingest/herunterladen.py` (`unveraendert`), und
 * dort ist sie massgeblich** – sie entscheidet ueber den Inhalt. Hier wird sie
 * gebraucht, um Dateinamen und Groessenschaetzung zu bestimmen, bevor der
 * Strom laeuft. Damit die beiden nicht auseinanderlaufen, gibt es
 * `herunterladen.py name` und eine Gegenprobe darueber.
 */
export function unveraendert(zeile: Groessenzeile, art: Art): boolean {
  return art === "original" || zeile.typ === "video" || zeile.dateityp === "JPEG";
}

export function zielendung(pfad: string, zeile: Groessenzeile, art: Art): string {
  if (unveraendert(zeile, art)) {
    const punkt = pfad.lastIndexOf(".");
    const roh = punkt >= 0 ? pfad.slice(punkt + 1).toLowerCase() : "";
    return roh || "bin";
  }
  return "jpg";
}

/** `2023-07-15_142305.jpg` – der sha256 sagt niemandem etwas. */
export function zieldateiname(aufnahme: Date, endung: string): string {
  const t = new Date(aufnahme);
  const z = (n: number) => String(n).padStart(2, "0");
  return (
    `${t.getUTCFullYear()}-${z(t.getUTCMonth() + 1)}-${z(t.getUTCDate())}_` +
    `${z(t.getUTCHours())}${z(t.getUTCMinutes())}${z(t.getUTCSeconds())}.${endung}`
  );
}

export function geschaetzteGroesse(zeilen: Groessenzeile[], art: Art): number {
  let summe = 0;
  for (const z of zeilen) {
    if (unveraendert(z, art)) {
      summe += Number(z.dateigroesse);
    } else if (z.breite && z.hoehe) {
      summe += z.breite * z.hoehe * BYTES_JE_PIXEL;
    } else {
      // Ohne Masse bleibt nur der Erfahrungswert: rund das Doppelte.
      summe += Number(z.dateigroesse) * 2;
    }
  }
  return Math.round(summe);
}

export function groessentext(bytes: number): string {
  const zahl = (w: number, s: number) =>
    w.toLocaleString("de-DE", { minimumFractionDigits: s, maximumFractionDigits: s });
  if (bytes >= 1024 ** 3) return `${zahl(bytes / 1024 ** 3, 1)} GB`;
  if (bytes >= 1024 ** 2) return `${zahl(bytes / 1024 ** 2, 0)} MB`;
  return `${zahl(bytes / 1024, 0)} kB`;
}

/**
 * Kopfzeile fuer den Anhang.
 *
 * Zweimal derselbe Name: `filename` als reine ASCII-Fassung fuer alte
 * Browser, `filename*` nach RFC 5987 mit UTF-8 fuer alle anderen. Ohne die
 * zweite Angabe wird aus "Größenprobe.zip" unterwegs Kraut.
 */
export function anhangKopfzeile(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Nichts, was einen Pfad aufmacht – dieselbe Regel wie `sauber()` in Python. */
export function sauberer(text: string): string {
  return (
    text
      .replace(/[/\\]/g, "-")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f\x7f]/g, "")
      .replace(/\s+/g, " ")
      .replace(/^[ .]+|[ .]+$/g, "")
      .slice(0, 60) || "Auswahl"
  );
}

/**
 * Startet `ingest/herunterladen.py` und gibt dessen Standardausgabe als Strom
 * zurueck.
 *
 * Bricht der Aufrufer ab – Fenster zu, Verbindung weg –, wird der
 * Unterprozess beendet. Sonst rechnet ffmpeg oder pillow weiter fuer
 * niemanden, und bei ein paar abgebrochenen Paketen steht die Maschine.
 */
export function strom(
  argumente: string[],
  eingabe: string | null,
  abbruch: AbortSignal,
): ReadableStream<Uint8Array> {
  const kind = spawn(join(PROJEKTWURZEL, "tools", "herunterladen.sh"), argumente, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  kind.stderr.on("data", (stueck: Buffer) => {
    const zeile = stueck.toString().trim();
    if (zeile) console.warn(`[herunterladen] ${zeile}`);
  });

  if (eingabe !== null) {
    kind.stdin.end(eingabe);
  } else {
    kind.stdin.end();
  }

  const beenden = () => {
    if (kind.exitCode === null) kind.kill("SIGTERM");
  };
  abbruch.addEventListener("abort", beenden, { once: true });
  kind.on("close", () => abbruch.removeEventListener("abort", beenden));

  // Der Strom wird umschlossen, damit `cancel()` den Unterprozess wirklich
  // erwischt. Ohne das rechnet er nach einem abgebrochenen Download weiter,
  // bis die Rohrleitung volllaeuft, und bleibt dann fuer immer stehen –
  // gemessen an einem Paket von zweihundert Bildern, bei dem der Abnehmer
  // nach einer Minute wegging.
  const innen = (Readable.toWeb(kind.stdout) as ReadableStream<Uint8Array>).getReader();

  return new ReadableStream<Uint8Array>({
    async pull(steuerung) {
      const { done, value } = await innen.read();
      if (done) {
        steuerung.close();
        return;
      }
      steuerung.enqueue(value);
    },
    cancel(grund) {
      console.warn(`[herunterladen] Abnehmer weg (${grund}) – Unterprozess wird beendet`);
      beenden();
      return innen.cancel(grund);
    },
  });
}
