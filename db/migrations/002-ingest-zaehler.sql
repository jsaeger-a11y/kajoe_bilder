-- 002-ingest-zaehler.sql
-- Zwei Zaehler mehr im Laufbericht.
--
-- Uebersprungene Wildkamerabilder und MOV-Dateien mit gleichnamigem Bild
-- gehoeren in den Laufbericht (siehe CLAUDE.md und docs/auftrag-phase1a.md).
-- Sie in `bemerkung` als Fliesstext abzulegen hiesse, sie spaeter nicht mehr
-- zaehlen zu koennen – und genau das Zaehlen ist der Zweck: wer am Ende
-- 11.800 von 14.000 Dateien in der Datenbank findet, muss sehen koennen, wo
-- die uebrigen geblieben sind.

BEGIN;

ALTER TABLE ingest_lauf
    ADD COLUMN uebersprungen INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN mov_mit_bildpartner INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN ingest_lauf.uebersprungen IS
    'Wildkamerabilder (Make beginnt mit ZEISS oder VenTrade). Sie gehoeren zum
     Jagdprojekt auf hunter und bekommen hier keine Zeile in bild.';

COMMENT ON COLUMN ingest_lauf.mov_mit_bildpartner IS
    'MOV-Dateien, zu denen eine gleichnamige Bilddatei im selben Ordner liegt –
     das Merkmal eines Live Photo. Ueber OneDrive kommt der Bewegtteil nicht
     an; in der Messung 2026 war die Zahl null. Wird trotzdem mitgezaehlt,
     damit es auffaellt statt vermutet zu werden, falls die alten Jahrgaenge
     anders aussehen.';

COMMIT;
