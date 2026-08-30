import type { Metadata } from "next";
import "./globals.css";

/**
 * Wurzel-Layout.
 *
 * Der Titel steht hier bewusst NEUTRAL. Er schlaegt auf die Anmeldeseite
 * durch, und die ist hinter dem Tunnel oeffentlich erreichbar: kein Hinweis
 * auf Fotos, keine Familie, keine Namen – weder im Text noch im Titel noch in
 * den Metaangaben. Die Seiten dahinter duerfen heissen, wie sie wollen.
 */
export const metadata: Metadata = {
  title: "Anmeldung",
  robots: { index: false, follow: false, nocache: true },
};

export default function WurzelLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
