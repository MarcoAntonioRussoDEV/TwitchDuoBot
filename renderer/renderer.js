// @ts-nocheck

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const queueList = document.getElementById("queueList");
const queueCount = document.getElementById("queueCount");
const removeInput = document.getElementById("removeInput");
const addTwitchInput = document.getElementById("addTwitchInput");
const addLolInput = document.getElementById("addLolInput");
const settingsModal = document.getElementById("settingsModal");
const modalWarning = document.getElementById("modalWarning");

let currentQueue = [];
let draggedIndex = null;

// ── Settings Modal ──────────────────────────────────────────────

const CFG_FIELDS = {
    DUO_SUB_ONLY: "cfgDuoSubOnly",
};

async function openSettings({ mandatory = false } = {}) {
    const cfg = await window.config.get();
    for (const [key, id] of Object.entries(CFG_FIELDS)) {
        const input = document.getElementById(id);
        if (key === "DUO_SUB_ONLY") {
            input.checked = String(cfg[key] ?? "true").toLowerCase() === "true";
        } else {
            input.value = cfg[key] ?? "";
        }
    }
    const twitchStatus = document.getElementById("twitchLoginStatus");
    const twitchUser = cfg.TWITCH_BOT_USERNAME;
    twitchStatus.textContent = twitchUser
        ? `Connesso come: @${twitchUser}`
        : "Non connesso";
    twitchStatus.style.color = twitchUser ? "#9147ff" : "#888";

    loadRiotAccountRows(cfg.STREAMER_RIOT_ACCOUNTS ?? "");
    modalWarning.classList.toggle("show", mandatory);
    // Se obbligatorio (primo avvio), nasconde il pulsante Annulla
    document.getElementById("btnSettingsCancel").style.display = mandatory
        ? "none"
        : "";
    settingsModal.classList.add("open");
}

function closeSettings() {
    settingsModal.classList.remove("open");
    checkRiotStatus();
}

document
    .getElementById("btnCredits")
    .addEventListener("click", () =>
        window.shell.openExternal(
            "https://github.com/MarcoAntonioRussoDEV/TwitchDuoBot",
        ),
    );

document.getElementById("btnSettings").addEventListener("click", () =>
    openSettings().catch(err => {
        console.error("openSettings crash:", err);
        addLog(`❌ Errore apertura impostazioni: ${err.message}`);
    }),
);

document
    .getElementById("btnTwitchLogin")
    .addEventListener("click", async () => {
        const loginStatus = document.getElementById("twitchLoginStatus");
        const btn = document.getElementById("btnTwitchLogin");
        loginStatus.textContent = "Autenticazione in corso...";
        loginStatus.style.color = "#888";
        btn.disabled = true;

        try {
            const result = await window.auth.loginTwitch();
            loginStatus.textContent = `Connesso come: @${result.username}`;
            loginStatus.style.color = "#9147ff";
            addLog(`✅ Login Twitch riuscito come @${result.username}`);
            await checkAllFilled();
        } catch (err) {
            loginStatus.textContent = "Non connesso";
            loginStatus.style.color = "#888";
            addLog(`❌ Errore login Twitch: ${err.message}`);
        } finally {
            btn.disabled = false;
        }
    });

document
    .getElementById("btnSettingsCancel")
    .addEventListener("click", closeSettings);

