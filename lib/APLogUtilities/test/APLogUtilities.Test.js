"use strict";

const chai = require('chai'),
    expect = chai.expect,
    should = chai.should();

const _ = require('lodash');
const os = require('os');
const stackTraceParser = require('stacktrace-parser');
const async = require('async');
const util = require('util');

const LogFormatter = require('../APLogUtilities');

describe("APLogUtilities", function() {
    it("test basic log formatter property setting and constructor uses", done => {
        let logFormatter = new LogFormatter();
        should.exist(logFormatter.sessionId);
        expect(logFormatter.escapeValues).to.equal(true);
        expect(logFormatter.hostName).to.equal(os.hostname());

        logFormatter.setStatusCode(400);
        expect(logFormatter.kvPairs.statusCode).to.equal(400);

        logFormatter.setSubCategory("subcat");
        expect(logFormatter.kvPairs.subCategory).to.equal("subcat");

        let messageText = util.format("This is a test message with 3 values %d, %d, %d", 1, 2, 3);
        logFormatter.setMessage("This is a test message with 3 values %d, %d, %d", 1, 2, 3);
        expect(logFormatter.message).to.equal(messageText);

        let properText = util.format("sessionId=\"%s\" hostname=\"%s\" platform=\"%s\" message=\"%s\" %s",
            logFormatter.sessionId,
            os.hostname(),
            os.type() + ' ' + os.release(),
            logFormatter.message,
            logFormatter.getKeyValuePairs());
        let formattedText = logFormatter.toString();
        expect(formattedText).to.equal(properText);

        let kvPairs = {
            key1: "value1",
            key2: "value2",
            key3: "value3"
        };

        let sessionValue = "NonDefaultSession";
        logFormatter = new LogFormatter(sessionValue, false, kvPairs);
        expect(logFormatter.sessionId).to.equal(sessionValue);
        expect(logFormatter.escapeValues).to.equal(false);
        expect(logFormatter.kvPairs).to.deep.equal(kvPairs);
        done();
    });

    it("should create an error object and add relevant properties on the log formatter", done => {
        let logFormatter = new LogFormatter();
        let error = new Error();
        logFormatter.setErrorLocation(error);
        let frames = stackTraceParser.parse(error.stack);
        let stackKeys = [];
        _.each(frames, function(frame, index) {
            stackKeys.push(util.format("_stack%d", index));
        });
        expect(logFormatter.kvPairs).to.have.all.keys(stackKeys);

        logFormatter.clearErrorLocation();
        _.each(["file", "line", "callingFunction"], propertyName => {
            should.not.exist(logFormatter.kvPairs[propertyName]);
        });
        _.each(stackKeys, stackKey => {
            should.not.exist(logFormatter.kvPairs[stackKey]);
        });

        logFormatter = new LogFormatter();
        let depth = 2;
        logFormatter.setErrorLocation(error, depth);
        let existingKeys = stackKeys.slice(0, depth);
        let nonExistentKeys = stackKeys.slice(depth);
        expect(logFormatter.kvPairs).to.have.all.keys(existingKeys);
        expect(logFormatter.kvPairs).to.not.have.all.keys(nonExistentKeys);

        logFormatter = new LogFormatter();
        logFormatter.setErrorLocation();
        expect(logFormatter.kvPairs).to.have.all.keys(["file", "line", "callingFunction"]);

        should.not.exist(logFormatter.kvPairs._stack0);
        done();
    });

    it("will test various key value pair methods", done => {
        let logFormatter = new LogFormatter();
        let key = "Key1";
        let value = "Value1";
        logFormatter.addKeyValue(key, value);
        should.exist(logFormatter.kvPairs[key]);
        expect(logFormatter.kvPairs[key]).to.equal(value);

        logFormatter.deleteKey(key);
        should.not.exist(logFormatter.kvPairs[key]);

        // Test empty value default case
        logFormatter.addKeyValue(key, "");
        should.exist(logFormatter.kvPairs[key]);
        expect(_.isEmpty(logFormatter.kvPairs[key])).to.equal(true);

        logFormatter.deleteKey(key);
        should.not.exist(logFormatter.kvPairs[key]);

        // Test empty value non-default case
        logFormatter.addKeyValue(key, "", true);
        should.not.exist(logFormatter.kvPairs[key]);

        // Add another kv pair and test getKeyValuePairs()
        logFormatter.addKeyValue("Key1", "Value1");
        logFormatter.addKeyValue("Key2", "Value2");
        let kvPairText = logFormatter.getKeyValuePairs();
        expect(kvPairText.split(" ").length).to.equal(2);

        logFormatter.clearKeyValuePairs();
        expect(Object.keys(logFormatter.kvPairs).length).to.equal(0);

        let kvPairs = {
            key1: "value1",
            key2: "value2",
            key3: "value3"
        };
        logFormatter.addKeyValues(kvPairs);
        expect(logFormatter.kvPairs).to.have.all.keys(Object.keys(kvPairs));

        logFormatter.clearKeyValuePairs();
        kvPairs.key2 = "";
        logFormatter.addKeyValues(kvPairs);
        expect(logFormatter.kvPairs).to.have.all.keys(Object.keys(kvPairs));

        logFormatter.clearKeyValuePairs();
        logFormatter.addKeyValues(kvPairs, true);
        expect(logFormatter.kvPairs).to.have.all.keys(["key1", "key3"]);
        expect(logFormatter.kvPairs).to.not.have.all.keys(["key2"]);

        done();
    });

    it("will test various timing methods", done => {
        this.timeout(5000);
        let logFormatter = new LogFormatter();
        let delay = 1000;
        let previousDelay = 0;
        let timerKey = "timerKey";
        logFormatter.newTiming();
        async.waterfall([
            callback => {
                setTimeout(callback, delay);
            },
            callback => {
                logFormatter.timeSince();
                expect(parseInt(logFormatter.kvPairs.elapsedTime)).to.be.above(delay);
                logFormatter.clearTimings();
                logFormatter.newTiming(timerKey);
                previousDelay = delay;
                delay = 1500;
                setTimeout(callback, delay);
            },
            callback => {
                logFormatter.timeSince(timerKey);
                expect(parseInt(logFormatter.kvPairs.elapsedTime)).to.be.above(delay);
                previousDelay = delay;
                delay = 1000;
                logFormatter.resetTiming(timerKey);
                setTimeout(callback, delay);
            },
            callback => {
                logFormatter.timeSince(timerKey);
                expect(parseInt(logFormatter.kvPairs.elapsedTime)).to.be.above(delay);
                expect(parseInt(logFormatter.kvPairs.elapsedTime)).to.be.below(previousDelay);
                logFormatter.clearTiming(timerKey);
                setTimeout(callback, delay);
            }
        ],
        err => {
            expect(logFormatter.kvPairs.elapsedTime).to.not.exist;
            expect(logFormatter.kvPairs.timerKey).to.not.exist;
            expect(logFormatter.startTimes[timerKey]).to.not.exist;
            done(err);
        });
    });
});

