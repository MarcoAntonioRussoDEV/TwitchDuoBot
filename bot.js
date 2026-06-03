const { EventEmitter } = require("events");
const riot = require("./riot");
const tmi = require("tmi.js");
const helperFunctions = require("./helper-functions");

const CHECK_INTERVAL = 30000; // 30 secondi

class Bot extends EventEmitter {
    constructor() {
        super();
        this.queue = [];
        this.queueOpen = true;
        this.botStartTime = Date.now();
        this.debug = false;
        this.client = null;
        this.streamerPuuids = [];
        this._checkInterval = null;
        this.running = false;
    }

    setQueueOpen(open) {
        this.queueOpen = Boolean(open);
        this.emit("queue-state", this.queueOpen);
        if (this.client) {
            const msg = this.queueOpen
                ? "🟢 La coda è ora APERTA! Usa !duo per entrare."
                : "🔴 La coda è ora CHIUSA! Non è possibile entrare in coda.";
            this.client.say(this._channel, msg);
        }
        this._log(this.queueOpen ? "Coda aperta" : "Coda chiusa");
    }

    _log(msg) {
        console.log(msg);
        this.emit("log", msg);
    }

    _emitQueue() {
        this.emit("queue-update", [...this.queue]);
    }

    async start() {
        if (this.running) return;
        this.running = true;
        this.botStartTime = Date.now();

        this.client = new tmi.Client({
            identity: {
                username: "queueBot",
                password: process.env.TWITCH_OAUTH_TOKEN,
            },
            channels: [process.env.TWITCH_CHANNEL],
        });

        try {
            await this.client.connect();
        } catch (err) {
            this._log(`Errore connessione Twitch: ${err.message}`);
            this.running = false;
            this.emit("status", "error");
            return;
        }

        this.emit("status", "connected");
        this._log("Bot connesso a Twitch");
        this.client.say(
            this._channel,
            "🟢 Bot connesso! Usa !queuehelp per i comandi.",
        );

        try {
            const accountsStr = process.env.STREAMER_RIOT_ACCOUNTS ?? "";
            const accounts = accountsStr
                .split(",")
                .map(a => {
                    const parts = a.trim().split("|");
                    return { name: parts[0]?.trim(), tag: parts[1]?.trim() };
                })
                .filter(a => a.name && a.tag);

            const results = await Promise.allSettled(
                accounts.map(a => riot.getPuuid(a.name, a.tag)),
            );
            this.streamerPuuids = results
                .filter(r => r.status === "fulfilled")
                .map(r => r.value);

            if (this.streamerPuuids.length > 0) {
                this._log(
                    `✅ Riot API OK — ${this.streamerPuuids.length} account caricati`,
                );
                this.emit("riot-status", { ok: true });
            } else {
                const firstErr = results.find(
                    r => r.status === "rejected",
                )?.reason;
                this._log(
                    `❌ Riot API KEY non valida: ${
                        firstErr?.message ?? "errore sconosciuto"
                    }`,
                );
                this.emit("riot-status", {
                    ok: false,
                    error: firstErr?.message ?? "errore sconosciuto",
                });
            }
        } catch (err) {
            this._log(`❌ Riot API KEY non valida: ${err.message}`);
            this.emit("riot-status", { ok: false, error: err.message });
        }

        this._checkInterval = setInterval(async () => {
            if (this.streamerPuuids.length === 0) return;

            const removed = await helperFunctions.checkAndRemove(
                this.queue,
                this.streamerPuuids,
                riot,
                this.botStartTime,
                this.debug,
            );

            removed.forEach(entry => {
                this.client.say(
                    this._channel,
                    `@${entry.twitchUser} è stato rimosso dalla coda perché ha giocato con lo streamer`,
                );
                this._log(`Rimosso automaticamente: @${entry.twitchUser}`);
            });

            if (removed.length > 0) this._emitQueue();
        }, CHECK_INTERVAL);

        this.client.on("chat", (channel, tags, message, self) => {
            if (self) return;
            this._handleChat(channel, tags, message);
        });
    }

    async stop() {
        if (!this.running) return;
        clearInterval(this._checkInterval);
        this._checkInterval = null;
        try {
            this.client.say(this._channel, "🔴 Bot disconnesso.");
            await this.client.disconnect();
        } catch (_) {}
        this.client = null;
        this.running = false;
        this.emit("status", "disconnected");
        this._log("Bot disconnesso");
    }

