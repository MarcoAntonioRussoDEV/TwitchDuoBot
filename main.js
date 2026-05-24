const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");

// electron-updater — solo nell'app packaged (repo pubblica, nessun token necessario)
function setupAutoUpdater() {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("update-available", info => {
        win?.webContents.send("updater:update-available", info);
    });

    autoUpdater.on("download-progress", progress => {
        win?.webContents.send("updater:download-progress", progress);
    });

    autoUpdater.on("update-downloaded", info => {
        win?.webContents.send("updater:update-downloaded", {
            version: info.version,
            releaseNotes: info.releaseNotes ?? null,
        });
    });

    autoUpdater.on("error", () => {}); // silent in produzione

    autoUpdater.checkForUpdates();
    return autoUpdater;
}

if (!app.isPackaged) {
    // @ts-ignore
    require("electron-reload")(__dirname, {
        electron: path.join(__dirname, "node_modules", ".bin", "electron"),
        hardResetMethod: "exit",
        ignored: /node_modules|dist|\.git|\.env/,
    });
}

// In sviluppo usa la cartella del progetto; nell'eseguibile usa userData (scrivibile)
function getEnvPath() {
    if (app.isPackaged) {
        return path.join(app.getPath("userData"), ".env");
    }
    return path.join(__dirname, ".env");
}

// .env utente in userData (token Twitch, canale, nome Riot, tag)
require("dotenv").config({ path: getEnvPath() });
// Carica la RIOT_API_KEY dal file .env bundlato nell'asar (override: true per prevalere su userData)
if (app.isPackaged) {
    require("dotenv").config({
        path: path.join(__dirname, ".env"),
        override: true,
    });
}

const bot = require("./bot");

const CONFIG_KEYS = [
    "TWITCH_OAUTH_TOKEN",
    "TWITCH_CHANNEL",
    "STREAMER_RIOT_ACCOUNTS",
];

function parseRiotAccounts(str) {
    if (!str) return [];
    return str
        .split(",")
        .map(a => {
            const parts = a.trim().split("|");
            return { name: parts[0]?.trim(), tag: parts[1]?.trim() };
        })
        .filter(a => a.name && a.tag);
}

/** @returns {Record<string, string>} */
function readEnv() {
    const values = {};
    try {
        const raw = fs.readFileSync(getEnvPath(), "utf-8");
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

function writeEnv(config) {
    // Read all existing lines, update/add only the keys in config
    const existing = {};
    const order = [];
    try {
        const raw = fs.readFileSync(getEnvPath(), "utf-8");
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
    fs.writeFileSync(getEnvPath(), content, "utf-8");
    for (const [k, v] of Object.entries(config)) process.env[k] = v;
}

let win;

function createWindow() {
    win = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 1024,
        minHeight: 720,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
        title: `Twitch Duo Bot v${app.getVersion()}`,
        backgroundColor: "#0e0e10",
    });

    win.loadFile(path.join(__dirname, "renderer", "index.html"));
    win.setMenuBarVisibility(false);
    win.webContents.on("did-finish-load", () => {
        win.setTitle(`Twitch Duo Bot v${app.getVersion()}`);
    });
}

let _updater = null;

app.whenReady().then(() => {
    createWindow();

    if (app.isPackaged) {
        _updater = setupAutoUpdater();
    }

    bot.on("log", msg => {
        win?.webContents.send("bot:log", msg);
    });

    bot.on("queue-update", queue => {
        win?.webContents.send("bot:queue-update", queue);
    });

    bot.on("status", status => {
        win?.webContents.send("bot:status", status);
    });

    bot.on("riot-status", result => {
        win?.webContents.send("bot:riot-status", result);
    });
});

app.on("window-all-closed", async () => {
    if (bot.running) await bot.stop();
    if (process.platform !== "darwin") app.quit();
});

// IPC handlers
ipcMain.handle("bot:start", async () => {
    await bot.start();
});

ipcMain.handle("bot:stop", async () => {
    await bot.stop();
});

ipcMain.handle("bot:skip", () => {
    return bot.adminSkip();
});

ipcMain.handle("bot:next", () => {
    return bot.adminNext();
});

ipcMain.handle("bot:skipNext", () => {
    return bot.adminSkipNext();
});

ipcMain.handle("bot:clearQueue", () => {
    bot.adminClearQueue();
});

ipcMain.handle("bot:liverank", () => {
    bot.adminLiveRank();
});

ipcMain.handle("bot:getLiveRankData", async () => {
    return bot.adminGetLiveRankData();
});

ipcMain.handle("bot:remove", (_, nick) => {
    return bot.adminRemove(nick);
});

ipcMain.handle("bot:add", (_, twitchUser, lolNick) => {
    return bot.adminAdd(twitchUser, lolNick);
});

ipcMain.handle("bot:move", (_, fromIndex, toIndex) => {
    return bot.adminMove(fromIndex, toIndex);
});

ipcMain.handle("bot:getQueue", () => {
    return [...bot.queue];
});

function getQueuePath() {
    return path.join(
        app.isPackaged ? app.getPath("userData") : __dirname,
        "saved-queue.json",
    );
}

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
        fs.unlinkSync(p);
        return { ok: true, queue };
    } catch (_) {
        return { ok: false, queue: [] };
    }
});

ipcMain.handle("config:get", () => readEnv());

ipcMain.handle("config:save", (_, config) => {
    writeEnv(config);
});

ipcMain.handle("config:isComplete", () => {
    const cfg = readEnv();
    return CONFIG_KEYS.every(k => cfg[k] && cfg[k].length > 0);
});

ipcMain.handle("shell:openExternal", (_, url) => {
    shell.openExternal(url);
});

ipcMain.handle("app:getVersion", () => app.getVersion());

ipcMain.handle("updater:check", () => {
    _updater?.checkForUpdates();
});

ipcMain.handle("updater:install", () => {
    _updater?.quitAndInstall();
});

ipcMain.handle("config:checkRiotKey", async () => {
    const apiKey = process.env.RIOT_API_KEY;
    const accounts = parseRiotAccounts(process.env.STREAMER_RIOT_ACCOUNTS);
    if (!apiKey || accounts.length === 0) {
        return { ok: false, error: "Configurazione incompleta" };
    }
    try {
        const axios = require("axios");
        const { name, tag } = accounts[0];
        const url = `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${name}/${tag}?api_key=${apiKey}`;
        await axios.get(url);
        return { ok: true };
    } catch (err) {
        return {
            ok: false,
            error: err.response?.data?.status?.message ?? err.message,
        };
    }
});