document
    .getElementById("btnSettingsSave")
    .addEventListener("click", async () => {
        const config = {};
        let valid = true;

        for (const [key, id] of Object.entries(CFG_FIELDS)) {
            const input = document.getElementById(id);
            if (key === "DUO_SUB_ONLY") {
                config[key] = input.checked ? "true" : "false";
                continue;
            }
        }

        // Valida e serializza gli account Riot
        const riotRows = document.querySelectorAll(".riot-account-row");
        const accountParts = [];
        riotRows.forEach(row => {
            const nameInput = row.querySelector(".riot-name");
            const tagInput = row.querySelector(".riot-tag");
            const name = nameInput.value.trim();
            const tag = tagInput.value.trim();
            if (!name || !tag) {
                if (!name) nameInput.classList.add("invalid");
                if (!tag) tagInput.classList.add("invalid");
                valid = false;
            } else {
                nameInput.classList.remove("invalid");
                tagInput.classList.remove("invalid");
                accountParts.push(`${name}|${tag}`);
            }
        });
        if (accountParts.length === 0) {
            valid = false;
        } else {
            config.STREAMER_RIOT_ACCOUNTS = accountParts.join(",");
        }

        // Verifica che il login Twitch sia stato effettuato
        const currentCfg = await window.config.get();
        if (!currentCfg.TWITCH_ACCESS_TOKEN) {
            modalWarning.classList.add("show");
            modalWarning.textContent =
                "Devi effettuare il login con Twitch prima di salvare.";
            return;
        }

        if (!valid) {
            modalWarning.classList.add("show");
            modalWarning.textContent =
                "Compila tutti i campi obbligatori prima di avviare il bot.";
            return;
        }

        modalWarning.classList.remove("show");

        try {
            await window.config.save(config);
            closeSettings();
            addLog("Configurazione salvata.");

            if (statusDot.classList.contains("connected")) {
                addLog(
                    "Riavvio del bot per applicare le nuove impostazioni...",
                );
                await window.bot.stop();
                setStatus("connecting");
                await window.bot.start();
            }
        } catch (err) {
            modalWarning.classList.add("show");
            modalWarning.textContent = `Errore durante il salvataggio: ${err.message}`;
        }
    });

// Rimuove il bordo rosso e nasconde il warning se tutti i campi sono compilati
async function checkAllFilled() {
    const riotRows = document.querySelectorAll(".riot-account-row");
    const riotFilled =
        riotRows.length > 0 &&
        [...riotRows].every(
            row =>
                row.querySelector(".riot-name").value.trim() !== "" &&
                row.querySelector(".riot-tag").value.trim() !== "",
        );

    const cfg = await window.config.get();
    const twitchLogged = Boolean(cfg.TWITCH_ACCESS_TOKEN);

    if (riotFilled && twitchLogged) {
        modalWarning.classList.remove("show");
    }
}

document
    .getElementById(CFG_FIELDS.DUO_SUB_ONLY)
    .addEventListener("change", function () {
        this.classList.remove("invalid");
    });

// ── Account Riot ────────────────────────────────────────────────