    _handleChat(channel, tags, message) {
        const msg = message.trim();
        const parts = msg.split(" ");
        const command = parts[0].toLowerCase();
        const duoSubOnly = ["true", "1", "yes"].includes(
            String(process.env.DUO_SUB_ONLY ?? "true").toLowerCase(),
        );
        const duoModeLabel = duoSubOnly ? "solo SUB" : "tutti";

        if (command === "!queuehelp") {
            const helpMessage = [
                "📌 Comandi disponibili:",
                `!duo <nickLoL> → Entra in coda (${duoModeLabel})`,
                "!openqueue / !closequeue → Apre/chiude la coda (solo Mod/Admin)",
                "!queue → Mostra la coda",
                "!me → Mostra la tua posizione",
                "!next → Annuncia il prossimo in coda",
                "!liverank → Mostra il rank attuale dei giocatori in partita con lo streamer",
                "🛠 Comandi Admin/Mod:",
                "!skip → Salta il primo della coda",
                "!skipn → Salta il primo e annuncia il successivo",
                "!addqueue <twitchUser> <nickLoL> → Aggiunge manualmente un utente in coda",
                "!movequeue <daPos> <aPos> → Sposta un utente in una nuova posizione",
                "!removequeue <nick> → Rimuove un utente dalla coda",
                "!clearqueue → Svuota completamente la coda",
                "🟣 Il bot rimuove automaticamente chi ha già giocato con lo streamer.",
            ].join(" | ");
            this.client.say(channel, helpMessage);
            return;
        }

        if (command === "!duo") {
            if (!this.queueOpen) {
                this.client.say(
                    channel,
                    `@${tags.username} la coda è chiusa, non è possibile entrare al momento`,
                );
                return;
            }
            if (duoSubOnly && !tags.subscriber) {
                this.client.say(
                    channel,
                    `@${tags.username} il comando è solo per i SUB`,
                );
                return;
            }
            const lolNick = parts.slice(1).join(" ");
            helperFunctions.handleDuoCommand(
                channel,
                tags,
                lolNick,
                this.client,
                this.queue,
            );
            this._emitQueue();
            if (lolNick.includes("#")) {
                const entry = this.queue.find(
                    e => e.twitchUser === tags.username,
                );
                if (entry) this._fetchAndSetRank(entry);
            }
            return;
        }

        if (command === "!queue") {
            const queueList = this.queue
                .map(
                    (entry, index) =>
                        `${index + 1}. ${entry.twitchUser} (${entry.lolNick})`,
                )
                .join(" | ");
            const response = queueList || "La coda è vuota!";
            this.client.say(channel, `Coda: ${response}`);
            return;
        }

        if (command === "!me") {
            const user = tags.username.toLowerCase();
            const pos = this.queue.findIndex(e => e.twitchUser === user);
            if (pos === -1) {
                this.client.say(channel, `@${user} non sei in coda`);
            } else {
                this.client.say(
                    channel,
                    `@${user} sei in posizione ${pos + 1}`,
                );
            }
            return;
        }

        if (command === "!next") {
            if (this.queue.length === 0) {
                this.client.say(channel, "La coda è vuota!");
                return;
            }

            if (this.queue.length === 1) {
                const only = this.queue[0];
                this.client.say(
                    channel,
                    "Non ci sono altri in coda, solo: " + only.twitchUser,
                );
                return;
            }

            const next = this.queue[1];
            this.client.say(
                channel,
                `Prossimo: @${next.twitchUser} (${next.lolNick})`,
            );
            this._emitQueue();
            return;
        }

        if (command === "!openqueue") {
            if (!helperFunctions.isModOrStreamer(tags)) {
                this.client.say(
                    channel,
                    `@${tags.username} non hai i permessi per usare questo comando`,
                );
                return;
            }
            this.setQueueOpen(true);
            return;
        }

        if (command === "!closequeue") {
            if (!helperFunctions.isModOrStreamer(tags)) {
                this.client.say(
                    channel,
                    `@${tags.username} non hai i permessi per usare questo comando`,
                );
                return;
            }
            this.setQueueOpen(false);
            return;
        }

        // Comandi admin/mod
        if (
            [
                "!skip",
                "!skipn",
                "!clearqueue",
                "!removequeue",
                "!addqueue",
                "!movequeue",
            ].includes(command)
        ) {
            if (!helperFunctions.isModOrStreamer(tags)) {
                this.client.say(
                    channel,
                    `@${tags.username} non hai i permessi per usare questo comando`,
                );
                return;
            }
        }

        if (command === "!skip") {
            if (this.queue.length === 0) {
                this.client.say(channel, "La coda è vuota!");
                return;
            }
            const skipped = this.queue.shift();
            this.client.say(channel, `Saltato: @${skipped.twitchUser}`);
            this._emitQueue();
            return;
        }

        if (command === "!skipn") {
            if (this.queue.length === 0) {
                this.client.say(channel, "La coda è vuota!");
                return;
            }
            const skipped = this.queue.shift();
            this.client.say(channel, `Saltato: @${skipped.twitchUser}`);
            if (this.queue.length > 0) {
                const next = this.queue.shift();
                this.client.say(
                    channel,
                    `Prossimo: @${next.twitchUser} (${next.lolNick})`,
                );
            } else {
                this.client.say(channel, "La coda ora è vuota!");
            }
            this._emitQueue();
            return;
        }

        if (command === "!clearqueue") {
            this.queue.length = 0;
            this.client.say(channel, "La coda è stata svuotata!");
            this._emitQueue();
            return;
        }

        if (command === "!removequeue") {
            const nick = parts[1];
            if (!nick) {
                this.client.say(
                    channel,
                    "Uso corretto: !removequeue <nickLoL>",
                );
                return;
            }
            const normalized = helperFunctions.normalize(nick);
            const index = this.queue.findIndex(
                e => helperFunctions.normalize(e.lolNick) === normalized,
            );
            if (index === -1) {
                this.client.say(
                    channel,
                    `Nessun utente con nick LoL simile a "${nick}" trovato in coda`,
                );
                return;
            }
            const [removed] = this.queue.splice(index, 1);
            this.client.say(
                channel,
                `Rimosso dalla coda: @${removed.twitchUser} (${removed.lolNick})`,
            );
            this._emitQueue();
            return;
        }

        if (command === "!addqueue") {
            const twitchUserRaw = parts[1];
            const lolNickRaw = parts.slice(2).join(" ").trim();

            if (!twitchUserRaw || !lolNickRaw) {
                this.client.say(
                    channel,
                    "Uso corretto: !addqueue <twitchUser> <nickLoL>",
                );
                return;
            }

            const result = this._addManualQueueEntry(twitchUserRaw, lolNickRaw);
            if (!result.ok) {
                this.client.say(channel, result.error);
                return;
            }

            this.client.say(
                channel,
                `Aggiunto manualmente in coda: @${result.entry.twitchUser} (${result.entry.lolNick})`,
            );
            this._log(
                `[CHAT][ADMIN] Aggiunto manualmente: @${result.entry.twitchUser} (${result.entry.lolNick})`,
            );
            this._emitQueue();
            if (lolNickRaw.includes("#")) this._fetchAndSetRank(result.entry);
            return;
        }

        if (command === "!movequeue") {
            const fromPosRaw = parts[1];
            const toPosRaw = parts[2];

            if (!fromPosRaw || !toPosRaw) {
                this.client.say(
                    channel,
                    "Uso corretto: !movequeue <daPos> <aPos>",
                );
                return;
            }

            const fromPos = Number.parseInt(fromPosRaw, 10);
            const toPos = Number.parseInt(toPosRaw, 10);

            if (!Number.isInteger(fromPos) || !Number.isInteger(toPos)) {
                this.client.say(
                    channel,
                    "Posizioni non valide: usa numeri interi (es. !movequeue 5 1)",
                );
                return;
            }

            const result = this._moveQueueEntry(fromPos - 1, toPos - 1);
            if (!result.ok) {
                this.client.say(channel, result.error);
                return;
            }

            this.client.say(
                channel,
                `Spostato @${result.moved.twitchUser} dalla posizione ${fromPos} alla posizione ${toPos}`,
            );
            this._log(
                `[CHAT][ADMIN] Spostato: @${result.moved.twitchUser} da ${fromPos} a ${toPos}`,
            );
            this._emitQueue();
            return;
        }
        if (command === "!liverank") {
            this._handleLiveRank(channel);
            return;
        }
        if (command === "!ciaobot") {
            if (tags.username.toLowerCase() === "ocrama94") {
                this.client.say(channel, "bip bop, ciao Ocrama!");
            }
        }
    }

