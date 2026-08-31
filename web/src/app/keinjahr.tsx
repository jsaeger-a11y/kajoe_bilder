/**
 * Der Satz fuer den Fall, dass gar kein Jahrgang freigeschaltet ist.
 *
 * `benutzer.jahre = '{}'` ist ein gueltiger Zustand und kein Fehler: das Konto
 * darf sich anmelden, sieht aber nichts. Ohne diesen Hinweis stuende dort
 * "Zu diesen Filtern gibt es nichts" – und die Person suchte am Filter herum,
 * obwohl der Filter nicht das Problem ist.
 */
export default function KeinJahr() {
  return (
    <p className="hinweis">
      <strong>Für dich ist zurzeit kein Jahrgang freigeschaltet.</strong> Deshalb ist
      hier nichts zu sehen – das ist kein Fehler und liegt nicht an den Filtern.
      Wer das Archiv verwaltet, kann dir einzelne Jahre freigeben.
    </p>
  );
}
