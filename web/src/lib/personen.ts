/**
 * Personen und Häufchen – alle Abfragen an einer Stelle (Phase 9b).
 *
 * **Massgeblich ist `gesicht.person_id`, und sonst nichts.** Es gibt keine
 * Spalte `gruppe.person_id`; wem ein Häufchen gehoert, ergibt sich aus seinen
 * Funden und wird hier – einmal – ausgerechnet. Zwei Faesser derselben
 * Wahrheit laufen auseinander, und in diesem Projekt ist genau das schon
 * dreimal passiert (DATABASE_URL, die Herkunftsregel, die Zellrechnung der
 * Karte). Der zweite Gewinn: `tools/gesichter.sh --neu-gruppieren` darf alle
 * Häufchen verwerfen, ohne dass eine einzige menschliche Zuordnung fällt.
 *
 * Ein Häufchen ist damit
 *
 *     offen      zustand = 'offen' und kein sichtbarer Fund trägt eine Person
 *     benannt    mindestens ein sichtbarer Fund trägt eine Person
 *     abgelegt   zustand = 'unwichtig'
 *
 * **Alles läuft durch `sichtbar(sicht)`.** Auch der Name eines Häufchens: er
 * wird aus den Funden hergeleitet, die DIESE Person sehen darf. Sonst stünde
 * bei jemandem mit Zugang zu einem einzigen Jahrgang der Name einer Person an
 * einem Häufchen, das für ihn aus lauter unsichtbaren Aufnahmen besteht – eine
 * Auskunft über Jahrgänge, die er nicht sehen darf.
 *
 * **Herausgenommene Funde** (`ausgenommen_am`) zählen nirgends mit, bleiben
 * aber im Häufchen stehen. Ohne `gruppe_id` wären sie unauffindbar und die
 * Rücknahme unmöglich; ein Lauf fasst sie ohnehin nicht mehr an.
 */

import "server-only";

import { abfrage, eineZeile, vorrat } from "./db";
import { sichtbar, type Sicht } from "./sichtbar";

/** Häufchen je Seite. Bei hunderten ist Blättern Pflicht. */
export const HAEUFCHEN_JE_SEITE = 24;

/** Gesichter je Seite in der Häufchenansicht. */
export const GESICHTER_JE_SEITE = 48;

/** So viele Beispielgesichter stehen auf einer Personenkarte. */
export const BEISPIELE = 8;

export type Art = "offen" | "benannt" | "abgelegt";

export interface Haeufchen {
  id: number;
  zustand: string;
  funde: number;
  bilder: number;
  von: Date | null;
  bis: Date | null;
  vertreter: number | null;
  personId: number | null;
  personName: string | null;
  ohnePerson: number;
}

export interface Person {
  id: number;
  name: string;
  aufnahmen: number;
  funde: number;
  von: Date | null;
  bis: Date | null;
  beispiel: number | null;
  haeufchen: number;
}

export interface Fund {
  id: number;
  bildId: number;
  kasten: number[];
  guete: number;
  aehnlichkeit: number | null;
  aufnahme: Date;
  personId: number | null;
  personName: string | null;
  ausgenommen: boolean;
}

/**
 * Der gemeinsame Unterbau aller Häufchenlisten.
 *
 * Steht hier als EINE Zeichenkette, weil Liste und Zählung dieselbe Menge
 * meinen müssen. Zwei Fassungen derselben Bedingung ergeben eine Seitenzahl,
 * die zu den Zeilen nicht passt – und das fällt erst auf der letzten Seite
 * auf.
 */
