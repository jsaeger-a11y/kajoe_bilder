import type { Metadata } from "next";

import Haeufchenliste from "../liste";

export const metadata: Metadata = { title: "Benannte Häufchen" };

export default async function Benannt({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <Haeufchenliste art="benannt" pfad="/haeufchen/benannt" suche={await searchParams} />;
}
