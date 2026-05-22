# Twitch Duo Bot

### Project Description

This is a personal, non-commercial Twitch chat bot designed to manage a **duo queue system** for a League of Legends streamer on Twitch. The bot is built with Node.js and Electron, runs locally on the streamer's machine, and serves a single Twitch channel.

### This bot was created specifically for the needs of the streamer [kyasarin](https://www.twitch.tv/kyasarin).

The bot allows viewers (optionally restricted to active subscribers) to join a queue to play alongside the streamer in a duo game. It integrates with the Riot Games API to automatically detect when a match has ended and remove from the queue the player who actually played with the streamer, keeping the queue accurate without any manual intervention. It also provides live in-game rank information for all participants in the streamer's current match.

### Features

**Queue management (chat commands)**

| Command                               | Access                           | Description                     |
| ------------------------------------- | -------------------------------- | ------------------------------- |
| `!duo <RiotID#TAG>`                   | Viewers (sub-only if configured) | Join the duo queue              |
| `!queue`                              | Everyone                         | Show the current queue          |
| `!me`                                 | Everyone                         | Show your position in the queue |
| `!queuehelp`                          | Everyone                         | Show all available commands     |
| `!next`                               | Admin / Mod                      | Announce the next player        |
| `!skip`                               | Admin / Mod                      | Skip the first player in queue  |
| `!skipn`                              | Admin / Mod                      | Skip first and announce next    |
| `!clearqueue`                         | Admin / Mod                      | Clear the entire queue          |
| `!removequeue <twitchUser>`           | Admin / Mod                      | Remove a specific user          |
| `!addqueue <twitchUser> <RiotID#TAG>` | Admin / Mod                      | Manually add a user             |
| `!movequeue <fromPos> <toPos>`        | Admin / Mod                      | Move a user to a new position   |
| `!liverank`                           | Admin / Mod                      | Post live game ranks in chat    |

**Desktop UI (Electron)**

- Start / Stop bot with one click
- Real-time queue list with drag-and-drop reorder
- Admin control panel (Next, Skip, Skip+Next, Clear, Save Queue)
- **Live Rank modal**: graphical view of all 10 participants in the streamer's current match, divided into Team Blue / Team Red, each with a colored tier badge, champion name and solo queue rank. Supports players in Streamer Mode.
- Settings modal: OAuth token, Twitch channel, Riot accounts (multiple), sub-only mode
- Bot status indicator and Riot API status badge in the footer
- Auto-updater via GitHub Releases

### How the Riot Games API is Used

The application uses the following Riot Games API endpoints:

| Endpoint                                                        | Purpose                                                                                                                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `GET /riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}` | Resolve the streamer's PUUID at bot startup; also used to validate a viewer's Riot ID when they join the queue                      |
| `GET /lol/match/v5/matches/by-puuid/{puuid}/ids`                | Fetch the ID of the streamer's most recent match (polling every 30 s)                                                               |
| `GET /lol/match/v5/matches/{matchId}`                           | Fetch match details to identify which queued player participated and auto-remove them                                               |
| `GET /lol/league/v4/entries/by-puuid/{puuid}`                   | Retrieve the solo queue rank of a viewer when they join the queue, and of all 10 participants when the live rank feature is invoked |
| `GET /lol/spectator/v5/active-games/by-summoner/{puuid}`        | Check whether the streamer is currently in a live game and retrieve all participant data for the Live Rank feature                  |

**Data Dragon (not Riot API)**

| Endpoint                                                                         | Purpose                                                      |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `GET https://ddragon.leagueoflegends.com/api/versions.json`                      | Resolve the latest game version                              |
| `GET https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json` | Map champion IDs to names (cached in memory for the session) |

API calls are made **only from the streamer's local machine**. There are no external servers, no databases, no third-party services involved. All data is processed locally and in memory.

The polling interval for match checks is **30 seconds**, deliberately conservative to minimize API call volume. The PUUID lookup happens once per bot session (at startup). Live game and rank data are fetched only on explicit demand (when the streamer presses the Live Rank button or a viewer types `!liverank`).

