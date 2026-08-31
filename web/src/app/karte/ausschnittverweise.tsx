"use client";

import { useRouter } from "next/navigation";

/**
 * Haelt den Kartenausschnitt fest, wenn jemand einen Filter umstellt.
 *
 * Das Problem: die Filterleiste wird auf dem Server gerendert, mit dem
 * Ausschnitt, der beim Seitenaufruf in der Adresse stand. Danach verschiebt
 * die Karte die Adresse bei jeder Bewegung. Ein Filterklick spaeter waere die
 * Karte also wieder dort, wo sie beim Laden stand – und wer eben noch
 * Norderstedt ansah, findet sich in ganz Europa wieder.
 *
 * Deshalb wird der Verweis erst beim Klicken fertiggestellt: lat, lon und z
 * kommen aus der Adresse, wie sie in diesem Augenblick ist.
 *
 * Ohne JavaScript funktioniert der Verweis weiterhin – nur eben ohne
 * Ausschnitt, und die Karte oeffnet auf dem Bereich des neuen Filters. Ohne
 * JavaScript gibt es allerdings ohnehin keine Karte.
 */
export default function Ausschnittverweise({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <div
      onClickCapture={(e) => {
        // Nur der einfache Linksklick. Wer mit Strg oder mittlerer Taste in
        // einem neuen Tab oeffnet, soll das behalten duerfen.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
          return;
        }
        const ziel = (e.target as HTMLElement).closest?.("a");
        const adresse = ziel?.getAttribute("href");
        if (!adresse || !adresse.startsWith("/karte")) return;

        const neu = new URL(adresse, window.location.origin);
        const jetzt = new URLSearchParams(window.location.search);
        for (const schluessel of ["lat", "lon", "z"]) {
          const wert = jetzt.get(schluessel);
          if (wert !== null) neu.searchParams.set(schluessel, wert);
        }
        e.preventDefault();
        router.push(`${neu.pathname}${neu.search}`);
      }}
    >
      {children}
    </div>
  );
}
