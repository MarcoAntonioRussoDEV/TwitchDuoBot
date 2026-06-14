const { app } = require("electron");
const fs = require("fs");
const path = require("path");

// Chiavi gestite dall'app nel file .env dell'utente (esposte al renderer via config:get)
const CONFIG_KEYS = [
    // Twitch
    "TWITCH_BOT_USERNAME",
    "TWITCH_ACCESS_TOKEN",
    "TWITCH_CHANNEL",
    // Kick (opzionale)
    "KICK_BOT_USERNAME",
    "KICK_ACCESS_TOKEN",
    "KICK_CHANNEL",
    "KICK_CHATROOM_ID",
    // Riot
    "STREAMER_RIOT_ACCOUNTS",
    "DUO_SUB_ONLY",
];

// Il bot richiede Twitch per avviarsi
// La validazione vera avviene in BotManager.start()
const REQUIRED_KEYS = [
    "TWITCH_ACCESS_TOKEN",
    "TWITCH_BOT_USERNAME",
    "STREAMER_RIOT_ACCOUNTS",
];

/**
 * ConfigService — gestisce la lettura/scrittura del file .env dell'utente.
 *
 * 💡 Lezione Electron — app.getPath("userData"):
 * Ogni app Electron ha una cartella "userData" scrivibile sul sistema operativo
 * (es. C:\Users\<user>\AppData\Roaming\<AppName> su Windows).
 * Nell'eseguibile distribuito (isPackaged = true), i file dell'utente (config, token)
 * vanno SEMPRE in userData, perché la cartella dell'app è in sola lettura.
 * In sviluppo (isPackaged = false), usiamo la root del progetto per comodità.
 */
class ConfigService {
    /**
     * Restituisce il percorso del .env in base all'ambiente.
     */
    getEnvPath() {
        if (app.isPackaged) {
            return path.join(app.getPath("userData"), ".env");
        }
        // In sviluppo: root del progetto (3 livelli su da src/main/services)
        return path.join(__dirname, "..", "..", "..", ".env");
    }

    /**
     * Legge il .env e restituisce un oggetto con solo le CONFIG_KEYS.
     * @returns {Record<string, string>}
     */
    read() {
        const values = {};
        try {
            const raw = fs.readFileSync(this.getEnvPath(), "utf-8");
            for (const line of raw.split(/\r?\n/)) {
                const eq = line.indexOf("=");
                if (eq === -1) continue;
                const key = line.slice(0, eq).trim();
                const val = line.slice(eq + 1).trim();
                if (key) values[key] = val;
            }
        } catch (_) {}
        return CONFIG_KEYS.reduce(
            (obj, k) => ({ ...obj, [k]: values[k] ?? "" }),
            {},
        );
    }

    /**
     * Scrive solo le chiavi fornite nel .env, preservando le altre.
     * Aggiorna anche process.env per la sessione corrente.
     * @param {Record<string, string>} config
     */
    write(config) {
        const existing = {};
        const order = [];
        try {
            const raw = fs.readFileSync(this.getEnvPath(), "utf-8");
            for (const line of raw.split(/\r?\n/)) {
                const eq = line.indexOf("=");
                if (eq === -1) continue;
                const key = line.slice(0, eq).trim();
                if (key) {
                    existing[key] = line.slice(eq + 1).trim();
                    order.push(key);
                }
            }
        } catch (_) {}
        for (const k of Object.keys(config)) {
            if (!order.includes(k)) order.push(k);
            existing[k] = config[k];
        }
        const content = order.map(k => `${k}=${existing[k]}`).join("\n");
        fs.writeFileSync(this.getEnvPath(), content, "utf-8");
        for (const [k, v] of Object.entries(config)) process.env[k] = v;
    }

    /**
     * Restituisce true se tutte le chiavi obbligatorie sono presenti e non vuote.
     */
    isComplete() {
        const cfg = this.read();
        return REQUIRED_KEYS.every(k => cfg[k]?.length > 0);
    }

    /**
     * Carica i file .env in process.env.
     * In produzione carica anche il .env bundlato nell'asar (per RIOT_API_KEY).
     */
    loadEnv() {
        require("dotenv").config({ path: this.getEnvPath() });
        if (app.isPackaged) {
            // override: true — la RIOT_API_KEY bundlata sovrascrive l'eventuale chiave in userData
            // __dirname = src/main/services → root è 3 livelli su
            require("dotenv").config({
                path: path.join(__dirname, "..", "..", "..", ".env"),
                override: true,
            });
        }
    }

    /**
     * Parsa la stringa "Name1|Tag1,Name2|Tag2" in array di oggetti.
     * @param {string} str
     * @returns {{ name: string, tag: string }[]}
     */
    parseRiotAccounts(str) {
        if (!str) return [];
        return str
            .split(",")
            .map(a => {
                const parts = a.trim().split("|");
                return { name: parts[0]?.trim(), tag: parts[1]?.trim() };
            })
            .filter(a => a.name && a.tag);
    }
}

module.exports = new ConfigService();