    _abbreviateRank(rank) {
        if (!rank || rank === "Unranked") return "NR";
        const tierMap = {
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
        const romanMap = { I: "1", II: "2", III: "3", IV: "4" };
        const [tier, division] = rank.split(" ");
        const abbrevTier = tierMap[tier] ?? tier;
        const abbrevDiv = romanMap[division] ?? division ?? "";
        return abbrevTier + abbrevDiv;
    }

    async _handleLiveRank(channel) {
        if (this.streamerPuuids.length === 0) {
            this.client.say(channel, "Nessun account Riot configurato.");
            return;
        }

        let liveGame = null;
        for (const puuid of this.streamerPuuids) {
            try {
                liveGame = await riot.getLiveGame(puuid);
                if (liveGame) break;
            } catch (err) {
                if (err?.response?.status !== 404) {
                    this._log(`Errore getLiveGame: ${err.message}`);
                }
            }
        }

        if (!liveGame) {
            this.client.say(
                channel,
                "Lo streamer non è attualmente in partita.",
            );
            return;
        }

        const participants = liveGame.participants ?? [];
        const results = await Promise.allSettled(
            participants.map(async p => {
                const [rank, champName] = await Promise.all([
                    riot.getRankByPuuid(p.puuid),
                    riot.getChampionNameById(p.championId),
                ]);
                return {
                    name: champName,
                    rank: this._abbreviateRank(rank),
                    teamId: p.teamId,
                };
            }),
        );

        const team1 = [];
        const team2 = [];
        for (const r of results) {
            if (r.status === "fulfilled") {
                const { name, rank, teamId } = r.value;
                const entry = `${name}(${rank})`;
                if (teamId === 100) team1.push(entry);
                else team2.push(entry);
            }
        }

        const msg = `🔵 ${team1.join(" | ")} 🔴 ${team2.join(" | ")}`;
        this.client.say(channel, msg);
    }

    async _fetchAndSetRank(entry) {
        const hashIdx = entry.lolNick.indexOf("#");
        if (hashIdx === -1) return;
        const gameName = entry.lolNick.slice(0, hashIdx).trim();
        const tagLine = entry.lolNick.slice(hashIdx + 1).trim();
        if (!gameName || !tagLine) return;
        try {
            entry.rank = await riot.getRankByNameTag(gameName, tagLine);
            this._emitQueue();
        } catch (err) {
            this._log(
                `Rank non disponibile per ${entry.lolNick}: ${err.message}`,
            );
        }
    }

    _addManualQueueEntry(twitchUserRaw, lolNickRaw) {
        const twitchUser = String(twitchUserRaw ?? "")
            .replace(/^@+/, "")
            .trim()
            .toLowerCase();
        const lolNick = String(lolNickRaw ?? "").trim();

        if (!twitchUser || !lolNick) {
            return {
                ok: false,
                code: "invalid-input",
                error: "Dati non validi: specifica twitchUser e nickLoL",
            };
        }

        if (this.queue.some(entry => entry.twitchUser === twitchUser)) {
            return {
                ok: false,
                code: "duplicate-twitch",
                error: `@${twitchUser} è già in coda`,
            };
        }

        const normalizedLolNick = helperFunctions.normalize(lolNick);
        const duplicateLol = this.queue.some(
            entry =>
                helperFunctions.normalize(entry.lolNick) === normalizedLolNick,
        );

        if (duplicateLol) {
            return {
                ok: false,
                code: "duplicate-lol",
                error: `Esiste già un utente in coda con nick LoL simile a "${lolNick}"`,
            };
        }

        const entry = {
            twitchUser,
            lolNick: lolNick.toLowerCase(),
            timestamp: Date.now(),
        };
        this.queue.push(entry);
        return { ok: true, entry };
    }

    _moveQueueEntry(fromIndex, toIndex) {
        if (this.queue.length === 0) {
            return {
                ok: false,
                code: "empty-queue",
                error: "La coda è vuota",
            };
        }

        if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
            return {
                ok: false,
                code: "invalid-index",
                error: "Posizioni non valide",
            };
        }

        if (
            fromIndex < 0 ||
            fromIndex >= this.queue.length ||
            toIndex < 0 ||
            toIndex >= this.queue.length
        ) {
            return {
                ok: false,
                code: "out-of-range",
                error: "Posizioni fuori range",
            };
        }

        if (fromIndex === toIndex) {
            return {
                ok: true,
                moved: this.queue[fromIndex],
                fromIndex,
                toIndex,
            };
        }

        const [moved] = this.queue.splice(fromIndex, 1);
        this.queue.splice(toIndex, 0, moved);
        return { ok: true, moved, fromIndex, toIndex };
    }

