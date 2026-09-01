-- 007-aufraeumlauf.sql
-- Protokoll der Aufraeumlaeufe.
--
-- Der Aufraeumlauf ist der EINZIGE Vorgang im System, der Dateien wirklich
-- entfernt. Bisher lief er von Hand, und wer ihn anstiess, sah den Bericht.
-- Sobald ein Timer ihn anstoesst, sieht ihn niemand mehr – und ein Vorgang,
-- der unbeobachtet loescht, ist derselbe Fall wie eine ungetestete Sicherung.
--
-- Deshalb dieselbe Regel wie bei `ingest_lauf` und `verarbeitung`: jeder Lauf
-- wird protokolliert, und `tools/status.sh` zeigt die letzten. Ohne das weiss
-- niemand, ob ein Lauf sauber durchkam, in der Mitte abbrach oder an der
-- Obergrenze haengenblieb.
--
-- Die Zahlen heissen `_faellig` und nicht `_entfernt`: sie sagen, was der Lauf
-- GEFUNDEN hat. Ob es auch wegkam, steht in `modus`. Ein Probelauf, der
-- "12 entfernt" protokollierte, waere eine Luege in der Datenbank.

BEGIN;

CREATE TABLE aufraeumlauf (
    id              BIGSERIAL   PRIMARY KEY,
    begonnen_am     TIMESTAMPTZ NOT NULL DEFAULT now(),
    beendet_am      TIMESTAMPTZ,

    -- 'probe' zaehlt nur, 'scharf' entfernt. Der Schalter steht in der .env
    -- (AUFRAEUMEN_SCHARF) und nicht im Skript.
    modus           TEXT        NOT NULL,
    -- 'timer' oder 'hand'. Ein Lauf von Hand mitten am Tag erklaert sonst
    -- spaeter niemand mehr.
    ausloeser       TEXT        NOT NULL,

    -- Datenbankseite
    sitzungen_faellig INTEGER   NOT NULL DEFAULT 0,
    versuche_faellig  INTEGER   NOT NULL DEFAULT 0,

    -- Dateiseite (ingest/aufraeumen.py). NULL heisst: kam nicht dazu.
    zeilen_faellig  INTEGER,
    dateien_faellig INTEGER,
    bytes_faellig   BIGINT,

    -- 'fertig'  durchgelaufen
    -- 'grenze'  Obergrenze ueberschritten, ABGEBROCHEN, nichts entfernt
    -- 'fehler'  abgebrochen mit Fehler
    -- NULL      laeuft noch oder der Prozess ist gestorben
    ausgang         TEXT,
    bemerkung       TEXT,

    CONSTRAINT aufraeumlauf_modus_gueltig
        CHECK (modus IN ('probe', 'scharf')),
    CONSTRAINT aufraeumlauf_ausloeser_gueltig
        CHECK (ausloeser IN ('timer', 'hand')),
    CONSTRAINT aufraeumlauf_ausgang_gueltig
        CHECK (ausgang IS NULL OR ausgang IN ('fertig', 'grenze', 'fehler'))
);

CREATE INDEX aufraeumlauf_zeit_idx ON aufraeumlauf (begonnen_am DESC);

COMMENT ON TABLE aufraeumlauf IS
    'Ein Eintrag je Aufraeumlauf. Die _faellig-Zahlen sagen, was gefunden
     wurde; ob es entfernt wurde, steht in modus. Angezeigt in
     tools/status.sh.';

COMMIT;
