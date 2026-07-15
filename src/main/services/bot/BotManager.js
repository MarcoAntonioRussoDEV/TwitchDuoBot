const { EventEmitter } = require("events");
const riot = require("../RiotService");
const { QueueService, isModOrStreamer } = require("./QueueService");
const TwitchClient = require("./TwitchClient");
const KickClient = require("./KickClient");

const CHECK_INTERVAL = 30_000; // 30 secondi

/**
 * BotManager — l'orchestratore centrale del bot.
 *
 * Responsabilità:
 * - Possiede il QueueService (stato della coda)
 * - Gestisce i client delle piattaforme (Twitch)
 * - Riceve comandi da qualsiasi client e li processa
 * - Emette eventi verso il Main Process (che li relaya alla UI via IPC)
 *
 * NON conosce Electron, IPC, o la UI. Questo lo rende:
 *   1. Testabile in isolamento (node bot.test.js)
 *   2. Riutilizzabile in modalità CLI (index.js)
 *   3. Indipendente dalla piattaforma di streaming
 *
 * 💡 Lezione Electron — EventEmitter come bridge:
 * BotManager estende EventEmitter. Il Main Process (index.js) si iscrive
 * agli eventi con bot.on("log", ...) e li ritrasmette al Renderer via
 * win.webContents.send(). Il Renderer ascolta tramite ipcRenderer.on().
 * Flusso: BotManager → EventEmitter → Main → IPC → Renderer
 */
class BotManager extends EventEmitter {
    constructor() {
        super();
        this.queueService = new QueueService();
        this.twitchClient = new TwitchClient();
        this.kickClient = new KickClient();
        this.queueOpen = true;
        this.running = false;
        this.botStartTime = Date.now();
        this.streamerPuuids = [];
        this._checkInterval = null;
        this.debug = false;
    }

    /**
     * Espone il riferimento diretto alla coda per la compatibilità con gli
     * IPC handler che usano bot.queue (es. queue:save).
     */
    get queue() {
        return this.queueService.queue;
    }

    // ─── Lifecycle ─────────────────────────────────────────────────────────────

    async start() {
        if (this.running) return;

        this.running = true;
        this.botStartTime = Date.now();

        let anyConnected = false;

        // ── Twitch ──────────────────────────────────────────────────────────────
        const hasTwitch =
            process.env.TWITCH_BOT_USERNAME &&
            process.env.TWITCH_ACCESS_TOKEN &&
            process.env.TWITCH_CHANNEL;

        if (hasTwitch) {
            try {
                await this.twitchClient.connect(
                    process.env.TWITCH_BOT_USERNAME,
                    process.env.TWITCH_ACCESS_TOKEN,
                    process.env.TWITCH_CHANNEL,
                );
                this.twitchClient.on("command", ctx =>
                    this._handleCommand(ctx),
                );
                this._log("✅ Connesso a Twitch");
                this.emit("platform-status", {
                    platform: "twitch",
                    status: "connected",
                });
                anyConnected = true;
            } catch (err) {
                this._log(`❌ Errore connessione Twitch: ${err.message}`);
                this.emit("platform-status", {
                    platform: "twitch",
                    status: "error",
                });
            }
        }

        // ── Kick ──────────────────────────────────────────────────────────────────
        const hasKick =
            process.env.KICK_ACCESS_TOKEN && process.env.KICK_CHANNEL;

        if (hasKick) {
            try {
                await this.kickClient.connect(
                    process.env.KICK_ACCESS_TOKEN,
                    process.env.KICK_CHANNEL,
                );
                this.kickClient.on("command", ctx =>
                    this._handleCommand(ctx),
                );
                this._log("✅ Connesso a Kick");
                this.emit("platform-status", {
                    platform: "kick",
                    status: "connected",
                });
                anyConnected = true;
            } catch (err) {
                this._log(`❌ Errore connessione Kick: ${err.message}`);
                this.emit("platform-status", {
                    platform: "kick",
                    status: "error",
                });
            }
        }

        if (!anyConnected) {
            this.running = false;
            this.emit("status", "error");
            this._log(
                "❌ Nessuna piattaforma configurata. Configura Twitch nelle impostazioni.",
            );
            return;
        }

        this.emit("status", "connected");
        this._say("🟢 Bot connesso! Usa !queuehelp per i comandi.");

        await this._loadStreamerPuuids();
        this._startRiotCheck();
    }

