"use client";

/**
 * Die Karte im Browser.
 *
 * Leaflet wird ERST IM EFFEKT geladen. Die Bibliothek fasst beim Einlesen
 * `window` an; ein Import auf Modulebene bricht deshalb beim Vorrendern auf
 * dem Server. Der Effekt laeuft nur im Browser, damit ist die Frage erledigt,
 * ohne dass die ganze Seite vom Vorrendern ausgenommen werden muesste.
 *
 * Es geht KEINE Koordinate nach draussen. Die Kachelschicht fragt Bilder nach
 * Zoomstufe, Spalte und Zeile ab – daraus ist ablesbar, welcher Ausschnitt
 * betrachtet wird, mehr nicht. Eine Rueckwaertssuche nach Ortsnamen ("Wien",
 * "Norderstedt") gibt es bewusst nicht: sie hiesse, private Aufnahmeorte –
 * darunter die eigene Wohnung – einzeln an einen fremden Dienst zu schicken.
 */

import type * as LeafletTyp from "leaflet";
import { useEffect, useRef, useState } from "react";

import "leaflet/dist/leaflet.css";

interface Rahmen {
  sued: number;
  nord: number;
  west: number;
  ost: number;
}

interface Gruppe {
  lat: number;
  lon: number;
  anzahl: number;
  beispiel: number;
  rahmen: Rahmen;
  /** `<stufe>:<zeile>:<spalte>` – vom Server berechnet, hier nur weitergereicht. */
  zelle: string;
}

interface Aufnahme {
  id: number;
  lat: number;
  lon: number;
  typ: string;
  wann: string;
}

interface Antwort {
  zoom: number;
  imAusschnitt: number;
  gruppen: Gruppe[];
  aufnahmen: Aufnahme[];
  abgeschnitten: boolean;
}

/**
 * Wie lange nach dem Loslassen gewartet wird, bevor nachgeladen wird.
 *
 * Ohne dieses Warten prasseln beim Ziehen und Zoomen Anfragen los – jede
 * Traegheitsbewegung von Leaflet loest ein eigenes `moveend` aus. 350 ms sind
 * kurz genug, dass es sich nicht nach Warten anfuehlt, und lang genug, dass
 * eine Wischbewegung genau eine Anfrage ergibt.
 */
const WARTEN_MS = 350;

function zahltext(n: number): string {
  return n.toLocaleString("de-DE");
}

