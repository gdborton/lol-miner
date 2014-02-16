var http = require('http');
var mongo = require('mongojs');
var RateLimiter = require('limiter').RateLimiter;

var limiter = new RateLimiter(1, 1190);

var collections = ['champions', 'summoners', 'games', 'gamePlayerStats'];
var dburl = process.env.DB_URL;
var apiKey = process.env.API_KEY;

var db = mongo(dburl, collections);
var summonerQueue = [19012493];
var summonersProcessed = [];
var gameQueue = [];

function updateChampions() {

    var championOptions = {
        host: 'prod.api.pvp.net',
        port: 80,
        path: '/api/lol/static-data/na/v1/champion?api_key=' + apiKey,
        method: 'GET'
    };

    var request = http.request(championOptions, function(res){
        var total = '';

        res.setEncoding('utf8');

        res.on('data', function(chunk) {
            total += chunk;
        });

        res.on('end', function(){
            var champions = JSON.parse(total).data;

            var championNames = Object.keys(champions);
            championNames.forEach(function(championName){
                db.champions.save(champions[championName]);
            });
            console.log('Champions saved.', championNames.length);
        });
    });

    request.end();
}

function updateSummoners(){
    if (summonerQueue.length > 0) {
        var summonerId = summonerQueue.shift();
        gameQueue.push(summonerId);
        var summonerOptions = {
            host: 'prod.api.pvp.net',
            port: 80,
            path: '/api/lol/na/v1.3/summoner/' + summonerId + '?api_key=' + apiKey,
            method: 'GET'
        };

        var request = http.request(summonerOptions, function(res){
            var total = '';

            res.setEncoding('utf8');

            res.on('data', function(chunk) {
                total += chunk;
            });

            res.on('end', function(){
                if (res.statusCode === 200) {
                    var summoner = JSON.parse(total)[summonerId];

                    db.summoners.save(summoner);
                    summonersProcessed.push(summonerId);
                    console.log('Summoner saved.', summonerId, 'Summoners in queue:', summonerQueue.length, 'Summoners processed:', summonersProcessed.length);
                } else {
                    console.warn('Didn\'t get a 200 status code, instead found: ', res.statusCode ,' will retry summoner', summonerId, 'later.');
                    summonerQueue.push(summonerId);
                }
            });
        });

        request.end();
    }
}

function updateSummonersGames(){
    if(gameQueue.length > 0) {
        var summonerId = gameQueue.shift();

        // These are player specific things associated to the lol api games DTO.
        var playerSpecificStats = ['teamId', 'championId', 'spell1', 'spell2', 'level', 'stats'];

        var gameOptions = {
            host: 'prod.api.pvp.net',
            port: 80,
            path: '/api/lol/na/v1.3/game/by-summoner/' + summonerId + '/recent?api_key=' + apiKey,
            method: 'GET'
        };

        var request = http.request(gameOptions, function(res){
            var total = '';

            res.setEncoding('utf8');

            res.on('data', function(chunk) {
                total += chunk;
            });

            res.on('end', function(){
                if (res.statusCode === 200) {
                    var games = JSON.parse(total).games;

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

                    console.log('Games saved: ', games.length, 'Summoner ID: ', summonerId, 'Games left in queue:', gameQueue.length);
                } else {
                    console.warn('Didn\'t get a 200 status, instead found: ' + res.statusCode + 'will retry', summonerId, ' games later.');
                    gameQueue.push(summonerId);
                }
            });
        });

        request.end();
    }
}
function dedupe() {
    function deduper (v, i, a) {
        return a.indexOf(v) == i;
    }

    summonerQueue = summonerQueue.filter(deduper);
    summonersProcessed = summonersProcessed.filter(deduper);
    gameQueue = gameQueue.filter(deduper);
}

function update(){
    dedupe();

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
        update();
    });
}

update();