function haeufchenUnterbau(
  art: Art | "alle",
  sicht: Sicht,
  ab: number,
): { text: string; werte: unknown[] } {
  const s = sichtbar(sicht, { ab, praefix: "b." });

  // Die Auswahl nach Art. Der Zustand liegt an der Gruppe und kann vor dem
  // Zusammenfassen greifen; die Person entsteht erst dabei und muss danach
  // gefiltert werden.
  const wo =
    art === "alle" ? "TRUE"
      : art === "abgelegt" ? "gr.zustand = 'unwichtig'"
        : "gr.zustand = 'offen'";
  const nach =
    art === "alle" || art === "abgelegt" ? "TRUE"
      : art === "benannt" ? "r.person_id IS NOT NULL"
        : "r.person_id IS NULL";

  return {
    text: `
      WITH sichtbare AS (
        SELECT g.id, g.gruppe_id, g.person_id, g.guete, g.bild_id, b.aufnahme_lokal
          FROM gesicht g JOIN bild b ON b.id = g.bild_id
         WHERE g.gruppe_id IS NOT NULL
           AND g.ausgenommen_am IS NULL
           AND ${s.text}
      ),
      roh AS (
        SELECT gr.id::int AS id, gr.zustand,
               count(sb.id)::int                                     AS funde,
               count(DISTINCT sb.bild_id)::int                       AS bilder,
               min(sb.aufnahme_lokal)                                AS von,
               max(sb.aufnahme_lokal)                                AS bis,
               count(sb.id) FILTER (WHERE sb.person_id IS NULL)::int AS ohne_person,
               -- Der Vertreter aus 9a zuerst, falls er sichtbar ist; sonst der
               -- Fund mit der besten Güte. So steht auf der Kachel nie ein
               -- Gesicht aus einem gesperrten Jahrgang.
               (array_agg(sb.id::int ORDER BY (sb.id = gr.vertreter_id) DESC, sb.guete DESC))[1]
                                                                     AS vertreter,
               -- Die Person des Häufchens: die häufigste unter seinen
               -- sichtbaren Funden. mode() uebergeht NULL-Werte, ein Haeufchen
               -- ohne jede Zuordnung bekommt also NULL.
               --
               -- Das war vorher eine LATERAL-Unterabfrage und lief je Häufchen
               -- einmal über die ganze Menge: 19 Sekunden für eine Seite. Als
               -- Aggregat ist es ein einziger Durchgang.
               (mode() WITHIN GROUP (ORDER BY sb.person_id))::int     AS person_id
          FROM gruppe gr
          LEFT JOIN sichtbare sb ON sb.gruppe_id = gr.id
         WHERE ${wo}
         GROUP BY gr.id, gr.zustand, gr.vertreter_id
        HAVING count(sb.id) > 0
      ),
      gefiltert AS (
        SELECT r.*, p.name AS person_name
          FROM roh r LEFT JOIN person p ON p.id = r.person_id
         WHERE ${nach}
      )`,
    werte: [...s.werte],
  };
}

export async function haeufchenSeite(
  art: Art,
  sicht: Sicht,
  seite: number,
): Promise<{ zeilen: Haeufchen[]; treffer: number }> {
  const u = haeufchenUnterbau(art, sicht, 1);
  const versatz = (Math.max(1, seite) - 1) * HAEUFCHEN_JE_SEITE;

  const [zeilen, zahl] = await Promise.all([
    abfrage<{
      id: number; zustand: string; funde: number; bilder: number;
      von: Date | null; bis: Date | null; ohne_person: number;
      vertreter: number | null; person_id: number | null; person_name: string | null;
    }>(
      `${u.text}
       SELECT * FROM gefiltert
        -- Größte zuerst: die lohnen sich, die kleinen sind meist Passanten.
        ORDER BY funde DESC, id
        LIMIT ${HAEUFCHEN_JE_SEITE} OFFSET ${versatz}`,
      u.werte,
    ),
    eineZeile<{ anzahl: string }>(`${u.text} SELECT count(*) AS anzahl FROM gefiltert`, u.werte),
  ]);

  return {
    zeilen: zeilen.map((z) => ({
      id: Number(z.id), zustand: z.zustand,
      funde: Number(z.funde), bilder: Number(z.bilder),
      von: z.von, bis: z.bis,
      vertreter: z.vertreter === null ? null : Number(z.vertreter),
      personId: z.person_id === null ? null : Number(z.person_id),
      personName: z.person_name,
      ohnePerson: Number(z.ohne_person),
    })),
    treffer: Number(zahl?.anzahl ?? 0),
  };
}

