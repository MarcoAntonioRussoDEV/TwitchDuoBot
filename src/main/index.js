const { app, BrowserWindow } = require("electron");
const path = require("path");

// ─── Services ─────────────────────────────────────────────────────────────────
const configService = require("./services/ConfigService");
const updaterService = require("./services/UpdaterService");
const bot = require("./services/bot/BotManager");
const logger = require("./services/Logger");

// ─── IPC Registrars ───────────────────────────────────────────────────────────
const { registerBotIpc } = require("./ipc/bot.ipc");
const { registerConfigIpc } = require("./ipc/config.ipc");
const { registerQueueIpc } = require("./ipc/queue.ipc");
const { registerUpdaterIpc } = require("./ipc/updater.ipc");

// ─── Hot Reload (solo sviluppo) ───────────────────────────────────────────────
// 💡 Lezione Electron — electron-reload:
// In sviluppo, electron-reload osserva i file del progetto e riavvia automaticamente
// il Main Process quando cambiano, come nodemon per Express.
// app.isPackaged === false in sviluppo, true nell'eseguibile distribuito.
if (!app.isPackaged) {
    // electron-reload non ha tipizzazioni corrette
    // eslint-disable-next-line
    const _reload = /** @type {any} */ (require("electron-reload"));
    _reload(path.join(__dirname, "..", ".."), {
        electron: path.join(
            __dirname,
            "..",
            "..",
            "node_modules",
            ".bin",
            "electron",
        ),
        hardResetMethod: "exit",
        ignored: /node_modules|dist|\.git|\.env|saved-queue\.json/,
    });
}

// ─── Caricamento .env ─────────────────────────────────────────────────────────
// Deve avvenire PRIMA di qualsiasi accesso a process.env.
// ConfigService gestisce i percorsi diversi tra dev e produzione.
configService.loadEnv();

// ─── Finestra principale ──────────────────────────────────────────────────────

/** @type {BrowserWindow | null} */
let win = null;

/**
 * Crea la BrowserWindow principale.
 *
 * 💡 Lezione Electron — BrowserWindow:
 * È l'equivalente di una tab del browser. Ogni finestra ha il suo processo
 * renderer isolato. Le opzioni webPreferences definiscono il livello di
 * sicurezza e le capacità del renderer:
 *
 *   - preload: script che gira PRIMA del renderer, con accesso a Node.js.
 *     È l'unico posto dove possiamo usare contextBridge in modo sicuro.
 *   - contextIsolation: true → il renderer non vede le API di Node/Electron
 *     direttamente. Solo quello che exponiamo nel preload con contextBridge.
 *   - nodeIntegration: false → il renderer non può fare require(). Sempre off
 *     per sicurezza (previene attacchi XSS che leggono il filesystem).
 */
function createWindow() {
    win = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 1024,
        minHeight: 720,
        webPreferences: {
            // Il preload sta alla root del progetto (src/main/index.js → ../../preload.js)
            preload: path.join(__dirname, "..", "..", "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
        title: `Twitch Duo Bot v${app.getVersion()}`,
        backgroundColor: "#0e0e10",
    });

    win.loadFile(path.join(__dirname, "..", "..", "renderer", "index.html"));
    win.setMenuBarVisibility(false);
    win.webContents.on("did-finish-load", () => {
        win.setTitle(`Twitch Duo Bot v${app.getVersion()}`);
    });
    // Log errori renderer nel terminale durante lo sviluppo
    if (!app.isPackaged) {
        win.webContents.on(
            "console-message",
            (_, level, message, line, sourceId) => {
                console.log(
                    `[Renderer][${level}] ${sourceId}:${line} ${message}`,
                );
            },
        );
    }
}

// ─── Ciclo di vita dell'app ───────────────────────────────────────────────────

/**
 * 💡 Lezione Electron — app.whenReady():
 * Electron ha bisogno di inizializzarsi prima di poter creare finestre
 * (carica Chromium, inizializza il processo GPU, ecc.).
 * whenReady() è una Promise che si risolve quando tutto è pronto.
 * È l'equivalente di DOMContentLoaded, ma per il processo principale.
 */
app.whenReady().then(() => {
    createWindow();

    // Collega il logger alla finestra fin dall'avvio (non solo dopo bot.start()),
    // così i log tecnici (es. login OAuth) raggiungono il Dev Log da subito.
    logger.setEmitFn(msg => {
        if (win && !win.isDestroyed()) win.webContents.send("bot:log", msg);
    });

    // Registra tutti gli IPC handler.
    // bot.ipc riceve `win` perché deve fare webContents.send() per push eventi.
    registerBotIpc(win);
    registerConfigIpc();
    registerQueueIpc();
    registerUpdaterIpc();

    // L'auto-updater si avvia SOLO nell'eseguibile distribuito
    if (app.isPackaged) {
        updaterService.setup(win);
    }
});

/**
 * 💡 Lezione Electron — window-all-closed:
 * Su macOS, le app rimangono attive anche senza finestre aperte (icona nel dock).
 * Su Windows/Linux, chiudere l'ultima finestra termina l'app.
 * Prima di uscire, fermiamo il bot per disconnetterci da Twitch in modo pulito.
 */
app.on("window-all-closed", async () => {
    if (bot.running) await bot.stop();
    if (process.platform !== "darwin") app.quit();
});

// Su macOS: ricrea la finestra se si clicca l'icona nel dock senza finestre aperte
app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
