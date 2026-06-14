const { ipcMain } = require("electron");
const updaterService = require("../services/UpdaterService");

/**
 * Registra gli IPC handler per il sistema di aggiornamento automatico.
 */
function registerUpdaterIpc() {
    ipcMain.handle("updater:check", () => updaterService.checkForUpdates());
    ipcMain.handle("updater:install", () => updaterService.quitAndInstall());
}

module.exports = { registerUpdaterIpc };