function createRiotAccountRow(name = "", tag = "") {
    const row = document.createElement("div");
    row.className = "riot-account-row";
    row.style.cssText =
        "display:flex;gap:6px;margin-bottom:6px;align-items:center;";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "riot-name";
    nameInput.placeholder = "Nome Riot (es. Ocrama94)";
    nameInput.value = name;
    nameInput.style.flex = "2";
    nameInput.addEventListener("input", function () {
        this.classList.remove("invalid");
        checkAllFilled();
    });

    const hash = document.createElement("span");
    hash.textContent = "#";
    hash.style.color = "#888";

    const tagInput = document.createElement("input");
    tagInput.type = "text";
    tagInput.className = "riot-tag";
    tagInput.placeholder = "EUW";
    tagInput.value = tag;
    tagInput.style.cssText = "flex:1;max-width:80px;";
    tagInput.addEventListener("input", function () {
        this.classList.remove("invalid");
        checkAllFilled();
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn-ghost btn-sm";
    removeBtn.textContent = "\u2715";
    removeBtn.title = "Rimuovi account";
    removeBtn.addEventListener("click", () => {
        const list = document.getElementById("riotAccountsList");
        if (list.children.length > 1) row.remove();
    });

    row.appendChild(nameInput);
    row.appendChild(hash);
    row.appendChild(tagInput);
    row.appendChild(removeBtn);
    return row;
}

function loadRiotAccountRows(accountsStr) {
    const list = document.getElementById("riotAccountsList");
    list.innerHTML = "";
    const accounts = accountsStr
        ? accountsStr.split(",").map(a => {
              const parts = a.trim().split("|");
              return {
                  name: parts[0]?.trim() ?? "",
                  tag: parts[1]?.trim() ?? "",
              };
          })
        : [];
    (accounts.length === 0 ? [{ name: "", tag: "" }] : accounts).forEach(a =>
        list.appendChild(createRiotAccountRow(a.name, a.tag)),
    );
}

document.getElementById("btnAddRiotAccount").addEventListener("click", () => {
    document
        .getElementById("riotAccountsList")
        .appendChild(createRiotAccountRow());
});

// ── Controllo configurazione all'avvio ─────────────────────────

(async () => {
    const complete = await window.config.isComplete();
    if (!complete) {
        openSettings({ mandatory: true }).catch(err => {
            console.error("openSettings(mandatory) crash:", err);
            addLog(`❌ Errore apertura impostazioni: ${err.message}`);
        });
    } else {
        checkRiotStatus();
    }
})();

// ── Stato ──────────────────────────────────────────────────────

function setStatus(status) {
    statusDot.className = "status-dot " + status;
    const labels = {
        connected: "Connesso",
        disconnected: "Disconnesso",
        connecting: "Connessione in corso...",
        error: "Errore di connessione",
    };
    statusText.textContent = labels[status] ?? status;
    btnStart.disabled = status === "connected" || status === "connecting";
    btnStop.disabled = status !== "connected";
}

// ── Coda ───────────────────────────────────────────────────────

function renderQueue(queue) {
    currentQueue = [...queue];
    queueCount.textContent = queue.length;
    window.bot.saveQueue();

    if (queue.length === 0) {
        queueList.innerHTML = '<div class="queue-empty">La coda è vuota</div>';
        return;
    }

    queueList.innerHTML = queue
        .map(
            (entry, i) => `
        <div class="queue-item ${i === 0 ? "first" : ""}" data-index="${i}" draggable="true">
            <div class="queue-pos">${i + 1}</div>
            <div class="queue-info">
                <div class="queue-twitch">@${entry.twitchUser}</div>
                <div class="queue-lol">LoL: ${entry.lolNick}${entry.rank ? ` <span class="queue-rank">${entry.rank}</span>` : ""}</div>
            </div>
            <button class="btn btn-ghost btn-sm" data-nick="${entry.lolNick}">✕</button>
        </div>`,
        )
        .join("");

    // Rimozione diretta dalla lista
    queueList.querySelectorAll("[data-nick]").forEach(btn => {
        btn.addEventListener("click", () => removeUser(btn.dataset.nick));
    });

    setupQueueDragAndDrop();
}

function clearDragIndicators() {
    queueList
        .querySelectorAll(
            ".queue-item.drag-over-top, .queue-item.drag-over-bottom",
        )
        .forEach(el => {
            el.classList.remove("drag-over-top", "drag-over-bottom");
        });
}

function setupQueueDragAndDrop() {
    const items = queueList.querySelectorAll(".queue-item");
    items.forEach(item => {
        item.addEventListener("dragstart", e => {
            draggedIndex = Number(item.dataset.index);
            item.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
        });

        item.addEventListener("dragend", () => {
            item.classList.remove("dragging");
            clearDragIndicators();
            draggedIndex = null;
        });

        item.addEventListener("dragover", e => {
            e.preventDefault();
            if (draggedIndex === null) return;

            clearDragIndicators();
            const rect = item.getBoundingClientRect();
            const isBottomHalf = e.clientY > rect.top + rect.height / 2;
            item.classList.add(
                isBottomHalf ? "drag-over-bottom" : "drag-over-top",
            );
        });

        item.addEventListener("dragleave", () => {
            item.classList.remove("drag-over-top", "drag-over-bottom");
        });

        item.addEventListener("drop", async e => {
            e.preventDefault();
            if (draggedIndex === null) return;

            const targetIndex = Number(item.dataset.index);
            const rect = item.getBoundingClientRect();
            const insertAfter = e.clientY > rect.top + rect.height / 2;

            let insertIndex = targetIndex + (insertAfter ? 1 : 0);
            if (draggedIndex < insertIndex) insertIndex -= 1;

            const toIndex = Math.max(
                0,
                Math.min(insertIndex, currentQueue.length - 1),
            );

            if (toIndex === draggedIndex) {
                clearDragIndicators();
                return;
            }

            const result = await window.bot.move(draggedIndex, toIndex);
            if (!result?.ok) {
                addLog(
                    `Errore spostamento coda: ${result?.error ?? "errore sconosciuto"}`,
                );
            }
            clearDragIndicators();
        });
    });
}

// ── Log ────────────────────────────────────────────────────────
/** @typedef {"success"|"error"|"warning"|"info"|"connection"|"queue"|"debug"} LogLevel */

/** @type {{ level: LogLevel, msg: string, details?: string, ts: number }[]} */
let userLogEntries = [];

/** @type {{ level: LogLevel, msg: string, details?: string, ts: number }[]} */
let devLogEntries = [];

const MAX_LOG_ENTRIES = 300;

/**
 * Icone per ogni livello di log
 */
const LOG_ICONS = {
    success: "✅",
    error: "❌",
    warning: "⚠️",
    info: "ℹ️",
    connection: "🔌",
    queue: "📋",
    debug: "🔍",
};

/**
 * Determina il livello di log in base al contenuto del messaggio.
 * @param {string} msg
 * @returns {{ level: LogLevel, isDev: boolean, details?: string }}
 */
function classifyLog(msg) {
    // Dev-only patterns — messaggi tecnici che vanno SOLO nel dev log
    const devOnlyPatterns = [
        /^\[TwitchAuth\]/,
        /^\[Riot\]/,
        /^\[Twitch\]/,
        /^(DEBUG|TRACE)/i,
        /^Fetching user/,
        /^Found user id/,
        /^Fetching channel/,
        /^Found chatroom/,
        /^broadcaster_user_id:/,
        /^chatroom_id:/,
        /websocket|pusher:ping|pusher:pong/i,
        /playwright browser/i,
        /initBrowser/,
        /Retrying/,
        /attempt \d+\/\d+/,
        /Token response/,
        /Queue state:/,
        /Connection status:/,
    ];

    const isDev = devOnlyPatterns.some(p => p.test(msg));
    let level = "info";

    if (/^✅/.test(msg) || /^✔/.test(msg)) level = "success";
    else if (
        /^❌/.test(msg) ||
        /^✖/.test(msg) ||
        (/error/i.test(msg) && !/Errore/i.test(msg))
    )
        level = "error";
    else if (/^⚠️/.test(msg) || /warning/i.test(msg)) level = "warning";
    else if (
        /^🔌/.test(msg) ||
        /conness[io]|disconness/i.test(msg) ||
        /connected|disconnected|connecting/i.test(msg)
    )
        level = "connection";
    else if (/^📋/.test(msg) || (/cod[ae]|queue/i.test(msg) && !isDev))
        level = "queue";
    else if (isDev) level = "debug";

    // Estrai dettagli strutturati (dopo il messaggio principale, es. "❌ Errore: ... — Dettaglio: ...")
    let details;
    const detailMatch = msg.match(/— Dettaglio: (.+)$/);
    if (detailMatch) details = detailMatch[1];

    return { level, isDev, details };
}

/**
 * Aggiunge un log con classificazione automatica.
 * @param {string} msg
 */
function addLog(msg) {
    const { level, isDev, details } = classifyLog(msg);
    const entry = { level, msg, details, ts: Date.now() };

    // Always add to dev log
    devLogEntries.push(entry);

    // Add to user log only if not dev-only
    if (!isDev) {
        userLogEntries.push(entry);
    }

    // Trim logs
    if (userLogEntries.length > MAX_LOG_ENTRIES) userLogEntries.shift();
    if (devLogEntries.length > MAX_LOG_ENTRIES) devLogEntries.shift();

    updateLogDisplay();
}

/**
 * Aggiunge un log forzato nel dev log (es. dati tecnici strutturati).
 * @param {string} msg
 * @param {object} [data]
 */
function addDevLog(msg, data) {
    let details;
    if (data) {
        try {
            details = JSON.stringify(data, null, 2).slice(0, 500);
        } catch (_) {
            details = String(data).slice(0, 500);
        }
    }
    const entry = { level: "debug", msg, details, ts: Date.now() };
    devLogEntries.push(entry);
    if (devLogEntries.length > MAX_LOG_ENTRIES) devLogEntries.shift();
    updateLogDisplay();
}

/**
 * Formatta un timestamp HH:MM:SS
 * @param {number} ts
 * @returns {string}
 */
function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

/**
 * Renderizza HTML per un singolo log entry
 * @param {{ level: LogLevel, msg: string, details?: string, ts: number }} entry
 * @param {boolean} isDev - se true, usa stili più compatti
 * @returns {string}
 */
function renderLogEntry(entry, isDev) {
    const icon = LOG_ICONS[entry.level] ?? "";
    const time = formatTime(entry.ts);
    const levelClass = `log-${entry.level}`;

    // Rimuovi l'icona dal messaggio se già presente (per evitare doppie icone)
    let cleanMsg = entry.msg;
    const iconPrefixes = ["✅", "❌", "⚠️", "ℹ️", "🔌", "📋", "🔍"];
    for (const iconChar of iconPrefixes) {
        if (cleanMsg.startsWith(iconChar + " ")) cleanMsg = cleanMsg.slice(2);
        if (cleanMsg.startsWith(iconChar)) cleanMsg = cleanMsg.slice(1);
    }
    cleanMsg = cleanMsg.trim();

    const detailsHtml = entry.details
        ? `<div class="log-entry-details">${escapeHtml(entry.details)}</div>`
        : "";

    return `<div class="log-entry ${levelClass}">
        <span class="log-icon">${icon}</span>
        <span class="log-time">[${time}]</span>
        <span class="log-msg">${escapeHtml(cleanMsg)}</span>
        ${detailsHtml}
    </div>`;
}

/**
 * Escape HTML di base per sicurezza
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function updateLogDisplay() {
    const userLogList = document.getElementById("logUserList");
    const devLogList = document.getElementById("logDevList");
    const tabUser = document.getElementById("tabUserLog");
    const tabDev = document.getElementById("tabDevLog");
    const isUserTabActive = tabUser.classList.contains("active");

    // Update user log list
    userLogList.innerHTML = userLogEntries
        .map(e => renderLogEntry(e, false))
        .join("");

    // Update dev log list
    devLogList.innerHTML = devLogEntries
        .map(e => renderLogEntry(e, true))
        .join("");

    // Update tab counters
    const userCount = tabUser.querySelector(".tab-count");
    const devCount = tabDev.querySelector(".tab-count");
    if (userCount) userCount.textContent = String(userLogEntries.length);
    if (devCount) devCount.textContent = String(devLogEntries.length);

    // Ensure the active tab's list is scrolled to bottom
    const activeList = isUserTabActive ? userLogList : devLogList;
    if (activeList) {
        activeList.scrollTop = activeList.scrollHeight;
    }
}

// ── Rimozione utente ───────────────────────────────────────────

async function removeUser(nick) {
    const result = await window.bot.remove(nick);
    if (!result) addLog(`Utente con nick "${nick}" non trovato in coda`);
}

async function addManualUserFromUi() {
    const twitchUser = addTwitchInput.value.trim();
    const lolNick = addLolInput.value.trim();

    if (!twitchUser || !lolNick) {
        addLog("Inserisci sia il nome Twitch che il nick LoL");
        return;
    }

    const result = await window.bot.add(twitchUser, lolNick);
    if (!result?.ok) {
        addLog(result?.error ?? "Impossibile aggiungere utente in coda");
        return;
    }

    addLog(
        `Aggiunto manualmente: @${result.entry.twitchUser} (${result.entry.lolNick})`,
    );
    addTwitchInput.value = "";
    addLolInput.value = "";
}

// ── Listener eventi bot ────────────────────────────────────────

window.bot.onStatus(setStatus);
window.bot.onQueueUpdate(renderQueue);
window.bot.onLog(addLog);

/**
 * Aggiorna il pallino di stato per una singola piattaforma nel footer.
 * @param {"twitch"} platform
 * @param {"connected"|"disconnected"|"error"|"none"} status
 */
function setPlatformStatus(platform, status) {
    const badge = document.getElementById(`${platform}StatusBadge`);
    const dot = document.getElementById(`${platform}StatusDot`);
    if (!badge || !dot) return;
    if (status === "none" || status === "disconnected") {
        badge.style.display = "none";
        return;
    }
    badge.style.display = "flex";
    dot.className = "status-dot " + status; // "connected" | "error"
}

window.bot.onPlatformStatus(({ platform, status }) =>
    setPlatformStatus(platform, status),
);

function updateRiotStatus({ ok, error }) {
    const badge = document.getElementById("riotStatusBadge");
    const dot = document.getElementById("riotStatusDot");
    const text = document.getElementById("riotStatusText");
    badge.style.display = "flex";
    if (ok) {
        dot.className = "status-dot connected";
        text.textContent = "Riot API";
    } else if (error === "Configurazione incompleta") {
        dot.className = "status-dot disconnected";
        text.textContent = "Riot API — Non configurata";
    } else {
        dot.className = "status-dot error";
        text.textContent = "Riot API — Key non valida";
        addLog(`❌ Riot API KEY non valida: ${error}`);
    }
}

async function checkRiotStatus() {
    const result = await window.config.checkRiotKey();
    updateRiotStatus(result);
}

window.bot.onRiotStatus(updateRiotStatus);

// ── Bottoni header ─────────────────────────────────────────────

btnStart.addEventListener("click", async () => {
    setStatus("connecting");
    addLog("Avvio bot in corso...");
    await window.bot.start();
});

btnStop.addEventListener("click", async () => {
    await window.bot.stop();
});

// ── Controlli admin ────────────────────────────────────────────

document.getElementById("btnNext").addEventListener("click", async () => {
    const entry = await window.bot.next();
    if (!entry) addLog("Coda vuota — nessun prossimo da annunciare");
});

document.getElementById("btnSkip").addEventListener("click", async () => {
    const entry = await window.bot.skip();
    if (!entry) addLog("Coda vuota — nessuno da saltare");
});

document.getElementById("btnSkipNext").addEventListener("click", async () => {
    const { skipped, next } = await window.bot.skipNext();
    if (!skipped) addLog("Coda vuota");
    else if (!next) addLog("Coda ora vuota dopo il salto");
});

document.getElementById("btnClear").addEventListener("click", async () => {
    if (!confirm("Svuotare tutta la coda?")) return;
    await window.bot.clearQueue();
});

document.getElementById("btnLiveRank").addEventListener("click", openRankModal);

document.getElementById("btnRemove").addEventListener("click", async () => {
    const nick = removeInput.value.trim();
    if (!nick) return;
    const result = await window.bot.remove(nick);
    if (result) {
        addLog(`Rimosso: @${result.twitchUser} (${result.lolNick})`);
        removeInput.value = "";
    } else {
        addLog(`Nessun utente trovato con nick LoL: "${nick}"`);
    }
});

document.getElementById("btnAddManual").addEventListener("click", () => {
    addManualUserFromUi();
});

addLolInput.addEventListener("keydown", e => {
    if (e.key === "Enter") addManualUserFromUi();
});

addTwitchInput.addEventListener("keydown", e => {
    if (e.key === "Enter") addManualUserFromUi();
});

document.getElementById("btnClearLog").addEventListener("click", () => {
    userLogEntries = [];
    devLogEntries = [];
    updateLogDisplay();
});

// ── Toggle Coda ────────────────────────────────────────────────

const btnToggleQueue = document.getElementById("btnToggleQueue");

function updateQueueToggleBtn(open) {
    if (open) {
        btnToggleQueue.innerHTML =
            '<i class="fa-solid fa-lock-open"></i> Chiudi Coda';
        btnToggleQueue.className = "btn btn-success";
        btnToggleQueue.title = "La coda è aperta — clicca per chiuderla";
    } else {
        btnToggleQueue.innerHTML = '<i class="fa-solid fa-lock"></i> Apri Coda';
        btnToggleQueue.className = "btn btn-danger";
        btnToggleQueue.title = "La coda è chiusa — clicca per aprirla";
    }
}

btnToggleQueue.addEventListener("click", async () => {
    const currentOpen = await window.bot.getQueueOpen();
    await window.bot.setQueueOpen(!currentOpen);
    updateQueueToggleBtn(!currentOpen);
});

window.bot.onQueueState(open => updateQueueToggleBtn(open));

// Inizializza stato del pulsante
window.bot.getQueueOpen().then(open => updateQueueToggleBtn(open));

removeInput.addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("btnRemove").click();
});

