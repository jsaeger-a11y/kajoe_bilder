-- 009-screenshot.sql
-- Bildschirmfotos bekommen eine eigene Herkunft.
--
-- Bisher landeten sie in `ohne_exif` – dem Sammelbecken fuer alles ohne
-- `Make`: Weitergeleitetes aus Messengern, Netzfunde, Bildschirmfotos. Drei
-- sehr verschiedene Dinge unter einem Namen, und wer nach echten Aufnahmen
-- suchte, musste sich durch die Bildschirmfotos hindurcharbeiten.
--
-- Erkannt wird an der KOMBINATION, ohne KI (siehe CLAUDE.md):
--
--   * die Bildmasse entsprechen exakt einer bekannten Bildschirmaufloesung
--     (tools/bildschirmgroessen.txt, hoch wie quer)
--   * UND `Make` fehlt
--   * UND es ist ein Bild, kein Video
--
-- Jede Bedingung fuer sich waere falsch: nur die Masse zu pruefen faenge
-- zugeschnittene Fotos ein, nur `Make` ist genau das, was vorher geschah, und
-- ohne die dritte Bedingung wuerde jedes Full-HD-Video ohne Kameradaten zum
-- Bildschirmfoto – im Bestand tragen 1.013 Videos die Masse 1920x1080.
--
-- Die Reihenfolge im Ingest ist Bildschirmfoto VOR ohne_exif. Andersherum
-- griffe die weitere Regel zuerst und die neue nie.
--
-- Bildschirmfotos werden NICHT verworfen, weder beim Einlesen noch danach.
-- Anders als bei den Wildkamerabildern gibt es dafuer keinen zwingenden
-- Grund, und die Erkennung ist neu. Sie bekommen eine Kategorie, mehr nicht;
-- wer sie loswerden will, filtert und raeumt zweistufig auf.
--
-- Diese Migration aendert KEINE vorhandene Zeile. Der Nachlauf ueber den
-- Bestand ist ein eigener, wiederholbarer Vorgang
-- (ingest/screenshots_nachtragen.py) und laeuft erst auf ausdrueckliche
-- Freigabe.

BEGIN;

ALTER TABLE bild DROP CONSTRAINT bild_herkunft_gueltig;

ALTER TABLE bild ADD CONSTRAINT bild_herkunft_gueltig
    CHECK (herkunft IN ('iphone', 'apple_sonstig', 'fremd', 'ohne_exif', 'screenshot'));

COMMENT ON COLUMN bild.herkunft IS
    'iphone | apple_sonstig | fremd | ohne_exif | screenshot.
     Ersetzt die urspruenglich geplante Objekterkennung – es gibt keine KI in
     diesem Projekt. `screenshot` heisst: Bildmasse gleich einer bekannten
     Bildschirmaufloesung UND kein Make UND typ = bild.';

COMMIT;
