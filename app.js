require('nodetime').profile({
    accountKey: process.env.NODE_TIME_KEY,
    appName: 'lol-miner'
});


var dataCollector = require('./lib/data-collector');
dataCollector.init();

var aggregator = require('./lib/data-aggregator');
aggregator.init();