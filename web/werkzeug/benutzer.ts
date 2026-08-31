/**
 * Konten anlegen und verwalten – von der Kommandozeile, nicht aus dem Browser.
 *
 * **Das erste Konto entsteht hier und nirgends sonst.** Es gibt keine offene
 * Registrierung, und eine Webseite "ersten Verwalter anlegen" waere eine Tuer,
 * die jemand findet, bevor sie geschlossen wird.
 *
 * **Das Passwort ist nie ein Aufrufargument.** Argumente stehen in der
 * Shell-Geschichte und fuer jeden anderen Benutzer in `ps`. Gefragt wird auf
 * dem Terminal ohne Anzeige; fuer Skripte gibt es --passwort-von-stdin.
 *
 * Aufruf ueber tools/benutzer.sh.
 */

import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { Pool } from "pg";

import { hashe, PASSWORT_MINDESTLAENGE } from "../src/lib/passwort.ts";
import { DATENBANK } from "../src/lib/umgebung.ts";

const ROLLEN = ["verwalter", "betrachter"] as const;

const vorrat = new Pool({ ...DATENBANK, max: 2 });

function hilfe(): never {
  console.log(`Aufruf: tools/benutzer.sh <befehl> [...]

  liste                            alle Konten zeigen
  anlegen <name> [rolle]           Konto anlegen (Vorgabe: betrachter)
  passwort <name>                  Passwort neu setzen, beendet alle Sitzungen
  rolle <name> <verwalter|betrachter>
  abschalten <name>                aktiv = false, beendet alle Sitzungen
  einschalten <name>               aktiv = true
  entsperren <name>                fehlversuche = 0
  jahre <name> alle|keine|2024,2025
                                   Jahrgaenge freischalten. "alle" heisst
                                   NULL: alle Jahre, auch kuenftige.
  sitzungen                        laufende Sitzungen zeigen

Passwoerter werden abgefragt, nie als Argument uebergeben.
Mit --passwort-von-stdin wird die erste Zeile der Standardeingabe genommen.`);
  process.exit(1);
}

async function passwortErfragen(frage: string): Promise<string> {
  if (process.argv.includes("--passwort-von-stdin")) {
    const teile: Buffer[] = [];
    for await (const stueck of process.stdin) teile.push(stueck as Buffer);
    return Buffer.concat(teile).toString("utf8").split("\n")[0];
  }
  if (!process.stdin.isTTY) {
    throw new Error(
      "Kein Terminal. Fuer Skripte --passwort-von-stdin verwenden.",
    );
  }

  // Ausgabe unterdruecken, damit das Passwort nicht auf dem Bildschirm steht.
  let stumm = false;
  const gedaempft = new Writable({
    write(stueck, _kodierung, fertig) {
      if (!stumm) process.stdout.write(stueck);
      fertig();
    },
  });
  const leser = createInterface({ input: process.stdin, output: gedaempft, terminal: true });

  const antwort = await new Promise<string>((aufloesen) => {
    leser.question(frage, (wert) => aufloesen(wert));
    stumm = true;
  });
  leser.close();
  process.stdout.write("\n");
  return antwort;
}

async function neuesPasswort(): Promise<string> {
  const eins = await passwortErfragen("Passwort: ");
  if (eins.length < PASSWORT_MINDESTLAENGE) {
    throw new Error(`Zu kurz – mindestens ${PASSWORT_MINDESTLAENGE} Zeichen.`);
  }
  if (!process.argv.includes("--passwort-von-stdin")) {
    const zwei = await passwortErfragen("Wiederholen: ");
    if (eins !== zwei) throw new Error("Die beiden Eingaben stimmen nicht ueberein.");
  }
  return eins;
}

async function kontoNummer(name: string): Promise<number> {
  const { rows } = await vorrat.query(
    `SELECT id::int AS id FROM benutzer WHERE lower(benutzername) = lower($1)`,
    [name],
  );
  if (!rows[0]) throw new Error(`Kein Konto mit dem Namen ${name}.`);
  return Number(rows[0].id);
}

