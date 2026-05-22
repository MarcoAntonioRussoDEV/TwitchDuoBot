// @ts-nocheck
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const queueList = document.getElementById("queueList");
const queueCount = document.getElementById("queueCount");
const logList = document.getElementById("logList");
const removeInput = document.getElementById("removeInput");
const addTwitchInput = document.getElementById("addTwitchInput");
const addLolInput = document.getElementById("addLolInput");
const settingsModal = document.getElementById("settingsModal");
const modalWarning = document.getElementById("modalWarning");

let currentQueue = [];
let draggedIndex = null;

// ── Settings Modal ──────────────────────────────────────────────

const CFG_FIELDS = {
    TWITCH_OAUTH_TOKEN: "cfgOauthToken",
    TWITCH_CHANNEL: "cfgTwitchChannel",
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

document
    .getElementById("btnSettings")
    .addEventListener("click", () => openSettings());

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
            const val = input.value.trim();
            if (!val) {
                input.classList.add("invalid");
                valid = false;
            } else {
                input.classList.remove("invalid");
                if (key === "TWITCH_OAUTH_TOKEN") {
                    config[key] = val.startsWith("oauth:")
                        ? val
                        : `oauth:${val}`;
                } else {
                    config[key] = val;
                }
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
        if (accountParts.length === 0) valid = false;
        else config.STREAMER_RIOT_ACCOUNTS = accountParts.join(",");

        if (!valid) {
            modalWarning.classList.add("show");
            modalWarning.textContent =
                "Compila tutti i campi obbligatori prima di avviare il bot.";
            return;
        }

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
function checkAllFilled() {
    const twitchFilled = [
        CFG_FIELDS.TWITCH_OAUTH_TOKEN,
        CFG_FIELDS.TWITCH_CHANNEL,
    ].every(fid => document.getElementById(fid).value.trim() !== "");
    const riotRows = document.querySelectorAll(".riot-account-row");
    const riotFilled =
        riotRows.length > 0 &&
        [...riotRows].every(
            row =>
                row.querySelector(".riot-name").value.trim() !== "" &&
                row.querySelector(".riot-tag").value.trim() !== "",
        );
    if (twitchFilled && riotFilled) modalWarning.classList.remove("show");
}

for (const id of [CFG_FIELDS.TWITCH_OAUTH_TOKEN, CFG_FIELDS.TWITCH_CHANNEL]) {
    document.getElementById(id).addEventListener("input", function () {
        this.classList.remove("invalid");
        checkAllFilled();
    });
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
        openSettings({ mandatory: true });
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

function addLog(msg) {
    const div = document.createElement("div");
    div.className = "log-entry";
    const now = new Date().toLocaleTimeString("it-IT");
    div.innerHTML = `<span class="log-time">[${now}]</span>${msg}`;
    logList.appendChild(div);
    logList.scrollTop = logList.scrollHeight;

    // Mantieni al massimo 200 righe di log
    while (logList.children.length > 200) {
        logList.removeChild(logList.firstChild);
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

function updateRiotStatus({ ok, error }) {
    const badge = document.getElementById("riotStatusBadge");
    const dot = document.getElementById("riotStatusDot");
    const text = document.getElementById("riotStatusText");
    badge.style.display = "flex";
    if (ok) {
        dot.className = "status-dot connected";
        text.textContent = "Riot API ✓";
    } else if (error === "Configurazione incompleta") {
        dot.className = "status-dot disconnected";
        text.textContent = "Riot API — Non configurata";
    } else {
        dot.className = "status-dot error";
        text.textContent = "Riot API ✗ — Key non valida";
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
    logList.innerHTML = "";
});

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

// ── Auto-updater ───────────────────────────────────────────────

const updateBanner = document.getElementById("updateBanner");
const updateBannerText = document.getElementById("updateBannerText");
const btnInstallUpdate = document.getElementById("btnInstallUpdate");

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

window.updater.onUpdateDownloaded(() => {
    updateBannerText.textContent = "✅ Aggiornamento scaricato e pronto!";
    btnInstallUpdate.style.display = "";
});

btnInstallUpdate.addEventListener("click", () => window.updater.install());

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
