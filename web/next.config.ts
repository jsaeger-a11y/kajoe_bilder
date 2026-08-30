import type { NextConfig } from "next";

const konfiguration: NextConfig = {
  // Im Code stehen ausschliesslich relative Pfade, nie eine absolute URL mit
  // Hostnamen. Damit laeuft dieselbe Anwendung unter 127.0.0.1:3000 und hinter
  // dem Cloudflare Tunnel gleichermassen, ohne dass irgendwo ein Hostname
  // konfiguriert werden muesste.
  //
  // Die Proxy-Header werden dort ausgewertet, wo sie gebraucht werden:
  // X-Forwarded-For und CF-Connecting-IP in src/lib/anfrage.ts, dort auch
  // X-Forwarded-Proto. Next 16 kennt keinen oeffentlichen Schalter dafuer;
  // `experimental.trustHostHeader` ist intern und waere hier ohnehin wirkungslos,
  // weil nichts im Code eine absolute URL baut.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:pfad*",
        headers: [
          // Hinter einem oeffentlich erreichbaren Tunnel ist die Anmeldeseite
          // fuer jeden aufrufbar. Sie soll in keinem Suchindex landen.
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default konfiguration;
