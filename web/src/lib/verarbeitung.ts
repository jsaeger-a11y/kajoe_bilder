/**
 * Verarbeitung anstossen und beobachten.
 *
 * **Die Anwendung startet keinen Prozess.** Sie schreibt eine Auslesedatei
 * nach `/data/kajoe_bilder/.anstoss`; eine `systemd.path`-Einheit sieht sie und
 * startet `kajoe-verarbeiten.service`. Ein Kindprozess aus Node heraus haenge
 * am Webdienst: bei jedem Neustart stirbt er mit oder bleibt als Waise
 * zurueck – und genau das darf nicht sein, wenn ein Lauf Stunden dauert.
 */

import "server-only";

import { readdir, stat, unlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

import { abfrage, eineZeile } from "./db";
import { DATEN } from "./dateien";

export const ANSTOSS = join(DATEN, ".anstoss");
export const EINGANG = join(DATEN, "eingang");

/** Juenger als das heisst: da schreibt vielleicht noch jemand. */
const FRISCH_SEKUNDEN = 60;

/** Fenster fuer die Temporessung. Kuerzer als das ist die Schaetzung vorlaeufig. */
const TEMPO_FENSTER_SEKUNDEN = 120;

// ---------------------------------------------------------------------------
// Was liegt in eingang/?
// ---------------------------------------------------------------------------

export interface Eingang {
  anzahl: number;
  bytes: number;
  juengsteSekunden: number | null;
  filepartAnzahl: number;
  beispiele: string[];
}

export async function eingangZustand(): Promise<Eingang> {
  let anzahl = 0;
  let bytes = 0;
  let juengste = 0;
  let filepartAnzahl = 0;
  const beispiele: string[] = [];

  const zuTun = [EINGANG];
  while (zuTun.length) {
    const ordner = zuTun.pop()!;
    let eintraege;
    try {
      eintraege = await readdir(ordner, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of eintraege) {
      const pfad = join(ordner, e.name);
      if (e.isDirectory()) {
        zuTun.push(pfad);
        continue;
      }
      if (!e.isFile()) continue;

      // WinSCP legt waehrend der Uebertragung .filepart an. Liegt so etwas
      // herum, ist der Bestand mit einiger Wahrscheinlichkeit unvollstaendig.
      if (e.name.endsWith(".filepart")) {
        filepartAnzahl += 1;
        continue;
      }

      try {
        const a = await stat(pfad);
        anzahl += 1;
        bytes += a.size;
        if (a.mtimeMs > juengste) juengste = a.mtimeMs;
        if (beispiele.length < 5) beispiele.push(pfad.slice(EINGANG.length + 1));
      } catch {
        /* verschwunden – zaehlt nicht */
      }
    }
  }

  return {
    anzahl,
    bytes,
    juengsteSekunden: juengste ? Math.round((Date.now() - juengste) / 1000) : null,
    filepartAnzahl,
    beispiele,
  };
}

/**
 * Sieht es nach einer laufenden Uebertragung aus?
 *
 * Als Hinweis, nicht als Sperre – der Mensch weiss es besser als die
 * Heuristik. Er hat vielleicht gerade eine einzelne Datei nachgelegt.
 */
export function uebertragungLaeuftVermutlich(e: Eingang): string | null {
  if (e.filepartAnzahl > 0) {
    return `${e.filepartAnzahl} Datei(en) mit der Endung .filepart – WinSCP überträgt gerade.`;
  }
  if (e.juengsteSekunden !== null && e.juengsteSekunden < FRISCH_SEKUNDEN) {
    return `Die jüngste Datei ist ${e.juengsteSekunden} Sekunden alt – da schreibt vielleicht noch jemand.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Laeuft gerade etwas?
// ---------------------------------------------------------------------------

export interface Laufend {
  id: number;
  schritt: string;
  begonnen_am: Date;
  aktualisiert_am: Date;
  gesamt: number;
  erledigt: number;
  angestossen_von: number | null;
  benutzername: string | null;
}

/**
 * Kennung des laufenden Systemstarts.
 *
 * Der Kern vergibt sie bei jedem Start neu. Sie ist der einzige zuverlaessige
 * Weg, eine Zeile aus einem frueheren Start zu erkennen: nach einem Neustart
 * beginnt die Vergabe der Prozessnummern wieder von vorn, und eine gemerkte
 * `pid` kann dann auf einen voellig anderen, lebenden Prozess zeigen.
 */
function bootKennung(): string | null {
  try {
    return readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim() || null;
  } catch {
    return null;
  }
}

/**
 * Zeilen, deren Prozess es nicht mehr gibt, auf 'abgebrochen' setzen.
 *
 * Eine Zeile, die auf `laeuft` stehenbleibt, blockiert sonst jeden weiteren
 * Anstoss – dieselbe Falle wie eine Sperrdatei, die niemand aufraeumt.
 * `process.kill(pid, 0)` toetet nichts, es fragt nur nach.
 *
 * Die Prozessnummer allein traegt aber nur, solange der Rechner durchlaeuft.
 * Deshalb steht die Kennung des Systemstarts davor – siehe Migration 008.
 */
export async function verwaisteAufraeumen(): Promise<number> {
  const offen = await abfrage<{
    id: number; pid: number | null; rechner: string | null; boot_kennung: string | null;
  }>(
    `SELECT id::int AS id, pid, rechner, boot_kennung
       FROM verarbeitung WHERE beendet_am IS NULL`,
  );
  const jetzigerStart = bootKennung();
  let aufgeraeumt = 0;
  for (const z of offen) {
    // Ein Lauf auf einem anderen Rechner ist von hier aus nicht zu beurteilen.
    if (z.rechner && z.rechner !== hostname()) continue;

    // Ein anderer Systemstart: der Prozess ist mit Sicherheit weg, und die
    // Prozessnummer darf gar nicht erst befragt werden.
    const ausAltemStart =
      z.boot_kennung !== null && jetzigerStart !== null && z.boot_kennung !== jetzigerStart;

    let lebt = false;
    if (z.pid && !ausAltemStart) {
      try {
        process.kill(z.pid, 0);
        lebt = true;
      } catch (f) {
        lebt = (f as NodeJS.ErrnoException).code === "EPERM";
      }
    }
    if (lebt) continue;
    await abfrage(
      `UPDATE verarbeitung
          SET zustand = 'abgebrochen', beendet_am = now(),
              bemerkung = coalesce(bemerkung || ' | ', '') || $2
        WHERE id = $1 AND beendet_am IS NULL`,
      [Number(z.id), ausAltemStart ? "Neustart dazwischen" : "Prozess nicht mehr vorhanden"],
    );
    aufgeraeumt += 1;
  }
  return aufgeraeumt;
}

export async function laufend(): Promise<Laufend | null> {
  await verwaisteAufraeumen();
  const z = await eineZeile<Laufend>(
    `SELECT v.id::int AS id, v.schritt, v.begonnen_am, v.aktualisiert_am,
            v.gesamt, v.erledigt, v.angestossen_von::int AS angestossen_von,
            b.benutzername
       FROM verarbeitung v LEFT JOIN benutzer b ON b.id = v.angestossen_von
      WHERE v.beendet_am IS NULL
      ORDER BY v.begonnen_am LIMIT 1`,
  );
  return z ?? null;
}

/** Wurde angestossen, aber der Dienst hat noch nicht begonnen? */
export async function wartetAufStart(): Promise<boolean> {
  try {
    await stat(ANSTOSS);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Tempo und Restzeit
// ---------------------------------------------------------------------------

export interface Tempo {
  /** Dateien je Sekunde, aus den letzten Minuten. */
  proSekunde: number | null;
  restSekunden: number | null;
  /** Zu kurz gemessen, um etwas zu taugen. */
  vorlaeufig: boolean;
  fensterSekunden: number;
}

/**
 * Die Restzeit wird GEMESSEN, nicht geraten.
 *
 * Aus dem Tempo der letzten Minuten und nicht aus einem festen Wert je Datei:
 * HEIC dauert laenger als PNG, und ein Lauf, der gerade an Videos arbeitet,
 * ist langsamer als sein Mittelwert vermuten laesst. Zwei Messpunkte braucht
 * es dafuer mindestens – vorher steht die Schaetzung als vorlaeufig da.
 */
export async function tempo(verarbeitungId: number, gesamt: number,
                           erledigt: number): Promise<Tempo> {
  const takte = await abfrage<{ zeitpunkt: Date; erledigt: number }>(
    `SELECT zeitpunkt, erledigt FROM verarbeitung_takt
      WHERE verarbeitung_id = $1 AND zeitpunkt > now() - $2 * interval '1 second'
      ORDER BY zeitpunkt`,
    [verarbeitungId, TEMPO_FENSTER_SEKUNDEN],
  );

  if (takte.length < 2) {
    return { proSekunde: null, restSekunden: null, vorlaeufig: true, fensterSekunden: 0 };
  }

  const erst = takte[0];
  const letzt = takte[takte.length - 1];
  const sekunden = (new Date(letzt.zeitpunkt).getTime() - new Date(erst.zeitpunkt).getTime()) / 1000;
  const dateien = Number(letzt.erledigt) - Number(erst.erledigt);

  if (sekunden <= 0 || dateien <= 0) {
    return { proSekunde: null, restSekunden: null, vorlaeufig: true, fensterSekunden: sekunden };
  }

  const proSekunde = dateien / sekunden;
  const offen = Math.max(0, gesamt - erledigt);
  return {
    proSekunde,
    restSekunden: Math.round(offen / proSekunde),
    vorlaeufig: sekunden < 60,
    fensterSekunden: Math.round(sekunden),
  };
}

// ---------------------------------------------------------------------------
// Anstossen
// ---------------------------------------------------------------------------

export async function anstossen(benutzerId: number): Promise<void> {
  // Mehr als das tut die Anwendung nicht: eine Datei mit der Benutzernummer
  // darin. systemd erledigt den Rest.
  await writeFile(ANSTOSS, `${benutzerId}\n`, { mode: 0o644 });
}

export async function anstossZuruecknehmen(): Promise<void> {
  try {
    await unlink(ANSTOSS);
  } catch {
    /* war schon weg */
  }
}

// ---------------------------------------------------------------------------
// Bericht
// ---------------------------------------------------------------------------

export interface Bericht {
  id: number;
  schritt: string;
  zustand: string;
  begonnen_am: Date;
  beendet_am: Date | null;
  gesamt: number;
  erledigt: number;
  erzeugt: number;
  uebersprungen: number;
  fehlgeschlagen: number;
  bemerkung: string | null;
  benutzername: string | null;
  // aus ingest_lauf
  gefunden: number | null;
  uebernommen: number | null;
  dubletten: number | null;
  quarantaene: number | null;
  ingest_uebersprungen: number | null;
  ingest_lauf_id: number | null;
}

export async function letzteLaeufe(wieviele = 10): Promise<Bericht[]> {
  return abfrage<Bericht>(
    `SELECT v.id::int AS id, v.schritt, v.zustand, v.begonnen_am, v.beendet_am,
            v.gesamt, v.erledigt, v.erzeugt, v.uebersprungen, v.fehlgeschlagen,
            v.bemerkung, b.benutzername,
            i.gefunden, i.uebernommen, i.dubletten, i.quarantaene,
            i.uebersprungen AS ingest_uebersprungen,
            v.ingest_lauf_id::int AS ingest_lauf_id
       FROM verarbeitung v
       LEFT JOIN benutzer b    ON b.id = v.angestossen_von
       LEFT JOIN ingest_lauf i ON i.id = v.ingest_lauf_id
      ORDER BY v.begonnen_am DESC LIMIT $1`,
    [wieviele],
  );
}

export interface Fehlerzeile {
  pfad: string;
  grund: string;
}

/** Fehlschlaege beim Ableiten – namentlich, nicht nur gezaehlt. */
export async function fehlerDesLaufs(verarbeitungId: number): Promise<Fehlerzeile[]> {
  return abfrage<Fehlerzeile>(
    `SELECT pfad, grund FROM verarbeitung_fehler
      WHERE verarbeitung_id = $1 ORDER BY id LIMIT 200`,
    [verarbeitungId],
  );
}

/** Quarantaenefaelle eines Einlesevorgangs – ebenfalls namentlich. */
export async function quarantaeneDesLaufs(ingestLaufId: number): Promise<Fehlerzeile[]> {
  return abfrage<Fehlerzeile>(
    `SELECT pfad, grund FROM quarantaene
      WHERE ingest_lauf_id = $1 ORDER BY id LIMIT 200`,
    [ingestLaufId],
  );
}

export function dauertext(sekunden: number): string {
  if (sekunden < 60) return `${Math.round(sekunden)} s`;
  const m = Math.floor(sekunden / 60);
  if (m < 60) return `${m} min ${Math.round(sekunden % 60)} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