export default function Kartenfeld({
  filterabfrage,
  start,
  zoomMin,
  zoomMax,
}: {
  /** Der Filterteil der Adresse, vom Server geprueft – z.B. "herkunft=alle&jahr=2026". */
  filterabfrage: string;
  start: { mitte: { lat: number; lon: number; zoom: number } | null; bereich: Rahmen | null };
  zoomMin: number;
  zoomMax: number;
}) {
  const feld = useRef<HTMLDivElement | null>(null);
  const [stand, setStand] = useState<{ imAusschnitt: number; punkte: number } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);

  /*
    Der Filter steckt in einer Referenz und nicht in der Abhaengigkeitsliste:
    sonst risse jeder Filterklick die Karte ab und baute sie an der
    Ausgangsstelle neu auf. Stattdessen liest der Ladevorgang immer den
    aktuellen Wert, und ein eigener Effekt weiter unten laedt bei einem
    Filterwechsel nach – der Ausschnitt bleibt dabei stehen.
  */
  const abfrageRef = useRef(filterabfrage);
  abfrageRef.current = filterabfrage;

  /** Vom Aufbau gesetzt, vom Filtereffekt benutzt. */
  const ladenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let abgebaut = false;
    let karte: LeafletTyp.Map | null = null;
    let schicht: LeafletTyp.LayerGroup | null = null;
    let zeitgeber: ReturnType<typeof setTimeout> | null = null;
    let laufend: AbortController | null = null;

    async function aufbauen() {
      const L = await import("leaflet");
      if (abgebaut || !feld.current) return;

      karte = L.map(feld.current, {
        zoomControl: true,
        // Zwei Finger zum Zoomen, ein Finger zum Ziehen – die Vorgabe von
        // Leaflet und auf dem Telefon das Erwartete.
        touchZoom: true,
        // Ein Rad-Dreh auf dem Rechner soll nicht drei Stufen springen.
        wheelPxPerZoomLevel: 120,
        minZoom: zoomMin,
        maxZoom: zoomMax,
        worldCopyJump: false,
      });

      /*
        Die Namensnennung ist Pflicht und keine Hoeflichkeit: die Kacheln
        stehen unter der Open Database License. Sie haengt an der
        Kachelschicht und ist damit da, solange die Karte da ist.
      */
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: zoomMax,
        attribution:
          'Karte © <a href="https://www.openstreetmap.org/copyright" ' +
          'target="_blank" rel="noreferrer noopener">OpenStreetMap</a>-Mitwirkende',
      }).addTo(karte);

      L.control.scale({ imperial: false, position: "bottomleft" }).addTo(karte);

      schicht = L.layerGroup().addTo(karte);

      if (start.mitte) {
        karte.setView([start.mitte.lat, start.mitte.lon], start.mitte.zoom);
      } else if (start.bereich) {
        karte.fitBounds(
          L.latLngBounds(
            [start.bereich.sued, start.bereich.west],
            [start.bereich.nord, start.bereich.ost],
          ),
          { padding: [30, 30] },
        );
      } else {
        karte.setView([51, 10], 5);
      }

      // --- Adresse mitfuehren ---------------------------------------------
      /*
        replaceState statt pushState: bei jeder Bewegung ein Eintrag im
        Verlauf machte den Zurueck-Knopf unbrauchbar. So steht in der Adresse
        immer der aktuelle Ausschnitt – wer sie kopiert, oeffnet dieselbe
        Ansicht, und der Weg zurueck aus der Einzelansicht landet dort wieder,
        wo die Karte stand.
      */
      function adresseMitfuehren() {
        if (!karte) return;
        const m = karte.getCenter();
        const werte = new URLSearchParams(abfrageRef.current);
        werte.set("lat", m.lat.toFixed(5));
        werte.set("lon", m.lng.toFixed(5));
        werte.set("z", String(karte.getZoom()));
        window.history.replaceState(null, "", `/karte?${werte.toString()}`);
      }

      // --- Marker ---------------------------------------------------------
      /*
        Der Verweis nimmt den Ausschnitt mit, damit die Einzelansicht einen
        Weg zurueck auf DIESE Stelle der Karte anbieten kann. Der
        Zurueck-Knopf des Browsers taete das auch – aber nur, solange
        dazwischen niemand weiterblaettert.
      */
      function bildblase(id: number, text: string): string {
        const werte = new URLSearchParams(abfrageRef.current);
        werte.set("von", "karte");
        if (karte) {
          const m = karte.getCenter();
          werte.set("lat", m.lat.toFixed(5));
          werte.set("lon", m.lng.toFixed(5));
          werte.set("z", String(karte.getZoom()));
        }
        const ziel = `/bild/${id}?${werte.toString()}`;
        return `<div class="kartenblase">
            <a href="${ziel}"><img src="/datei/${id}/vorschau" alt="" width="112" height="112"></a>
            <div>${text}<br><a href="${ziel}">Aufnahme öffnen</a></div>
          </div>`;
      }

      function gruppenmarke(g: Gruppe): LeafletTyp.Marker {
        const d = g.anzahl >= 1000 ? 52 : g.anzahl >= 100 ? 48 : g.anzahl >= 10 ? 43 : 38;
        const marke = L.marker([g.lat, g.lon], {
          icon: L.divIcon({
            className: "",
            html: `<span class="kartengruppe" style="width:${d}px;height:${d}px">${zahltext(g.anzahl)}</span>`,
            iconSize: [d, d],
            iconAnchor: [d / 2, d / 2],
          }),
          keyboard: true,
          title: `${zahltext(g.anzahl)} Aufnahmen`,
          /*
            Grosse Gruppen liegen UNTEN.

            Der Marker sitzt auf dem Schwerpunkt und nicht in der Zellmitte –
            so soll es sein, sonst staenden die Punkte sichtbar auf einem
            Raster. Der Preis: zwei benachbarte Zellen koennen ihre
            Schwerpunkte dicht beieinander haben, und dann ueberdecken sich
            die Kreise. Deckt der grosse den kleinen zu, ist der kleine gar
            nicht mehr anklickbar; umgekehrt bleibt vom grossen immer ein Rand
            uebrig, weil er der groessere ist. Deshalb sinken grosse Gruppen
            nach unten, und einzelne Aufnahmen (ohne Versatz) liegen ganz oben.
          */
          zIndexOffset: -Math.round(Math.min(10, Math.log2(g.anzahl)) * 100),
        });

        /*
          Ein Klick oeffnet eine Blase mit ZWEI Wegen: hineinzoomen oder die
          Aufnahmen in der Galerie ansehen.

          Bis Phase 7 zoomte der Klick unmittelbar. Das war einen Griff
          kuerzer, liess aber keinen Platz fuer den zweiten Weg – und ein
          Weg, den man nicht sieht, ist keiner. Ausserdem oeffnen einzelne
          Aufnahmen schon immer eine Blase; so verhalten sich beide gleich.
          Wer nur zoomen will, hat weiterhin den Doppelklick auf die Karte.
        */
        marke.on("click", () => {
          if (!karte) return;
          const rahmen = L.latLngBounds(
            [g.rahmen.sued, g.rahmen.west],
            [g.rahmen.nord, g.rahmen.ost],
          );
          /*
            Auf welche Stufe muesste man gehen, damit die tatsaechliche
            Ausdehnung der Gruppe gerade ins Bild passt? Liegt die hoeher als
            die jetzige, zerfaellt die Gruppe beim Hineinzoomen. Liegt sie
            nicht hoeher, liegen die Aufnahmen so dicht beieinander, dass die
            Karte sie nicht auseinanderziehen kann.
          */
          const ziel = karte.getBoundsZoom(rahmen, false, L.point(30, 30));
          const teilbar = ziel > karte.getZoom();

          const werte = new URLSearchParams(abfrageRef.current);
          werte.set("zelle", g.zelle);
          const galerie = `/galerie?${werte.toString()}`;

          marke
            .bindPopup(
              `<div class="kartenblase">
                 <a href="${galerie}"><img src="/datei/${g.beispiel}/vorschau" alt=""
                    width="112" height="112"></a>
                 <div>
                   <b>${zahltext(g.anzahl)} Aufnahmen</b>${teilbar
                     ? ""
                     : " an nahezu derselben Stelle. Weiter zerfällt diese Gruppe nicht."}
                   <div class="blasenknoepfe">
                     ${teilbar ? '<button type="button" data-zoomen="1">Hineinzoomen</button>' : ""}
                     <a class="haupt" href="${galerie}">In der Galerie zeigen</a>
                   </div>
                 </div>
               </div>`,
              { maxWidth: 300 },
            )
            .openPopup();

          // Der Knopf sitzt im Markup der Blase; Leaflet baut sie erst beim
          // Oeffnen. Deshalb wird er hier und nicht vorher angebunden.
          const blase = marke.getPopup()?.getElement();
          blase?.querySelector<HTMLButtonElement>("[data-zoomen]")?.addEventListener(
            "click",
            () => {
              marke.closePopup();
              karte?.flyToBounds(rahmen, { padding: [30, 30], maxZoom: zoomMax, duration: 0.6 });
            },
          );
        });
        return marke;
      }

      function aufnahmemarke(a: Aufnahme): LeafletTyp.Marker {
        const marke = L.marker([a.lat, a.lon], {
          icon: L.divIcon({
            className: "",
            html: `<span class="karteneinzeln${a.typ === "video" ? " video" : ""}"></span>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          }),
          keyboard: true,
          title: a.wann,
        });
        marke.bindPopup(
          bildblase(a.id, `${a.wann}${a.typ === "video" ? " · Video" : ""}`),
          { maxWidth: 280 },
        );
        return marke;
      }

      // --- Laden ----------------------------------------------------------
      async function laden() {
        if (!karte || !schicht) return;
        // Der vorige Zug wird abgebrochen, nicht abgewartet: sonst kann eine
        // alte Antwort eine neue ueberschreiben und die Karte zeigt Punkte
        // eines Ausschnitts, der nicht mehr zu sehen ist.
        laufend?.abort();
        const steuerung = new AbortController();
        laufend = steuerung;
        setLaedt(true);

        const r = karte.getBounds();
        const werte = new URLSearchParams(abfrageRef.current);
        werte.set("s", r.getSouth().toFixed(6));
        werte.set("n", r.getNorth().toFixed(6));
        werte.set("w", r.getWest().toFixed(6));
        werte.set("o", r.getEast().toFixed(6));
        werte.set("z", String(karte.getZoom()));

        try {
          const antwort = await fetch(`/api/karte?${werte.toString()}`, {
            signal: steuerung.signal,
            headers: { Accept: "application/json" },
          });
          if (!antwort.ok) {
            setFehler(
              antwort.status === 401 || antwort.status === 403
                ? "Für die Karte fehlt die Berechtigung."
                : `Die Karte konnte nicht geladen werden (${antwort.status}).`,
            );
            return;
          }
          const daten = (await antwort.json()) as Antwort;
          if (abgebaut || steuerung.signal.aborted || !schicht) return;

          schicht.clearLayers();
          for (const g of daten.gruppen) schicht.addLayer(gruppenmarke(g));
          for (const a of daten.aufnahmen) schicht.addLayer(aufnahmemarke(a));

          setFehler(
            daten.abgeschnitten
              ? "Sehr viele Gruppen in diesem Ausschnitt – es werden nicht alle gezeigt."
              : null,
          );
          setStand({
            imAusschnitt: daten.imAusschnitt,
            punkte: daten.gruppen.length + daten.aufnahmen.length,
          });
        } catch (f) {
          // Ein Abbruch ist der Normalfall: der naechste Zug hat den vorigen
          // ueberholt. Nur echte Fehler gehoeren auf den Schirm.
          if ((f as Error)?.name !== "AbortError") {
            setFehler("Die Karte konnte nicht geladen werden.");
          }
        } finally {
          if (laufend === steuerung) {
            laufend = null;
            setLaedt(false);
          }
        }
      }

      function planen() {
        adresseMitfuehren();
        if (zeitgeber) clearTimeout(zeitgeber);
        zeitgeber = setTimeout(() => void laden(), WARTEN_MS);
      }

      karte.on("moveend", planen);
      ladenRef.current = () => void laden();
      // Einmal gleich zu Beginn: sonst stuende in der Adresse nach dem ersten
      // Aufruf noch kein Ausschnitt, und wer sie kopiert, gaebe eine Karte
      // weiter, die beim Empfaenger woanders steht.
      adresseMitfuehren();
      void laden();
    }

    void aufbauen();

    return () => {
      abgebaut = true;
      ladenRef.current = null;
      if (zeitgeber) clearTimeout(zeitgeber);
      laufend?.abort();
      karte?.remove();
    };
    // Nur beim Aufbau. Der Filter kommt ueber abfrageRef herein, der
    // Startausschnitt wird nur einmal gebraucht.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
    Filterwechsel: die Filterleiste sind gewoehnliche Verweise, Next tauscht
    dabei nur die Serverdaten aus und laesst diese Komponente stehen. Ohne
    diesen Effekt zeigte die Karte danach weiter die alten Punkte – sichtbar
    falsch, weil die Zahl darueber schon die neue waere.
  */
  const ersterLauf = useRef(true);
  useEffect(() => {
    if (ersterLauf.current) {
      ersterLauf.current = false;
      return;
    }
    ladenRef.current?.();
  }, [filterabfrage]);

  return (
    <>
      <div className="kartenfeld" ref={feld} />
      <p className="kartenstand" aria-live="polite">
        {fehler ? <span className="kartenfehler">{fehler} </span> : null}
        {stand === null
          ? "Karte wird geladen …"
          : stand.imAusschnitt === 0
            ? "In diesem Ausschnitt liegt keine Aufnahme."
            : `${zahltext(stand.imAusschnitt)} ${stand.imAusschnitt === 1 ? "Aufnahme" : "Aufnahmen"} im Ausschnitt, gezeigt als ${zahltext(stand.punkte)} ${stand.punkte === 1 ? "Punkt" : "Punkte"}.`}
        {laedt ? " …" : ""}
      </p>
    </>
  );
}
