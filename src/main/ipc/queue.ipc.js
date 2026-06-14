const { ipcMain, app } = require("electron");
const fs = require("fs");
const path = require("path");
const bot = require("../services/bot/BotManager");

/**
 * Restituisce il percorso del file di salvataggio della coda.
 * In produzione: userData (scrivibile). In sviluppo: root del progetto.
 */
function getQueuePath() {
    const dir = app.isPackaged
        ? app.getPath("userData")
        : path.join(__dirname, "..", "..", ".."); // src/main/ipc → root
    return path.join(dir, "saved-queue.json");
}

/**
 * Registra gli IPC handler per la persistenza della coda su disco.
 */
function registerQueueIpc() {
    ipcMain.handle("queue:save", () => {
        try {
            fs.writeFileSync(
                getQueuePath(),
                JSON.stringify(bot.queue, null, 2),
                "utf-8",
            );
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    });

    ipcMain.handle("queue:load", () => {
        const p = getQueuePath();
        try {
            const raw = fs.readFileSync(p, "utf-8");
            const queue = JSON.parse(raw);
            fs.unlinkSync(p); // consumo unico: dopo il caricamento, il file viene eliminato
            return { ok: true, queue };
        } catch (_) {
            return { ok: false, queue: [] };
        }
    });
}

module.exports = { registerQueueIpc };