document.getElementById("btnSaveQueue").addEventListener("click", async () => {
    const result = await window.bot.saveQueue();
    if (result?.ok) addLog("✅ Coda salvata su disco.");
    else
        addLog(
            `❌ Errore salvataggio coda: ${result?.error ?? "errore sconosciuto"}`,
        );
});

// ── Carica coda iniziale ───────────────────────────────────────

(async () => {
    const saved = await window.bot.loadQueue();
    if (saved?.ok && saved.queue.length > 0) {
        for (const entry of saved.queue) {
            await window.bot.add(entry.twitchUser, entry.lolNick);
        }
        addLog(`📂 Coda ripristinata (${saved.queue.length} utenti).`);
    } else {
        window.bot.getQueue().then(renderQueue);
    }
})();
// Log tab switching
document.getElementById("tabUserLog").addEventListener("click", () => {
    document.getElementById("tabUserLog").classList.add("active");
    document.getElementById("tabDevLog").classList.remove("active");
    document.getElementById("logUserList").style.display = "block";
    document.getElementById("logDevList").style.display = "none";
    // Scroll to bottom of active log
    const activeList = document.getElementById("logUserList");
    if (activeList) activeList.scrollTop = activeList.scrollHeight;
});

document.getElementById("tabDevLog").addEventListener("click", () => {
    document.getElementById("tabDevLog").classList.add("active");
    document.getElementById("tabUserLog").classList.remove("active");
    document.getElementById("logDevList").style.display = "block";
    document.getElementById("logUserList").style.display = "none";
    // Scroll to bottom of active log
    const activeList = document.getElementById("logDevList");
    if (activeList) activeList.scrollTop = activeList.scrollHeight;
});

