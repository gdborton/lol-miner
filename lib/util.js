var util = {
    dateCutoff: function () {
        var dateCutoff = new Date();
        return dateCutoff.setDate(dateCutoff.getDate() - 3);
    },
    attemptDone: function (current, target, callback) {
        if (current === target && callback) {
            callback();
        }
    }
};

module.exports = util;