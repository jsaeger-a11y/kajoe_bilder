import Link from "next/link";

import type { Fund, Haeufchen } from "@/lib/personen";

/**
 * Gemeinsame Bausteine der Personenseiten.
 *
 * Alles hier ist reine Anzeige. Die Prüfungen stehen in den Seiten, den
 * Actions und der Bildroute – ein ausgeblendeter Knopf ist keine Prüfung.
 */

export function zeitraum(von: Date | null, bis: Date | null): string {
  if (!von || !bis) return "–";
  const j = (d: Date) => new Date(d).getUTCFullYear();
  return j(von) === j(bis) ? String(j(von)) : `${j(von)} – ${j(bis)}`;
}

/** Die Unterleiste: wo liegt wie viel Arbeit. */
export function Unterleiste({
  hier,
  zahlen,
}: {
  hier: "personen" | "offen" | "benannt" | "abgelegt";
  zahlen: { offen: number; benannt: number; abgelegt: number; personen: number; neue: number };
}) {
  const punkt = (
    schluessel: typeof hier,
    ziel: string,
    text: string,
    anzahl: number,
  ) => (
    <Link href={ziel} className={`marke-filter${hier === schluessel ? " gewaehlt" : ""}`}>
      {text}
      <span className="zahl"> {anzahl}</span>
    </Link>
  );

  return (
    <div className="filterzeile">
      {punkt("personen", "/personen", "Personen", zahlen.personen)}
      {punkt("offen", "/haeufchen", "offene Häufchen", zahlen.offen)}
      {punkt("benannt", "/haeufchen/benannt", "benannt", zahlen.benannt)}
      {punkt("abgelegt", "/haeufchen/abgelegt", "abgelegt", zahlen.abgelegt)}
      {zahlen.neue > 0 ? (
        <span className="leise">{zahlen.neue} neue Funde warten auf ein Ja</span>
      ) : null}
    </div>
  );
}

/**
 * Ein Gesichtsausschnitt.
 *
 * Der Verweis führt zur Aufnahme, nicht zu einer Lupe: wer ein Gesicht nicht
 * erkennt, braucht das ganze Bild – die Umgebung sagt mehr als ein grösserer
 * Ausschnitt.
 */
export function Gesicht({
  fund,
  ziel,
  titel,
}: {
  fund: { id: number; bildId: number };
  ziel?: string;
  titel?: string;
}) {
  return (
    <Link className="gesicht-kachel" href={ziel ?? `/bild/${fund.bildId}`} title={titel}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/gesicht/${fund.id}`} alt="" loading="lazy" width={200} height={200} />
    </Link>
  );
}

/** Ein Häufchen als Kachel in der Liste. */
export function HaeufchenKachel({ h }: { h: Haeufchen }) {
  return (
    <Link className="haeufchen-kachel" href={`/haeufchen/${h.id}`}>
      {h.vertreter !== null ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={`/gesicht/${h.vertreter}`} alt="" loading="lazy" width={200} height={200} />
      ) : (
        <div className="gesicht-leer" />
      )}
      <div className="haeufchen-text">
        <strong>{h.personName ?? `Häufchen ${h.id}`}</strong>
        <span className="leise">
          {h.funde} Fund{h.funde === 1 ? "" : "e"} · {h.bilder} Aufnahmen
          <br />
          {zeitraum(h.von, h.bis)}
          {h.ohnePerson > 0 && h.personName ? (
            <>
              <br />
              <b>{h.ohnePerson} neu</b>
            </>
          ) : null}
        </span>
      </div>
    </Link>
  );
}

/** Blättern über gleichartige Seiten. */
export function Blaettern({
  pfad,
  seite,
  treffer,
  jeSeite,
}: {
  pfad: string;
  seite: number;
  treffer: number;
  jeSeite: number;
}) {
  const seiten = Math.max(1, Math.ceil(treffer / jeSeite));
  if (seiten <= 1) return null;
  const verweis = (s: number) => (s <= 1 ? pfad : `${pfad}?seite=${s}`);
  return (
    <nav className="blaettern">
      {seite > 1 ? <Link href={verweis(seite - 1)}>← zurück</Link> : <span>← zurück</span>}
      <span>
        Seite {seite} von {seiten}
      </span>
      {seite < seiten ? <Link href={verweis(seite + 1)}>weiter →</Link> : <span>weiter →</span>}
    </nav>
  );
}

/** Ein einzelner Fund in der Häufchenansicht, mit dem, was man damit tun kann. */
export function FundKachel({
  fund,
  gruppe,
  darfBenennen,
  herausnehmen,
  zurueckholen,
}: {
  fund: Fund;
  gruppe: number;
  darfBenennen: boolean;
  herausnehmen: (formular: FormData) => Promise<void>;
  zurueckholen: (formular: FormData) => Promise<void>;
}) {
  const wert = fund.aehnlichkeit === null ? "–" : fund.aehnlichkeit.toFixed(2);
  return (
    <div className={`fund${fund.ausgenommen ? " fund-aus" : ""}`}>
      <Gesicht
        fund={fund}
        titel={`Ähnlichkeit ${wert}${fund.personName ? ` · ${fund.personName}` : ""}`}
      />
      <span className="leise">{wert}</span>
      {fund.personName ? <span className="fund-person">{fund.personName}</span> : null}
      {darfBenennen ? (
        fund.ausgenommen ? (
          <form action={zurueckholen}>
            <input type="hidden" name="gesicht" value={fund.id} />
            <input type="hidden" name="gruppe" value={gruppe} />
            <button className="klein" type="submit">
              zurück
            </button>
          </form>
        ) : (
          <form action={herausnehmen}>
            <input type="hidden" name="gesicht" value={fund.id} />
            <button className="klein" type="submit" title="gehört nicht in dieses Häufchen">
              heraus
            </button>
          </form>
        )
      ) : null}
    </div>
  );
}