async function liste(): Promise<void> {
  const { rows } = await vorrat.query(
    `SELECT b.id::int AS id, b.benutzername, b.rolle, b.aktiv, b.fehlversuche, b.jahre,
            to_char(b.letzte_anmeldung, 'YYYY-MM-DD HH24:MI') AS letzte,
            (SELECT count(*) FROM sitzung s
              WHERE s.benutzer_id = b.id AND s.laeuft_ab_am > now()) AS sitzungen
       FROM benutzer b ORDER BY b.benutzername`,
  );
  if (!rows.length) {
    console.log("Noch kein Konto angelegt.");
    return;
  }
  console.log(
    "Nr.  Name                 Rolle       Zustand       Fehl  Sitz  Jahrgaenge        letzte Anmeldung",
  );
  for (const z of rows) {
    // Ein Verwalter ist nie eingeschraenkt, unabhaengig vom Feld – das steht
    // hier genauso dran, sonst liest jemand eine Liste und glaubt, sie gelte.
    const jahre =
      z.rolle === "verwalter"
        ? "alle (Verwalter)"
        : z.jahre === null
          ? "alle + kuenftige"
          : z.jahre.length === 0
            ? "KEINE"
            : z.jahre.join(",");
    console.log(
      String(z.id).padEnd(5) +
        String(z.benutzername).padEnd(21) +
        String(z.rolle).padEnd(12) +
        (z.aktiv ? "aktiv" : "abgeschaltet").padEnd(14) +
        String(z.fehlversuche).padEnd(6) +
        String(z.sitzungen).padEnd(6) +
        jahre.padEnd(18) +
        (z.letzte ?? "–"),
    );
  }
}

