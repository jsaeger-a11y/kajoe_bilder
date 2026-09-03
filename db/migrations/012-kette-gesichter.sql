-- 012-kette-gesichter.sql
-- Die Verarbeitungskette bekommt einen dritten Schritt (Phase 10).
--
-- Bisher kannte `verarbeitung.schritt` nur 'einlesen' und 'ableiten'. Der
-- Gesichtsschritt kommt dazu – und zwar in dieselbe Tabelle, nicht in eine
-- eigene: die Anzeige, die Restzeitrechnung, das Aufraeumen verwaister Zeilen
-- und die Sperre gegen einen zweiten Anstoss sind schon da und sollen fuer
-- alle drei Schritte gelten. Ein zweiter Weg daneben liefe frueher oder
-- spaeter auseinander.
--
-- Die fachlichen Zahlen eines Gesichtslaufs stehen weiter in `gesichtslauf` –
-- wie beim Einlesen, wo `ingest_lauf` die Zahlen haelt und `verarbeitung` nur
-- den Fortschritt. Damit der Bericht beides zusammen zeigen kann, bekommt
-- `verarbeitung` einen Verweis, genau wie `ingest_lauf_id`.

BEGIN;

-- Ein CHECK laesst sich nicht aendern, nur ersetzen.
ALTER TABLE verarbeitung DROP CONSTRAINT verarbeitung_schritt_gueltig;
ALTER TABLE verarbeitung ADD CONSTRAINT verarbeitung_schritt_gueltig
    CHECK (schritt IN ('einlesen', 'ableiten', 'gesichter'));

ALTER TABLE verarbeitung
    ADD COLUMN gesichtslauf_id BIGINT REFERENCES gesichtslauf(id);

COMMENT ON COLUMN verarbeitung.gesichtslauf_id IS
    'Verweis auf den fachlichen Lauf, wie ingest_lauf_id beim Einlesen.
     verarbeitung haelt den Fortschritt, gesichtslauf die Zahlen.';

COMMIT;
