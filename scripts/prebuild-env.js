/**
 * prebuild-env.js
 * Eseguito automaticamente da npm prima di "build" e "deploy".
 * Sostituisce .env con una versione minimale (solo RIOT_API_KEY e TWITCH_CLIENT_ID) per il bundle,
 * salvando l'originale in .env.bak così il postbuild può ripristinarlo.
 */

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");
const backupPath = path.join(root, ".env.bak");

// Legge RIOT_API_KEY dall'env corrente (variabile d'ambiente CI o dal file .env locale)
let riotKey = process.env.RIOT_API_KEY;
let twitchClientId = process.env.TWITCH_CLIENT_ID;
if (!riotKey && fs.existsSync(envPath)) {
    const parsed = dotenv.parse(fs.readFileSync(envPath, "utf8"));

    riotKey = parsed.RIOT_API_KEY ?? "";
    twitchClientId = parsed.TWITCH_CLIENT_ID ?? "";
}

// Backup del .env originale (se esiste)
if (fs.existsSync(envPath)) {
    fs.copyFileSync(envPath, backupPath);
}

// Scrive un .env minimalista — nessun token personale
fs.writeFileSync(
    envPath,
    `RIOT_API_KEY=${riotKey}\nTWITCH_CLIENT_ID=${twitchClientId}\n`,
);

console.log("[prebuild-env] .env sostituito con versione bundle-safe.");
