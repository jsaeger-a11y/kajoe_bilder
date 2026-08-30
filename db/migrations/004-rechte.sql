-- 004-rechte.sql
-- Einzelne Rechte je Benutzer, zusaetzlich zur Rolle.
--
-- Ein Verwalter darf ohnehin alles. Diese Spalte ist fuer den Fall, dass ein
-- Betrachter etwas Bestimmtes duerfen soll, ohne gleich Verwalter zu werden.
--
-- Als LISTE und nicht als einzelnes Ja/Nein, obwohl zunaechst nur `loeschen`
-- darin steht: ein zweiter Fall ist bereits bekannt. Ob die Karte allen
-- sichtbar sein soll oder nur Verwaltern, ist in CLAUDE.md ausdruecklich
-- offen. Eine Spalte `darf_loeschen` muesste dann eine zweite bekommen, und
-- die dritte kaeme bestimmt auch noch.
--
-- Welche Kennungen es gibt, steht im Code an einer Stelle
-- (web/src/lib/rechte.ts) und bewusst NICHT als Datenbankregel: eine
-- CHECK-Bedingung ueber einer Liste zwingt zu einer Migration, sobald ein
-- Recht dazukommt, und der Gewinn waere gering.

BEGIN;

ALTER TABLE benutzer
    ADD COLUMN rechte TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN benutzer.rechte IS
    'Einzelne Rechte zusaetzlich zur Rolle, z.B. {loeschen}. Ein Verwalter
     darf ohnehin alles; diese Liste ist fuer Betrachter gedacht. Die
     gueltigen Kennungen stehen in web/src/lib/rechte.ts.';

COMMIT;
