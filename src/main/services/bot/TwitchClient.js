const { EventEmitter } = require("events");
const tmi = require("tmi.js");

/**
 * TwitchClient — gestisce la connessione a Twitch via tmi.js.
 *
 * Responsabilità:
 * - Aprire/chiudere la connessione WebSocket a Twitch IRC
 * - Ricevere messaggi dalla chat e fare il parsing dei comandi
 * - Emettere eventi "command" con una struttura normalizzata
 *
 * NON conosce la logica della coda o di Riot. Si limita a tradurre
 * i messaggi di chat in eventi strutturati che BotManager può gestire.
 *
 * Questo è il pattern Adapter: TwitchClient adatta il protocollo tmi.js
 * all'interfaccia comune { command, channel, tags, args } che il bot usa.
 *
 * 💡 Lezione Electron — EventEmitter:
 * EventEmitter è il sistema pub/sub di Node.js. TwitchClient estende EventEmitter
 * così BotManager può fare: twitchClient.on("command", handler).
 * È lo stesso meccanismo usato da bot.on("log", ...) in main.js per inviare
 * log alla UI tramite IPC.
 */
class TwitchClient extends EventEmitter {
    constructor() {
        super();
        /** @type {import("tmi.js").Client | null} */
        this._client = null;
        /** @type {string | null} Canale normalizzato con # */
        this._channel = null;
    }

    get connected() {
        return this._client !== null;
    }

    // ─── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * Connette il client a Twitch.
     * @param {string} username
     * @param {string} accessToken
     * @param {string} channel
     */
    async connect(username, accessToken, channel) {
        this._channel = channel.startsWith("#") ? channel : `#${channel}`;

        this._client = new tmi.Client({
            identity: {
                username,
                password: `oauth:${accessToken}`,
            },
            channels: [this._channel],
        });

        await this._client.connect();

        // Ascolta tutti i messaggi in chat e li smista come eventi "command"
        this._client.on("chat", (ch, tags, message, self) => {
            if (self) return; // ignora i messaggi inviati dal bot stesso
            this._routeMessage(ch, tags, message.trim());
        });
    }

    async disconnect() {
        if (!this._client) return;
        try {
            await this._client.disconnect();
        } catch (_) {}
        this._client = null;
    }

    // ─── Messaggi in uscita ────────────────────────────────────────────────────

    /** Invia un messaggio nel canale connesso. */
    say(message) {
        if (this._client && this._channel) {
            this._client.say(this._channel, message);
        }
    }

    // ─── Routing interno ──────────────────────────────────────────────────────

    /**
     * Parsa un messaggio di chat e, se inizia con "!", emette "command".
     * Struttura comune condivisa con TwitchClient:
     * { command: string, channel: string, tags: object, args: string[] }
     */
    _routeMessage(channel, tags, message) {
        if (!message.startsWith("!")) return;
        const parts = message.split(" ");
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);
        this.emit("command", { command, channel, tags, args });
    }
}

module.exports = TwitchClient;
