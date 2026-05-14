// -----------------------------
// NORMALIZZAZIONE
// -----------------------------
function normalize(str) {
    return str
        .toLowerCase()
        .split("#")[0] // rimuove il tag dopo #
        .replace(/\s+/g, "") // rimuove spazi
        .replace(/[^a-z0-9]/g, ""); // rimuove caratteri strani
}

// -----------------------------
// OTTIENI COMPAGNI DI SQUADRA
// -----------------------------
function getTeammates(details, streamerPuuids) {
    const streamer = details.info.participants.find(p =>
        streamerPuuids.includes(p.puuid),
    );
    if (!streamer) return [];
    const teamId = streamer.teamId;

    return details.info.participants
        .filter(p => p.teamId === teamId)
        .map(p => normalize(p.riotIdGameName));
}

// -----------------------------
// RIMOZIONE SICURA DALLA CODA
// -----------------------------
function removeUsersWhoPlayed(queue, teammates) {
    const removed = [];

    for (let i = queue.length - 1; i >= 0; i--) {
        const entry = queue[i];
        const normalizedNick = normalize(entry.lolNick);

        if (teammates.includes(normalizedNick)) {
            removed.push(entry);
            queue.splice(i, 1);
        }
    }

    return removed;
}

// ------------------------------
// CONTROLLO PARTITA E RIMOZIONE
// -----------------------------
function handleDuoCommand(channel, tags, lolNick, client, queue) {
    const twitchUser = tags.username;

    if (!lolNick) {
        client.say(channel, `@${twitchUser} usa: !duo <nickLoL>`);
        return;
    }

    if (queue.some(entry => entry.twitchUser === twitchUser)) {
        client.say(channel, `@${twitchUser} sei già in coda`);
        return;
    }

    queue.push({
        twitchUser,
        lolNick: lolNick.toLowerCase(),
        timestamp: Date.now(),
    });

    client.say(
        channel,
        `@${twitchUser} aggiunto in coda con nick LoL: ${lolNick}`,
    );
    console.log(`Coda aggiornata: ${JSON.stringify(queue)}`);
}

// -----------------------------
// CONTROLLO AUTOMATICO RIOT
// -----------------------------
async function checkAndRemove(
    queue,
    streamerPuuids,
    riot,
    botStartTime,
    debug = false,
) {
    const allRemoved = [];
    const checkedMatchIds = new Set();

    for (const puuid of streamerPuuids) {
        try {
            const lastMatch = await riot.getLastMatchId(puuid);
            if (checkedMatchIds.has(lastMatch)) continue;
            checkedMatchIds.add(lastMatch);

            const details = await riot.getMatchDetails(lastMatch);
            const gameEnd = details.info.gameEndTimestamp;

            if (gameEnd < botStartTime && !debug) {
                console.log(
                    `Partita precedente all'avvio del bot (account ${puuid.slice(0, 8)}...) → ignoro`,
                );
                continue;
            }

            const teammates = getTeammates(details, streamerPuuids);
            const removed = removeUsersWhoPlayed(queue, teammates);
            allRemoved.push(...removed);
        } catch (err) {
            console.error(
                `Errore nel controllo Riot (account ${puuid.slice(0, 8)}...):`,
                err.message,
            );
        }
    }

    return allRemoved;
}

// -----------------------------
// FUNZIONE DI CONTROLLO MODERATORI/STREAMER
// -----------------------------
function isModOrStreamer(tags) {
    const user = tags.username.toLowerCase();
    const streamer = process.env.TWITCH_CHANNEL.replace("#", "").toLowerCase();

    return (
        tags.mod === true || // moderatore
        user === streamer || // lo streamer
        tags.badges?.broadcaster === "1" // broadcaster (sicurezza extra)
    );
}

module.exports = {
    normalize,
    getTeammates,
    removeUsersWhoPlayed,
    handleDuoCommand,
    isModOrStreamer,
    checkAndRemove,
};