// ── Auto-updater ───────────────────────────────────────────────

const updateBanner = document.getElementById("updateBanner");
const updateBannerText = document.getElementById("updateBannerText");
const btnInstallUpdate = document.getElementById("btnInstallUpdate");
const btnShowChangelog = document.getElementById("btnShowChangelog");
const changelogModal = document.getElementById("changelogModal");
const changelogContent = document.getElementById("changelogContent");

btnInstallUpdate.style.display = "none";

window.updater.onUpdateAvailable(info => {
    updateBannerText.textContent = `⬇ Aggiornamento disponibile: v${info.version} — Download in corso...`;
    updateBanner.classList.add("visible");
});

window.updater.onDownloadProgress(progress => {
    const pct = Math.round(progress.percent);
    const mbps = (progress.bytesPerSecond / 1024 / 1024).toFixed(1);
    updateBannerText.textContent = `⬇ Download aggiornamento: ${pct}% — ${mbps} MB/s`;
});

window.updater.onUpdateDownloaded(info => {
    const ver = info?.version ? ` v${info.version}` : "";
    updateBannerText.textContent = `✅ Aggiornamento${ver} scaricato e pronto!`;
    btnInstallUpdate.style.display = "";

    if (info?.releaseNotes) {
        const notes =
            typeof info.releaseNotes === "string"
                ? info.releaseNotes
                : info.releaseNotes
                      .map(r => `<h3>v${r.version}</h3>${r.note}`)
                      .join("");
        changelogContent.innerHTML = notes;
        btnShowChangelog.style.display = "";
    }
});

