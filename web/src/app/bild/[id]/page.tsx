import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { eineZeile } from "@/lib/db";
import { dauertext, filterAusSuche, nachbarn, suchtext } from "@/lib/galerie";
import { verlangeAnmeldung } from "@/lib/zugriff";
import Kopf from "../../kopf";
import Abspieler from "./abspieler";

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

  const filter = filterAusSuche(await searchParams);

  const b = await eineZeile<Zeile>(
    `SELECT id::int AS id, sha256, dateiname, dateityp, dateigroesse, typ, herkunft,
            geraet_hersteller, geraet_modell, aufnahme_lokal, aufnahme_utc,
            zeitversatz, zeitquelle, breite, hoehe, dauer_sekunden, video_codec,
            hdr, lat, lon, gps_status, wiedergabe_erzeugt, eingelesen_am
       FROM bild WHERE id = $1 AND geloescht_am IS NULL`,
    [nummer],
  );
  if (!b) notFound();

  // Geblaettert wird INNERHALB der gefilterten Menge. Sonst springt man aus der
  // Auswahl heraus, in der man gerade sucht.
  const rundum = await nachbarn(filter, b.aufnahme_lokal, b.id);
  const anhang = suchtext(filter);
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
