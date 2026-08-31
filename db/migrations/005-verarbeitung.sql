-- 005-verarbeitung.sql
-- Verarbeitungslaeufe mit Fortschritt.
--
-- `ingest_lauf` wurde bisher erst am ENDE geschrieben. Fuer eine Anzeige, die
-- waehrend der Arbeit etwas zeigt, reicht das nicht – und fuer die Frage
-- "laeuft ueberhaupt noch etwas?" erst recht nicht.

BEGIN;

-- ---------------------------------------------------------------------------
-- Ein Lauf, ein Schritt
-- ---------------------------------------------------------------------------

-- Eine gemeinsame Tabelle fuer beide Schritte statt zweier fast gleicher:
-- die Anzeige fragt "was laeuft gerade", und das soll EINE Abfrage sein.
CREATE TABLE verarbeitung (
    id              BIGSERIAL   PRIMARY KEY,

    schritt         TEXT        NOT NULL,   -- 'einlesen' | 'ableiten'
    zustand         TEXT        NOT NULL DEFAULT 'laeuft',

    -- NULL heisst: von Hand ueber tools/ angestossen, nicht aus der
    -- Oberflaeche. Beide Wege muessen weiter gehen.
    angestossen_von INTEGER     REFERENCES benutzer(id),

    begonnen_am     TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Wird alle hundert Dateien fortgeschrieben. Steht sie still und der
    -- Prozess ist tot, war es ein Absturz.
    aktualisiert_am TIMESTAMPTZ NOT NULL DEFAULT now(),
    beendet_am      TIMESTAMPTZ,

    gesamt          INTEGER     NOT NULL DEFAULT 0,
    erledigt        INTEGER     NOT NULL DEFAULT 0,

    -- Beim Einlesen zeigt diese Spalte auf die Zeile mit den Einzelheiten
    -- (gefunden, uebernommen, Dubletten, Quarantaene, uebersprungen).
    ingest_lauf_id  BIGINT      REFERENCES ingest_lauf(id),

    -- Beim Ableiten stehen die Zahlen hier: eine eigene Tabelle dafuer waere
    -- eine dritte fast gleiche.
    erzeugt         INTEGER     NOT NULL DEFAULT 0,
    uebersprungen   INTEGER     NOT NULL DEFAULT 0,
    fehlgeschlagen  INTEGER     NOT NULL DEFAULT 0,

    bemerkung       TEXT,

    -- Zum Erkennen einer verwaisten Sperre: laeuft der Prozess noch?
    pid             INTEGER,
    rechner         TEXT,

    CONSTRAINT verarbeitung_schritt_gueltig
        CHECK (schritt IN ('einlesen', 'ableiten')),
    CONSTRAINT verarbeitung_zustand_gueltig
        CHECK (zustand IN ('laeuft', 'fertig', 'fehler', 'abgebrochen'))
);

COMMENT ON COLUMN verarbeitung.pid IS
    'Prozessnummer des Laufs. Steht der Zustand auf laeuft und gibt es den
     Prozess nicht mehr, ist der Lauf abgestuerzt – ohne diese Angabe
     blockierte eine verwaiste Zeile jeden weiteren Anstoss.';

CREATE INDEX verarbeitung_offen_idx ON verarbeitung (begonnen_am DESC)
    WHERE beendet_am IS NULL;
CREATE INDEX verarbeitung_zeit_idx  ON verarbeitung (begonnen_am DESC);

-- ---------------------------------------------------------------------------
-- Takt: der Verlauf, nicht nur der Stand
-- ---------------------------------------------------------------------------

-- Aus einem einzelnen Stand laesst sich keine Restzeit rechnen. Erst zwei
-- Messpunkte ergeben ein Tempo, und das Tempo der letzten Minuten ist etwas
-- anderes als der Durchschnitt seit dem Start: HEIC dauert laenger als PNG,
-- und ein Lauf, der gerade an Videos arbeitet, ist langsamer als sein
-- Mittelwert vermuten laesst.
CREATE TABLE verarbeitung_takt (
    verarbeitung_id BIGINT      NOT NULL REFERENCES verarbeitung(id) ON DELETE CASCADE,
    zeitpunkt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    erledigt        INTEGER     NOT NULL,

    PRIMARY KEY (verarbeitung_id, zeitpunkt)
);

-- ---------------------------------------------------------------------------
-- Fehler beim Ableiten – namentlich
-- ---------------------------------------------------------------------------

-- Quarantaenefaelle des Einlesens stehen schon in `quarantaene`. Was beim
-- Ableiten scheitert, hatte bisher keinen Ort: gezaehlt wurde es, benannt
-- nicht. Wer am Ende drei Fehlschlaege sieht und nicht weiss, welche Dateien
-- es waren, kann nichts damit anfangen.
CREATE TABLE verarbeitung_fehler (
    id              BIGSERIAL   PRIMARY KEY,
    verarbeitung_id BIGINT      NOT NULL REFERENCES verarbeitung(id) ON DELETE CASCADE,
    bild_id         BIGINT      REFERENCES bild(id),
    pfad            TEXT        NOT NULL,
    grund           TEXT        NOT NULL,
    zeitpunkt       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX verarbeitung_fehler_lauf_idx ON verarbeitung_fehler (verarbeitung_id);

-- ---------------------------------------------------------------------------
-- Auch der Ingest-Lauf schreibt jetzt mit
-- ---------------------------------------------------------------------------

ALTER TABLE ingest_lauf
    ADD COLUMN aktualisiert_am TIMESTAMPTZ;

COMMENT ON COLUMN ingest_lauf.aktualisiert_am IS
    'Alle hundert Dateien fortgeschrieben. Bricht ein Lauf ab, steht in der
     Zeile trotzdem, wie weit er kam.';

COMMIT;