    // ----------------------------
    // Helper: canale normalizzato (#nome)
    // ----------------------------
    get _channel() {
        const ch = process.env.TWITCH_CHANNEL || "";
        return ch.startsWith("#") ? ch : `#${ch}`;
    }

    // ----------------------------
    // Metodi admin richiamabili dalla UI
    // ----------------------------

    adminSkip() {
        if (this.queue.length === 0) return null;
        const skipped = this.queue.shift();
        this._log(`[UI] Saltato: @${skipped.twitchUser}`);
        this._emitQueue();
        return skipped;
    }

    adminNext() {
        if (this.queue.length < 2) return null;
        const entry = this.queue[1];
        if (this.client && this.running) {
            this.client.say(
                this._channel,
                `Prossimo: @${entry.twitchUser} (${entry.lolNick})`,
            );
        }
        this._log(`[UI] Prossimo: @${entry.twitchUser} (${entry.lolNick})`);
        return entry;
    }

    adminSkipNext() {
        if (this.queue.length === 0) return { skipped: null, next: null };
        const skipped = this.queue.shift();
        this._log(`[UI] Saltato: @${skipped.twitchUser}`);
        let next = null;
        if (this.queue.length > 0) {
            next = this.queue[0];
            if (this.client && this.running) {
                this.client.say(
                    this._channel,
                    `Prossimo: @${next.twitchUser} (${next.lolNick})`,
                );
            }
            this._log(`[UI] Prossimo: @${next.twitchUser} (${next.lolNick})`);
        }
        this._emitQueue();
        return { skipped, next };
    }

