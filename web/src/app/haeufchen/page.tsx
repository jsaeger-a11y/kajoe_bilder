import type { Metadata } from "next";

import Haeufchenliste from "./liste";

export const metadata: Metadata = { title: "Offene Häufchen" };

export default async function Offen({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <Haeufchenliste art="offen" pfad="/haeufchen" suche={await searchParams} />;
}
