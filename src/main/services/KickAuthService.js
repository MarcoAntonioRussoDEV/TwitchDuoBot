const { shell, BrowserWindow } = require("electron");
const crypto = require("crypto");
const http = require("http");
const axios = require("axios");

const KICK_AUTH_URL = "https://id.kick.com/oauth/authorize";
const KICK_TOKEN_URL = "https://id.kick.com/oauth/token";
const KICK_USERS_URL = "https://api.kick.com/public/v1/users";
const SCOPES = "user:read channel:read chat:write events:subscribe";
const REDIRECT_URI = "http://localhost:17564";
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Apre una BrowserWindow nascosta (Chromium reale) per caricare la pagina del
 * canale Kick ed estrarre il chatroom_id via JS.
 *
 * Kick usa Cloudflare che blocca Node.js/axios (403), ma Chromium supera i
 * challenge JS. Il flusso è: challenge Cloudflare → redirect → pagina Kick.
 * Ogni did-finish-load può essere il challenge o la pagina reale, quindi si
 * riprova dopo ogni caricamento finché non si trova il chatroom_id.
 */
async function fetchChatroomId(slug, accessToken) {
    // Primo tentativo: API pubblica v1 con endpoint chatrooms (non documentato)
    try {
        const r = await axios.get(
            `https://api.kick.com/public/v1/chatrooms`,
            {
                params: { broadcaster_username: slug },
                headers: { Authorization: `Bearer ${accessToken}` },
            },
        );
        const id = r.data?.data?.[0]?.id ?? r.data?.id ?? r.data?.chatroom_id;
        if (id) return id;
    } catch (_) {}

    // Secondo tentativo: API pubblica v1 path-param channel
    try {
        const r = await axios.get(
            `https://api.kick.com/public/v1/channels/${slug}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const id = r.data?.chatroom?.id ?? r.data?.chatroom_id ?? r.data?.data?.chatroom?.id;
        if (id) return id;
    } catch (_) {}

    // Terzo tentativo: v2 dall'interno della pagina Kick (BrowserWindow),
    // stavolta con Bearer token OAuth nell'header.
    return new Promise(resolve => {
        const win = new BrowserWindow({
            show: false,
            webPreferences: { nodeIntegration: false, contextIsolation: true },
        });

        let done = false;
        const finish = id => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            try { win.destroy(); } catch (_) {}
            resolve(id ?? null);
        };

        const tryExtract = async () => {
            if (done) return;
            const url = win.webContents.getURL();
            if (!url.includes(`kick.com/${slug}`)) return;
            try {
                const result = await win.webContents.executeJavaScript(`
                    (async function(){
                        try {
                            const r = await fetch("/api/v2/channels/${slug}", {
                                headers: { "Authorization": "Bearer ${accessToken}" }
                            });
                            const d = await r.json();
                            return JSON.stringify({ chatroom: d && d.chatroom ? d.chatroom.id : null });
                        } catch(e) { return JSON.stringify({ error: e.message }); }
                    })()
                `);
                const p = JSON.parse(result);
                if (p.chatroom) finish(p.chatroom);
                else finish(null);
            } catch (_) { finish(null); }
        };

        win.webContents.on("did-finish-load", () => setTimeout(tryExtract, 1000));
        win.webContents.on("did-fail-load", () => finish(null));
        const timer = setTimeout(() => finish(null), 20_000);
        win.loadURL(`https://kick.com/${slug}`);
    });
}

/** Base64URL senza padding (RFC 7636 §4.1). */
function base64url(buffer) {
    return buffer
        .toString("base64")
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
}

/**
 * KickAuthService — OAuth2 Authorization Code + PKCE (S256) di Kick.
 *
 * Kick RICHIEDE PKCE: senza code_challenge la pagina id.kick.com non carica.
 * Kick è anche un client confidenziale: vuole client_secret nel token exchange.
 * Il flusso usa entrambi (PKCE + client_secret).
 *
 * Usa shell.openExternal() perché Kick usa Google come SSO, e Google blocca
 * i login da Electron (bot detection su navigator.webdriver, fingerprint, ecc.).
 *
 * Flusso:
 * 1. Genera code_verifier e code_challenge (S256)
 * 2. Avvia un server HTTP locale su localhost:17564
 * 3. Apre l'URL di auth nel browser reale dell'utente
 * 4. L'utente completa il login con Google (nessun problema)
 * 5. Kick fa il redirect a localhost:17564?code=...
 * 6. Il server scambia il code con il token (code_verifier + client_secret) e chiude
 */