btnInstallUpdate.addEventListener("click", () => window.updater.install());

btnShowChangelog.addEventListener("click", () =>
    changelogModal.classList.add("open"),
);

document
    .getElementById("btnCloseChangelog")
    .addEventListener("click", () => changelogModal.classList.remove("open"));

document
    .getElementById("btnCloseChangelog2")
    .addEventListener("click", () => changelogModal.classList.remove("open"));

document
    .getElementById("btnInstallUpdate2")
    .addEventListener("click", () => window.updater.install());

document
    .getElementById("btnCheckUpdate")
    .addEventListener("click", async () => {
        const btn = document.getElementById("btnCheckUpdate");
        btn.disabled = true;
        btn.classList.add("checking");
        btn.querySelector(".btn-label").textContent = "Controllo...";
        await window.updater.check();
        setTimeout(() => {
            btn.disabled = false;
            btn.classList.remove("checking");
            btn.querySelector(".btn-label").textContent = "Update";
        }, 5000);
    });

// ── Versione nel footer ────────────────────────────────────────

window.shell.getVersion().then(v => {
    const footer = document.getElementById("appFooter");
    if (footer) footer.textContent += ` — v${v}`;
});

// ── Rank Modal ────────────────────────────────────────────────

const RANK_COLORS = {
    IRON: "#8d6748",
    BRONZE: "#cd7f32",
    SILVER: "#a8a8a8",
    GOLD: "#f0b429",
    PLATINUM: "#4fc3f7",
    EMERALD: "#50c878",
    DIAMOND: "#85c1e9",
    MASTER: "#9b59b6",
    GRANDMASTER: "#e74c3c",
    CHALLENGER: "#f8c100",
    UNRANKED: "#3d3d44",
};