### Scope and Scale

- Single Twitch channel (the streamer's own channel)
- Single geographic region (EUW)
- Queue state is optionally persisted to a local JSON file and restored at next startup; no external database
- No public-facing web service or API proxy
- No monetization of any kind
- The bot is distributed as a self-contained Windows installer via GitHub Releases, intended for personal use by the streamer

### Technical Stack

- **Runtime**: Node.js (CommonJS)
- **Desktop wrapper**: Electron
- **Twitch integration**: tmi.js
- **HTTP client**: axios
- **Icons**: Font Awesome Free (bundled via postinstall script)
- **Auto-updater**: electron-updater (GitHub Releases)
- **Configuration**: dotenv — user settings stored in `%AppData%` (never in the repo)

### API Key Handling

The Riot API key is stored in a local `.env` file which is listed in `.gitignore` and is never committed to the repository. For packaged builds, the key is injected by GitHub Actions from a repository secret (`RIOT_API_KEY`) and bundled inside the application's `app.asar` at build time. It is never present in the source code.

### Why a Permanent Key is Needed

The development API key expires every 24 hours, which interrupts the automatic match-detection feature at unpredictable times during a live stream. A permanent (personal) API key would allow the streamer to run the bot without having to manually regenerate the key before every stream session.

The application does not require elevated scopes or write access to any Riot data. Read-only access to match history, account lookup, league entries and spectator data is sufficient for all functionality.

---

## Italiano

### Descrizione del Progetto

Questo è un bot Twitch personale e non commerciale progettato per gestire un **sistema di coda duo** per uno streamer di League of Legends su Twitch. Il bot è sviluppato in Node.js con interfaccia desktop Electron, gira localmente sul PC dello streamer e serve un unico canale Twitch.

### Questo bot è stato creato specificamente per le esigenze della streamer [kyasarin](https://www.twitch.tv/kyasarin).

Il bot permette ai viewer (facoltativamente limitati ai soli abbonati) di iscriversi a una coda per giocare in duo con lo streamer. Integra le API di Riot Games per rilevare automaticamente il termine di una partita e rimuovere dalla coda il giocatore che ha effettivamente giocato con lo streamer, mantenendo la coda aggiornata senza intervento manuale. Fornisce inoltre informazioni di rank in tempo reale per tutti i partecipanti alla partita live dello streamer.

### Funzionalità

**Gestione coda (comandi chat)**

| Comando                                 | Accesso                          | Descrizione                             |
| --------------------------------------- | -------------------------------- | --------------------------------------- |
| `!duo <RiotID#TAG>`                     | Viewer (solo sub se configurato) | Entra in coda                           |
| `!queue`                                | Tutti                            | Mostra la coda attuale                  |
| `!me`                                   | Tutti                            | Mostra la tua posizione in coda         |
| `!queuehelp`                            | Tutti                            | Mostra tutti i comandi disponibili      |
| `!next`                                 | Admin / Mod                      | Annuncia il prossimo in coda            |
| `!skip`                                 | Admin / Mod                      | Salta il primo della coda               |
| `!skipn`                                | Admin / Mod                      | Salta il primo e annuncia il successivo |
| `!clearqueue`                           | Admin / Mod                      | Svuota tutta la coda                    |
| `!removequeue <twitchUser>`             | Admin / Mod                      | Rimuove un utente specifico             |
| `!addqueue <twitchUser> <RiotID#TAG>`   | Admin / Mod                      | Aggiunge manualmente un utente          |
| `!movequeue <daPosizione> <aPosizione>` | Admin / Mod                      | Sposta un utente in una nuova posizione |
| `!liverank`                             | Admin / Mod                      | Posta in chat i rank della partita live |

**UI Desktop (Electron)**

- Avvio / Arresto del bot con un clic
- Lista coda in tempo reale con riordino drag-and-drop
- Pannello controlli admin (Next, Skip, Skip+Next, Clear, Salva Coda)
- **Modale Live Rank**: vista grafica di tutti i 10 partecipanti alla partita live dello streamer, divisi in Team Blu / Team Rosso, ciascuno con badge tier colorato, nome campione e rank soloQ. Supporto per giocatori in Streamer Mode.
- Modale impostazioni: token OAuth, canale Twitch, account Riot (multipli), modalità solo-sub
- Indicatore stato bot e badge stato Riot API nel footer
- Aggiornamento automatico tramite GitHub Releases

### Come vengono usate le API di Riot Games

| Endpoint                                                        | Scopo                                                                                                            |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET /riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}` | Risolve il PUUID dello streamer all'avvio; usato anche per validare il Riot ID di un viewer quando entra in coda |
| `GET /lol/match/v5/matches/by-puuid/{puuid}/ids`                | Recupera l'ID dell'ultima partita dello streamer (polling ogni 30 s)                                             |
| `GET /lol/match/v5/matches/{matchId}`                           | Recupera i dettagli della partita per identificare quale utente in coda ha giocato e rimuoverlo automaticamente  |
| `GET /lol/league/v4/entries/by-puuid/{puuid}`                   | Recupera il rank soloQ di un viewer all'ingresso in coda e di tutti i 10 partecipanti per la funzione Live Rank  |
| `GET /lol/spectator/v5/active-games/by-summoner/{puuid}`        | Verifica se lo streamer è in partita e recupera i dati di tutti i partecipanti per la funzione Live Rank         |

**Data Dragon (non API Riot)**

| Endpoint                                                                         | Scopo                                                            |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `GET https://ddragon.leagueoflegends.com/api/versions.json`                      | Risolve la versione attuale del gioco                            |
| `GET https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json` | Mappa gli ID campione ai nomi (cache in memoria per la sessione) |

