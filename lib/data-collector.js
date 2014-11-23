var mongo = require('mongojs');

var Lawl = require('lawl');
var lawl = new Lawl({ apiToken: process.env.API_KEY });

var collections = ['champions', 'summoners', 'games', 'gamePlayerStats'];

var dburl = process.env.DB_URL;
var db = mongo(dburl, collections);

var util = require('./util');

var summonerQueue = [];
var summonersProcessed = [];
var gameQueue = [];
var running = false;

function resetQueue () {
    summonerQueue = [19012493, 19028356, 605384, 204479, 21341176, 19027914];
    summonersProcessed = [];
    gameQueue = [];
}

function updateChampions () {
    lawl.getChampions(function (error, champions) {
        if (!error){
            champions = champions.champions;
            var championNames = Object.keys(champions);
            championNames.forEach(function(championName){
                db.champions.save(champions[championName]);
            });
            console.log('Champions saved.', championNames.length);
        } else {
            console.log(error.message);
        }
    });
}

function updateSummoners () {
    if (summonerQueue.length > 0) {
        var summonerIdsToFetch = summonerQueue.splice(0, 40); // The api can only handle 40 summoners at a time.
        gameQueue = gameQueue.concat(summonerIdsToFetch);

        lawl.getSummoners(summonerIdsToFetch, function (error, summoners) {
            if (!error) {
                var summonerIds = Object.keys(summoners); // The keys are the summonerIds.
                summonerIds.forEach(function (summonerId) {
                    db.summoners.save(summoners[summonerId]);
                    summonersProcessed.push(summonerId);
                });
            } else {
                console.log(error);
                summonerQueue = summonerIdsToFetch.concat(summonerQueue);
            }
        });
    }
}

function updateSummonersGames () {
    if (gameQueue.length > 0) {
        var summonerId = gameQueue.shift();
        // These are player specific things associated to the lol api games DTO.
        var playerSpecificStats = ['teamId', 'championId', 'spell1', 'spell2', 'level', 'stats'];

        lawl.getRecentGamesBySummonerId(summonerId, function (error, returnObject) {
            if (!error) {
                var games = returnObject.games;

                games.forEach(function(game){
                    if(game.gameMode === 'ARAM' && game.createDate > util.dateCutoff()) {
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
                    }
                });
            } else {
                console.log(error);
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
    setTimeout(dedupe, summonerQueue.length * 900);
}

function update(){
    if (gameQueue.length > 0) {
        updateSummonersGames();
    } else if (summonerQueue.length > 0 ) {
        updateSummoners();
    }
}

function reportStatus() {
    console.log('Summoners in the summonerQueue:', summonerQueue.length + '.', 'Summoners processed:', summonersProcessed.length + '.');
    console.log('Games left in queue:', gameQueue.length);
}

module.exports = {
    init: function () {
        if ( !running ) {
            running = true;
            resetQueue();
            setInterval(reportStatus, 5000);
            setInterval(resetQueue, 1000*60*60*4); // Reset every 4 hours to catch all 10 games of our original seeds.
            setInterval(update, 100);
            setTimeout(dedupe, 1000);
            updateChampions();
        }
    }
}