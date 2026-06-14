/**
 * prebuild-env.js
 * Eseguito automaticamente da npm prima di "build" e "deploy".
 * Sostituisce .env con una versione minimale (solo le chiavi developer da bundlare)
 * salvando l'originale in .env.bak così il postbuild può ripristinarlo.
 *
 * Ordine di priorità per ogni chiave: process.env > .env locale.
 * Questo permette di sovrascrivere le chiavi da CI senza modificare .env.
 *
 * Chiavi bundlate nell'app (developer secrets, mai token personali):
 *   RIOT_API_KEY, TWITCH_CLIENT_ID, KICK_CLIENT_ID, KICK_CLIENT_SECRET
 */

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");
const backupPath = path.join(root, ".env.bak");

// Legge il .env locale come fallback (se esiste)
const localEnv = fs.existsSync(envPath)
    ? dotenv.parse(fs.readFileSync(envPath, "utf8"))
    : {};

/** @param {string} key */
const get = key => process.env[key] || localEnv[key] || "";

const riotKey        = get("RIOT_API_KEY");
const twitchClientId = get("TWITCH_CLIENT_ID");
const kickClientId   = get("KICK_CLIENT_ID");
const kickClientSecret = get("KICK_CLIENT_SECRET");

if (!riotKey)        console.warn("[prebuild-env] ATTENZIONE: RIOT_API_KEY non trovata.");
if (!twitchClientId) console.warn("[prebuild-env] ATTENZIONE: TWITCH_CLIENT_ID non trovata.");
if (!kickClientId)   console.warn("[prebuild-env] ATTENZIONE: KICK_CLIENT_ID non trovata.");
if (!kickClientSecret) console.warn("[prebuild-env] ATTENZIONE: KICK_CLIENT_SECRET non trovata.");

// Backup del .env originale
if (fs.existsSync(envPath)) {
    fs.copyFileSync(envPath, backupPath);
}

// Scrive un .env minimale — solo le chiavi developer, nessun token personale
fs.writeFileSync(
    envPath,
    [
        `RIOT_API_KEY=${riotKey}`,
        `TWITCH_CLIENT_ID=${twitchClientId}`,
        `KICK_CLIENT_ID=${kickClientId}`,
        `KICK_CLIENT_SECRET=${kickClientSecret}`,
    ].join("\n") + "\n",
);

console.log("[prebuild-env] .env sostituito con versione bundle-safe.");