/** Ein einzelnes Häufchen – oder `null`, wenn es für diese Sicht nichts hergibt. */
export async function haeufchen(id: number, sicht: Sicht): Promise<Haeufchen | null> {
  const s = sichtbar(sicht, { ab: 2, praefix: "b." });
  const z = await eineZeile<{
    id: number; zustand: string; funde: number; bilder: number;
    von: Date | null; bis: Date | null; ohne_person: number;
    vertreter: number | null; person_id: number | null; person_name: string | null;
  }>(
    `WITH sichtbare AS (
       SELECT g.id, g.person_id, g.guete, g.bild_id, b.aufnahme_lokal
         FROM gesicht g JOIN bild b ON b.id = g.bild_id
        WHERE g.gruppe_id = $1 AND g.ausgenommen_am IS NULL AND ${s.text}
     )
     SELECT gr.id::int AS id, gr.zustand,
            (SELECT count(*)::int FROM sichtbare)                                 AS funde,
            (SELECT count(DISTINCT bild_id)::int FROM sichtbare)                  AS bilder,
            (SELECT min(aufnahme_lokal) FROM sichtbare)                           AS von,
            (SELECT max(aufnahme_lokal) FROM sichtbare)                           AS bis,
            (SELECT count(*)::int FROM sichtbare WHERE person_id IS NULL)         AS ohne_person,
            (SELECT id FROM sichtbare ORDER BY (id = gr.vertreter_id) DESC, guete DESC LIMIT 1)
                                                                                  AS vertreter,
            pp.person_id, pp.name AS person_name
       FROM gruppe gr
       LEFT JOIN LATERAL (
         SELECT p.id::int AS person_id, p.name
           FROM sichtbare s2 JOIN person p ON p.id = s2.person_id
          GROUP BY p.id, p.name ORDER BY count(*) DESC, p.name LIMIT 1
       ) pp ON TRUE
      WHERE gr.id = $1`,
    [id, ...s.werte],
  );
  if (!z) return null;
  return {
    id: Number(z.id), zustand: z.zustand,
    funde: Number(z.funde), bilder: Number(z.bilder),
    von: z.von, bis: z.bis,
    vertreter: z.vertreter === null ? null : Number(z.vertreter),
    personId: z.person_id === null ? null : Number(z.person_id),
    personName: z.person_name,
    ohnePerson: Number(z.ohne_person),
  };
}

/**
 * Die Funde eines Häufchens.
 *
 * Absteigend nach Ähnlichkeit zum Mittelvektor: die sichersten zuerst, die
 * zweifelhaften am Ende. Genau dort sucht man das fremde Gesicht.
 */
export async function fundeDesHaeufchens(
  gruppeId: number,
  sicht: Sicht,
  seite: number,
  mitAusgenommenen = false,
): Promise<{ zeilen: Fund[]; treffer: number }> {
  const s = sichtbar(sicht, { ab: 2, praefix: "b." });
  const filter = mitAusgenommenen
    ? "g.ausgenommen_am IS NOT NULL"
    : "g.ausgenommen_am IS NULL";
  const versatz = (Math.max(1, seite) - 1) * GESICHTER_JE_SEITE;

  const [zeilen, zahl] = await Promise.all([
    abfrage<{
      id: number; bild_id: number; kasten: number[]; guete: number;
      gruppe_aehnlichkeit: number | null; aufnahme_lokal: Date;
      person_id: number | null; person_name: string | null; ausgenommen: boolean;
    }>(
      `SELECT g.id::int AS id, g.bild_id::int AS bild_id, g.kasten, g.guete,
              g.gruppe_aehnlichkeit, b.aufnahme_lokal,
              p.id::int AS person_id, p.name AS person_name,
              (g.ausgenommen_am IS NOT NULL) AS ausgenommen
         FROM gesicht g
         JOIN bild b ON b.id = g.bild_id
         LEFT JOIN person p ON p.id = g.person_id
        WHERE g.gruppe_id = $1 AND ${filter} AND ${s.text}
        ORDER BY g.gruppe_aehnlichkeit DESC NULLS LAST, g.id
        LIMIT ${GESICHTER_JE_SEITE} OFFSET ${versatz}`,
      [gruppeId, ...s.werte],
    ),
    eineZeile<{ anzahl: string }>(
      `SELECT count(*) AS anzahl FROM gesicht g JOIN bild b ON b.id = g.bild_id
        WHERE g.gruppe_id = $1 AND ${filter} AND ${s.text}`,
      [gruppeId, ...s.werte],
    ),
  ]);

  return {
    zeilen: zeilen.map((z) => ({
      id: Number(z.id), bildId: Number(z.bild_id), kasten: z.kasten,
      guete: Number(z.guete),
      aehnlichkeit: z.gruppe_aehnlichkeit === null ? null : Number(z.gruppe_aehnlichkeit),
      aufnahme: z.aufnahme_lokal,
      personId: z.person_id === null ? null : Number(z.person_id),
      personName: z.person_name,
      ausgenommen: z.ausgenommen,
    })),
    treffer: Number(zahl?.anzahl ?? 0),
  };
}

