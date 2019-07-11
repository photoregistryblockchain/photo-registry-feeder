(function () {
    "use strict";

    var _ = require('lodash');
    var uuid = require('uuid');
    var traceback = require('stack-trace');
    var stackTraceParser = require('stacktrace-parser');
    var os = require('os');
    var ec2meta = require('ec2-meta');
    var moment = require('moment');
    var util = require('util');

    module.exports = LogObject;

    function LogObject(sessionId, escapeValues, existingKVPairs) {
        var kvPairs = {};
        if (existingKVPairs) {
            _.forOwn(existingKVPairs, function(value, key) {
                kvPairs[key] = value;
            });
        }
        this.kvPairs = kvPairs;
        this.escapeValues = (_.isUndefined(escapeValues)) ? true : escapeValues;
        this.sessionId = (sessionId) ? sessionId : generateLogSessionId();
        this.hostName = hostname();// os.hostname();
        this.platform = os.type() + ' ' + os.release();
        this.message = "";
        this.startTimes = {};
    }

    LogObject.prototype.setSubCategory = function (category) {
        this.addKeyValue("subCategory", category);
        return this;
    };

    LogObject.prototype.setStatusCode = function (statusCode) {
        this.addKeyValue("statusCode", statusCode);
        return this;
    };

    LogObject.prototype.setMessage = function () {
        this.message = util.format.apply(util, arguments);
        return this;
    };

    LogObject.prototype.setErrorLocation = function (err, depth) {
        if (err && err instanceof Error && err.stack) {
            if (_.isUndefined(depth)) {
                depth = 0;
            }
            var stackFrames = stackTraceParser.parse(err.stack);
            for (var fromTop = 0; (fromTop < stackFrames.length && (depth === 0 || fromTop < depth)); fromTop++) {
                var stackKey = util.format("_stack%d", fromTop);
                this.kvPairs[stackKey] = util.format("%s.%s():%d",
                    stackFrames[fromTop].file,
                    stackFrames[fromTop].methodName,
                    stackFrames[fromTop].lineNumber);
            }
        }
        else {
            var callStack = traceback.get(LogObject.prototype.setErrorLocation);
            this.addKeyValue("file", callStack[0].getFileName());
            this.addKeyValue("line", callStack[0].getLineNumber());
            this.addKeyValue("callingFunction", callStack[0].getFunctionName());
        }
        return this;
    };

    LogObject.prototype.clearErrorLocation = function() {
        var self = this;

        _.each(["file", "line", "callingFunction"], function (propertyToDelete) {
            if (self.kvPairs.hasOwnProperty(propertyToDelete)) {
                delete self.kvPairs[propertyToDelete];
            }
        });

        // Now remove stack trace properties
        _.each(Object.keys(self.kvPairs), function (propertyName) {
            if (propertyName.startsWith("_stack")) {
                delete self.kvPairs[propertyName];
            }
        });
        return this;
    };

    LogObject.prototype.addKeyValue = function (key, value, skipNull) {
        if (!skipNull || !_.isEmpty(value)) {
            this.kvPairs[key] = value;
        }
        return this;
    };

    LogObject.prototype.addKeyValues = function(kvPairs, skipNull) {
        var self = this;

        _.forOwn(kvPairs, function(value, key) {
            self.addKeyValue(key, value, skipNull);
        });
        return this;
    };

    LogObject.prototype.getKeyValuePairs = function () {
        /* jshint -W089 */
        var self = this;
        var kvPairText = [];
        _.forOwn(this.kvPairs, function(value, key) {
            kvPairText.push(util.format("%s=\"%s\"", key,
                (self.escapeValues ? LogObject.escapeValue(value) : value)));
        });
        return kvPairText.join(" ");
    };

    LogObject.prototype.clearKeyValuePairs = function () {
        this.kvPairs = {};
    };

    LogObject.prototype.deleteKey = function (key) {
        delete this.kvPairs[key];
    };

    LogObject.prototype.toString = function () {
        return util.format("sessionId=\"%s\" hostname=\"%s\" platform=\"%s\" message=\"%s\" %s",
            this.sessionId, this.hostName, this.platform, this.message, this.getKeyValuePairs());
    };

    LogObject.prototype.newTiming = function(timerKey) {
        timerKey = _.isEmpty(timerKey) ? "default" : timerKey;
        this.startTimes[timerKey] = moment();
    };

    LogObject.prototype.timeSince = function(timerKey) {
        timerKey = _.isEmpty(timerKey) ? "default" : timerKey;
        if (this.startTimes[timerKey] > 0) {
            var elapsedMilliseconds = moment().diff(this.startTimes[timerKey]);
            this.addKeyValue("elapsedTime",elapsedMilliseconds.toString());
            this.addKeyValue("timerKey", timerKey);
        }
    };

    LogObject.prototype.resetTiming = function(timerKey) {
        if (this.startTimes[timerKey] > 0) {
            this.startTimes[timerKey] = moment();
        }
    };

    LogObject.prototype.clearTiming = function(timerKey) {
        if (this.startTimes[timerKey] > 0) {
            delete this.startTimes.timerKey;
            this.deleteKey("elapsedTime");
            this.deleteKey("timerKey");
        }
    };

    LogObject.prototype.clearTimings = function() {
        this.startTimes = {};
        this.deleteKey("elapsedTime");
        this.deleteKey("timerKey");
    };

    LogObject.escapeValue = function (text) {
        return encodeURIComponent(text);
    };

    LogObject.unEscapeValue = function (text) {
        return decodeURIComponent(text);
    };

    function generateLogSessionId() {
        return uuid.v4().replace(/-/g, "");
    }

    function hostname() {
        var _hostname = os.hostname();
        if (os.type().toLowerCase().indexOf('windows') === -1) {
            try {
                // load instance-id
                ec2meta.load('instance-id', function (err, value) {
                    _hostname = value;
                });
            }
            catch (err) {
            }
        }
        return _hostname;
    }
}(module.exports));