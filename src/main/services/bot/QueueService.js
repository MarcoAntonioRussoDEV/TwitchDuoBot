/**
 * Normalizza un nick LoL per confronti case-insensitive.
 * Rimuove tag (#...), spazi e caratteri non alfanumerici.
 * @param {string} str
 * @returns {string}
 */
function normalize(str) {
    return str
        .toLowerCase()
        .split("#")[0]
        .replace(/\s+/g, "")
        .replace(/[^a-z0-9]/g, "");
}

/**
 * Verifica se l'utente è moderatore o lo streamer stesso.
 * Supporta i tag normalizzati di TwitchClient e KickClient.
 * @param {object} tags
 * @returns {boolean}
 */
function isModOrStreamer(tags) {
    const user = (tags.username ?? "").toLowerCase();
    const twitchStreamer = (process.env.TWITCH_CHANNEL ?? "")
        .replace("#", "")
        .toLowerCase();
    const kickStreamer = (process.env.KICK_CHANNEL ?? "").toLowerCase();
    return (
        tags.mod === true ||
        user === twitchStreamer ||
        (kickStreamer !== "" && user === kickStreamer) ||
        tags.badges?.broadcaster === "1"
    );
}

/**
 * QueueService — gestisce lo stato della coda e tutte le operazioni su di essa.
 *
 * È pura logica di business: nessuna dipendenza da Electron, tmi.js o Riot.
 * Può essere testata in isolamento con Node.js semplice.
 *
 * Due metodi di aggiunta:
 * - addFromChat()   → controlla solo duplicato twitchUser (comportamento !duo in chat)
 * - addManual()     → controlla sia twitchUser che lolNick (comportamento admin UI/!addqueue)
 */
class QueueService {
    constructor() {
        /** @type {Array<{ twitchUser: string, lolNick: string, timestamp: number, rank?: string }>} */
        this.queue = [];
    }

    // ─── Aggiunta ─────────────────────────────────────────────────────────────

    /**
     * Aggiunge un entry dalla chat (!duo). Controlla solo duplicato twitchUser.
     * @param {string} twitchUser
     * @param {string} lolNick
     * @returns {{ ok: boolean, entry?: object, code?: string, error?: string }}
     */
    addFromChat(twitchUser, lolNick) {
        const normalizedUser = twitchUser.toLowerCase();
        if (this.queue.some(e => e.twitchUser === normalizedUser)) {
            return {
                ok: false,
                code: "duplicate-twitch",
                error: `@${normalizedUser} è già in coda`,
            };
        }
        const entry = {
            twitchUser: normalizedUser,
            lolNick: lolNick.toLowerCase(),
            timestamp: Date.now(),
        };
        this.queue.push(entry);
        return { ok: true, entry };
    }

    /**
     * Aggiunge un entry manualmente (UI o !addqueue). Controlla entrambi i duplicati.
     * @param {string} twitchUserRaw
     * @param {string} lolNickRaw
     * @returns {{ ok: boolean, entry?: object, code?: string, error?: string }}
     */
    addManual(twitchUserRaw, lolNickRaw) {
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
        if (this.queue.some(e => e.twitchUser === twitchUser)) {
            return {
                ok: false,
                code: "duplicate-twitch",
                error: `@${twitchUser} è già in coda`,
            };
        }
        if (this.queue.some(e => normalize(e.lolNick) === normalize(lolNick))) {
            return {
                ok: false,
                code: "duplicate-lol",
                error: `Esiste già un utente con nick LoL simile a "${lolNick}"`,
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

    // ─── Rimozione ────────────────────────────────────────────────────────────

    /**
     * Rimuove per nick LoL (normalizzato). Usato da !removequeue e UI.
     * @param {string} nick
     * @returns {object | null}
     */
    remove(nick) {
        const normalized = normalize(nick);
        const index = this.queue.findIndex(
            e => normalize(e.lolNick) === normalized,
        );
        if (index === -1) return null;
        const [removed] = this.queue.splice(index, 1);
        return removed;
    }

    /** Rimuove il primo elemento (skip). */
    skip() {
        return this.queue.shift() ?? null;
    }

    /** Svuota la coda. */
    clear() {
        this.queue.length = 0;
    }

    // ─── Spostamento ──────────────────────────────────────────────────────────

    /**
     * Sposta un elemento dalla posizione fromIndex a toIndex (0-based).
     * @returns {{ ok: boolean, moved?: object, fromIndex?: number, toIndex?: number, code?: string, error?: string }}
     */
    move(fromIndex, toIndex) {
        if (this.queue.length === 0)
            return { ok: false, code: "empty-queue", error: "La coda è vuota" };
        if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex))
            return {
                ok: false,
                code: "invalid-index",
                error: "Posizioni non valide",
            };
        if (
            fromIndex < 0 ||
            fromIndex >= this.queue.length ||
            toIndex < 0 ||
            toIndex >= this.queue.length
        )
            return {
                ok: false,
                code: "out-of-range",
                error: "Posizioni fuori range",
            };
        if (fromIndex === toIndex)
            return {
                ok: true,
                moved: this.queue[fromIndex],
                fromIndex,
                toIndex,
            };

        const [moved] = this.queue.splice(fromIndex, 1);
        this.queue.splice(toIndex, 0, moved);
        return { ok: true, moved, fromIndex, toIndex };
    }

    // ─── Query ────────────────────────────────────────────────────────────────

    getAll() {
        return [...this.queue];
    }

    getByUser(username) {
        return (
            this.queue.find(e => e.twitchUser === username.toLowerCase()) ??
            null
        );
    }

    positionOf(username) {
        return this.queue.findIndex(
            e => e.twitchUser === username.toLowerCase(),
        );
    }

    size() {
        return this.queue.length;
    }

    setAll(entries) {
        this.queue = Array.isArray(entries) ? entries : [];
    }

    // ─── Rimozione automatica (post-partita Riot) ─────────────────────────────

    /**
     * Rimuove dalla coda tutti i giocatori che hanno giocato in squadra
     * con lo streamer nell'ultima partita.
     * @param {string[]} streamerPuuids
     * @param {object} matchDetails - risposta dell'API /lol/match/v5/matches/{id}
     * @returns {object[]} entries rimossi
     */
    removePlayedWith(streamerPuuids, matchDetails) {
        const streamer = matchDetails.info.participants.find(p =>
            streamerPuuids.includes(p.puuid),
        );
        if (!streamer) return [];

        const teammates = matchDetails.info.participants
            .filter(p => p.teamId === streamer.teamId)
            .map(p => normalize(p.riotIdGameName));

        const removed = [];
        for (let i = this.queue.length - 1; i >= 0; i--) {
            if (teammates.includes(normalize(this.queue[i].lolNick))) {
                removed.push(this.queue.splice(i, 1)[0]);
            }
        }
        return removed;
    }
}

module.exports = { QueueService, normalize, isModOrStreamer };