    async stop() {
        if (!this.running) return;
        this._stopRiotCheck();
        this._say("🔴 Bot disconnesso.");
        await this.twitchClient.disconnect();
        this.twitchClient.removeAllListeners("command");
        this.emit("platform-status", { platform: "twitch", status: "disconnected" });
        await this.kickClient.disconnect();
        this.kickClient.removeAllListeners("command");
        this.emit("platform-status", { platform: "kick", status: "disconnected" });
        this.running = false;
        this.emit("status", "disconnected");
        this._log("Bot disconnesso");
    }

    // ─── Stato coda ───────────────────────────────────────────────────────────

    setQueueOpen(open) {
        this.queueOpen = Boolean(open);
        this.emit("queue-state", this.queueOpen);
        const msg = this.queueOpen
            ? "🟢 La coda è ora APERTA! Usa !duo per entrare."
            : "🔴 La coda è ora CHIUSA! Non è possibile entrare in coda.";
        this._say(msg);
        this._log(this.queueOpen ? "Coda aperta" : "Coda chiusa");
    }

    // ─── Metodi Admin (chiamati dagli IPC handler) ────────────────────────────

    adminSkip() {
        const skipped = this.queueService.skip();
        if (!skipped) return null;
        this._log(`[UI] Saltato: @${skipped.twitchUser}`);
        this._emitQueue();
        return skipped;
    }

    adminNext() {
        if (this.queue.length < 2) return null;
        const entry = this.queue[1];
        this._say(`Prossimo: @${entry.twitchUser} (${entry.lolNick})`);
        this._log(`[UI] Prossimo: @${entry.twitchUser} (${entry.lolNick})`);
        return entry;
    }

    adminSkipNext() {
        const skipped = this.queueService.skip();
        if (!skipped) return { skipped: null, next: null };
        this._log(`[UI] Saltato: @${skipped.twitchUser}`);
        let next = null;
        if (this.queue.length > 0) {
            next = this.queue[0];
            this._say(`Prossimo: @${next.twitchUser} (${next.lolNick})`);
            this._log(`[UI] Prossimo: @${next.twitchUser} (${next.lolNick})`);
        }
        this._emitQueue();
        return { skipped, next };
    }

    adminClearQueue() {
        this.queueService.clear();
        this._say("La coda è stata svuotata!");
        this._log("[UI] Coda svuotata");
        this._emitQueue();
    }

    adminRemove(nick) {
        const removed = this.queueService.remove(nick);
        if (!removed) return null;
        this._say(`Rimosso dalla coda: @${removed.twitchUser} (${removed.lolNick})`);
        this._log(`[UI] Rimosso: @${removed.twitchUser} (${removed.lolNick})`);
        this._emitQueue();
        return removed;
    }

    adminAdd(twitchUser, lolNick) {
        const result = this.queueService.addManual(twitchUser, lolNick);
        if (!result.ok) return result;
        this._say(`Aggiunto manualmente in coda: @${result.entry.twitchUser} (${result.entry.lolNick})`);
        this._log(
            `[UI] Aggiunto manualmente: @${result.entry.twitchUser} (${result.entry.lolNick})`,
        );
        this._emitQueue();
        if (lolNick.includes("#")) this._fetchAndSetRank(result.entry);
        return result;
    }

    adminMove(fromIndex, toIndex) {
        const result = this.queueService.move(fromIndex, toIndex);
        if (!result.ok) return result;
        this._log(
            `[UI] Spostato: @${result.moved.twitchUser} da ${fromIndex + 1} a ${toIndex + 1}`,
        );
        this._emitQueue();
        return result;
    }

