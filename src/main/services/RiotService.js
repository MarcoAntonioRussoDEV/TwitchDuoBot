const axios = require("axios");

// Regione usata per le chiamate account/match (europe = EUW + EUNE + TR)
const RIOT_REGION = "europe";
// Platform server dello streamer
const RIOT_PLATFORM = "euw1";

/**
 * RiotService — centralizza tutte le chiamate all'API Riot.
 *
 * Nessuna dipendenza da Electron: può essere usato sia dal Main Process
 * che, in futuro, da un eventuale backend separato o test suite.
 */
class RiotService {
    constructor() {
        /** @type {Record<string, string> | null} Cache championId → nome */
        this._championMap = null;
    }

    _apiKey() {
        return process.env.RIOT_API_KEY;
    }

    // ─── Account ─────────────────────────────────────────────────────────────

    async getPuuid(gameName, tagLine) {
        const url = `https://${RIOT_REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${gameName}/${tagLine}?api_key=${this._apiKey()}`;
        const res = await axios.get(url);
        return res.data.puuid;
    }

    // ─── Match ────────────────────────────────────────────────────────────────

    async getLastMatchId(puuid) {
        const url = `https://${RIOT_REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?count=1&api_key=${this._apiKey()}`;
        const res = await axios.get(url);
        return res.data[0];
    }

    async getMatchDetails(matchId) {
        const url = `https://${RIOT_REGION}.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${this._apiKey()}`;
        const res = await axios.get(url);
        return res.data;
    }

    // ─── Rank ─────────────────────────────────────────────────────────────────

    async getRankByNameTag(gameName, tagLine) {
        const puuid = await this.getPuuid(gameName, tagLine);
        return this.getRankByPuuid(puuid);
    }

    async getRankByPuuid(puuid) {
        const url = `https://${RIOT_PLATFORM}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}?api_key=${this._apiKey()}`;
        const res = await axios.get(url);
        const solo = res.data.find(e => e.queueType === "RANKED_SOLO_5x5");
        if (!solo) return "Unranked";
        return `${solo.tier} ${solo.rank}`;
    }

    // ─── Live Game ────────────────────────────────────────────────────────────

    async getLiveGame(puuid) {
        const url = `https://${RIOT_PLATFORM}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${puuid}?api_key=${this._apiKey()}`;
        const res = await axios.get(url);
        return res.data;
    }

    // ─── Champion ─────────────────────────────────────────────────────────────

    async getChampionNameById(championId) {
        if (!this._championMap) {
            const verRes = await axios.get(
                "https://ddragon.leagueoflegends.com/api/versions.json",
            );
            const version = verRes.data[0];
            const champRes = await axios.get(
                `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
            );
            this._championMap = {};
            for (const champ of Object.values(champRes.data.data)) {
                this._championMap[champ.key] = champ.name;
            }
        }
        return this._championMap[String(championId)] ?? `Champ#${championId}`;
    }

    // ─── Utility ──────────────────────────────────────────────────────────────

    /**
     * Verifica che la Riot API Key sia valida eseguendo una chiamata reale.
     * Usato dalla UI nella schermata impostazioni.
     */
    async checkApiKey(apiKey, accounts) {
        if (!apiKey || accounts.length === 0) {
            return { ok: false, error: "Configurazione incompleta" };
        }
        try {
            const { name, tag } = accounts[0];
            const url = `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${name}/${tag}?api_key=${apiKey}`;
            await axios.get(url);
            return { ok: true };
        } catch (err) {
            return {
                ok: false,
                error: err.response?.data?.status?.message ?? err.message,
            };
        }
    }
}

module.exports = new RiotService();
