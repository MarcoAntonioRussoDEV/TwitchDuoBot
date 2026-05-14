# Twitch Duo Queue Bot

### Project Description

This is a personal, non-commercial Twitch chat bot designed to manage a **duo queue system** for a League of Legends streamer on Twitch. The bot is built with Node.js and Electron, runs locally on the streamer's machine, and serves a single Twitch channel.

The bot allows viewers who are active subscribers to join a queue to play alongside the streamer in a duo game. It integrates with the Riot Games API to automatically detect when a match has ended and remove from the queue the player who actually played with the streamer, keeping the queue accurate without any manual intervention.

### How the Riot Games API is Used

The application uses the following Riot Games API endpoints:

| Endpoint                                                        | Purpose                                                          |
| --------------------------------------------------------------- | ---------------------------------------------------------------- |
| `GET /riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}` | Retrieve the streamer's PUUID once at bot startup                |
| `GET /lol/match/v5/matches/by-puuid/{puuid}/ids`                | Fetch the ID of the streamer's most recent match                 |
| `GET /lol/match/v5/matches/{matchId}`                           | Fetch match details to identify which queued player participated |

API calls are made **only from the streamer's local machine**. There are no external servers, no databases, no third-party services involved. All data is processed locally and in memory.

The polling interval for match checks is **30 seconds**, deliberately conservative to minimize API call volume. The PUUID lookup happens once per bot session (at startup). Match data is fetched only while the bot is actively running.

### Scope and Scale

- Single Twitch channel (the streamer's own channel)
- Single geographic region (EUW)
- No data is stored persistently — queue state is held in memory and reset each session
- No public-facing web service or API proxy
- No monetization of any kind
- The bot is not distributed; it runs exclusively on the streamer's own hardware

### Technical Stack

- **Runtime**: Node.js (CommonJS)
- **Desktop wrapper**: Electron (local GUI for the streamer)
- **Twitch integration**: tmi.js
- **HTTP client**: axios
- **Configuration**: dotenv (.env file, local only)

### Why a Permanent Key is Needed

The development API key expires every 24 hours, which interrupts the automatic match-detection feature at unpredictable times during a live stream. A permanent (personal) API key would allow the streamer to run the bot without having to manually regenerate the key before every stream session.

The application does not require elevated scopes or write access to any Riot data. Read-only access to match history and account lookup is sufficient for all functionality.

---

## Italiano

### Descrizione del Progetto

Questo e' un bot Twitch personale e non commerciale progettato per gestire un **sistema di coda duo** per uno streamer di League of Legends su Twitch. Il bot e' sviluppato in Node.js con interfaccia desktop Electron, gira localmente sul PC dello streamer e serve un unico canale Twitch.

Il bot permette ai viewer abbonati di iscriversi a una coda per giocare in duo con lo streamer. Integra le API di Riot Games per rilevare automaticamente il termine di una partita e rimuovere dalla coda il giocatore che ha effettivamente giocato con lo streamer, mantenendo la coda aggiornata senza intervento manuale.

### Come vengono usate le API di Riot Games

L'applicazione utilizza i seguenti endpoint delle API Riot Games:

| Endpoint                                                        | Scopo                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}` | Recupero del PUUID dello streamer una volta all'avvio del bot                        |
| `GET /lol/match/v5/matches/by-puuid/{puuid}/ids`                | Recupero dell'ID dell'ultima partita dello streamer                                  |
| `GET /lol/match/v5/matches/{matchId}`                           | Recupero dei dettagli della partita per identificare quale utente in coda ha giocato |

Le chiamate API vengono effettuate **esclusivamente dal PC locale dello streamer**. Non esistono server esterni, database o servizi di terze parti coinvolti. Tutti i dati vengono elaborati localmente e in memoria.

L'intervallo di polling per il controllo delle partite e' di **30 secondi**, volutamente conservativo per ridurre il volume di chiamate API. Il lookup del PUUID avviene una sola volta per sessione (all'avvio). I dati delle partite vengono recuperati solo mentre il bot e' attivo.

### Portata e Dimensioni

- Singolo canale Twitch (il canale dello streamer stesso)
- Singola regione geografica (EUW)
- Nessun dato viene salvato in modo persistente: lo stato della coda e' in memoria e viene azzerato ad ogni sessione
- Nessun servizio web pubblico o proxy API
- Nessuna monetizzazione di alcun tipo
- Il bot non e' distribuito: gira esclusivamente sull'hardware dello streamer

### Stack Tecnologico

- **Runtime**: Node.js (CommonJS)
- **Wrapper desktop**: Electron (interfaccia grafica locale per lo streamer)
- **Integrazione Twitch**: tmi.js
- **Client HTTP**: axios
- **Configurazione**: dotenv (file .env, solo locale)

### Perche' e' necessaria una Key Permanente

La chiave API di sviluppo scade ogni 24 ore, interrompendo la funzionalita' di rilevamento automatico delle partite in momenti imprevedibili durante una diretta. Una chiave permanente (personale) consentirebbe allo streamer di utilizzare il bot senza dover rigenerare manualmente la chiave prima di ogni sessione di streaming.

L'applicazione non richiede scope elevati ne' accesso in scrittura ad alcun dato Riot. L'accesso in sola lettura alla cronologia delle partite e alla ricerca degli account e' sufficiente per tutte le funzionalita'.

## Change Logs

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
