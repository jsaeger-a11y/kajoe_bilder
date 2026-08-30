-- 003-sitzungen.sql
-- Sitzungen in der Datenbank, nicht im JWT.
--
-- Auth.js kann beim Credentials-Provider keine Datenbanksitzungen, sondern nur
-- JWT. Damit stand die Wahl zwischen Auth.js mit JWT und einer eigenen, sehr
-- kleinen Sitzungsverwaltung. Es ist die eigene geworden; die Begruendung steht
-- ausfuehrlich in web/LIESMICH.md, hier der Kern:
--
-- Ein JWT laesst sich nicht zurueckziehen. `benutzer.aktiv = FALSE` wuerde eine
-- laufende Sitzung nicht beenden, und ein abgeschaltetes Konto soll genau das:
-- draussen sein. Wer deshalb bei jeder Anfrage doch in der Datenbank nachsieht,
-- hat den einzigen Vorteil des JWT schon aufgegeben und traegt nur noch dessen
-- Umstaende mit.
--
-- Gespeichert wird NICHT die Kennung aus dem Cookie, sondern ihr SHA-256. Wer
-- eine Sicherung in die Haende bekommt, haelt damit keine gueltigen Sitzungen
-- in der Hand. Das kostet nichts: die Kennung ist ohnehin ein Zufallswert und
-- muss nicht zurueckgerechnet werden koennen.

BEGIN;

CREATE TABLE sitzung (
    id              BIGSERIAL   PRIMARY KEY,

    -- SHA-256 der Kennung aus dem Cookie (32 Zufallsbytes, base64url).
    kennung_hash    CHAR(64)    NOT NULL UNIQUE,

    benutzer_id     INTEGER     NOT NULL REFERENCES benutzer(id) ON DELETE CASCADE,

    angelegt_am     TIMESTAMPTZ NOT NULL DEFAULT now(),
    laeuft_ab_am    TIMESTAMPTZ NOT NULL,
    -- Hoechstens einmal je Stunde nachgefuehrt: bei drei Benutzern braucht
    -- niemand einen Schreibvorgang je Seitenaufruf.
    zuletzt_gesehen TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Zur Nachvollziehbarkeit, wenn eine Sitzung auffaellt. Faellt mit der
    -- Sitzung weg; IP-Adressen sind personenbezogene Daten.
    ip              INET,
    browser         TEXT
);

COMMENT ON COLUMN sitzung.kennung_hash IS
    'SHA-256 des Cookie-Werts, nicht der Wert selbst. Eine Sicherung der
     Datenbank soll keine gueltigen Sitzungen enthalten.';

CREATE INDEX sitzung_ablauf_idx   ON sitzung (laeuft_ab_am);
CREATE INDEX sitzung_benutzer_idx ON sitzung (benutzer_id);

COMMIT;
