const { ipcMain } = require("electron");
const bot = require("../services/bot/BotManager");

/**
 * Registra tutti gli IPC handler relativi al bot.
 *
 * 💡 Lezione Electron — IPC (Inter-Process Communication):
 * Main e Renderer non condividono la stessa memoria. Comunicano via messaggi.
 *
 * Due modalità:
 *   ipcMain.handle("canale", handler) → request/response (renderer aspetta la risposta)
 *   ipcMain.on("canale", handler)     → fire-and-forget (renderer non aspetta)
 *
 * Nel Renderer:
 *   window.bot.start() → ipcRenderer.invoke("bot:start") → ipcMain.handle("bot:start")
 *
 * Per gli eventi PUSH (dal bot verso la UI), usiamo webContents.send():
 *   bot.on("log", msg) → win.webContents.send("bot:log", msg)
 * Il renderer li ascolta con: ipcRenderer.on("bot:log", (_, msg) => ...)
 *
 * @param {Electron.BrowserWindow} win - riferimento alla finestra principale
 */
function registerBotIpc(win) {
    // ── Lifecycle ────────────────────────────────────────────────────────────
    ipcMain.handle("bot:start", () => bot.start());
    ipcMain.handle("bot:stop", () => bot.stop());

    // ── Operazioni coda ──────────────────────────────────────────────────────
    ipcMain.handle("bot:skip", () => bot.adminSkip());
    ipcMain.handle("bot:next", () => bot.adminNext());
    ipcMain.handle("bot:skipNext", () => bot.adminSkipNext());
    ipcMain.handle("bot:clearQueue", () => bot.adminClearQueue());
    ipcMain.handle("bot:remove", (_, nick) => bot.adminRemove(nick));
    ipcMain.handle("bot:add", (_, twitchUser, lolNick) =>
        bot.adminAdd(twitchUser, lolNick),
    );
    ipcMain.handle("bot:move", (_, from, to) => bot.adminMove(from, to));
    ipcMain.handle("bot:getQueue", () => [...bot.queue]);

    // ── Stato coda ───────────────────────────────────────────────────────────
    ipcMain.handle("bot:setQueueOpen", (_, open) => bot.setQueueOpen(open));
    ipcMain.handle("bot:getQueueOpen", () => bot.queueOpen);

    // ── Live rank ────────────────────────────────────────────────────────────
    ipcMain.handle("bot:liverank", () => bot.adminLiveRank());
    ipcMain.handle("bot:getLiveRankData", () => bot.adminGetLiveRankData());

    // ── Push eventi: bot → renderer ──────────────────────────────────────────
    // win?.webContents.send() invia messaggi al renderer senza aspettare risposta.
    // Il "?" protegge in caso la finestra venga chiusa prima che l'evento arrivi.
    bot.on("log", msg => win?.webContents.send("bot:log", msg));
    bot.on("queue-update", queue =>
        win?.webContents.send("bot:queue-update", queue),
    );
    bot.on("status", status => win?.webContents.send("bot:status", status));
    bot.on("riot-status", result =>
        win?.webContents.send("bot:riot-status", result),
    );
    bot.on("queue-state", open =>
        win?.webContents.send("bot:queue-state", open),
    );
    bot.on("platform-status", data =>
        win?.webContents.send("bot:platform-status", data),
    );
}

module.exports = { registerBotIpc };
