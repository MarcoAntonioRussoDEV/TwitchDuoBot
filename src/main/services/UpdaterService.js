/**
 * UpdaterService — wrappa electron-updater per gli aggiornamenti automatici.
 *
 * 💡 Lezione Electron — app.isPackaged:
 * Questo flag è `true` solo quando l'app è stata compilata con electron-builder.
 * In sviluppo (npm start) è sempre `false`.
 * Controlliamo gli update SOLO nell'eseguibile distribuito per evitare errori
 * durante lo sviluppo (il repo potrebbe non avere un update server configurato).
 *
 * Il flusso è:
 * 1. checkForUpdates() → se disponibile, scarica in background (autoDownload: true)
 * 2. Emette "update-downloaded" → la UI mostra la notifica all'utente
 * 3. L'utente clicca "Installa" → quitAndInstall() riavvia l'app con la nuova versione
 */
class UpdaterService {
    constructor() {
        /** @type {import("electron-updater").AppUpdater | null} */
        this._updater = null;
    }

    /**
     * Inizializza l'updater e collega gli eventi alla finestra principale.
     * Deve essere chiamato DOPO la creazione della BrowserWindow.
     * @param {Electron.BrowserWindow} win
     */
    setup(win) {
        const { autoUpdater } = require("electron-updater");
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;

        autoUpdater.on("update-available", info =>
            win?.webContents.send("updater:update-available", info),
        );

        autoUpdater.on("download-progress", progress =>
            win?.webContents.send("updater:download-progress", progress),
        );

        autoUpdater.on("update-downloaded", info =>
            win?.webContents.send("updater:update-downloaded", {
                version: info.version,
                releaseNotes: info.releaseNotes ?? null,
            }),
        );

        // Silenzioso in produzione — errori di rete non devono crashare l'app
        autoUpdater.on("error", () => {});

        autoUpdater.checkForUpdates();
        this._updater = autoUpdater;
        return this;
    }

    checkForUpdates() {
        this._updater?.checkForUpdates();
    }

    quitAndInstall() {
        this._updater?.quitAndInstall();
    }
}

module.exports = new UpdaterService();