/**
 * Die benannten Personen.
 *
 * Gezählt werden AUFNAHMEN, nicht Funde: zwei Gesichter derselben Person auf
 * einem Bild sind eine Aufnahme. Und alles unter `sichtbar` – wer nur einen
 * Jahrgang sehen darf, bekommt hier die Zahlen dieses Jahrgangs.
 */
export async function personen(sicht: Sicht): Promise<Person[]> {
  const s = sichtbar(sicht, { ab: 1, praefix: "b." });
  const zeilen = await abfrage<{
    id: number; name: string; aufnahmen: number; funde: number;
    von: Date | null; bis: Date | null; beispiel: number | null; haeufchen: number;
  }>(
    `SELECT p.id::int AS id, p.name,
            count(DISTINCT g.bild_id)::int AS aufnahmen,
            count(*)::int                  AS funde,
            count(DISTINCT g.gruppe_id)::int AS haeufchen,
            min(b.aufnahme_lokal) AS von, max(b.aufnahme_lokal) AS bis,
            (array_agg(g.id::int ORDER BY g.guete DESC, g.groesse DESC))[1] AS beispiel
       FROM person p
       JOIN gesicht g ON g.person_id = p.id AND g.ausgenommen_am IS NULL
       JOIN bild b ON b.id = g.bild_id
      WHERE ${s.text}
      GROUP BY p.id, p.name
      ORDER BY count(DISTINCT g.bild_id) DESC, p.name`,
    s.werte,
  );
  return zeilen.map((z) => ({
    id: Number(z.id), name: z.name,
    aufnahmen: Number(z.aufnahmen), funde: Number(z.funde),
    haeufchen: Number(z.haeufchen),
    von: z.von, bis: z.bis,
    beispiel: z.beispiel === null ? null : Number(z.beispiel),
  }));
}

export async function personMit(id: number, sicht: Sicht): Promise<Person | null> {
  return (await personen(sicht)).find((p) => p.id === id) ?? null;
}

/**
 * Personen ohne einen einzigen sichtbaren Fund.
 *
 * Nur für Verwalter gedacht: sie tauchen in `personen()` nicht auf, sollen
 * sich aber auflösen lassen. Sonst bliebe ein Name für immer stehen, dessen
 * Aufnahmen alle zum Löschen vorgemerkt wurden.
 */
export async function personenOhneFunde(sicht: Sicht): Promise<{ id: number; name: string }[]> {
  const s = sichtbar(sicht, { ab: 1, praefix: "b." });
  const zeilen = await abfrage<{ id: number; name: string }>(
    `SELECT p.id::int AS id, p.name
       FROM person p
      WHERE NOT EXISTS (
        SELECT 1 FROM gesicht g JOIN bild b ON b.id = g.bild_id
         WHERE g.person_id = p.id AND g.ausgenommen_am IS NULL AND ${s.text})
      ORDER BY p.name`,
    s.werte,
  );
  return zeilen.map((z) => ({ id: Number(z.id), name: z.name }));
}

