var mongo = require('mongojs');
var dburl = process.env.DB_URL;
var collections = ['champions', 'summoners', 'games', 'gamePlayerStats', 'championStats', 'gamesProcessed'];
var db = mongo(dburl, collections);
var util = require('./util');

var globGamesRemoved = {
    fullGames: 0,
    oldGames: 0
};



var processGame = function (game, callback) {
    var query = { "gameId": game.gameId };
    var gamePlayerStatsProcessed = 0;

    db.gamePlayerStats.find(query, function (error, documents) {
        if (!error) {
            if (documents.length === 0 && callback) {
                callback();
            }
            documents.forEach(function (doc) {
                processGamePlayerStat(doc, function () {
                    gamePlayerStatsProcessed++;

                    util.attemptDone(gamePlayerStatsProcessed, 10, function () {
                        markGameProcessed(game.gameId, function () {
                            globGamesRemoved.fullGames++;
                            if (callback) {
                                callback();
                            }
                        });
                    });
                });
            });
        } else {
            console.log('Found error trying to get gamePlayerStats for gameId:', game.gameId);
        }
    });
};

var processGamePlayerStat = function (gamePlayerStat, callback) {
    var outcome = gamePlayerStat.stats.win ? "wins" : "loses";
    var update = { $inc: {} };

    update.$inc[outcome + '.count'] = 1;
    for (var item = 0; item < 7; item++) {
        if (gamePlayerStat.stats['item' + item]) {
            update.$inc[outcome + '.items.' + gamePlayerStat.stats['item' + item]] = 1;
        }
    }

    db.championStats.update(
        { 'championId': gamePlayerStat.championId },
        update,
        { 'upsert': true },
        function () {
            if (callback) {
                callback();
            }
        }
    );
};

var markGameProcessed = function (gameId, callback) {
    var query = { gameId: gameId };
    var gamePlayerStatsRemove = 0;

    db.games.find(query, function (error, games) {
        if (!error) {
            if (games.length === 0 && callback) {
                callback();
            }
            games.forEach(function (game) {
                db.games.remove(game, function (error) {
                    if (!error) {
                        db.gamePlayerStats.find(query, function (error, gamePlayerStats) {
                            if (!error) {
                                if (gamePlayerStats.length === 0 && callback) {
                                    callback();
                                }
                                gamePlayerStats.forEach(function (gamePlayerStat) {
                                    db.gamePlayerStats.remove(gamePlayerStat, function () {
                                        if (!error) {
                                            gamePlayerStatsRemove++;
                                            util.attemptDone(gamePlayerStatsRemove, gamePlayerStats.length, function () {
                                                db.gamesProcessed.save(query, function () {
                                                    if (callback) {
                                                        callback();
                                                    }
                                                });
                                            });
                                        }
                                    });
                                });
                            }
                        });
                    }
                });
            });
        } else {
            console.log(error);
        }

    });
};

var removeOldGames = function (callback) {
    var gamesRemoved = 0;

    db.games.find({
        "createDate": {
            "$lt": util.dateCutoff()
        }
    }, function (error, documents ) {
        if (!error) {
            if (documents.length === 0) {
                if (callback) {
                    callback();
                }
            }
            documents.forEach(function (doc) {
                markGameProcessed(doc.gameId, function () {
                    gamesRemoved++;
                    globGamesRemoved.oldGames++;
                    util.attemptDone(gamesRemoved, documents.length, function () {
                        if (callback) {
                            callback();
                        }
                    });
                });
            });
        } else {
            console.log(error);
        }
    });
};

var processFullGames = function (callback) {
    db.gamePlayerStats.aggregate([
        {
            $group: {
                _id: { gameId: "$gameId"},
                count: { $sum: 1 },
                gameId: { $first: "$gameId"}
            }
        }
    ], function (error, documents) {
        var gamesProcessed = {
            full: 0,
            notFull: 0,
            total: 0
        };

        if (!error) {
            if (documents.length === 0) {
                if (callback) {
                    callback();
                }
            }
            documents.forEach(function (doc) {
                if (doc.count === 10) {
                    processGame(doc, function () {
                        gamesProcessed.full++;
                        gamesProcessed.total++;
                        util.attemptDone(gamesProcessed.total, documents.length, function () {
                            console.log('total', gamesProcessed.total, 'full', gamesProcessed.full, 'not full', gamesProcessed.notFull);
                            if (callback) {
                                callback();
                            }
                        });
                    });
                } else {
                    gamesProcessed.total++;
                    gamesProcessed.notFull++;
                    util.attemptDone(gamesProcessed.total, documents.length, function () {
                        console.log('total', gamesProcessed.total, 'full', gamesProcessed.full, 'not full', gamesProcessed.notFull);
                        if (callback) {
                            callback();
                        }
                    });
                }
            });
        } else {
            console.log(error);
        }
    });
};

var running = false;
var aggregator = {
    init: function () {
        if (!running) {
            running = true;
            setInterval(function () {
                processFullGames(function () {
                    console.log('All full games have been processed.');
                    removeOldGames(function () {
                        console.log('All old games have been processed.');
                        console.log('Full games processed:', globGamesRemoved.fullGames, 'Old games processed:', globGamesRemoved.oldGames);
                    });
                });
            }, 30000);
        }
    }
};

module.exports = aggregator;