Le chiamate API vengono effettuate **esclusivamente dal PC locale dello streamer**. Non esistono server esterni, database o servizi di terze parti coinvolti. L'intervallo di polling è di 30 secondi. I dati di partita live e rank vengono recuperati solo su richiesta esplicita.

### Portata e Dimensioni

- Singolo canale Twitch (il canale dello streamer stesso)
- Singola regione geografica (EUW)
- Lo stato della coda è facoltativamente salvato su file JSON locale e ripristinato all'avvio successivo; nessun database esterno
- Nessun servizio web pubblico o proxy API
- Nessuna monetizzazione di alcun tipo
- Il bot è distribuito come installer Windows autonomo tramite GitHub Releases, destinato all'uso personale dello streamer

### Stack Tecnologico

- **Runtime**: Node.js (CommonJS)
- **Wrapper desktop**: Electron
- **Integrazione Twitch**: tmi.js
- **Client HTTP**: axios
- **Icone**: Font Awesome Free (incluso tramite script postinstall)
- **Aggiornamento automatico**: electron-updater (GitHub Releases)
- **Configurazione**: dotenv — impostazioni utente salvate in `%AppData%` (mai nel repo)

### Gestione della API Key

La chiave API Riot è salvata in un file `.env` locale, incluso nel `.gitignore` e mai committato nella repository. Per le build distribuite, la chiave viene iniettata da GitHub Actions tramite un repository secret (`RIOT_API_KEY`) e inclusa nel file `app.asar` a build time. Non è mai presente nel codice sorgente.

### Perché è necessaria una Key Permanente

La chiave API di sviluppo scade ogni 24 ore, interrompendo il rilevamento automatico delle partite in momenti imprevedibili durante una diretta. Una chiave permanente (personale) consente allo streamer di usare il bot senza dover rigenerare la chiave prima di ogni sessione.

L'applicazione non richiede scope elevati né accesso in scrittura. L'accesso in sola lettura a cronologia partite, account, classifiche e dati spettatore è sufficiente per tutte le funzionalità.

## Change Logs

Vedi [CHANGELOG.md](CHANGELOG.md)

<!--
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
-->
