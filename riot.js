require("dotenv").config();
const axios = require("axios");

const RIOT_REGION = "europe"; // per EUW/EUNE
const RIOT_PLATFORM = "euw1"; // server dello streamer

// Ottieni PUUID da Riot ID
async function getPuuid(gameName, tagLine) {
    const url = `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${gameName}/${tagLine}?api_key=${process.env.RIOT_API_KEY}`;

    const res = await axios.get(url);
    return res.data.puuid;
}

// Ottieni ID dell’ultima partita
async function getLastMatchId(puuid) {
    const url = `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?count=1&api_key=${process.env.RIOT_API_KEY}`;

    const res = await axios.get(url);
    return res.data[0];
}

// Ottieni dettagli della partita
async function getMatchDetails(matchId) {
    const url = `https://europe.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${process.env.RIOT_API_KEY}`;

    const res = await axios.get(url);
    return res.data;
}

// Ottieni il rank soloQ di un giocatore tramite nome#tag
// Ritorna es. "GOLD II" oppure "Unranked"
async function getRankByNameTag(gameName, tagLine) {
    const puuid = await getPuuid(gameName, tagLine);

    const leagueUrl = `https://${RIOT_PLATFORM}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}?api_key=${process.env.RIOT_API_KEY}`;
    const leagueRes = await axios.get(leagueUrl);

    const solo = leagueRes.data.find(e => e.queueType === "RANKED_SOLO_5x5");
    if (!solo) return "Unranked";

    return `${solo.tier} ${solo.rank}`;
}

// Ottieni informazioni su una partita in corso
async function getLiveGame(puuid) {
    const url = `https://${RIOT_PLATFORM}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${puuid}?api_key=${process.env.RIOT_API_KEY}`;
    const res = await axios.get(url);
    return res.data; // null / 404 se non è in partita
}

// Cache del mapping championId → championName (DDragon)
let _championMap = null;

async function getChampionNameById(championId) {
    if (!_championMap) {
        const verRes = await axios.get(
            "https://ddragon.leagueoflegends.com/api/versions.json",
        );
        const version = verRes.data[0];
        const champRes = await axios.get(
            `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
        );
        _championMap = {};
        for (const champ of Object.values(champRes.data.data)) {
            _championMap[champ.key] = champ.name;
        }
    }
    return _championMap[String(championId)] ?? `Champ#${championId}`;
}

// Ottieni il rank soloQ di un giocatore tramite PUUID
async function getRankByPuuid(puuid) {
    const url = `https://${RIOT_PLATFORM}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}?api_key=${process.env.RIOT_API_KEY}`;
    const res = await axios.get(url);
    const solo = res.data.find(e => e.queueType === "RANKED_SOLO_5x5");
    if (!solo) return "Unranked";
    return `${solo.tier} ${solo.rank}`;
}

module.exports = {
    getPuuid,
    getLastMatchId,
    getMatchDetails,
    getRankByNameTag,
    getRankByPuuid,
    getChampionNameById,
    getLiveGame,
};
