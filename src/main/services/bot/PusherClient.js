const { EventEmitter } = require("events");
const WebSocket = require("ws");

const PUSHER_APP_KEY = "32cbd69e4b950bf97679";
const PUSHER_CLUSTER = "us2";
const PUSHER_URL = `wss://ws-${PUSHER_CLUSTER}.pusher.com/app/${PUSHER_APP_KEY}?protocol=7&client=js&version=8.5.0&flash=false`;

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

class PusherClient extends EventEmitter {
    constructor() {
        super();
        this._ws = null;
        this._socketId = null;
        this._connected = false;
        this._destroyed = false;
        this._subscriptions = new Map();
        this._reconnectDelay = RECONNECT_BASE_MS;
    }

    get connected() {
        return this._connected;
    }

    get socketId() {
        return this._socketId;
    }

    async connect() {
        if (this._destroyed) return;

        return new Promise((resolve, reject) => {
            const ws = new WebSocket(PUSHER_URL);
            this._ws = ws;
            let settled = false;

            const cleanup = () => {
                ws.removeListener("open", onOpen);
                ws.removeListener("close", onClose);
                ws.removeListener("error", onError);
            };

            const onOpen = () => {
                this._reconnectDelay = RECONNECT_BASE_MS;
            };

            const onMessage = data => {
                let msg;
                try {
                    msg = JSON.parse(data.toString());
                } catch (_) {
                    return;
                }

                this._handlePusherEvent(msg);

                if (msg.event === "pusher:connection_established" && !settled) {
                    settled = true;
                    resolve(this._socketId);
                }
            };

            const onClose = code => {
                const wasSettled = settled;
                this._connected = false;
                this._socketId = null;
                cleanup();
                if (!this._destroyed) this._scheduleReconnect();
                if (!wasSettled) {
                    settled = true;
                    reject(new Error(`WS chiuso (${code})`));
                }
            };

            const onError = err => {
                if (!settled) {
                    settled = true;
                    reject(err);
                }
            };

            ws.on("open", onOpen);
            ws.on("message", onMessage);
            ws.once("close", onClose);
            ws.once("error", onError);

            setTimeout(() => {
                if (!settled) {
                    settled = true;
                    cleanup();
                    ws.terminate();
                    reject(new Error("Timeout connessione Pusher (10s)"));
                }
            }, 10_000);
        });
    }

    disconnect() {
        this._destroyed = true;
        this._connected = false;
        this._socketId = null;
        if (this._ws) {
            this._ws.removeAllListeners();
            this._ws.terminate();
            this._ws = null;
        }
        this._subscriptions.clear();
    }

    subscribe(channel, auth = "") {
        this._subscriptions.set(channel, { auth });
        this._send({
            event: "pusher:subscribe",
            data: { channel, auth },
        });
    }

    unsubscribe(channel) {
        this._subscriptions.delete(channel);
        this._send({
            event: "pusher:unsubscribe",
            data: { channel },
        });
    }

    _handlePusherEvent(msg) {
        const event = msg.event;

        if (event === "pusher:connection_established") {
            const data =
                typeof msg.data === "string" ? JSON.parse(msg.data) : msg.data;
            this._socketId = data.socket_id;
            this._connected = true;
            this.emit("connected", { socketId: data.socket_id });
            return;
        }

        if (event === "pusher:ping") {
            this._send({ event: "pusher:pong", data: {} });
            return;
        }

        if (event === "pusher:pong") return;

        if (event === "pusher:error") {
            const data = this._parseData(msg.data);
            this.emit("error", new Error(data?.message || "Errore Pusher"));
            return;
        }

        if (event === "pusher_internal:subscription_succeeded") {
            this.emit("subscribed", msg.channel);
            return;
        }

        if (event && event.includes("ChatMessageEvent")) {
            this.emit("chat_message", this._parseData(msg.data));
            return;
        }

        if (process.env.DEBUG) {
            this.emit("debug", msg);
        }
    }

    _parseData(data) {
        if (typeof data !== "string") return data;
        try {
            return JSON.parse(data);
        } catch (_) {
            return data;
        }
    }

    _scheduleReconnect() {
        if (this._destroyed) return;
        const delay = this._reconnectDelay;
        this._reconnectDelay = Math.min(delay * 2, RECONNECT_MAX_MS);
        setTimeout(() => {
            if (this._destroyed) return;
            this._reconnect().catch(() => {});
        }, delay);
    }

    async _reconnect() {
        if (this._destroyed) return;
        const subscriptions = new Map(this._subscriptions);
        this._subscriptions.clear();
        await this.connect();
        for (const [channel, { auth }] of subscriptions) {
            this.subscribe(channel, auth);
        }
    }

    _send(msg) {
        if (this._ws && this._ws.readyState === WebSocket.OPEN) {
            this._ws.send(JSON.stringify(msg));
        }
    }
}

module.exports = PusherClient;
