import type { Metadata } from "next";

import Haeufchenliste from "../liste";

export const metadata: Metadata = { title: "Abgelegte Häufchen" };

export default async function Abgelegt({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <Haeufchenliste art="abgelegt" pfad="/haeufchen/abgelegt" suche={await searchParams} />;
}
