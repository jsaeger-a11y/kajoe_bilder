-- 001-grundschema.sql
-- kajoe_bilder – Grundschema
--
-- Diese Datei wird nach dem ersten Lauf NICHT mehr geaendert. Alle weiteren
-- Aenderungen kommen als neue nummerierte Datei.
--
-- Nicht enthalten: Sitzungen und Anmeldung im Detail (Phase 3, eigene Migration,
-- weil die Form davon abhaengt, wie Auth.js verdrahtet wird).

BEGIN;

-- ---------------------------------------------------------------------------
-- Benutzer
-- ---------------------------------------------------------------------------

CREATE TABLE benutzer (
    id              SERIAL PRIMARY KEY,
    benutzername    TEXT        NOT NULL UNIQUE,
    passwort_hash   TEXT        NOT NULL,          -- argon2id, nie im Klartext
    rolle           TEXT        NOT NULL DEFAULT 'betrachter',
    aktiv           BOOLEAN     NOT NULL DEFAULT TRUE,
    fehlversuche    INTEGER     NOT NULL DEFAULT 0,
    angelegt_am     TIMESTAMPTZ NOT NULL DEFAULT now(),
    letzte_anmeldung TIMESTAMPTZ,

    CONSTRAINT benutzer_rolle_gueltig
        CHECK (rolle IN ('verwalter', 'betrachter'))
);

COMMENT ON COLUMN benutzer.aktiv IS
    'Abschalten statt loeschen: sonst verwaisen die Auswahllisten des Benutzers.';

-- Anmeldeversuche: jeder Ausgang, auch der erfolgreiche – sonst bleibt die eine
-- Frage offen, ob am Ende doch jemand durchkam. NIEMALS das Passwort, auch nicht
-- gekuerzt und nicht gehasht.
CREATE TABLE anmeldeversuch (
    id              BIGSERIAL PRIMARY KEY,
    zeitpunkt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    benutzername    TEXT,                          -- auch nicht vorhandene
    erfolgreich     BOOLEAN     NOT NULL,
    ip              INET,
    land            TEXT                           -- im Moment des Versuchs, spaeter
);                                                 -- aus einer IP nicht mehr zu klaeren

CREATE INDEX anmeldeversuch_zeit_idx ON anmeldeversuch (zeitpunkt DESC);

-- ---------------------------------------------------------------------------
-- Herkunft der Dateien
-- ---------------------------------------------------------------------------