    adminLiveRank() {
        if (!this.twitchClient.connected || !this.running) return;
        this._handleLiveRankCommand();
    }

    async adminGetLiveRankData() {
        if (!this.running)
            return { ok: false, error: "Il bot non è in esecuzione." };
        if (this.streamerPuuids.length === 0)
            return { ok: false, error: "Nessun account Riot configurato." };
        return this._getLiveRankData();
    }

    // ─── Routing comandi (agnostico rispetto alla piattaforma) ────────────────

    /**
     * Dispatcher centrale dei comandi.
     * Riceve { command, channel, tags, args } da qualsiasi client (Twitch).
     * La struttura del contesto è il "contratto" tra i client e il bot.
     *
     * Nota: `tags` viene da Twitch (tmi.js).
     */
    _handleCommand({ command, channel, tags, args }) {
        const duoSubOnly = ["true", "1", "yes"].includes(
            String(process.env.DUO_SUB_ONLY ?? "true").toLowerCase(),
        );
        const isMod = isModOrStreamer(tags);

        switch (command) {
            case "!queuehelp":
                return this._cmdHelp(channel, duoSubOnly);
            case "!duo":
                return this._cmdDuo(channel, tags, args, duoSubOnly);
            case "!queue":
                return this._cmdShowQueue(channel);
            case "!me":
                return this._cmdMe(channel, tags);
            case "!next":
                return this._cmdNext(channel);
            case "!openqueue":
                return isMod
                    ? this.setQueueOpen(true)
                    : this._noPerms(channel, tags);
            case "!closequeue":
                return isMod
                    ? this.setQueueOpen(false)
                    : this._noPerms(channel, tags);
            case "!skip":
                return isMod
                    ? this._cmdSkip(channel)
                    : this._noPerms(channel, tags);
            case "!skipn":
                return isMod
                    ? this._cmdSkipNext(channel)
                    : this._noPerms(channel, tags);
            case "!clearqueue":
                return isMod
                    ? this._cmdClearQueue(channel)
                    : this._noPerms(channel, tags);
            case "!removequeue":
                return isMod
                    ? this._cmdRemove(channel, args)
                    : this._noPerms(channel, tags);
            case "!addqueue":
                return isMod
                    ? this._cmdAdd(channel, args)
                    : this._noPerms(channel, tags);
            case "!movequeue":
                return isMod
                    ? this._cmdMove(channel, args)
                    : this._noPerms(channel, tags);
            case "!liverank":
                return this._handleLiveRankCommand();
            case "!ciaobot":
                if (tags.username?.toLowerCase() === "ocrama94") {
                    this._say("bip bop, ciao Ocrama!");
                }
                return;
        }
    }

    /**
     * Broadcast del messaggio su tutte le piattaforme connesse.
     * Ogni client è indipendente: se uno fallisce, l'altro continua.
     */
    _say(message) {
        if (this.twitchClient.connected) this.twitchClient.say(message);
        if (this.kickClient.connected) this.kickClient.say(message);
    }

    _noPerms(channel, tags) {
        this._say(
            `@${tags.username} non hai i permessi per usare questo comando`,
        );
    }

    // ─── Implementazione comandi ──────────────────────────────────────────────

    _cmdHelp(channel, duoSubOnly) {
        const duoModeLabel = duoSubOnly ? "solo SUB" : "tutti";
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
        this._say(helpMessage);
    }

    _cmdDuo(channel, tags, args, duoSubOnly) {
        if (!this.queueOpen) {
            this._say(
                `@${tags.username} la coda è chiusa, non è possibile entrare al momento`,
            );
            return;
        }
        if (duoSubOnly && !tags.subscriber) {
            this._say(`@${tags.username} il comando è solo per i SUB`);
            return;
        }
        const lolNick = args.join(" ").trim();
        if (!lolNick) {
            this._say(`@${tags.username} usa: !duo <nickLoL>`);
            return;
        }

        const result = this.queueService.addFromChat(tags.username, lolNick);
        if (!result.ok) {
            this._say(`@${tags.username} sei già in coda`);
            return;
        }
        this._say(
            `@${tags.username} aggiunto in coda con nick LoL: ${lolNick}`,
        );
        this._log(`Coda aggiornata: ${JSON.stringify(this.queue)}`);
        this._emitQueue();
        if (lolNick.includes("#")) this._fetchAndSetRank(result.entry);
    }

