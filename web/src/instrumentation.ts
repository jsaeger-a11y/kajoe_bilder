/**
 * Laeuft einmal beim Start des Servers.
 *
 * Zweck: eine deutliche Zeile ins Log, wenn das Sitzungscookie OHNE `Secure`
 * ausgeliefert wird. Sonst bleibt die Einstellung nach dem Tunnel still aus,
 * und das merkt niemand.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { COOKIE_SICHER } = await import("./lib/umgebung");

  if (COOKIE_SICHER) {
    console.log("[kajoe] Sitzungscookie: HttpOnly, SameSite=Lax, Secure");
  } else {
    console.warn(
      "\n" +
        "[kajoe] ================================================================\n" +
        "[kajoe]  ACHTUNG: COOKIE_SECURE=0 – das Sitzungscookie geht OHNE Secure\n" +
        "[kajoe]  hinaus und faehrt damit auch ueber unverschluesseltes HTTP.\n" +
        "[kajoe]  Das ist nur fuer das lokale Netz gedacht. Hinter dem\n" +
        "[kajoe]  Cloudflare Tunnel gehoert COOKIE_SECURE=1 in die .env.\n" +
        "[kajoe] ================================================================\n",
    );
  }
}
