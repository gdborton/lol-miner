var http = require('http');
var mongo = require('mongojs');
var RateLimiter = require('limiter').RateLimiter;

var limiter = new RateLimiter(1, 1500);

var collections = ['champions', 'summoners', 'games', 'gamePlayerStats'];
var dburl = process.env.DB_URL;
var apiKey = process.env.API_KEY;

var db = mongo(dburl, collections);
var summonerQueue = [19012493];
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
                var summoner = JSON.parse(total)[summonerId];

                db.summoners.save(summoner);
                console.log('Summoner saved.', summonerId, 'Summoners in queue:', summonerQueue.length);
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
                var games = JSON.parse(total).games;

                games.forEach(function(game){
                    game.players = [];
                    game.players.push(summonerId);

                    var playerStats = {'gameId': game.gameId, 'summonerId': summonerId};

                    if (game.fellowPlayers) {
                        game.fellowPlayers.forEach(function(fellowPlayer){
                            game.players.push(fellowPlayer.summonerId);
                            summonerQueue.push(fellowPlayer.summonerId);
                            gameQueue.push(fellowPlayer.summonerId);
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
            });
        });

        request.end();
    }
}

function dedupe (v, i, a) {
    return a.indexOf(v) == i;
}

function update(){
    summonerQueue = summonerQueue.filter(dedupe);
    gameQueue = gameQueue.filter(dedupe);

    limiter.removeTokens(1, function(){
        if (gameQueue.length > 0) {
            updateSummonersGames();
        } else if (summonerQueue.length > 0 ) {
            updateSummoners()
        } else {
            updateChampions();
        }
        update();
    });
}

update();