-- Woher ein Schwung Dateien kam. Wird gebraucht, sobald ein zweites OneDrive-
-- Konto dazukommt: ohne diese Angabe ist spaeter nicht mehr zu klaeren, warum
-- ein Bild doppelt aussieht oder wem es gehoert.
CREATE TABLE quelle (
    id              SERIAL PRIMARY KEY,
    bezeichnung     TEXT        NOT NULL,          -- z.B. 'OneDrive Joerg'
    angelegt_am     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Jeder Durchlauf des Ingest. Ohne ihn weiss niemand, ob ein Lauf sauber
-- durchgekommen ist oder in der Mitte abgebrochen wurde.
CREATE TABLE ingest_lauf (
    id              BIGSERIAL PRIMARY KEY,
    quelle_id       INTEGER     REFERENCES quelle(id),
    begonnen_am     TIMESTAMPTZ NOT NULL DEFAULT now(),
    beendet_am      TIMESTAMPTZ,
    gefunden        INTEGER     NOT NULL DEFAULT 0,
    uebernommen     INTEGER     NOT NULL DEFAULT 0,
    dubletten       INTEGER     NOT NULL DEFAULT 0,
    quarantaene     INTEGER     NOT NULL DEFAULT 0,
    bemerkung       TEXT
);

-- ---------------------------------------------------------------------------
-- Dateien
-- ---------------------------------------------------------------------------

CREATE TABLE bild (
    id              BIGSERIAL PRIMARY KEY,

    -- Erkennung und Ablage -------------------------------------------------
    -- sha256 ist die EINZIGE Dublettenpruefung. Nie ueber den Dateinamen:
    -- iPhones zaehlen IMG_0001..IMG_9999 und fangen wieder von vorn an; zwei
    -- Telefone im Haushalt haben mit Sicherheit dieselben Namen.
    sha256          CHAR(64)    NOT NULL UNIQUE,
    dateiname       TEXT        NOT NULL,          -- wie sie hiess, zur Nachvollziehbarkeit
    pfad            TEXT        NOT NULL,          -- relativ zu /data/kajoe_bilder/original
    dateigroesse    BIGINT      NOT NULL,
    dateityp        TEXT        NOT NULL,          -- 'HEIC', 'JPEG', 'PNG', 'MOV', ...

    typ             TEXT        NOT NULL,          -- 'bild' | 'video'
    live_photo      BOOLEAN     NOT NULL DEFAULT FALSE,

    -- Herkunft -------------------------------------------------------------
    -- Ersetzt die urspruenglich geplante KI-Erkennung. 'Make = Apple' ist wahr
    -- oder falsch, kostet Millisekunden und irrt sich nie. Es wird NICHTS beim
    -- Einlesen verworfen – die Kategorie ist ein Filter, kein Ausschluss.
    herkunft        TEXT        NOT NULL,
    geraet_hersteller TEXT,                        -- EXIF Make
    geraet_modell   TEXT,                          -- EXIF Model
    quelle_id       INTEGER     REFERENCES quelle(id),
    ingest_lauf_id  BIGINT      REFERENCES ingest_lauf(id),

    -- Zeit -----------------------------------------------------------------
    -- ACHTUNG, andere Regel als im Jagdprojekt: fuehrend ist die ORTSZEIT der
    -- Aufnahme, nicht UTC. Fotos reisen mit. Ein Bild von Silvester 00:30
    -- Berliner Zeit ist 23:30 UTC am Vortag und laege sonst im falschen Jahr;
    -- ein Urlaubsbild aus Thailand von 10:00 Uhr laege als 03:00 UTC unter
    -- "nachts". Jahr und Monat kommen deshalb aus aufnahme_lokal.
    aufnahme_lokal  TIMESTAMP   NOT NULL,          -- OHNE Zeitzone, wie die Kamera zeigte
    aufnahme_utc    TIMESTAMPTZ,                   -- nur wenn OffsetTimeOriginal vorlag
    zeitversatz     TEXT,                          -- z.B. '+07:00', sonst NULL
    zeitquelle      TEXT        NOT NULL,          -- 'exif' | 'dateiname' | 'ordner' | 'dateizeit'

    -- Redundant zu aufnahme_lokal, aber bewusst gespeichert: die Galerie
    -- gruppiert danach, und ein Ausdruck ueber einer Zeitzone ist in Postgres
    -- nicht IMMUTABLE und taugt deshalb nicht als generierte Spalte.
    jahr            SMALLINT    NOT NULL,
    monat           SMALLINT    NOT NULL,

    -- Bild -----------------------------------------------------------------
    breite          INTEGER,
    hoehe           INTEGER,
    ausrichtung     SMALLINT,                      -- EXIF Orientation
    dauer_sekunden  NUMERIC(10,3),                 -- nur bei typ = 'video'
    video_codec     TEXT,                          -- 'hevc' | 'h264' | ...
    hdr             BOOLEAN     NOT NULL DEFAULT FALSE,

    -- Ort ------------------------------------------------------------------
    -- EXIF liefert Grad/Minute/Sekunde plus Himmelsrichtung. Beim Einlesen in
    -- Dezimalgrad umrechnen; S und W sind NEGATIV. Wer das vergisst, spiegelt
    -- seine Bilder auf die Nordhalbkugel.
    lat             DOUBLE PRECISION,
    lon             DOUBLE PRECISION,
    gps_status      TEXT        NOT NULL DEFAULT 'fehlt',   -- 'ok' | 'fehlt' | 'unplausibel'

    -- Ableitungen ----------------------------------------------------------
    -- Das Original wird nie angefasst. Vorschau und Ansicht sind JPEG.
    -- Das JPEG in voller Aufloesung entsteht erst beim Herunterladen.
    vorschau_erzeugt BOOLEAN    NOT NULL DEFAULT FALSE,
    -- Videos: H.264-Fassung in 1080p, erst beim ersten Abspielen erzeugt.
    -- Nicht vorab fuer alle: H.264 ist bei gleicher Qualitaet rund doppelt so
    -- gross wie HEVC, und die meisten Videos sieht ohnehin nie jemand an.
    wiedergabe_erzeugt BOOLEAN  NOT NULL DEFAULT FALSE,

    -- Verwaltung -----------------------------------------------------------
    eingelesen_am   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Zweistufiges Loeschen: erst vormerken, Datei faellt nach 30 Tagen im
    -- Aufraeumlauf. Ein Stapellauf ueber hunderte Bilder, der sofort loescht,
    -- ist nicht umkehrbar.
    geloescht_am    TIMESTAMPTZ,

    CONSTRAINT bild_typ_gueltig
        CHECK (typ IN ('bild', 'video')),
    CONSTRAINT bild_herkunft_gueltig
        CHECK (herkunft IN ('iphone', 'apple_sonstig', 'fremd', 'ohne_exif')),
    CONSTRAINT bild_zeitquelle_gueltig
        CHECK (zeitquelle IN ('exif', 'dateiname', 'ordner', 'dateizeit')),
    CONSTRAINT bild_gps_status_gueltig
        CHECK (gps_status IN ('ok', 'fehlt', 'unplausibel')),
    CONSTRAINT bild_monat_gueltig
        CHECK (monat BETWEEN 1 AND 12)
);

COMMENT ON COLUMN bild.live_photo IS
    'MOV-Datei, die zu einer gleichnamigen HEIC gehoert (unter 5 Sekunden).
     Zaehlt NICHT als Video – sonst stehen tausende Scheinvideos in der
     Videokategorie.';

COMMENT ON COLUMN bild.zeitquelle IS
    'Rangfolge beim Einlesen: exif > dateiname > ordner > dateizeit.
     Die Dateizeit steht ganz unten: nach einem OneDrive-Abgleich ist sie
     meist das Kopierdatum und damit der schlechteste verfuegbare Wert.';

-- Der Hauptweg der Galerie: eine Herkunft, ein Jahr, ein Monat, nicht geloescht.
CREATE INDEX bild_galerie_idx
    ON bild (herkunft, jahr, monat, aufnahme_lokal DESC)
    WHERE geloescht_am IS NULL;

CREATE INDEX bild_aufnahme_idx  ON bild (aufnahme_lokal DESC);
CREATE INDEX bild_geloescht_idx ON bild (geloescht_am) WHERE geloescht_am IS NOT NULL;
CREATE INDEX bild_gps_idx       ON bild (lat, lon)     WHERE gps_status = 'ok';

-- Dateien, die der Ingest nicht lesen konnte. Still uebergehen waere das
-- Schlimmste: man zaehlt hinterher 4.812 statt 4.830 und weiss nicht, welche
-- achtzehn fehlen.
CREATE TABLE quarantaene (
    id              BIGSERIAL PRIMARY KEY,
    pfad            TEXT        NOT NULL,
    dateigroesse    BIGINT,
    grund           TEXT        NOT NULL,
    ingest_lauf_id  BIGINT      REFERENCES ingest_lauf(id),
    festgestellt_am TIMESTAMPTZ NOT NULL DEFAULT now(),
    erledigt_am     TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- Auswahllisten
-- ---------------------------------------------------------------------------

-- Benannte Listen statt einer flachen Markierung: so laesst sich die Arbeit
-- unterbrechen und fortsetzen, und "Kalender 2027" steht neben "Kalender 2028".
-- Privat, mit Freigabeschalter.
CREATE TABLE auswahl (
    id              SERIAL PRIMARY KEY,
    besitzer_id     INTEGER     NOT NULL REFERENCES benutzer(id),
    name            TEXT        NOT NULL,
    freigegeben     BOOLEAN     NOT NULL DEFAULT FALSE,
    angelegt_am     TIMESTAMPTZ NOT NULL DEFAULT now(),
    geaendert_am    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT auswahl_name_je_besitzer UNIQUE (besitzer_id, name)
);

COMMENT ON COLUMN auswahl.freigegeben IS
    'Andere angemeldete Benutzer duerfen die Liste SEHEN, nicht aendern.
     Gefiltert wird in der Abfrage, nicht in der Anzeige – und JEDE Aktion
     prueft den Besitzer noch einmal: dass die Seite davor nur eigene Listen
     zeigt, ist keine Pruefung.';

CREATE TABLE auswahl_bild (
    auswahl_id      INTEGER     NOT NULL REFERENCES auswahl(id) ON DELETE CASCADE,
    bild_id         BIGINT      NOT NULL REFERENCES bild(id)    ON DELETE CASCADE,
    aufgenommen_am  TIMESTAMPTZ NOT NULL DEFAULT now(),
    notiz           TEXT,

    PRIMARY KEY (auswahl_id, bild_id)
);

CREATE INDEX auswahl_bild_bild_idx ON auswahl_bild (bild_id);

-- ---------------------------------------------------------------------------
-- Grunddaten
-- ---------------------------------------------------------------------------

INSERT INTO quelle (bezeichnung) VALUES ('OneDrive – Erstbestand');

COMMIT;
