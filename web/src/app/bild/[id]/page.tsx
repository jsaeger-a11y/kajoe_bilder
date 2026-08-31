import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { eineZeile } from "@/lib/db";
import { dauertext, filterAusSuche, nachbarn, suchtext } from "@/lib/galerie";
import { unveraendert } from "@/lib/herunterladen";
import { eigeneListen, inWievielenListen } from "@/lib/listen";
import { auswahlAusSuche, auswahlteile, istMarkiert, umschalten } from "@/lib/markierung";
import { LOESCHFRIST_TAGE } from "@/lib/rechte";
import { NICHT_GELOESCHT } from "@/lib/sichtbar";
import { darf, verlangeAnmeldung } from "@/lib/zugriff";
import { einzelVormerken } from "../../vorgemerkt/aktionen";
import Kopf from "../../kopf";
import Abspieler from "./abspieler";
import InListe from "./aktionen";

export const metadata: Metadata = { title: "Aufnahme" };

interface Zeile {
  id: number;
  sha256: string;
  dateiname: string;
  dateityp: string;
  dateigroesse: string;
  typ: string;
  herkunft: string;
  geraet_hersteller: string | null;
  geraet_modell: string | null;
  aufnahme_lokal: Date;
  aufnahme_utc: Date | null;
  zeitversatz: string | null;
  zeitquelle: string;
  breite: number | null;
  hoehe: number | null;
  dauer_sekunden: string | null;
  video_codec: string | null;
  hdr: boolean;
  lat: number | null;
  lon: number | null;
  gps_status: string;
  wiedergabe_erzeugt: boolean;
  eingelesen_am: Date;
}

const ZEITQUELLE_TEXT: Record<string, string> = {
  exif: "aus den Aufnahmedaten der Kamera (EXIF)",
  dateiname: "aus dem Muster im Dateinamen hergeleitet",
  ordner: "aus dem Ordnernamen hergeleitet",
  dateizeit: "aus der Dateizeit hergeleitet",
};