    _cmdShowQueue(channel) {
        const list = this.queue
            .map((e, i) => `${i + 1}. ${e.twitchUser} (${e.lolNick})`)
            .join(" | ");
        this._say(`Coda: ${list || "La coda è vuota!"}`);
    }

    _cmdMe(channel, tags) {
        const pos = this.queueService.positionOf(tags.username);
        if (pos === -1) {
            this._say(`@${tags.username} non sei in coda`);
        } else {
            this._say(`@${tags.username} sei in posizione ${pos + 1}`);
        }
    }

    _cmdNext(channel) {
        if (this.queue.length === 0) {
            this._say("La coda è vuota!");
            return;
        }
        if (this.queue.length === 1) {
            this._say(
                "Non ci sono altri in coda, solo: " + this.queue[0].twitchUser,
            );
            return;
        }
        const next = this.queue[1];
        this._say(`Prossimo: @${next.twitchUser} (${next.lolNick})`);
    }

    _cmdSkip(channel) {
        const skipped = this.queueService.skip();
        if (!skipped) {
            this._say("La coda è vuota!");
            return;
        }
        this._say(`Saltato: @${skipped.twitchUser}`);
        this._emitQueue();
    }

    _cmdSkipNext(channel) {
        const skipped = this.queueService.skip();
        if (!skipped) {
            this._say("La coda è vuota!");
            return;
        }
        this._say(`Saltato: @${skipped.twitchUser}`);
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            this._say(`Prossimo: @${next.twitchUser} (${next.lolNick})`);
        } else {
            this._say("La coda ora è vuota!");
        }
        this._emitQueue();
    }

    _cmdClearQueue(channel) {
        this.queueService.clear();
        this._say("La coda è stata svuotata!");
        this._emitQueue();
    }

    _cmdRemove(channel, args) {
        const nick = args[0];
        if (!nick) {
            this._say("Uso corretto: !removequeue <nickLoL>");
            return;
        }
        const removed = this.queueService.remove(nick);
        if (!removed) {
            this._say(
                `Nessun utente con nick LoL simile a "${nick}" trovato in coda`,
            );
            return;
        }
        this._say(
            `Rimosso dalla coda: @${removed.twitchUser} (${removed.lolNick})`,
        );
        this._emitQueue();
    }

    _cmdAdd(channel, args) {
        const twitchUserRaw = args[0];
        const lolNickRaw = args.slice(1).join(" ").trim();
        if (!twitchUserRaw || !lolNickRaw) {
            this._say("Uso corretto: !addqueue <twitchUser> <nickLoL>");
            return;
        }
        const result = this.queueService.addManual(twitchUserRaw, lolNickRaw);
        if (!result.ok) {
            this._say(result.error);
            return;
        }
        this._say(
            `Aggiunto manualmente in coda: @${result.entry.twitchUser} (${result.entry.lolNick})`,
        );
        this._log(
            `[CHAT][ADMIN] Aggiunto manualmente: @${result.entry.twitchUser} (${result.entry.lolNick})`,
        );
        this._emitQueue();
        if (lolNickRaw.includes("#")) this._fetchAndSetRank(result.entry);
    }

    _cmdMove(channel, args) {
        const fromPos = parseInt(args[0], 10);
        const toPos = parseInt(args[1], 10);
        if (!Number.isInteger(fromPos) || !Number.isInteger(toPos)) {
            this._say(
                "Posizioni non valide: usa numeri interi (es. !movequeue 5 1)",
            );
            return;
        }
        const result = this.queueService.move(fromPos - 1, toPos - 1);
        if (!result.ok) {
            this._say(result.error);
            return;
        }
        this._say(
            `Spostato @${result.moved.twitchUser} dalla posizione ${fromPos} alla posizione ${toPos}`,
        );
        this._log(
            `[CHAT][ADMIN] Spostato: @${result.moved.twitchUser} da ${fromPos} a ${toPos}`,
        );
        this._emitQueue();
    }

    // ─── Riot Integration ──────────────────────────────────────────────────────

    async _loadStreamerPuuids() {
        const accounts = (process.env.STREAMER_RIOT_ACCOUNTS ?? "")
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
            const firstErr = results.find(r => r.status === "rejected")?.reason;
            this._log(
                `❌ Riot API KEY non valida: ${firstErr?.message ?? "errore sconosciuto"}`,
            );
            this.emit("riot-status", {
                ok: false,
                error: firstErr?.message ?? "errore sconosciuto",
            });
        }
    }

    _startRiotCheck() {
        this._checkInterval = setInterval(async () => {
            if (this.streamerPuuids.length === 0) return;
            const checkedMatchIds = new Set();

            for (const puuid of this.streamerPuuids) {
                try {
                    const lastMatch = await riot.getLastMatchId(puuid);
                    if (checkedMatchIds.has(lastMatch)) continue;
                    checkedMatchIds.add(lastMatch);

                    const details = await riot.getMatchDetails(lastMatch);
                    if (
                        details.info.gameEndTimestamp < this.botStartTime &&
                        !this.debug
                    ) {
                        continue;
                    }

                    const removed = this.queueService.removePlayedWith(
                        this.streamerPuuids,
                        details,
                    );
                    removed.forEach(entry => {
                        this._say(
                            `@${entry.twitchUser} è stato rimosso dalla coda perché ha giocato con lo streamer`,
                        );
                        this._log(
                            `Rimosso automaticamente: @${entry.twitchUser}`,
                        );
                    });
                    if (removed.length > 0) this._emitQueue();
                } catch (_) {
                    // Silenzioso — l'API potrebbe essere temporaneamente non disponibile
                }
            }
        }, CHECK_INTERVAL);
    }

    _stopRiotCheck() {
        clearInterval(this._checkInterval);
        this._checkInterval = null;
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

    async _handleLiveRankCommand() {
        if (this.streamerPuuids.length === 0) {
            this._say("Nessun account Riot configurato.");
            return;
        }
        let liveGame = null;
        for (const puuid of this.streamerPuuids) {
            try {
                liveGame = await riot.getLiveGame(puuid);
                if (liveGame) break;
            } catch (err) {
                if (err?.response?.status !== 404)
                    this._log(`Errore getLiveGame: ${err.message}`);
            }
        }
        if (!liveGame) {
            this._say("Lo streamer non è attualmente in partita.");
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
                (teamId === 100 ? team1 : team2).push(`${name}(${rank})`);
            }
        }
        this._say(`🔵 ${team1.join(" | ")} 🔴 ${team2.join(" | ")}`);
    }

    async _getLiveRankData() {
        let liveGame = null;
        for (const puuid of this.streamerPuuids) {
            try {
                liveGame = await riot.getLiveGame(puuid);
                if (liveGame) break;
            } catch (err) {
                if (err?.response?.status !== 404)
                    this._log(`Errore getLiveGame: ${err.message}`);
            }
        }
        if (!liveGame)
            return {
                ok: false,
                error: "Lo streamer non è attualmente in partita.",
            };

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
                (r.value.teamId === 100 ? team1 : team2).push(r.value);
            }
        }
        return { ok: true, team1, team2 };
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
        return (tierMap[tier] ?? tier) + (romanMap[division] ?? division ?? "");
    }

    // ─── Helpers interni ──────────────────────────────────────────────────────

    _log(msg) {
        console.log(msg);
        this.emit("log", msg);
    }

    _emitQueue() {
        this.emit("queue-update", this.queueService.getAll());
    }
}

// Singleton — il bot è una singola istanza per ciclo di vita dell'app
module.exports = new BotManager();
