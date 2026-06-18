const { EventEmitter } = require("events");
const axios = require("axios");
const PusherClient = require("./PusherClient");

const KICK_SEND_URL = "https://api.kick.com/public/v1/chat";
const KICK_USERS_URL = "https://api.kick.com/public/v1/users";

/**
 * KickClient — gestisce la connessione alla chat di Kick.
 *
 * Kick usa Pusher per la chat in tempo reale. Il canale è pubblico
 * (nessuna auth Pusher necessaria), quindi basta il chatroom_id.
 * I messaggi vengono inviati tramite le API REST di Kick con il token OAuth.
 *
 * Emette gli stessi eventi di TwitchClient:
 *   "command" → { command, channel, tags, args }
 * dove tags normalizza il formato Kick nel contratto condiviso con BotManager.
 */
class KickClient extends EventEmitter {
    constructor() {
        super();
        /** @type {PusherClient | null} */
        this._pusher = null;
        /** @type {number | null} */
        this._chatroomId = null;
        /** @type {string | null} */
        this._accessToken = null;
        /** @type {string | null} */
        this._channel = null;
        /** @type {number | null} */
        this._userId = null;
    }

    get connected() {
        return this._pusher !== null && this._pusher.connected;
    }

    // ─── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * Connette il client alla chat Kick.
     * @param {string} accessToken
     * @param {string} channel - username/slug del canale Kick
     */
    async connect(accessToken, channel) {
        this._accessToken = accessToken;
        this._channel = channel.toLowerCase();

        // 1. Legge chatroom_id dal config; se assente lo recupera via API pubblica.
        let chatroomId = Number.parseInt(process.env.KICK_CHATROOM_ID ?? "", 10);
        if (!chatroomId) {
            try {
                const r = await axios.get(`https://kick.com/api/v1/channels/${this._channel}`);
                chatroomId = r.data?.chatroom?.id;
            } catch (_) {}
        }
        if (!chatroomId) {
            throw new Error(
                "Impossibile ottenere KICK_CHATROOM_ID — esegui di nuovo il login Kick dalle impostazioni.",
            );
        }
        this._chatroomId = chatroomId;

        // 2. Recupera l'ID numerico dell'utente (necessario per inviare messaggi via v1 API)
        try {
            const userRes = await axios.get(KICK_USERS_URL, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            const rawData = userRes.data?.data;
            const user = Array.isArray(rawData) ? rawData[0] : rawData;
            this._userId = user?.user_id ?? null;
        } catch (err) {
            console.error("[KickClient] userId fetch error:", err.response?.status, JSON.stringify(err.response?.data));
        }

        // 3. Connetti al Pusher di Kick e iscriviti alla chatroom pubblica
        this._pusher = new PusherClient();
        await this._pusher.connect();
        const pusherChannel = `chatrooms.${this._chatroomId}.v2`;
        this._pusher.subscribe(pusherChannel);

        // 3. Ascolta i messaggi di chat e smistali come comandi
        this._pusher.on("chat_message", msg => {
            const username = msg.sender?.username?.toLowerCase();
            const content = msg.content?.trim();
            if (!username || !content) return;
            this._routeMessage(this._channel, username, content, msg.sender);
        });
    }

    async disconnect() {
        if (!this._pusher) return;
        try {
            this._pusher.disconnect();
        } catch (_) {}
        this._pusher = null;
        this._chatroomId = null;
        this._userId = null;
    }

    // ─── Messaggi in uscita ────────────────────────────────────────────────────

    /** Invia un messaggio nel canale Kick connesso. */
    say(message) {
        if (!this._userId || !this._accessToken) return;
        const MAX = 490;
        // Splitto su " | " mantenendo ogni chunk sotto il limite di Kick
        const parts = message.split(" | ");
        const chunks = [];
        let current = "";
        for (const part of parts) {
            const candidate = current ? `${current} | ${part}` : part;
            if (candidate.length > MAX) {
                if (current) chunks.push(current);
                current = part.slice(0, MAX);
            } else {
                current = candidate;
            }
        }
        if (current) chunks.push(current);

        for (const chunk of chunks) {
            axios
                .post(
                    KICK_SEND_URL,
                    { broadcaster_user_id: this._userId, content: chunk, type: "bot" },
                    {
                        headers: {
                            Authorization: `Bearer ${this._accessToken}`,
                            "Content-Type": "application/json",
                        },
                    },
                )
                .catch(() => {});
        }
    }

    // ─── Routing interno ──────────────────────────────────────────────────────

    /**
     * Normalizza un messaggio Kick nel contratto { command, channel, tags, args }
     * condiviso con TwitchClient, così BotManager può gestirli identicamente.
     *
     * Kick invia i badge nell'oggetto sender.identity.badges (array di oggetti
     * con proprietà "type": "subscriber" | "moderator" | "broadcaster" | ecc.)
     */
    _routeMessage(channel, username, message, senderData) {
        if (!message.startsWith("!")) return;
        const parts = message.split(" ");
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);

        const badges = senderData?.identity?.badges ?? [];
        const hasBadge = type => badges.some(b => b.type === type);

        const tags = {
            username,
            subscriber: hasBadge("subscriber"),
            mod: hasBadge("moderator"),
            badges: hasBadge("broadcaster") ? { broadcaster: "1" } : {},
        };

        this.emit("command", { command, channel, tags, args });
    }
}

module.exports = KickClient;
