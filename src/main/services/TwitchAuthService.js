const { BrowserWindow } = require("electron");
const crypto = require("crypto");
const axios = require("axios");

const TWITCH_AUTH_URL = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_USERS_URL = "https://api.twitch.tv/helix/users";
const SCOPES = "chat:read chat:edit";
const REDIRECT_URI = "http://localhost:17563";

/**
 * TwitchAuthService — gestisce il flusso OAuth2 Implicit Grant di Twitch.
 *
 * 💡 Lezione Electron — BrowserWindow come popup di autenticazione:
 * Electron può aprire più BrowserWindow. Qui ne creiamo una secondaria che
 * carica la pagina di login Twitch. Intercettiamo il redirect tramite
 * webContents.on("will-redirect") per catturare il token dall'URL
 * prima che il browser tenti di caricare localhost (che non esiste).
 *
 * La protezione CSRF è implementata con il parametro `state`:
 * generiamo un valore random, lo includiamo nell'URL di auth, e lo
 * verifichiamo nel redirect — se non corrisponde, l'auth viene rifiutata.
 */
async function startOAuth(clientId) {
    const state = crypto.randomBytes(16).toString("hex");

    const authUrl = new URL(TWITCH_AUTH_URL);
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("response_type", "token");
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("state", state);

    return new Promise((resolve, reject) => {
        let done = false;

        const authWin = new BrowserWindow({
            width: 600,
            height: 700,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
            },
            title: "Accedi con Twitch",
        });

        authWin.setMenuBarVisibility(false);

        function handleRedirectUrl(url, event) {
            if (done || !url.startsWith(REDIRECT_URI)) return;

            let parsed;
            try {
                parsed = new URL(url);
            } catch (_) {
                return;
            }

            const error = parsed.searchParams.get("error");
            if (error) {
                if (event) event.preventDefault();
                done = true;
                if (!authWin.isDestroyed()) authWin.destroy();
                reject(
                    new Error(
                        parsed.searchParams.get("error_description") ?? error,
                    ),
                );
                return;
            }

            // Token nel frammento (#access_token=...)
            const fragment = parsed.hash.slice(1);
            const params = new URLSearchParams(fragment);
            const accessToken = params.get("access_token");
            if (!accessToken) return;

            if (event) event.preventDefault();
            done = true;
            if (!authWin.isDestroyed()) authWin.destroy();

            if (params.get("state") !== state) {
                reject(new Error("State mismatch — possibile attacco CSRF"));
                return;
            }

            axios
                .get(TWITCH_USERS_URL, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Client-Id": clientId,
                    },
                })
                .then(userRes => {
                    const username = userRes.data.data[0]?.login;
                    if (!username)
                        throw new Error(
                            "Impossibile ottenere il nome utente Twitch",
                        );
                    resolve({ accessToken, username });
                })
                .catch(err =>
                    reject(
                        new Error(err.response?.data?.message ?? err.message),
                    ),
                );
        }

        authWin.webContents.on("will-redirect", (event, url) =>
            handleRedirectUrl(url, event),
        );

        authWin.webContents.on("did-navigate", (_, url) =>
            handleRedirectUrl(url, null),
        );

        authWin.on("closed", () => {
            if (!done) {
                done = true;
                reject(new Error("Autenticazione annullata dall'utente"));
            }
        });

        authWin.loadURL(authUrl.toString());
    });
}

module.exports = { startOAuth };