function abbrevRank(rank) {
    if (!rank || rank === "Unranked") return "NR";
    const [tier, div] = rank.split(" ");
    const t = {
        CHALLENGER: "C",
        GRANDMASTER: "GM",
        MASTER: "M",
        DIAMOND: "D",
        EMERALD: "E",
        PLATINUM: "P",
        GOLD: "G",
        SILVER: "S",
        BRONZE: "B",
        IRON: "I",
    };
    const d = { I: "1", II: "2", III: "3", IV: "4" };
    return (t[tier] ?? tier) + (d[div] ?? div ?? "");
}

function rankCardHTML({ champion, rank, tier, streamerMode }) {
    const color = RANK_COLORS[tier] ?? "#3d3d44";
    const textColor = tier === "UNRANKED" ? "#666" : "#111";
    const rankLabel = streamerMode
        ? `<span class="rank-streamer-badge"><i class="fa-solid fa-eye-slash"></i> Streamer Mode</span>`
        : rank;
    return `<div class="rank-card">
        <div class="rank-tier-badge" style="background:${color};color:${textColor}">${abbrevRank(rank)}</div>
        <div class="rank-card-info">
            <div class="rank-card-champion">${champion}</div>
            <div class="rank-card-rank">${rankLabel}</div>
        </div>
    </div>`;
}

