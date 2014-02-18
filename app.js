var request = require('request');
var mongo = require('mongojs');
var RateLimiter = require('limiter').RateLimiter;

require('nodetime').profile({
    accountKey: process.env.NODE_TIME_KEY,
    appName: 'lol-miner'
});

var limiter = new RateLimiter(1, 1190);

var collections = ['champions', 'summoners', 'games', 'gamePlayerStats'];
var dburl = process.env.DB_URL;
var apiKey = process.env.API_KEY;

var db = mongo(dburl, collections);
var summonerQueue = [19012493];
var summonersProcessed = [];
var gameQueue = [];

function updateChampions() {

    var championUrl = 'https://prod.api.pvp.net/api/lol/static-data/na/v1/champion?api_key=' + apiKey;

    request(championUrl, function(error, res, body){
        if (!error && res.statusCode === 200 && body.length !== 0) {
            var champions = JSON.parse(body).data;
            var championNames = Object.keys(champions);

            championNames.forEach(function(championName){
                db.champions.save(champions[championName]);
            });
            console.log('Champions saved.', championNames.length);
        }
    });
}

function updateSummoners(){
    if (summonerQueue.length > 0) {
        var summonerId = summonerQueue.shift();
        gameQueue.push(summonerId);

        var summonerUrl = 'https://prod.api.pvp.net/api/lol/na/v1.3/summoner/' + summonerId + '?api_key=' + apiKey;

        request(summonerUrl, function(error, res, body){
            if (!error && res.statusCode === 200 && body.length !== 0) {
                var summoner = JSON.parse(body)[summonerId];
                db.summoners.save(summoner);
                summonersProcessed.push(summonerId);
            } else {
                console.warn('Didn\'t get a 200 status code, instead found: ', res.statusCode ,' will retry summoner', summonerId, 'later.');
                summonerQueue.push(summonerId);
            }
        });
    }
}

function updateSummonersGames(){
    if(gameQueue.length > 0) {
        var summonerId = gameQueue.shift();

        // These are player specific things associated to the lol api games DTO.
        var playerSpecificStats = ['teamId', 'championId', 'spell1', 'spell2', 'level', 'stats'];

        var gameUrl = 'https://prod.api.pvp.net/api/lol/na/v1.3/game/by-summoner/' + summonerId + '/recent?api_key=' + apiKey;

        request(gameUrl, function(error, res, body){
            if (!error && res.statusCode === 200 && body.length !== 0) {
                var games = JSON.parse(body).games;

                games.forEach(function(game){
                    game.players = [];
                    game.players.push(summonerId);

                    var playerStats = {'gameId': game.gameId, 'summonerId': summonerId};

                    if (game.fellowPlayers) {
                        game.fellowPlayers.forEach(function(fellowPlayer){
                            game.players.push(fellowPlayer.summonerId);
                            if (summonersProcessed.indexOf(fellowPlayer.summonerId) <= 0) {
                                summonerQueue.push(fellowPlayer.summonerId);
                            }
                        });
                        delete game.fellowPlayers;
                    }

                    playerSpecificStats.forEach(function(stat){
                        playerStats[stat] = game[stat];
                        delete game[stat];
                    });

                    db.games.save(game);
                    db.gamePlayerStats.save(playerStats);
                });
            } else {
                console.warn('Didn\'t get a 200 status, instead found:', res.statusCode,  'will retry', summonerId + '\'s', 'games later.');
                gameQueue.push(summonerId);
            }
        });
    }
}

function dedupe() {
    function deduper (v, i, a) {
        return a.indexOf(v) == i;
    }

    summonerQueue = summonerQueue.filter(deduper);
    summonersProcessed = summonersProcessed.filter(deduper);
    gameQueue = gameQueue.filter(deduper);
    setTimeout(dedupe, summonerQueue * 1000);
}

function update(){
    limiter.removeTokens(1, function(){
        if (gameQueue.length > 0) {
            updateSummonersGames();
        } else if (summonerQueue.length > 0 ) {
            updateSummoners();
        } else {
            updateChampions();
            console.log('Clearing the summoner processed list.');
            summonerQueue = summonersProcessed;
            summonersProcessed = [];
        }
    });
}

function reportStatus() {
    console.log('Summoners in the summonerQueue:', summonerQueue.length + '.', 'Summoners processed:', summonersProcessed.length + '.');
    console.log('Games left in queue:', gameQueue.length);
}

setInterval(update, 1190);
setInterval(reportStatus, 10000);
setTimeout(dedupe, 1000);