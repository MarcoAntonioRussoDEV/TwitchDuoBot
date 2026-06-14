/**
 * Logger — sistema di logging centralizzato per il backend.
 *
 * Tutti i moduli backend possono fare logger.info(...) invece di
 * console.log(...). I messaggi vengono sia stampati nel terminale
 * che inoltrati al BotManager (che li relay alla UI via IPC).
 *
 * ── Utilizzo ──
 *   const logger = require("./Logger");
 *   logger.info("Modulo", "messaggio");       // utente + dev log
 *   logger.debug("Modulo", "messaggio");      // solo dev log
 *
 * ── Setup ──
 *   const logger = require("./Logger");
 *   logger.setEmitFn(fn);
 *   // fn = (msg) => bot.emit("log", msg)
 *   // Questo viene chiamato dopo l'inizializzazione del bot
 *   // per evitare dipendenze circolari.
 */

/** @type {((msg: string) => void) | null} */
let _emit = null;

let _attached = false;

/**
 * Collega il logger al bot per inoltrare i log alla UI.
 * @param {(msg: string) => void} emitFn
 */
function setEmitFn(emitFn) {
    _emit = emitFn;
    _attached = true;
}

/**
 * Invia un log user-facing (appare nel Log Utente e Dev Log).
 * @param {string} module - Nome modulo
 * @param {string} msg - Messaggio
 */
function info(module, msg) {
    const full = `ℹ️ ${msg}`;
    console.log(`[${module}] ${msg}`);
    if (_emit) _emit(full);
}

/**
 * Invia un log di successo (appare in entrambi i log).
 * @param {string} module
 * @param {string} msg
 */
function success(module, msg) {
    const full = `✅ ${msg}`;
    console.log(`[${module}] ${msg}`);
    if (_emit) _emit(full);
}

/**
 * Invia un log di errore (appare in entrambi i log).
 * @param {string} module
 * @param {string} msg
 */
function error(module, msg) {
    const full = `❌ ${msg}`;
    console.error(`[${module}] ${msg}`);
    if (_emit) _emit(full);
}

/**
 * Invia un log di warning (appare in entrambi i log).
 * @param {string} module
 * @param {string} msg
 */
function warn(module, msg) {
    const full = `⚠️ ${msg}`;
    console.warn(`[${module}] ${msg}`);
    if (_emit) _emit(full);
}

/**
 * Invia un log tecnico (appare SOLO nel Dev Log).
 * Il prefisso [Modulo] fa matchare i devOnlyPatterns nel renderer.
 * @param {string} module - Nome modulo
 * @param {string} msg - Messaggio tecnico
 */
function debug(module, msg) {
    const full = `[${module}] ${msg}`;
    console.log(full);
    if (_emit) _emit(full);
}

/**
 * Invia un log tecnico con dati JSON (appare SOLO nel Dev Log).
 * @param {string} module
 * @param {string} msg
 * @param {object} [data]
 */
function debugData(module, msg, data) {
    let full = `[${module}] ${msg}`;
    if (data) {
        try {
            full += ` — ${JSON.stringify(data)}`;
        } catch (_) {}
    }
    console.log(full);
    if (_emit) _emit(full);
}

module.exports = { setEmitFn, info, success, error, warn, debug, debugData };
