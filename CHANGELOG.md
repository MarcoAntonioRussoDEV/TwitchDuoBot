## Change Logs

## 1.5.1

- **Fix recupero `KICK_CHATROOM_ID`**: la `BrowserWindow` nascosta usata finora per recuperare il chatroom id veniva sempre bloccata (403 "security policy") dal WAF Cloudflare di `kick.com`, indipendentemente da user agent/client hints — il fingerprint TLS del motore Chromium interno di Electron risulta diverso da quello di un Chrome vero installato sul sistema (verificato: lo stesso URL, con lo stesso identico user agent, funziona dal browser reale dell'utente ma non dalla `BrowserWindow`). L'API pubblica OAuth di Kick, inoltre, non espone questo dato (verificato sulla documentazione ufficiale). La `BrowserWindow` è stata rimossa: ora è la pagina di successo mostrata al termine del login — aperta nel browser reale dell'utente, già accettato da Cloudflare per l'autenticazione — a recuperare il chatroom id (endpoint pubblico con CORS aperto) e a rimandarlo al server locale dell'app prima che questo si chiuda. Il chatroom ID continua a essere ricavato automaticamente al login, senza bisogno di inserirlo a mano nel `.env`.
- **Dev Log ora utile**: il logger tecnico (`Logger.js`) era collegato alla UI solo dopo il primo avvio del bot — i log di login/OAuth (es. `[KickAuth]`) non arrivavano mai al Dev Log. Ora è collegato fin dall'apertura dell'app.

## 1.5.0

- **Integrazione Kick**: il bot ora si connette alla chat Kick oltre che a Twitch.
    - Login OAuth2 + PKCE via browser reale (Google SSO compatibile) con redirect locale su `localhost:17564`.
    - Ricezione messaggi in tempo reale tramite Pusher WebSocket (`chatrooms.{chatroomId}.v2`).
    - Invio messaggi tramite API pubblica Kick v1 (`api.kick.com/public/v1/chat`), con supporto automatico alla suddivisione dei messaggi lunghi (> 490 caratteri) per rispettare il limite di Kick.
    - Tutti i comandi esistenti (`!duo`, `!queue`, `!queuehelp`, `!me`, `!next`, ecc.) funzionano su entrambe le piattaforme simultaneamente.
    - Badge streamer/mod/subscriber di Kick normalizzati nel contratto condiviso con TwitchClient.
    - Stato connessione Kick visibile nel footer dell'UI (pallino verde **KICK**).
    - ⚠️ **Limitazione nota**: il `KICK_CHATROOM_ID` deve essere inserito manualmente nel file `.env` — l'API pubblica Kick v1 non espone il chatroom ID e `kick.com/api/v2` è bloccata da Cloudflare per le richieste Node.js. L'ID si trova nelle DevTools del browser ispezionando le richieste WebSocket della chat.
- **Fix crash al riavvio**: risolto `UnhandledPromiseRejection: Object has been destroyed` causato da `electron-reload` che tentava di inviare eventi IPC a una finestra già distrutta.
- **Fix riavvio in sviluppo**: aggiunto `saved-queue.json` al pattern ignorato da `electron-reload` per evitare che il salvataggio automatico della coda causasse un riavvio dell'app in modalità dev.

## 1.4.0

- Aggiunta autenticazione Twitch OAuth

## 1.3.7

- Aggiunta funzionalità **Apri/Chiudi Coda**: il pulsante nell'UI permette di aprire o chiudere la coda in tempo reale.
    - Quando la coda è **chiusa**, il comando `!duo` viene bloccato e il bot risponde al viewer informandolo.
    - Quando la coda cambia stato, il bot annuncia in chat l'apertura o chiusura con un messaggio dedicato.
    - Aggiunti comandi chat `!openqueue` e `!closequeue` (riservati a Mod/Admin) per aprire e chiudere la coda direttamente dalla chat Twitch.
    - Il pulsante cambia aspetto dinamicamente: verde con lucchetto aperto quando la coda è aperta, rosso con lucchetto chiuso quando è chiusa.

## 1.3.6

- Test visualizzazione release notes al momento dell'aggiornamento.

## 1.3.5

- **Release notes al momento dell'aggiornamento**: quando un aggiornamento è pronto, compare il pulsante **📋 Novità** nel banner — cliccandolo si apre una modale con le note della nuova versione prese dalla release GitHub.

## 1.3.4

- Aggiornata icona

## 1.3.3

- **Salvataggio automatico della coda**: la coda viene salvata su `saved-queue.json` ad ogni modifica (aggiunta, rimozione, skip, riordino drag-and-drop, comandi chat), senza necessità di premere il tasto "Salva Coda" manualmente.

## 1.3.2

- Aggiunta **modale Live Rank** grafica: il tasto Live Rank apre una finestra con i 10 partecipanti divisi per team (Team Blu / Team Rosso), ognuno con badge colorato per tier, nome campione e rank soloQ.
- I colori dei badge seguono il tier (Iron → Challenger) con palette dedicata per ciascun rank.
- Il tasto **Post Chat** all'interno della modale posta il riepilogo in chat Twitch come faceva il vecchio tasto Live Rank.
- Aggiunto supporto alla **Streamer Mode**: i giocatori con puuid offuscato vengono comunque mostrati nella modale con il campione corretto e badge "Streamer Mode" al posto del rank.

## 1.3.1

- Integrazione **Font Awesome** via npm (`@fortawesome/fontawesome-free`); le icone vengono copiate in `renderer/vendor/fa/` tramite `scripts/copy-fa.js` eseguito al postinstall.
- Redesign **header** a tre colonne: logo a sinistra, pulsanti Avvia/Ferma centrati, Update + Impostazioni + GitHub a destra.
- Pulsante **Update** restyled con bordo, icona rotante durante il controllo e label "Update".
- Pulsanti **Impostazioni** e **GitHub** convertiti in icon-only (`btn-icon`).
- Controlli admin restyled con classe `btn-ghost` e icone Font Awesome (Next, Skip, Skip Next, Clear Queue, Live Rank, Salva Coda).
- **Footer** riprogettato: credits a sinistra, badge stato bot + stato Riot API a destra.
- Correzione allineamento **righe input** (aggiungi/rimuovi): unified grid a 3 colonne con `input-span2` per il campo rimuovi.
- **Riconnessione automatica** del bot al salvataggio delle impostazioni se il bot è attualmente connesso.

## 1.3.0

- Aggiunto comando `!liverank` (chat) e tasto **Live Rank** (UI): scrive in chat i campioni con il rank soloQ di tutti i partecipanti alla partita live dello streamer, divisi per team.
- Il rank viene abbreviato in formato compatto (es. `G2`, `P4`, `NR`) per rientrare nel limite di 500 caratteri di Twitch.
- I nomi dei campioni vengono risolti tramite Data Dragon (cache locale per tutta la sessione del bot).
- Aggiunto il rank per PUUID (`getRankByPuuid`) per evitare doppie lookup Riot.
- Il titolo della finestra mostra ora la versione del programma (es. `Twitch Duo Bot v1.3.0`).

## 1.2.1

- Modifica alla logica di caricamento della coda, ora cancella la coda in memoria dopo averla caricata

## 1.2.0

- Corretto il tasto **Next** dell'UI che annunciava il primo in coda invece del secondo, ora coerente con il comando chat `!next`.
- Aggiunto footer con credits (Made by Marco Antonio Russo).
- Aggiunto tasto **GitHub** nell'header per aprire la repository nel browser.
- Corretto fetch ELO: `adminAdd` (aggiunta manuale da UI) ora recupera il rank come già facevano `!duo` e `!addqueue`.
- Aggiunto comando `npm run dev` con hot-reload tramite `electron-reload` (solo in sviluppo, non impatta la build).
- Aggiunto tasto **Salva Coda** che persiste la coda su `saved-queue.json`; all'avvio la coda viene ripristinata automaticamente se il file esiste.

# 1.1.3

- Aggiunto tag con ELO del player in coda se fornisce nick completo di lol, es: Ocrama94#EUW

## 1.1.2

- Aggiunto comando admin/mod `!addqueue <twitchUser> <nickLoL>` per inserire manualmente utenti in coda.
- Aggiunta versione UI per inserimento manuale (campi Twitch + LoL) con validazioni duplicate su Twitch user e nick LoL.
- Aggiunta funzionalita di riordino coda da UI tramite drag-and-drop con slittamento automatico degli altri utenti.
- Aggiunti metodi backend/IPC dedicati al riordino coda dalla UI.
- Aggiunto comando admin/mod `!movequeue <daPos> <aPos>` per spostare un utente in qualsiasi posizione della coda.
- Aumentata dimensione finestra applicazione (default e minima) per mostrare tutta l'interfaccia.

## 1.1.1

- Gestito nome utente che entra in coda con tag

## 1.1.0

- Aggiunto flag per attivare comandi solo sub.