function zeitstempel(d: Date): string {
  const t = new Date(d);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${z(t.getUTCDate())}.${z(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}, ${z(t.getUTCHours())}:${z(t.getUTCMinutes())}`;
}

function groessentext(bytes: string | number): string {
  const b = Number(bytes);
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(b / 1024)} kB`;
}

export default async function Einzelansicht({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const wer = await verlangeAnmeldung();
  const nummer = Number((await params).id);
  if (!Number.isInteger(nummer) || nummer < 1) notFound();

  const suche = await searchParams;
  const filter = filterAusSuche(suche);
  const auswahl = auswahlAusSuche(suche);
  const tun = String(suche.tun ?? "");

  const b = await eineZeile<Zeile>(
    `SELECT id::int AS id, sha256, dateiname, dateityp, dateigroesse, typ, herkunft,
            geraet_hersteller, geraet_modell, aufnahme_lokal, aufnahme_utc,
            zeitversatz, zeitquelle, breite, hoehe, dauer_sekunden, video_codec,
            hdr, lat, lon, gps_status, wiedergabe_erzeugt, eingelesen_am
       FROM bild WHERE id = $1 AND ${NICHT_GELOESCHT}`,
    [nummer],
  );
  if (!b) notFound();

  // Geblaettert wird INNERHALB der gefilterten Menge. Sonst springt man aus der
  // Auswahl heraus, in der man gerade sucht.
  const [rundum, listen, inListenAnzahl] = await Promise.all([
    nachbarn(filter, b.aufnahme_lokal, b.id),
    eigeneListen(wer.benutzerId),
    inWievielenListen(b.id),
  ]);
  const zusatz = auswahlteile(auswahl);
  const anhang = suchtext(filter, {}, zusatz);
  const markiert = istMarkiert(auswahl, b.id);
  const darfLoeschen = darf(wer, "loeschen");
  const laenge = dauertext(b.dauer_sekunden);
  const hergeleitet = b.zeitquelle !== "exif";

  return (
    <main>
      <Kopf wer={wer} />

      <nav className="blaettern">
        {rundum.vorher !== null ? (
          <Link href={`/bild/${rundum.vorher}${anhang}`}>← neuere</Link>
        ) : (
          <span>← neuere</span>
        )}
        <Link href={`/galerie${anhang}`}>
          zurück zur Galerie · {rundum.stelle} von {rundum.treffer}
        </Link>
        {rundum.nachher !== null ? (
          <Link href={`/bild/${rundum.nachher}${anhang}`}>ältere →</Link>
        ) : (
          <span>ältere →</span>
        )}
      </nav>

      <div className="filterzeile">
        <b>Dieses Bild</b>
        {/* Ein VERWEIS, kein Kaestchen – die Markierung steht in der Adresse
            und ueberlebt damit jedes Blaettern. */}
        <Link
          className={`marke-filter${markiert ? " gewaehlt" : ""}`}
          href={`/bild/${b.id}${suchtext(filter, {}, auswahlteile(umschalten(auswahl, b.id)))}`}
        >
          {markiert ? "✓ markiert" : "markieren"}
        </Link>
        {auswahl.ids.length ? (
          <Link className="marke-filter" href={`/galerie${suchtext(filter, {}, zusatz)}`}>
            {auswahl.ids.length} markiert – zur Auswahl
          </Link>
        ) : null}
        {darfLoeschen ? (
          tun === "loeschen" ? (
            <Link className="marke-filter gewaehlt" href={`/bild/${b.id}${anhang}`}>
              Abbrechen
            </Link>
          ) : (
            <Link className="marke-filter"
                  href={`/bild/${b.id}${suchtext(filter, {}, [...zusatz, "tun=loeschen"])}`}>
              Zum Löschen vormerken …
            </Link>
          )
        ) : null}
      </div>

      {darfLoeschen && tun === "loeschen" ? (
        <div className="karte">
          <p>
            Dieses Bild zum Löschen vormerken? Es verschwindet aus der Galerie, die
            Datei bleibt <strong>{LOESCHFRIST_TAGE} Tage</strong> liegen und lässt sich
            unter <em>Vorgemerkt</em> zurückholen.
          </p>
          {inListenAnzahl > 0 ? (
            <p className="fehler">
              Achtung: Dieses Bild steht in <strong>{inListenAnzahl}</strong>{" "}
              Auswahlliste(n). Eine Sammellöschung würde es überspringen – hier, einzeln,
              wird es mitgenommen.
            </p>
          ) : null}
          <form action={einzelVormerken} className="nebeneinander">
            <input type="hidden" name="bild" value={b.id} />
            <input type="hidden" name="zurueck" value={`/galerie${anhang}`} />
            <button className="haupt" type="submit">Ja, vormerken</button>
            <Link className="marke-filter" href={`/bild/${b.id}${anhang}`}>Abbrechen</Link>
          </form>
        </div>
      ) : null}

      <div className="herunterladen">
        {/* Die Vorgabe ist das JPEG: das ist die Fassung, die ein
            Druckdienstleister annimmt. Ist das Original schon ein JPEG oder
            handelt es sich um ein Video, liefert auch dieser Weg die
            Originaldatei unveraendert aus – ein zweites Kodieren waere eine
            weitere Generation ohne jeden Gewinn. */}
        {unveraendert(b, "jpeg") ? (
          <a className="haupt" href={`/herunterladen/bild/${b.id}?art=original`}>
            Herunterladen ({b.dateityp}, {groessentext(b.dateigroesse)})
          </a>
        ) : (
          <>
            <a className="haupt" href={`/herunterladen/bild/${b.id}?art=jpeg`}>
              Als JPEG herunterladen (volle Auflösung)
            </a>
            <a href={`/herunterladen/bild/${b.id}?art=original`}>
              Original ({b.dateityp}, {groessentext(b.dateigroesse)})
            </a>
          </>
        )}
      </div>

      <div className="einzel">
        <div className="buehne">
          {b.typ === "video" ? (
            <Abspieler id={b.id} fertig={b.wiedergabe_erzeugt} />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={`/datei/${b.id}/ansicht`} alt="" />
          )}
        </div>

        <div className="angaben">
          <dl>
            <dt>Aufgenommen</dt>
            <dd>
              {zeitstempel(b.aufnahme_lokal)} Uhr
              {b.zeitversatz ? ` (${b.zeitversatz})` : ""}
            </dd>

            <dt>Zeitquelle</dt>
            <dd>{ZEITQUELLE_TEXT[b.zeitquelle] ?? b.zeitquelle}</dd>

            <dt>Herkunft</dt>
            <dd>{b.herkunft}</dd>

            <dt>Gerät</dt>
            <dd>
              {b.geraet_hersteller || b.geraet_modell
                ? [b.geraet_hersteller, b.geraet_modell].filter(Boolean).join(" ")
                : "keine Angabe in der Datei"}
            </dd>

            <dt>Maße</dt>
            <dd>{b.breite && b.hoehe ? `${b.breite} × ${b.hoehe}` : "unbekannt"}</dd>

            <dt>Datei</dt>
            <dd>
              {b.dateityp}, {groessentext(b.dateigroesse)}
              <br />
              <span className="leise">{b.dateiname}</span>
            </dd>

            {b.typ === "video" ? (
              <>
                <dt>Video</dt>
                <dd>
                  {laenge ?? "?"} min, {b.video_codec ?? "?"}
                  {b.hdr ? ", HDR" : ""}
                </dd>
              </>
            ) : null}

            <dt>Ort</dt>
            <dd>
              {b.gps_status === "ok" && b.lat !== null && b.lon !== null
                ? `${b.lat.toFixed(5)}, ${b.lon.toFixed(5)}`
                : b.gps_status === "unplausibel"
                  ? "Koordinate unplausibel, verworfen"
                  : "keine Koordinate in der Datei"}
            </dd>

            <dt>Eingelesen</dt>
            <dd className="leise">{zeitstempel(b.eingelesen_am)} UTC</dd>
          </dl>

          <InListe bildId={b.id} listen={listen.map((l) => ({ id: l.id, name: l.name, anzahl: l.anzahl }))} />

          {inListenAnzahl > 0 ? (
            <p className="leise">
              Steht in {inListenAnzahl} Auswahlliste(n).
            </p>
          ) : null}

          {hergeleitet ? (
            <p className="herleitung">
              <strong>Das Datum ist hergeleitet, nicht gemessen.</strong> Die Datei
              trägt keinen Aufnahmezeitpunkt; der Wert oben stammt{" "}
              {b.zeitquelle === "dateiname"
                ? "aus dem Dateinamen (der die UTC-Zeit trägt und nach Europe/Berlin umgerechnet wurde)"
                : b.zeitquelle === "ordner"
                  ? "aus dem Ordnernamen und meint deshalb nur den Monat"
                  : "aus der Dateizeit und ist nach einem OneDrive-Abgleich meist das Kopierdatum"}
              . Für einen Kalender lohnt hier ein zweiter Blick.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
