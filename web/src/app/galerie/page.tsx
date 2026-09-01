import type { Metadata } from "next";
import Link from "next/link";

import {
  SEITENGROESSE, alleIds, dauertext, filterAusSuche, galerielink, istEingeschraenkt,
  monatstext, seite, suchtext, trefferzahlen, zeitraeume, type Kachel,
} from "@/lib/galerie";
import { abfrage } from "@/lib/db";
import { type Groessenzeile } from "@/lib/herunterladen";
import { eigeneListen } from "@/lib/listen";
import {
  auswahlAusSuche, auswahlteile, istMarkiert, umschalten,
} from "@/lib/markierung";
import { HOECHSTENS_JE_VORGANG } from "@/lib/rechte";
import { sichtVon, sichtbar } from "@/lib/sichtbar";
import { zellmitte } from "@/lib/zelle";
import { darf, verlangeAnmeldung } from "@/lib/zugriff";
import Kopf from "../kopf";
import Auswahlleiste from "./auswahlleiste";
import Paketformular from "../paketformular";
import Filterleiste from "./filterleiste";
import KeinJahr from "../keinjahr";

export const metadata: Metadata = { title: "Galerie" };

function datum(d: Date): string {
  const t = new Date(d);
  return `${String(t.getUTCDate()).padStart(2, "0")}.${String(t.getUTCMonth() + 1).padStart(2, "0")}.`;
}