async function main(): Promise<void> {
  const argumente = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [befehl, name, dritt] = argumente;
  if (!befehl) hilfe();

  switch (befehl) {
    case "liste":
      await liste();
      break;

    case "sitzungen": {
      const { rows } = await vorrat.query(
        `SELECT s.id::int AS id, b.benutzername,
                to_char(s.angelegt_am, 'YYYY-MM-DD HH24:MI') AS seit,
                to_char(s.laeuft_ab_am, 'YYYY-MM-DD HH24:MI') AS bis,
                host(s.ip) AS ip
           FROM sitzung s JOIN benutzer b ON b.id = s.benutzer_id
          WHERE s.laeuft_ab_am > now() ORDER BY s.angelegt_am DESC`,
      );
      if (!rows.length) console.log("Keine laufende Sitzung.");
      for (const z of rows) {
        console.log(`${String(z.id).padEnd(5)}${String(z.benutzername).padEnd(21)}${z.seit} bis ${z.bis}  ${z.ip ?? "–"}`);
      }
      break;
    }

    case "anlegen": {
      if (!name) hilfe();
      const rolle = dritt ?? "betrachter";
      if (!(ROLLEN as readonly string[]).includes(rolle)) {
        throw new Error(`Rolle muss ${ROLLEN.join(" oder ")} sein.`);
      }
      if (!/^[a-z0-9._-]{3,40}$/i.test(name)) {
        throw new Error("Benutzername: 3 bis 40 Zeichen, nur Buchstaben, Ziffern, . _ -");
      }
      const { rows } = await vorrat.query(
        `SELECT 1 FROM benutzer WHERE lower(benutzername) = lower($1)`,
        [name],
      );
      if (rows.length) throw new Error(`Den Namen ${name} gibt es schon.`);

      const passwort = await neuesPasswort();
      const { rows: neu } = await vorrat.query(
        `INSERT INTO benutzer (benutzername, passwort_hash, rolle)
         VALUES ($1, $2, $3) RETURNING id::int AS id`,
        [name, await hashe(passwort), rolle],
      );
      console.log(`Konto ${name} angelegt, Nummer ${neu[0].id}, Rolle ${rolle}.`);
      break;
    }

    case "passwort": {
      if (!name) hilfe();
      const id = await kontoNummer(name);
      const passwort = await neuesPasswort();
      await vorrat.query(
        `UPDATE benutzer SET passwort_hash = $2, fehlversuche = 0 WHERE id = $1`,
        [id, await hashe(passwort)],
      );
      const { rowCount } = await vorrat.query(`DELETE FROM sitzung WHERE benutzer_id = $1`, [id]);
      console.log(`Passwort gesetzt. ${rowCount ?? 0} Sitzung(en) beendet.`);
      break;
    }

    case "rolle": {
      if (!name || !dritt) hilfe();
      if (!(ROLLEN as readonly string[]).includes(dritt)) {
        throw new Error(`Rolle muss ${ROLLEN.join(" oder ")} sein.`);
      }
      const id = await kontoNummer(name);
      await vorrat.query(`UPDATE benutzer SET rolle = $2 WHERE id = $1`, [id, dritt]);
      console.log(`${name} ist jetzt ${dritt}.`);
      break;
    }

    /**
     * Jahrgaenge von der Kommandozeile setzen.
     *
     * Der Weg fuer den Alltag ist die Benutzerverwaltung. Dieser hier ist der
     * Rueckweg, wenn niemand mehr hineinkommt – so wie das erste Konto auch
     * hier und nirgends sonst entsteht.
     */
    case "jahre": {
      if (!name || !dritt) hilfe();
      const id = await kontoNummer(name);

      if (dritt === "alle") {
        await vorrat.query(`UPDATE benutzer SET jahre = NULL WHERE id = $1`, [id]);
        console.log(`${name}: alle Jahre, auch kuenftige.`);
        break;
      }

      const gewaehlt =
        dritt === "keine"
          ? []
          : [...new Set(dritt.split(",").map((s) => Number(s.trim())))].sort((a, b) => a - b);
      if (gewaehlt.some((j) => !Number.isInteger(j) || j < 1900 || j > 2999)) {
        throw new Error("Jahre als Zahlen mit Komma dazwischen, z.B. 2024,2025.");
      }

      const { rows: da } = await vorrat.query(
        `SELECT DISTINCT jahr FROM bild WHERE geloescht_am IS NULL`,
      );
      const vorhanden = new Set(da.map((z) => Number(z.jahr)));
      const unbekannt = gewaehlt.filter((j) => !vorhanden.has(j));

      await vorrat.query(`UPDATE benutzer SET jahre = $2::smallint[] WHERE id = $1`, [
        id, gewaehlt,
      ]);
      console.log(
        `${name}: ${gewaehlt.length ? gewaehlt.join(", ") : "KEIN Jahrgang"}.` +
          // Nicht abweisen, nur sagen: ein Jahrgang, der noch nicht eingelesen
          // ist, laesst sich sinnvoll vorab freischalten.
          (unbekannt.length
            ? ` Hinweis: ${unbekannt.join(", ")} gibt es im Bestand (noch) nicht.`
            : ""),
      );
      break;
    }

    case "abschalten": {
      if (!name) hilfe();
      const id = await kontoNummer(name);
      const { rows } = await vorrat.query(
        `SELECT count(*) AS n FROM benutzer WHERE rolle='verwalter' AND aktiv AND id <> $1`,
        [id],
      );
      if (Number(rows[0].n) === 0) {
        throw new Error("Es muss mindestens ein aktiver Verwalter uebrig bleiben.");
      }
      await vorrat.query(`UPDATE benutzer SET aktiv = FALSE WHERE id = $1`, [id]);
      const { rowCount } = await vorrat.query(`DELETE FROM sitzung WHERE benutzer_id = $1`, [id]);
      console.log(`${name} abgeschaltet (nicht geloescht). ${rowCount ?? 0} Sitzung(en) beendet.`);
      break;
    }

    case "einschalten": {
      if (!name) hilfe();
      await vorrat.query(`UPDATE benutzer SET aktiv = TRUE WHERE id = $1`, [
        await kontoNummer(name),
      ]);
      console.log(`${name} eingeschaltet.`);
      break;
    }

    case "entsperren": {
      if (!name) hilfe();
      await vorrat.query(`UPDATE benutzer SET fehlversuche = 0 WHERE id = $1`, [
        await kontoNummer(name),
      ]);
      console.log(`${name} entsperrt.`);
      break;
    }

    default:
      hilfe();
  }
}

main()
  .then(() => vorrat.end())
  .catch(async (fehler: unknown) => {
    console.error(`FEHLER: ${fehler instanceof Error ? fehler.message : String(fehler)}`);
    await vorrat.end();
    process.exit(1);
  });
