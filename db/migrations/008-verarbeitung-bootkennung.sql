-- 008-verarbeitung-bootkennung.sql
-- Ein Neustart macht jede Prozessnummer wertlos.
--
-- `verwaiste_aufraeumen()` entscheidet bisher so: gleicher Rechnername, und
-- `os.kill(pid, 0)` sagt, ob es den Prozess noch gibt. Das traegt genau so
-- lange, wie der Rechner durchlaeuft.
--
-- Nach einem Neustart faengt die Vergabe der Prozessnummern wieder bei 1 an.
-- Eine Zeile, die mit `pid = 1473239` auf `laeuft` stehengeblieben ist, wird
-- dann irgendwann auf einen VOELLIG ANDEREN, lebenden Prozess treffen – und
-- gilt damit fuer immer als "laeuft noch". Der Rechnername ist derselbe, also
-- greift auch der zweite Riegel nicht.
--
-- Die Folge waere still und vollstaendig: `laeuft_schon()` findet die Zeile,
-- jeder weitere Anstoss wird abgewiesen, und in der Oberflaeche steht ein
-- Vorgang, den es nicht gibt. Kein Fehler, keine Meldung – die Verarbeitung
-- ist einfach tot.
--
-- Genau dieser Fall wird ab Phase 7 wahrscheinlich: `unattended-upgrades`
-- startet den Rechner um 03:45 UTC neu, wenn ein Sicherheitsstand es
-- verlangt, und kann dabei einen laufenden Ingest treffen.
--
-- Der Kern vergibt bei jedem Start eine neue Kennung
-- (`/proc/sys/kernel/random/boot_id`). Wer sie mitschreibt, erkennt eine
-- Zeile aus einem frueheren Start sofort und braucht die Prozessnummer gar
-- nicht mehr zu befragen.
--
-- Bestehende Zeilen bekommen NULL. Fuer sie gilt weiter die alte Pruefung –
-- sie sind alle abgeschlossen, und eine Migration soll keine Vergangenheit
-- erfinden.

BEGIN;

ALTER TABLE verarbeitung
    ADD COLUMN boot_kennung TEXT;

COMMENT ON COLUMN verarbeitung.boot_kennung IS
    'Kennung des Systemstarts (/proc/sys/kernel/random/boot_id), unter dem der
     Lauf begann. Weicht sie vom jetzigen Start ab, ist der Prozess mit
     Sicherheit weg – ganz gleich, was `pid` sagt: nach einem Neustart werden
     Prozessnummern neu vergeben. NULL bei Zeilen aus der Zeit vor
     Migration 008.';

COMMIT;
