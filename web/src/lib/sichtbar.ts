/**
 * Die eine Bedingung, die vorgemerkte Bilder aus dem Weg raeumt.
 *
 * Sie steht hier und wird nirgends neu formuliert – nicht in der Galerie,
 * nicht in den Listen, nicht beim Ausliefern einer Datei, nicht beim Zaehlen.
 * Eine Abfrage, die sie vergisst, zeigt vorgemerkte Bilder wieder an, und das
 * faellt genau dort nicht auf, wo man nicht hinsieht.
 *
 * Geloescht wird zweistufig: `geloescht_am` blendet aus, die Dateien fallen
 * erst nach dreissig Tagen im Aufraeumlauf. Die Zeile selbst bleibt fuer
 * immer stehen – sie ist der Grabstein, an dem der naechste Ingest erkennt,
 * dass diese Datei schon einmal da war.
 */

export const NICHT_GELOESCHT = "geloescht_am IS NULL";
export const VORGEMERKT = "geloescht_am IS NOT NULL";
