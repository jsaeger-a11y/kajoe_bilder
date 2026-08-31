-- 006-jahre.sql
-- Jahresfreischaltung je Benutzer.
--
-- Anlass ist konkret: fuer den Familienkalender bekommt jemand von aussen
-- Zugriff auf genau den Jahrgang, aus dem der Kalender entsteht – und auf
-- keinen anderen.
--
-- Das kehrt eine fruehere Entscheidung um. In docs/anforderungen.md stand,
-- feiner als die beiden Rollen werde es nicht, weil es keinen Jahrgang gebe,
-- den nicht jeder sehen duerfe. Das galt fuer den Haushalt und nicht fuer
-- Gaeste.
--
-- NULL ist die Vorgabe und der Normalfall:
--
--   NULL          alle Jahre, AUCH KUENFTIGE
--   {2025,2026}   genau diese Jahre
--   {}            keines
--
-- Der Unterschied zwischen NULL und einer Liste aller heute vorhandenen Jahre
-- ist der wichtige Teil: bei NULL erscheint 2027 von selbst, sobald die ersten
-- Bilder aus 2027 eingelesen sind. Muesste jemand eine Liste nachfuehren,
-- stuende im Januar der ganze Haushalt ohne den neuen Jahrgang da – und der
-- Fehler faellt erst auf, wenn jemand sein Bild sucht.
--
-- Bestehende Konten bekommen deshalb NULL und nicht die heutigen Jahre. Ohne
-- DEFAULT und ohne NOT NULL ist das genau das, was ALTER TABLE ohnehin tut.
--
-- SMALLINT[] wie bild.jahr. Keine CHECK-Bedingung auf gueltige Jahreszahlen:
-- welche Jahre es gibt, sagen die Daten (SELECT DISTINCT jahr FROM bild) und
-- nicht eine Regel, die jemand nachfuehren muesste.
--
-- Ein Verwalter ist nie eingeschraenkt, unabhaengig vom Feld. Das steht im
-- Code (web/src/lib/sichtbar.ts) und nicht hier: eine Datenbankregel koennte
-- es nicht ausdruecken, ohne die Rolle mitzulesen, und zwei Orte fuer
-- dieselbe Aussage laufen auseinander.

BEGIN;

ALTER TABLE benutzer
    ADD COLUMN jahre SMALLINT[];

COMMENT ON COLUMN benutzer.jahre IS
    'Freigeschaltete Jahrgaenge. NULL = alle, auch kuenftige (Vorgabe).
     {2025,2026} = genau diese. {} = keines. Ein Verwalter ist nie
     eingeschraenkt, unabhaengig vom Wert; durchgesetzt wird das in
     web/src/lib/sichtbar.ts.';

COMMIT;
