const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("shell", {
    openExternal: url => ipcRenderer.invoke("shell:openExternal", url),
    getVersion: () => ipcRenderer.invoke("app:getVersion"),
});

contextBridge.exposeInMainWorld("updater", {
    onUpdateAvailable: cb =>
        ipcRenderer.on("updater:update-available", (_, info) => cb(info)),
    onDownloadProgress: cb =>
        ipcRenderer.on("updater:download-progress", (_, progress) =>
            cb(progress),
        ),
    onUpdateDownloaded: cb =>
        ipcRenderer.on("updater:update-downloaded", () => cb()),
    install: () => ipcRenderer.invoke("updater:install"),
    check: () => ipcRenderer.invoke("updater:check"),
});

contextBridge.exposeInMainWorld("config", {
    get: () => ipcRenderer.invoke("config:get"),
    save: cfg => ipcRenderer.invoke("config:save", cfg),
    isComplete: () => ipcRenderer.invoke("config:isComplete"),
    checkRiotKey: () => ipcRenderer.invoke("config:checkRiotKey"),
});

contextBridge.exposeInMainWorld("bot", {
    start: () => ipcRenderer.invoke("bot:start"),
    stop: () => ipcRenderer.invoke("bot:stop"),
    skip: () => ipcRenderer.invoke("bot:skip"),
    next: () => ipcRenderer.invoke("bot:next"),
    skipNext: () => ipcRenderer.invoke("bot:skipNext"),
    clearQueue: () => ipcRenderer.invoke("bot:clearQueue"),
    liveRank: () => ipcRenderer.invoke("bot:liverank"),
    getLiveRankData: () => ipcRenderer.invoke("bot:getLiveRankData"),
    remove: nick => ipcRenderer.invoke("bot:remove", nick),
    add: (twitchUser, lolNick) =>
        ipcRenderer.invoke("bot:add", twitchUser, lolNick),
    move: (fromIndex, toIndex) =>
        ipcRenderer.invoke("bot:move", fromIndex, toIndex),
    getQueue: () => ipcRenderer.invoke("bot:getQueue"),
    saveQueue: () => ipcRenderer.invoke("queue:save"),
    loadQueue: () => ipcRenderer.invoke("queue:load"),
    onLog: cb => ipcRenderer.on("bot:log", (_, msg) => cb(msg)),
    onQueueUpdate: cb =>
        ipcRenderer.on("bot:queue-update", (_, queue) => cb(queue)),
    onStatus: cb => ipcRenderer.on("bot:status", (_, status) => cb(status)),
    onRiotStatus: cb =>
        ipcRenderer.on("bot:riot-status", (_, result) => cb(result)),
});
