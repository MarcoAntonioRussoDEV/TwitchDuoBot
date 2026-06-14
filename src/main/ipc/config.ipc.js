const { ipcMain, shell, app } = require("electron");
const configService = require("../services/ConfigService");
const riotService = require("../services/RiotService");
const { startOAuth } = require("../services/TwitchAuthService");

/**
 * Registra gli IPC handler per configurazione, autenticazione e shell.
 */
function registerConfigIpc() {
    // ── Configurazione ────────────────────────────────────────────────────────
    ipcMain.handle("config:get", () => configService.read());

    ipcMain.handle("config:save", (_, config) => configService.write(config));

    ipcMain.handle("config:isComplete", () => configService.isComplete());

    ipcMain.handle("config:checkRiotKey", async () => {
        const apiKey = process.env.RIOT_API_KEY;
        const accounts = configService.parseRiotAccounts(
            process.env.STREAMER_RIOT_ACCOUNTS,
        );
        return riotService.checkApiKey(apiKey, accounts);
    });

    // ── Autenticazione Twitch ─────────────────────────────────────────────────
    ipcMain.handle("auth:twitch:login", async () => {
        const clientId = process.env.TWITCH_CLIENT_ID;
        if (!clientId) {
            throw new Error(
                "TWITCH_CLIENT_ID non configurato nell'app. Contatta lo sviluppatore.",
            );
        }
        const { accessToken, username } = await startOAuth(clientId);
        configService.write({
            TWITCH_ACCESS_TOKEN: accessToken,
            TWITCH_BOT_USERNAME: username,
            // Il bot si connette al canale dell'account autenticato
            TWITCH_CHANNEL: username,
        });
        return { username };
    });

    // ── Shell / App ───────────────────────────────────────────────────────────
    ipcMain.handle("shell:openExternal", (_, url) => {
        // Validazione: apriamo solo URL http/https per sicurezza
        const parsed = new URL(url);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return;
        shell.openExternal(url);
    });

    ipcMain.handle("app:getVersion", () => app.getVersion());
}

module.exports = { registerConfigIpc };