/** Beispielgesichter einer Person – die besten zuerst. */
export async function beispieleDerPerson(
  personId: number,
  sicht: Sicht,
  wieviele = BEISPIELE,
): Promise<{ id: number; bildId: number }[]> {
  const s = sichtbar(sicht, { ab: 2, praefix: "b." });
  const zeilen = await abfrage<{ id: number; bild_id: number }>(
    `SELECT g.id::int AS id, g.bild_id::int AS bild_id
       FROM gesicht g JOIN bild b ON b.id = g.bild_id
      WHERE g.person_id = $1 AND g.ausgenommen_am IS NULL AND ${s.text}
      ORDER BY g.guete DESC, g.groesse DESC
      LIMIT ${Math.max(1, Math.min(48, wieviele))}`,
    [personId, ...s.werte],
  );
  return zeilen.map((z) => ({ id: Number(z.id), bildId: Number(z.bild_id) }));
}

/** Die Häufchen, die zu einer Person gehören. */
export async function haeufchenDerPerson(personId: number, sicht: Sicht): Promise<Haeufchen[]> {
  const alle = await Promise.all(
    (["offen", "benannt", "abgelegt"] as Art[]).map((a) => haeufchenSeite(a, sicht, 1)),
  );
  return alle.flatMap((x) => x.zeilen).filter((h) => h.personId === personId);
}

/**
 * Welche Personen wurden auf dieser Aufnahme erkannt?
 *
 * Für die Einzelansicht. Ohne eigene Sichtprüfung: die Seite hat das Bild
 * bereits unter `sichtbar` geholt – aber `sicht.gesichter` wird hier
 * verlangt, damit die Auskunft nicht an jemanden geht, der das Recht nicht
 * hat.
 */
export async function personenDesBildes(
  bildId: number,
  sicht: Sicht,
): Promise<{ id: number; name: string; gesicht: number }[]> {
  if (!sicht.gesichter) return [];
  const zeilen = await abfrage<{ id: number; name: string; gesicht: number }>(
    `SELECT p.id::int AS id, p.name,
            (array_agg(g.id::int ORDER BY g.guete DESC))[1] AS gesicht
       FROM gesicht g JOIN person p ON p.id = g.person_id
      WHERE g.bild_id = $1 AND g.ausgenommen_am IS NULL
      GROUP BY p.id, p.name ORDER BY p.name`,
    [bildId],
  );
  return zeilen.map((z) => ({ id: Number(z.id), name: z.name, gesicht: Number(z.gesicht) }));
}

/**
 * Zahlen für die Unterleiste: wie viel Arbeit liegt wo.
 *
 * Eine Abfrage über alle Häufchen statt dreier Listenabfragen – die Leiste
 * steht auf jeder Seite dieses Bereichs, und drei volle Durchgänge dafür wären
 * die Rechnung dreimal umsonst.
 */