    adminClearQueue() {
        this.queue.length = 0;
        if (this.client && this.running) {
            this.client.say(this._channel, "La coda è stata svuotata!");
        }
        this._log("[UI] Coda svuotata");
        this._emitQueue();
    }

    adminLiveRank() {
        if (!this.client || !this.running) return;
        this._handleLiveRank(this._channel);
    }

    async adminGetLiveRankData() {
        if (!this.running) {
            return { ok: false, error: "Il bot non è in esecuzione." };
        }
        if (this.streamerPuuids.length === 0) {
            return { ok: false, error: "Nessun account Riot configurato." };
        }

        let liveGame = null;
        for (const puuid of this.streamerPuuids) {
            try {
                liveGame = await riot.getLiveGame(puuid);
                if (liveGame) break;
            } catch (err) {
                if (err?.response?.status !== 404) {
                    this._log(`Errore getLiveGame: ${err.message}`);
                }
            }
        }

        if (!liveGame) {
            return {
                ok: false,
                error: "Lo streamer non è attualmente in partita.",
            };
        }

        const participants = liveGame.participants ?? [];
        const results = await Promise.allSettled(
            participants.map(async p => {
                let rank = null;
                let streamerMode = false;
                try {
                    rank = await riot.getRankByPuuid(p.puuid);
                } catch {
                    streamerMode = true;
                }
                const champion = await riot
                    .getChampionNameById(p.championId)
                    .catch(() => `Champ#${p.championId}`);
                const resolvedRank = rank ?? "Unranked";
                const tier =
                    resolvedRank !== "Unranked"
                        ? resolvedRank.split(" ")[0]
                        : "UNRANKED";
                return {
                    champion,
                    rank: resolvedRank,
                    tier,
                    teamId: p.teamId,
                    streamerMode,
                };
            }),
        );

        const team1 = [];
        const team2 = [];
        for (const r of results) {
            if (r.status === "fulfilled") {
                const { champion, rank, tier, teamId, streamerMode } = r.value;
                (teamId === 100 ? team1 : team2).push({
                    champion,
                    rank,
                    tier,
                    streamerMode,
                });
            }
        }

        return { ok: true, team1, team2 };
    }

    adminRemove(nick) {
        const normalized = helperFunctions.normalize(nick);
        const index = this.queue.findIndex(
            e => helperFunctions.normalize(e.lolNick) === normalized,
        );
        if (index === -1) return null;
        const [removed] = this.queue.splice(index, 1);
        if (this.client && this.running) {
            this.client.say(
                this._channel,
                `Rimosso dalla coda: @${removed.twitchUser} (${removed.lolNick})`,
            );
        }
        this._log(`[UI] Rimosso: @${removed.twitchUser} (${removed.lolNick})`);
        this._emitQueue();
        return removed;
    }

    adminAdd(twitchUser, lolNick) {
        const result = this._addManualQueueEntry(twitchUser, lolNick);
        if (!result.ok) return result;

        if (this.client && this.running) {
            this.client.say(
                this._channel,
                `Aggiunto manualmente in coda: @${result.entry.twitchUser} (${result.entry.lolNick})`,
            );
        }
        this._log(
            `[UI] Aggiunto manualmente: @${result.entry.twitchUser} (${result.entry.lolNick})`,
        );
        this._emitQueue();
        if (lolNick.includes("#")) this._fetchAndSetRank(result.entry);
        return result;
    }

    adminMove(fromIndex, toIndex) {
        const result = this._moveQueueEntry(fromIndex, toIndex);
        if (!result.ok) return result;

        this._log(
            `[UI] Spostato: @${result.moved.twitchUser} da ${fromIndex + 1} a ${toIndex + 1}`,
        );
        this._emitQueue();
        return result;
    }
}

module.exports = new Bot();
