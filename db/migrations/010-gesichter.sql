-- 010-gesichter.sql
-- Gesichter finden und gruppieren (Phase 9a). Nicht 009 wie im Auftrag: die
-- Nummer war seit dem Bildschirmfoto-Auftrag belegt.
--
-- Das ist das erste Modell in diesem Projekt. CLAUDE.md hat "keine KI" bis
-- hierher als nicht verhandelbar gefuehrt; die Regel ist mit diesem Auftrag
-- ausdruecklich eingegrenzt worden (siehe dort): kein Modell entscheidet, was
-- verworfen oder wie sortiert wird – das bleibt bei Make und Massen. Ein
-- Modell macht VORSCHLAEGE, die ein Mensch bestaetigt. Genau deshalb gibt es
-- hier zwei Spalten, die nie ineinander ueberschrieben werden:
--
--   gesicht.gruppe_id   Maschinenvorschlag – darf ein neuer Lauf aendern
--   gesicht.person_id   menschliche Zuordnung – aendert ein Lauf NIE
--
-- Wer den einen Wert mit dem anderen ueberschreibt, kann spaeter nicht mehr
-- sagen, wie verlaesslich die Zuordnungen sind.
--
-- Der Vektor liegt als real[] (512 Werte, L2-normiert). KEIN pgvector: bei der
-- zu erwartenden Menge reicht die Rechnung in Bloecken von Hand, eine
-- Datenbankerweiterung waere dasselbe Uebermass wie PostGIS fuer die Karte.
--
-- `person` ist fuer 9b (Benennen). Das Schema steht schon, gefuellt wird es
-- dort.

BEGIN;

-- Jeder Lauf wird protokolliert, wie ingest_lauf und aufraeumlauf. Ein
-- Vorgang, der Stunden rechnet, braucht eine Zeile, an der man sieht, ob er
-- durchkam – und wie schnell.
CREATE TABLE gesichtslauf (
    id               BIGSERIAL   PRIMARY KEY,
    begonnen_am      TIMESTAMPTZ NOT NULL DEFAULT now(),
    aktualisiert_am  TIMESTAMPTZ NOT NULL DEFAULT now(),
    beendet_am       TIMESTAMPTZ,
    zustand          TEXT        NOT NULL DEFAULT 'laeuft',  -- laeuft | fertig | abgebrochen
    modell           TEXT        NOT NULL,
    -- Fortschritt
    bilder_geplant   INTEGER     NOT NULL DEFAULT 0,
    bilder           INTEGER     NOT NULL DEFAULT 0,
    gesichter        INTEGER     NOT NULL DEFAULT 0,
    -- Gruppierung
    tauglich         INTEGER,
    gruppen_neu      INTEGER,
    zugeordnet       INTEGER,
    -- Messwerte
    sekunden_je_bild REAL,
    temperatur_max   REAL,
    bemerkung        TEXT,
    pid              INTEGER,
    boot_kennung     TEXT,
    CONSTRAINT gesichtslauf_zustand_gueltig
        CHECK (zustand IN ('laeuft', 'fertig', 'abgebrochen'))
);

CREATE TABLE person (
    id           BIGSERIAL   PRIMARY KEY,
    name         TEXT        NOT NULL UNIQUE,
    angelegt_am  TIMESTAMPTZ NOT NULL DEFAULT now(),
    bemerkung    TEXT
);

-- Ein Haeufchen. Der Vertreter wird nach dem Anlegen der Gesichter gesetzt
-- (Verweis in beide Richtungen, deshalb unten per ALTER).
CREATE TABLE gruppe (
    id               BIGSERIAL   PRIMARY KEY,
    groesse          INTEGER     NOT NULL DEFAULT 0,
    vertreter_id     BIGINT,
    mittelvektor     REAL[]      NOT NULL,
    angelegt_am      TIMESTAMPTZ NOT NULL DEFAULT now(),
    aktualisiert_am  TIMESTAMPTZ NOT NULL DEFAULT now(),
    lauf_id          BIGINT      REFERENCES gesichtslauf(id),
    bemerkung        TEXT
);

-- Ein Fund je Zeile.
CREATE TABLE gesicht (
    id            BIGSERIAL   PRIMARY KEY,
    bild_id       BIGINT      NOT NULL REFERENCES bild(id),
    -- Kasten auf der ANSICHTSFASSUNG (~1600 px), nicht auf dem Original:
    -- x1, y1, x2, y2 in Bildpunkten.
    kasten        INTEGER[]   NOT NULL,
    guete         REAL        NOT NULL,   -- Detektor, 0..1
    vektor        REAL[]      NOT NULL,   -- 512 Werte, L2-normiert
    -- Merkmale fuer die Qualitaetsbeurteilung. Die Schwellen dazu stehen im
    -- Code an einer Stelle (ingest/gesichter.py, SCHWELLEN), nicht hier:
    -- sie werden am Piloten eingestellt, und eine Spalte "tauglich" waere
    -- ein zweiter Ort fuer dieselbe Regel.
    groesse       INTEGER     NOT NULL,   -- kuerzere Kastenseite in px
    schaerfe      REAL,                   -- Laplace-Varianz des Ausschnitts
    nick          REAL,                   -- Kopfhaltung in Grad (pitch)
    gier          REAL,                   --                     (yaw)
    roll          REAL,                   --                     (roll)
    -- Maschinenvorschlag
    gruppe_id     BIGINT      REFERENCES gruppe(id),
    gruppe_aehnlichkeit REAL,             -- Kosinus zum Mittelvektor bei Zuordnung
    -- Menschliche Zuordnung – ein Lauf schreibt hier NIE.
    person_id     BIGINT      REFERENCES person(id),
    modell        TEXT        NOT NULL,
    erkannt_am    TIMESTAMPTZ NOT NULL DEFAULT now(),
    lauf_id       BIGINT      REFERENCES gesichtslauf(id),
    CONSTRAINT gesicht_kasten_vier CHECK (array_length(kasten, 1) = 4),
    CONSTRAINT gesicht_vektor_512  CHECK (array_length(vektor, 1) = 512)
);

ALTER TABLE gruppe
    ADD CONSTRAINT gruppe_vertreter_fkey
    FOREIGN KEY (vertreter_id) REFERENCES gesicht(id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX gesicht_bild_idx   ON gesicht (bild_id);
CREATE INDEX gesicht_gruppe_idx ON gesicht (gruppe_id);
CREATE INDEX gesicht_person_idx ON gesicht (person_id) WHERE person_id IS NOT NULL;

-- Fortschritt am Datensatz: ein Bild gilt als bearbeitet, sobald hier ein
-- Zeitpunkt steht – auch dann, wenn kein Gesicht darauf war. Ohne diese
-- Markierung muesste ein zweiter Lauf raten, welche Bilder er schon hatte,
-- und "kein Gesicht gefunden" saehe aus wie "noch nicht angesehen".
ALTER TABLE bild
    ADD COLUMN gesichter_am     TIMESTAMPTZ,
    ADD COLUMN gesichter_modell TEXT;

-- Die Auswahl "noch nicht bearbeitet" ist der Hauptweg jedes Laufs.
CREATE INDEX bild_gesichter_offen_idx ON bild (id)
    WHERE gesichter_am IS NULL AND typ = 'bild' AND geloescht_am IS NULL;

COMMENT ON TABLE gesicht IS
    'Ein Fund des Gesichtsdetektors je Zeile, auf der Ansichtsfassung.
     gruppe_id ist der Maschinenvorschlag, person_id die menschliche
     Zuordnung – nie das eine mit dem anderen ueberschreiben.';

COMMIT;