export async function zahlen(
  sicht: Sicht,
): Promise<{ offen: number; benannt: number; abgelegt: number; personen: number; neue: number }> {
  const u = haeufchenUnterbau("alle", sicht, 1);
  const s = sichtbar(sicht, { ab: 1, praefix: "b." });

  const [h, p] = await Promise.all([
    eineZeile<{ offen: string; benannt: string; abgelegt: string; neue: string }>(
      `${u.text}
       SELECT count(*) FILTER (WHERE zustand = 'offen' AND person_id IS NULL)     AS offen,
              count(*) FILTER (WHERE zustand = 'offen' AND person_id IS NOT NULL) AS benannt,
              count(*) FILTER (WHERE zustand = 'unwichtig')                       AS abgelegt,
              coalesce(sum(ohne_person) FILTER (
                WHERE zustand = 'offen' AND person_id IS NOT NULL), 0)            AS neue
         FROM gefiltert`,
      u.werte,
    ),
    eineZeile<{ anzahl: string }>(
      `SELECT count(DISTINCT g.person_id) AS anzahl
         FROM gesicht g JOIN bild b ON b.id = g.bild_id
        WHERE g.person_id IS NOT NULL AND g.ausgenommen_am IS NULL AND ${s.text}`,
      s.werte,
    ),
  ]);

  return {
    offen: Number(h?.offen ?? 0),
    benannt: Number(h?.benannt ?? 0),
    abgelegt: Number(h?.abgelegt ?? 0),
    personen: Number(p?.anzahl ?? 0),
    // "neue" sind Funde in einem benannten Häufchen, die noch keine Person
    // tragen – die kommen nach jedem Lauf dazu und warten auf ein Ja.
    neue: Number(h?.neue ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Schreiben. Aufgerufen nur aus Server Actions, die vorher `aktionVerwalter()`
// verlangt haben – die Prüfung steht dort, nicht hier.
// ---------------------------------------------------------------------------

export interface Ergebnis {
  ok: boolean;
  fehler?: string;
  anzahl?: number;
  id?: number;
}

/** Namen prüfen: getrimmt, nicht leer, nicht zu lang. Sonst nichts. */
function namePruefen(name: string): { ok: true; wert: string } | { ok: false; fehler: string } {
  const wert = name.trim().replace(/\s+/g, " ");
  if (!wert) return { ok: false, fehler: "Der Name darf nicht leer sein." };
  if (wert.length > 80) return { ok: false, fehler: "Höchstens 80 Zeichen." };
  return { ok: true, wert };
}

/**
 * Neue Person anlegen.
 *
 * **Keine Prüfung auf „echte" Namen.** Das drittgrösste Häufchen des Piloten
 * ist der Hund; der bekommt einen Namen wie alle anderen. Geprüft wird nur,
 * dass überhaupt etwas dasteht und dass der Name noch frei ist.
 */
export async function personAnlegen(name: string, von: number): Promise<Ergebnis> {
  const g = namePruefen(name);
  if (!g.ok) return { ok: false, fehler: g.fehler };

  const vorhanden = await eineZeile<{ id: number }>(
    "SELECT id::int AS id FROM person WHERE lower(name) = lower($1)",
    [g.wert],
  );
  if (vorhanden) return { ok: false, fehler: `„${g.wert}" gibt es schon.` };

  const zeile = await eineZeile<{ id: number }>(
    "INSERT INTO person (name, angelegt_von) VALUES ($1, $2) RETURNING id::int AS id",
    [g.wert, von],
  );
  return { ok: true, id: Number(zeile?.id) };
}

/**
 * Ein Häufchen einer Person zuordnen.
 *
 * Es werden nur Funde ohne Person gesetzt. Wer schon jemand anderem zugeordnet
 * ist, bleibt – das war eine eigene menschliche Entscheidung, und eine zweite
 * soll sie nicht stillschweigend überschreiben. Die Häufchenansicht zeigt
 * solche Abweichler einzeln an.
 *
 * Zwei Häufchen derselben Person zuzuordnen IST das Zusammenführen aus dem
 * Auftrag: „Zwei, die dieselbe Person zeigen, werden zu einer Person." Die
 * Häufchen bleiben getrennt – sie sind der Vorschlag der Maschine, und den
 * gibt es weiter unverändert.
 */
export async function haeufchenZuweisen(
  gruppeId: number,
  personId: number,
  von: number,
): Promise<Ergebnis> {
  const p = await eineZeile<{ id: number }>("SELECT id::int AS id FROM person WHERE id = $1", [personId]);
  if (!p) return { ok: false, fehler: "Diese Person gibt es nicht." };

  const kunde = await vorrat.connect();
  try {
    await kunde.query("BEGIN");
    const ergebnis = await kunde.query(
      `UPDATE gesicht SET person_id = $2
        WHERE gruppe_id = $1 AND person_id IS NULL AND ausgenommen_am IS NULL`,
      [gruppeId, personId],
    );
    // Ein zugeordnetes Häufchen ist nicht mehr abgelegt – sonst stünde es in
    // zwei Listen zugleich und in keiner richtig.
    await kunde.query(
      `UPDATE gruppe SET zustand = 'offen', entschieden_am = now(), entschieden_von = $2
        WHERE id = $1`,
      [gruppeId, von],
    );
    await kunde.query("COMMIT");
    return { ok: true, anzahl: ergebnis.rowCount ?? 0 };
  } catch (f) {
    await kunde.query("ROLLBACK");
    throw f;
  } finally {
    kunde.release();
  }
}

/**
 * Die Zuordnung eines einzelnen Häufchens lösen.
 *
 * Nötig, weil sonst ein falsch zugeordnetes Häufchen nur über das Auflösen der
 * ganzen Person zurückzunehmen wäre – und das träfe alle anderen Häufchen
 * derselben Person mit.
 *
 * Gelöst wird **nur** die Zuordnung zu genau dieser Person. Funde, die jemand
 * einzeln einer anderen Person gegeben hat, bleiben, wie sie sind.
 */
export async function haeufchenLoesen(gruppeId: number, von: number): Promise<Ergebnis> {
  const p = await eineZeile<{ person_id: number }>(
    `SELECT person_id::int AS person_id FROM gesicht
      WHERE gruppe_id = $1 AND person_id IS NOT NULL AND ausgenommen_am IS NULL
      GROUP BY person_id ORDER BY count(*) DESC LIMIT 1`,
    [gruppeId],
  );
  if (!p) return { ok: false, fehler: "Dieses Häufchen trägt keinen Namen." };

  const kunde = await vorrat.connect();
  try {
    await kunde.query("BEGIN");
    const ergebnis = await kunde.query(
      "UPDATE gesicht SET person_id = NULL WHERE gruppe_id = $1 AND person_id = $2",
      [gruppeId, Number(p.person_id)],
    );
    await kunde.query(
      "UPDATE gruppe SET entschieden_am = now(), entschieden_von = $2 WHERE id = $1",
      [gruppeId, von],
    );
    await kunde.query("COMMIT");
    return { ok: true, anzahl: ergebnis.rowCount ?? 0 };
  } catch (f) {
    await kunde.query("ROLLBACK");
    throw f;
  } finally {
    kunde.release();
  }
}

/** Als unwichtig ablegen – eine Entscheidung, kein Löschen. */
export async function haeufchenAblegen(gruppeId: number, von: number): Promise<Ergebnis> {
  const zeile = await eineZeile<{ anzahl: string }>(
    `SELECT count(*) AS anzahl FROM gesicht
      WHERE gruppe_id = $1 AND person_id IS NOT NULL AND ausgenommen_am IS NULL`,
    [gruppeId],
  );
  if (Number(zeile?.anzahl ?? 0) > 0) {
    return {
      ok: false,
      fehler: "Dieses Häufchen ist einer Person zugeordnet. Erst die Person lösen.",
    };
  }
  await abfrage(
    `UPDATE gruppe SET zustand = 'unwichtig', entschieden_am = now(), entschieden_von = $2
      WHERE id = $1`,
    [gruppeId, von],
  );
  return { ok: true };
}

/** Aus der Ablage zurückholen. */
export async function haeufchenZurueckholen(gruppeId: number, von: number): Promise<Ergebnis> {
  await abfrage(
    `UPDATE gruppe SET zustand = 'offen', entschieden_am = now(), entschieden_von = $2
      WHERE id = $1`,
    [gruppeId, von],
  );
  return { ok: true };
}

/**
 * Die neu dazugekommenen Funde eines benannten Häufchens übernehmen.
 *
 * Ein Lauf schreibt `person_id` nie – so steht es in CLAUDE.md, und dabei
 * bleibt es. Nach jedem Lauf hängen deshalb an einem benannten Häufchen neue
 * Funde ohne Person. Dieser Knopf ist das eine Ja dazu, und davor steht, wie
 * viele es sind und wie sie aussehen.
 */
export async function neueUebernehmen(gruppeId: number, von: number): Promise<Ergebnis> {
  const p = await eineZeile<{ person_id: number }>(
    `SELECT person_id::int AS person_id FROM gesicht
      WHERE gruppe_id = $1 AND person_id IS NOT NULL AND ausgenommen_am IS NULL
      GROUP BY person_id ORDER BY count(*) DESC LIMIT 1`,
    [gruppeId],
  );
  if (!p) return { ok: false, fehler: "Dieses Häufchen trägt keinen Namen." };
  return haeufchenZuweisen(gruppeId, Number(p.person_id), von);
}

/**
 * Ein einzelnes Gesicht aus dem Häufchen nehmen.
 *
 * `gruppe_id` BLEIBT stehen. Ohne sie wäre der Fund unauffindbar und die
 * Rücknahme unmöglich; gezählt wird er nirgends mehr, und ein Lauf fasst ihn
 * wegen `ausgenommen_am` nicht mehr an – auch nicht, um ihn erneut
 * zuzuordnen. Genau das verlangt der Auftrag.
 */
export async function gesichtHerausnehmen(gesichtId: number, von: number): Promise<Ergebnis> {
  const zeile = await eineZeile<{ gruppe_id: number | null }>(
    `UPDATE gesicht
        SET ausgenommen_am = now(), ausgenommen_von = $2, person_id = NULL
      WHERE id = $1 AND ausgenommen_am IS NULL
      RETURNING gruppe_id::int AS gruppe_id`,
    [gesichtId, von],
  );
  if (!zeile) return { ok: false, fehler: "Dieser Fund ist bereits herausgenommen." };
  return { ok: true, id: zeile.gruppe_id === null ? undefined : Number(zeile.gruppe_id) };
}

/** Die Herausnahme rückgängig machen. Der Fund ist sofort wieder im Häufchen. */
export async function gesichtZurueckholen(gesichtId: number): Promise<Ergebnis> {
  await abfrage(
    "UPDATE gesicht SET ausgenommen_am = NULL, ausgenommen_von = NULL WHERE id = $1",
    [gesichtId],
  );
  return { ok: true };
}

export async function personUmbenennen(id: number, name: string): Promise<Ergebnis> {
  const g = namePruefen(name);
  if (!g.ok) return { ok: false, fehler: g.fehler };
  const vorhanden = await eineZeile<{ id: number }>(
    "SELECT id::int AS id FROM person WHERE lower(name) = lower($1) AND id <> $2",
    [g.wert, id],
  );
  if (vorhanden) return { ok: false, fehler: `„${g.wert}" gibt es schon.` };
  await abfrage("UPDATE person SET name = $2 WHERE id = $1", [id, g.wert]);
  return { ok: true };
}

/**
 * Eine Person auflösen.
 *
 * Die Funde bleiben, die Zuordnung fällt weg, die Bilder rührt niemand an.
 * Die Häufchen stehen danach wieder als offene Frage in der Liste – das ist
 * gewollt: die Zuordnung war falsch oder überflüssig, die Gruppierung der
 * Maschine deswegen noch nicht.
 */
export async function personAufloesen(id: number): Promise<Ergebnis> {
  const kunde = await vorrat.connect();
  try {
    await kunde.query("BEGIN");
    const ergebnis = await kunde.query("UPDATE gesicht SET person_id = NULL WHERE person_id = $1", [id]);
    await kunde.query("DELETE FROM person WHERE id = $1", [id]);
    await kunde.query("COMMIT");
    return { ok: true, anzahl: ergebnis.rowCount ?? 0 };
  } catch (f) {
    await kunde.query("ROLLBACK");
    throw f;
  } finally {
    kunde.release();
  }
}

/**
 * Der Ausschnitt eines Fundes – Kasten und Pfadangaben der Ansichtsfassung.
 *
 * Steht hier und nicht in der Route, weil `sichtbar` dazugehört: die Route
 * liefert ein Bild aus, und ein Gesicht aus einem gesperrten Jahrgang oder aus
 * einer vorgemerkt gelöschten Aufnahme darf nicht über die Leitung gehen.
 */
export async function ausschnitt(
  gesichtId: number,
  sicht: Sicht,
): Promise<{ jahr: number; monat: number; sha256: string; kasten: number[] } | null> {
  const s = sichtbar(sicht, { ab: 2, praefix: "b." });
  const z = await eineZeile<{ jahr: number; monat: number; sha256: string; kasten: number[] }>(
    `SELECT b.jahr, b.monat, b.sha256, g.kasten
       FROM gesicht g JOIN bild b ON b.id = g.bild_id
      WHERE g.id = $1 AND b.vorschau_erzeugt AND ${s.text}`,
    [gesichtId, ...s.werte],
  );
  return z ?? null;
}