async function openRankModal() {
    document.getElementById("rankModal").classList.add("open");
    document.getElementById("rankModalContent").innerHTML =
        '<div class="rank-loading"><i class="fa-solid fa-spinner fa-spin"></i> Recupero dati partita...</div>';

    const result = await window.bot.getLiveRankData();
    if (!result?.ok) {
        document.getElementById("rankModalContent").innerHTML =
            `<div class="rank-empty"><i class="fa-solid fa-circle-info"></i> ${result?.error ?? "Errore sconosciuto"}</div>`;
        return;
    }

    document.getElementById("rankModalContent").innerHTML = `
        <div class="rank-teams">
            <div class="rank-team">
                <div class="rank-team-header team-blue">
                    <i class="fa-solid fa-shield-halved"></i> Team Blu
                </div>
                ${result.team1.map(rankCardHTML).join("")}
            </div>
            <div class="rank-team">
                <div class="rank-team-header team-red">
                    <i class="fa-solid fa-shield-halved"></i> Team Rosso
                </div>
                ${result.team2.map(rankCardHTML).join("")}
            </div>
        </div>`;
}

document.getElementById("btnCloseRankModal").addEventListener("click", () => {
    document.getElementById("rankModal").classList.remove("open");
});

document.getElementById("rankModal").addEventListener("click", e => {
    if (e.target === document.getElementById("rankModal"))
        document.getElementById("rankModal").classList.remove("open");
});

document
    .getElementById("btnPostRankChat")
    .addEventListener("click", async () => {
        await window.bot.liveRank();
        addLog("📊 !liverank inviato in chat");
    });
