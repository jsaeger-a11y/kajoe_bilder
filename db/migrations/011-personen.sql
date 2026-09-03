-- 011-personen.sql
-- Personen benennen und finden (Phase 9b).
--
-- 9a hat Haeufchen gebildet: `gesicht.gruppe_id` ist der Maschinenvorschlag.
-- Hier kommt die menschliche Seite dazu. Dabei bleibt es bei EINER Stelle, an
-- der steht, wer auf einem Fund zu sehen ist:
--
--     gesicht.person_id    die menschliche Zuordnung – MASSGEBLICH
--     gruppe.zustand       die Entscheidung "das interessiert nicht"
--
-- **Bewusst KEINE Spalte `gruppe.person_id`.** Sie waere ein zweiter Ort fuer
-- dieselbe Tatsache, und zwei Faesser derselben Wahrheit laufen auseinander –
-- in diesem Projekt schon dreimal passiert (DATABASE_URL, die Herkunftsregel,
-- die Zellrechnung der Karte). Wem ein Haeufchen zugeordnet ist, ergibt sich
-- aus seinen Funden; die Abfrage dazu steht in `web/src/lib/personen.ts` an
-- einer Stelle. Das hat einen zweiten Vorteil: `--neu-gruppieren` in 9a darf
-- die Haeufchen verwerfen, ohne dass eine einzige menschliche Zuordnung
-- verlorengeht.
--
-- Ein Haeufchen ist damit
--
--     offen        zustand = 'offen'  und kein Fund traegt eine Person
--     benannt      mindestens ein Fund traegt eine Person
--     abgelegt     zustand = 'unwichtig'
--
-- Die Tabellen `person` und `gruppe` selbst gibt es seit 010.

BEGIN;

-- Wer einen Namen vergibt, wird vermerkt. Das ist keine Buchfuehrung um ihrer
-- selbst willen: Benennen legt fest, wer im Archiv namentlich auffindbar ist,
-- und beruehrt damit Rechte Dritter. Wenn spaeter jemand fragt, wie ein Name
-- hierher kam, soll die Antwort in der Datenbank stehen und nicht in einer
-- Erinnerung.
ALTER TABLE person
    ADD COLUMN angelegt_von INTEGER REFERENCES benutzer(id);

-- "Unwichtig" ist eine ENTSCHEIDUNG, kein Loeschen. Das Haeufchen bleibt
-- vollstaendig stehen und verschwindet nur aus der Liste der offenen Fragen.
-- Der Grund steht im Auftrag: passt spaeter ein neues Gesicht dazu, ordnet der
-- naechste Lauf es diesem Haeufchen zu – und es taucht NICHT wieder als offene
-- Frage auf. Sonst legt man dieselbe Nachbarin jedes Jahr aufs Neue weg.
ALTER TABLE gruppe
    ADD COLUMN zustand         TEXT NOT NULL DEFAULT 'offen',
    ADD COLUMN entschieden_am  TIMESTAMPTZ,
    ADD COLUMN entschieden_von INTEGER REFERENCES benutzer(id),
    ADD CONSTRAINT gruppe_zustand_gueltig CHECK (zustand IN ('offen', 'unwichtig'));

-- Ein einzelnes Gesicht aus einem Haeufchen herausnehmen.
--
-- Ein blosses Zuruecksetzen von `gruppe_id` genuegt nicht: der naechste Lauf
-- sucht sich genau die Funde ohne Haeufchen und legte dasselbe fremde Gesicht
-- wieder dazu. Deshalb ein eigener Vermerk, den kein Lauf anfasst und der die
-- Auswahl des Laufs einschraenkt (siehe `_lade` in `ingest/gesichter.py`).
ALTER TABLE gesicht
    ADD COLUMN ausgenommen_am  TIMESTAMPTZ,
    ADD COLUMN ausgenommen_von INTEGER REFERENCES benutzer(id);

-- Die offenen Haeufchen werden nach Groesse absteigend gezeigt – das ist der
-- Hauptweg der Benennseite, und bei hunderten Haeufchen ist es der einzige,
-- der sich lohnt.
CREATE INDEX gruppe_zustand_groesse_idx ON gruppe (zustand, groesse DESC);

-- Die Ausgenommenen sind wenige; ein Teilindex genuegt und kostet nichts.
CREATE INDEX gesicht_ausgenommen_idx ON gesicht (id) WHERE ausgenommen_am IS NOT NULL;

COMMENT ON COLUMN gruppe.zustand IS
    'offen | unwichtig. "unwichtig" heisst abgelegt, nicht geloescht: das
     Haeufchen bleibt, nimmt weiter neue Funde auf und stellt keine Frage mehr.';

COMMENT ON COLUMN gesicht.ausgenommen_am IS
    'Von Hand aus dem Haeufchen genommen. Ein Lauf fasst diesen Fund nicht mehr
     an – ohne den Vermerk wuerde er ihn beim naechsten Mal wieder zuordnen.';

COMMIT;