async function startOAuth(clientId) {
    const state = crypto.randomBytes(16).toString("hex");

    // PKCE — RFC 7636
    const codeVerifier = base64url(crypto.randomBytes(32));
    const codeChallenge = base64url(
        crypto.createHash("sha256").update(codeVerifier).digest(),
    );

    const authUrl = new URL(KICK_AUTH_URL);
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    return new Promise((resolve, reject) => {
        let done = false;
        let timeoutId;

        const cleanup = server => {
            if (timeoutId) clearTimeout(timeoutId);
            try {
                server.close();
            } catch (_) {}
        };

        const server = http.createServer(async (req, res) => {
            if (done) {
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(
                    "<html><body><p>Operazione già completata.</p></body></html>",
                );
                return;
            }

            let url;
            try {
                url = new URL(req.url, REDIRECT_URI);
            } catch (_) {
                res.writeHead(400);
                res.end();
                return;
            }

            const error = url.searchParams.get("error");
            if (error) {
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(
                    `<html><body><h2>&#10060; Errore: ${error}</h2><p>Puoi chiudere questa finestra e tornare all&apos;app.</p></body></html>`,
                );
                done = true;
                cleanup(server);
                reject(
                    new Error(
                        url.searchParams.get("error_description") ?? error,
                    ),
                );
                return;
            }

            const code = url.searchParams.get("code");
            if (!code) {
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(
                    "<html><body><p>Nessun codice ricevuto. Riprova.</p></body></html>",
                );
                return;
            }

            if (url.searchParams.get("state") !== state) {
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(
                    "<html><body><h2>&#10060; Errore di sicurezza (state mismatch)</h2><p>Puoi chiudere questa finestra.</p></body></html>",
                );
                done = true;
                cleanup(server);
                reject(new Error("State mismatch — possibile attacco CSRF"));
                return;
            }

            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                "<html><body><h2>&#9989; Login Kick riuscito!</h2><p>Puoi chiudere questa finestra e tornare all&apos;app.</p></body></html>",
            );
            done = true;
            cleanup(server);

            try {
                const tokenBody = new URLSearchParams({
                    grant_type: "authorization_code",
                    client_id: clientId,
                    client_secret: process.env.KICK_CLIENT_SECRET,
                    redirect_uri: REDIRECT_URI,
                    code,
                    code_verifier: codeVerifier,
                });
                const tokenRes = await axios.post(KICK_TOKEN_URL, tokenBody);

                const accessToken = tokenRes.data.access_token;
                if (!accessToken)
                    throw new Error("Token non ricevuto da Kick");

                let username =
                    tokenRes.data.username ??
                    tokenRes.data.user?.username ??
                    tokenRes.data.user?.slug;

                if (!username) {
                    const userRes = await axios.get(KICK_USERS_URL, {
                        headers: { Authorization: `Bearer ${accessToken}` },
                    });
                    const rawData = userRes.data?.data;
                    const user = Array.isArray(rawData) ? rawData[0] : rawData;
                    username = user?.username ?? user?.slug ?? user?.name;
                }

                if (!username)
                    throw new Error("Impossibile ottenere il nome utente Kick");

                const chatroomId = await fetchChatroomId(username.toLowerCase(), accessToken);

                resolve({ accessToken, username, chatroomId });
            } catch (err) {
                const data = err.response?.data;
                const detail = data && Object.keys(data).length
                    ? JSON.stringify(data)
                    : err.message;
                reject(new Error(detail));
            }
        });

        server.listen(17564, "127.0.0.1", () => {
            shell.openExternal(authUrl.toString());
        });

        server.on("error", err => {
            if (!done) {
                done = true;
                reject(
                    new Error(
                        `Impossibile avviare il server locale (porta 17564): ${err.message}`,
                    ),
                );
            }
        });

        timeoutId = setTimeout(() => {
            if (!done) {
                done = true;
                cleanup(server);
                reject(new Error("Timeout autenticazione Kick (5 minuti)"));
            }
        }, AUTH_TIMEOUT_MS);
    });
}

module.exports = { startOAuth };