function uhrzeit(d: Date): string {
  const t = new Date(d);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

export default async function Galerie({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const wer = await verlangeAnmeldung();
  const sicht = sichtVon(wer);
  const suche = await searchParams;
  const filter = filterAusSuche(suche);
  const auswahl = auswahlAusSuche(suche);

  const [{ kacheln, treffer }, zahlen, raeume, listen] = await Promise.all([
    seite(filter, sicht),
    trefferzahlen(filter, sicht),
    zeitraeume(filter, sicht),
    eigeneListen(wer.benutzerId, sicht),
  ]);

  const seiten = Math.max(1, Math.ceil(treffer / SEITENGROESSE));
  const eingeschraenkt = istEingeschraenkt(filter);

  // "alle Treffer waehlen" kennt der Server, nicht der Browser: die Kennungen
  // der Bilder, die gerade nicht auf dem Schirm stehen, hat sonst niemand.
  const alleTrefferIds = auswahl.aktiv && eingeschraenkt ? await alleIds(filter, sicht) : [];

  // Fuer die Groessenschaetzung des Pakets – nur wenn ueberhaupt etwas
  // markiert ist, sonst waere es eine Abfrage fuer nichts.
  const sichtbarkeit = sichtbar(sicht, { ab: 2 });
  const markierteZeilen: Groessenzeile[] = auswahl.ids.length
    ? await abfrage<Groessenzeile>(
        `SELECT dateityp, typ, dateigroesse, breite, hoehe
           FROM bild WHERE id = ANY($1::bigint[]) AND ${sichtbarkeit.text}`,
        [auswahl.ids, ...sichtbarkeit.werte],
      )
    : [];

  const gruppen: { jahr: number; monat: number; stuecke: Kachel[] }[] = [];
  for (const k of kacheln) {
    const letzte = gruppen.at(-1);
    if (letzte && letzte.jahr === k.jahr && letzte.monat === k.monat) letzte.stuecke.push(k);
    else gruppen.push({ jahr: k.jahr, monat: k.monat, stuecke: [k] });
  }

  const zusatz = auswahlteile(auswahl);
  const anhang = suchtext(filter, {}, zusatz);
  const blaettern = (s: number) => `/galerie${suchtext(filter, { seite: s }, zusatz)}`;

  return (
    <main>
      <Kopf wer={wer} />
      <h1>Galerie</h1>

      <Filterleiste filter={filter} zahlen={zahlen} treffer={treffer} zeitraeume={raeume} />

      {/*
        Dass ein Kartenausschnitt filtert, muss dastehen. Sonst sucht jemand
        ein Bild, das in dieser Zelle nun einmal nicht liegt, und haelt die
        Galerie fuer kaputt. Dazu der Weg zurueck an dieselbe Stelle der Karte
        – Mitte und Zoomstufe stecken in der Zelle, es braucht keine
        zusaetzliche Angabe in der Adresse.
      */}
      {filter.zelle !== null ? (
        <p className="hinweis-filter">
          <strong>Kartenausschnitt</strong> – gezeigt werden nur die{" "}
          <strong>{treffer}</strong> Aufnahmen aus der angeklickten Gruppe
          (Stufe {filter.zelle.stufe}). Aufnahmen <em>ohne Ort</em> erscheinen hier
          nicht.{" "}
          {darf(wer, "karte") ? (
            <Link href={`/karte${suchtext({ ...filter, zelle: null, ort: "alle", seite: 1 }, {},
              [`lat=${zellmitte(filter.zelle).lat.toFixed(5)}`,
               `lon=${zellmitte(filter.zelle).lon.toFixed(5)}`,
               `z=${filter.zelle.stufe}`])}`}>
              zurück zur Karte
            </Link>
          ) : null}
          {" · "}
          <Link href={`/galerie${suchtext({ ...filter, zelle: null, seite: 1 })}`}>
            Ausschnitt aufheben
          </Link>
        </p>
      ) : null}

      <div className="filterzeile">
        <b>Auswahl</b>
        {auswahl.aktiv ? (
          <>
            <Link className="marke-filter gewaehlt" href={`/galerie${suchtext(filter)}`}>
              Auswahl beenden
            </Link>
            {auswahl.ids.length ? (
              <Link className="marke-filter"
                    href={`/galerie${suchtext(filter, {}, ["w=1"])}`}>
                Markierungen aufheben
              </Link>
            ) : null}
            {eingeschraenkt ? (
              <Link className="marke-filter"
                    href={`/galerie${suchtext(filter, {}, ["w=1", `m=${alleTrefferIds.join(",")}`])}`}>
                alle {Math.min(treffer, HOECHSTENS_JE_VORGANG)} Treffer wählen
                {treffer > HOECHSTENS_JE_VORGANG ? ` (von ${treffer})` : ""}
              </Link>
            ) : null}
          </>
        ) : (
          <Link className="marke-filter" href={`/galerie${suchtext(filter, {}, ["w=1"])}`}>
            Bilder auswählen
          </Link>
        )}
      </div>

      {auswahl.aktiv && !eingeschraenkt ? (
        /*
          Ohne Einschraenkung traefe eine Sammelauswahl den ganzen Bestand.
          Statt eines Schalters, der nichts tut, steht hier, was noch fehlt.
        */
        <p className="hinweis-filter">
          Für „alle Treffer wählen“ fehlt noch ein Filter – gerade sind alle{" "}
          {zahlen.gesamt} Aufnahmen im Blick. Wähle oben ein Jahr, einen Monat, eine
          Herkunft, einen Typ oder <em>mit Ort</em>. Einzeln markieren geht schon jetzt.
        </p>
      ) : null}

      {auswahl.aktiv ? (
        <Auswahlleiste
          ids={auswahl.ids}
          listen={listen.map((l) => ({ id: l.id, name: l.name, anzahl: l.anzahl }))}
          darfLoeschen={darf(wer, "loeschen")}
          grenze={HOECHSTENS_JE_VORGANG}
        />
      ) : null}

      {auswahl.ids.length ? (
        <Paketformular zeilen={markierteZeilen} ids={auswahl.ids} was="markierte Aufnahmen" />
      ) : null}

      {sicht.jahre?.length === 0 ? <KeinJahr /> : null}

      {kacheln.length === 0 && sicht.jahre?.length !== 0 ? (
        <p className="hinweis">Zu diesen Filtern gibt es nichts.</p>
      ) : null}

      {gruppen.map((g) => (
        <section key={`${g.jahr}-${g.monat}`}>
          <h2 className="monatskopf">
            {monatstext(g.jahr, g.monat)} <span>{g.stuecke.length} auf dieser Seite</span>
          </h2>
          <div className="gitter">
            {g.stuecke.map((k) => {
              const laenge = dauertext(k.dauer_sekunden);
              const markiert = istMarkiert(auswahl, k.id);
              // Im Auswahlmodus ein VERWEIS, kein Kaestchen – siehe
              // src/lib/markierung.ts, Abschnitt defaultChecked.
              const ziel = auswahl.aktiv
                ? `/galerie${suchtext(filter, {}, auswahlteile(umschalten(auswahl, k.id)))}#k${k.id}`
                : `/bild/${k.id}${anhang}`;
              return (
                <Link
                  key={k.id}
                  id={`k${k.id}`}
                  href={ziel}
                  className={`kachel${markiert ? " markiert" : ""}`}
                  title={`${datum(k.aufnahme_lokal)} ${uhrzeit(k.aufnahme_lokal)}`}
                  aria-pressed={auswahl.aktiv ? markiert : undefined}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/datei/${k.id}/vorschau`} alt="" loading="lazy"
                       decoding="async" width={300} height={300} />
                  <span className="marke">
                    {datum(k.aufnahme_lokal)} {uhrzeit(k.aufnahme_lokal)}
                  </span>
                  {k.typ === "video" ? (
                    <span className="tag">▶ Video{laenge ? ` ${laenge}` : ""}</span>
                  ) : null}
                  {auswahl.aktiv ? (
                    <span className="haken">{markiert ? "✓" : ""}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      {seiten > 1 ? (
        <nav className="blaettern">
          {filter.seite > 1 ? <Link href={blaettern(filter.seite - 1)}>← neuere</Link>
                            : <span>← neuere</span>}
          <span>Seite {filter.seite} von {seiten} · {treffer} Aufnahmen</span>
          {filter.seite < seiten ? <Link href={blaettern(filter.seite + 1)}>ältere →</Link>
                                 : <span>ältere →</span>}
        </nav>
      ) : null}
    </main>
  );
}
