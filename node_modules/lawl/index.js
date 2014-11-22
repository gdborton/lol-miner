var request = require('request');
var RateLimiter = require('limiter').RateLimiter;
var _ = require('lodash');
var limiter = RateLimiter(1, 1200);

var outstandingRequests = 0;
var requestsPerSecond = 0;

setInterval(function () {
    requestsPerSecond = 0;
}, 1000);

var limiter;
var host = 'https://<%- region %>.api.pvp.net';
var executeRequest = function (url, callback) {
    outstandingRequests++;
    limiter.removeTokens(1, function () {
        requestsPerSecond++;
        request(url, function (error, res, body) {
            var returnObject = {};

            if (!error) {
                if (res.statusCode === 200 && body.length !== 0) {
                    returnObject = JSON.parse(body);
                } else {
                    error = new Error('The network request succeeded, but found a ' + res.statusCode + ' status code instead of a 200 OK. ' + url);
                }
            }

            if (_.isFunction(callback)) {
                callback(error, returnObject);
            }
            outstandingRequests--;
        });
    });
};


var Lawl = function (options) {
    this.apiToken = options.apiToken;
    this.region = options.region || 'NA';
    limiter = new RateLimiter(1, options.rateLimit || 1190);

    this.getChampions = function (callback) {
        var url = this.url('/api/lol/<%-region%>/v1.2/champion');
        executeRequest(url, callback);
    }.bind(this);

    this.getRecentGamesBySummonerId = function (summonerId, callback) {
        var url = this.url('/api/lol/<%- region %>/v1.3/game/by-summoner/' + summonerId + '/recent');
        executeRequest(url, callback);
    };

    // TODO - Consider the 40 summoner limit.
    this.getSummonersByName = function (summonerNames, callback) {
        summonerNames = _.isArray(summonerNames) ? summonerNames.join(',') : summonerNames;
        var url = this.url('/api/lol/<%-region%>/v1.4/summoner/by-name/' + summonerNames);
        executeRequest(url, callback);
    }.bind(this);

    // TODO - Consider the 40 summoner limit.
    this.getSummoners = function (summonerIds, callback) {
        summonerIds = _.isArray(summonerIds) ? summonerIds.join(',') : summonerIds;
        var url = this.url('/api/lol/<%-region%>/v1.4/summoner/' + summonerIds);
        executeRequest(url, callback);
    }.bind(this);

    this.url = function (route) {
        var url = host + route + '?api_key=<%- apiToken %>';
        return _.template(url, {region: this.region.toLowerCase(), apiToken: this.apiToken});
    }.bind(this);

    this.requestsPerSecond = function () { return requestsPerSecond };
    this.outstandingRequests = function () { return outstandingRequests };
};

module.exports = Lawl;