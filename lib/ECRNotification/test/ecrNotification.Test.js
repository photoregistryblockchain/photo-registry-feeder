var chai = require('chai'),
    expect = chai.expect,
    should = chai.should(),
    assert = chai.assert;

var fs = require('fs');
var config = require('config');
var async = require('async');

var namespaceConfig = config.get('namespaces');
var xpathConfig = config.get('xpaths');
var ecrNotificationConfig = config.get('ecrNotification');

var log4js = require('log4js');
var logConfig = config.get('logging');
log4js.configure(logConfig);
var logger = log4js.getLogger();

var ECRNotification = require('../ecrNotification');

describe("ECRNotification", function () {
    "use strict";

    var notificationText, noetagNotificationText, emptyNotificationText, missingPropertyNotificationText;

    before(function (done) {
        async.waterfall([
                function (callback) {
                    fs.readFile("./testData/ecrNotification.xml", "utf-8", callback);
                },
                function (data, callback) {
                    notificationText = data;
                    fs.readFile("./testData/ecrNotification-NoETag.xml", "utf-8", callback);
                },
                function (data, callback) {
                    noetagNotificationText = data;
                    fs.readFile("./testData/ecrNotification-Empty.xml", "utf-8", callback);
                },
                function (data, callback) {
                    emptyNotificationText = data;
                    fs.readFile("./testData/ecrNotification-missingProperties.xml", "utf-8", callback);
                },
                function (data, callback) {
                    missingPropertyNotificationText = data;
                    async.setImmediate(function () {
                        callback(null);
                    });
                }
            ],
            function (err) {
                if (err) {
                    console.log("Error reading notification text: %s", err);
                }
                done();
            });
    });

    describe("constructor", function () {
        it("should create a notification object with relevant values populated", function () {

            var notification = new ECRNotification(null, notificationText, ecrNotificationConfig, namespaceConfig, xpathConfig, logger);
            should.not.exist(notification.messageId);
            expect(notification.itemId).to.equal("c65e3f8e697d40b0b13f28c42a50223e");
            expect(notification.version).to.equal("1");
            expect(notification.title).to.equal("Item:c65e3f8e697d40b0b13f28c42a50223e,Version:1");
            expect(notification.feedId).to.equal("tag:pipelineingestion.ap.org,2016-08-24:c65e3f8e697d40b0b13f28c42a50223e,1");
            expect(notification.entryId).to.equal("tag:ecr.ap.org,2016-08-24:c65e3f8e697d40b0b13f28c42a50223e,1");
            expect(notification.products instanceof Array).to.be.equal(true);
            expect(notification.products.length).to.be.above(0);
            expect(typeof notification.products[0]).to.equal("number");
            expect(notification.savedSearchIds instanceof Array).to.be.equal(true);
            expect(notification.savedSearchIds.length).to.be.above(0);
            expect(typeof notification.savedSearchIds[0]).to.equal("number");
            should.exist(notification.filingIds);
            expect(notification.filingIds instanceof Array).to.be.equal(true);
            expect(notification.filingIds.length).to.be.above(0);
            expect(notification.filingIds[0]).to.equal('bde44e4b73c24c1583af5d12b3e47735');
            should.exist(notification.contentLink);
            should.exist(notification.entryDateTime);
            should.exist(notification.feedDateTime);
            expect(notification.etag).to.equal('fb8419464457d0368c49caa260d7ac10');
        });

        it ("should create a notification object with certain values empty or unpopulated", function () {
            var notification = new ECRNotification(null, emptyNotificationText, ecrNotificationConfig, namespaceConfig, xpathConfig, logger);
            expect(notification.products instanceof Array).to.be.equal(true);
            expect(notification.products.length).to.be.equal(0);
            expect(notification.savedSearchIds instanceof Array).to.be.equal(true);
            expect(notification.savedSearchIds.length).to.be.equal(0);
            should.exist(notification.entryDateTime);
            should.exist(notification.feedDateTime);
        });

        it("should warn on missing properties but initialize them", function () {
            var notification = new ECRNotification(null, missingPropertyNotificationText, ecrNotificationConfig, namespaceConfig, xpathConfig, logger);
            should.not.exist(notification.messageId);
            expect(notification.itemId).to.equal("c65e3f8e697d40b0b13f28c42a50223e");
            expect(notification.version).to.not.exist;
            expect(notification.title).to.equal("Item:c65e3f8e697d40b0b13f28c42a50223e,Version:1");
            expect(notification.feedId).to.equal("tag:pipelineingestion.ap.org,2016-08-24:c65e3f8e697d40b0b13f28c42a50223e,1");
            expect(notification.entryId).to.equal("tag:ecr.ap.org,2016-08-24:c65e3f8e697d40b0b13f28c42a50223e,1");
            expect(notification.products instanceof Array).to.be.equal(true);
            expect(notification.products.length).to.equal(0);
            expect(notification.savedSearchIds instanceof Array).to.be.equal(true);
            expect(notification.savedSearchIds.length).to.be.above(0);
            expect(typeof notification.savedSearchIds[0]).to.equal("number");
            expect(notification.filingIds instanceof Array).to.be.equal(true);
            expect(notification.filingIds.length).to.equal(0);
            should.exist(notification.contentLink);
            should.exist(notification.entryDateTime);
            should.exist(notification.feedDateTime);
            expect(notification.etag).to.equal('fb8419464457d0368c49caa260d7ac10');
        });

        it("should fail to create a new object due to bad XML", function (done) {
            /* jshint -W031 */
            assert.throw(function () {
                new ECRNotification(null, "<feed>/feed>", ecrNotificationConfig, namespaceConfig, xpathConfig, logger);
            }, Error);
            done();
        });
    });

    describe("containsTarget", function () {
        it("should find a target named Edge and not find one named Bogus", function (done) {
            var notification = new ECRNotification(null, notificationText, ecrNotificationConfig, namespaceConfig, xpathConfig, logger);
            var hasTarget = notification.containsTarget("Edge");
            expect(hasTarget).to.be.equal(true);
            hasTarget = notification.containsTarget("Bogus");
            expect(hasTarget).to.be.equal(false);
            done();
        });
    });

    describe("containsTargets", function () {
        it("should find targets named Edge and Productizer and not ones named Edge and Bogus", function (done) {
            var notification = new ECRNotification(null, notificationText, ecrNotificationConfig, namespaceConfig, xpathConfig, logger);
            var hasTarget = notification.containsTargets(["Edge", "Productizer"]);
            expect(hasTarget).to.be.equal(true);
            hasTarget = notification.containsTargets(["Edge", "Bogus"]);
            expect(hasTarget).to.be.equal(false);
            done();
        });
    });

    describe("getAPPL", function () {
        it("should retrieve the APPL associated with the content Url", function (done) {
            var notification = new ECRNotification(null, notificationText, ecrNotificationConfig, namespaceConfig, xpathConfig, logger);
            notification.getAPPL(ecrNotificationConfig.retries.default, function (err, applText, etag) {
                should.exist(applText);
                should.exist(etag);
                done();
            });
        });
        it("should retrieve the APPL associated with the content Url AND save the etag from the APPL", function (done) {
            var notification = new ECRNotification(null, noetagNotificationText, ecrNotificationConfig, namespaceConfig, xpathConfig, logger);
            expect(notification.etag).to.match(/^0000/);
            notification.getAPPL(ecrNotificationConfig.retries.default, function (err, applText, etag) {
                should.exist(applText);
                should.exist(etag);
                expect(notification.etag).to.be.equal(etag);
                done();
            });
        });
        it("use bogus link and make sure we get an error in our callback after 3 retries", function (done) {
            var notification = new ECRNotification(null, notificationText, ecrNotificationConfig, namespaceConfig, xpathConfig, logger);
            notification.contentLink = "http://catalogapiqa.ap.org/AP.MessageRepository.APIHost/Services/MessageRepository.svc/documents/bogus";
            notification.getAPPL(ecrNotificationConfig.retries.default, function (err, applText, etag) {
                should.exist(err);
                should.not.exist(applText);
                should.not.exist(etag);
                done();
            });
        });
        it("use bogus link and make sure we get an error in our callback after 1 retries", function (done) {
            var newConfig = JSON.parse(JSON.stringify(ecrNotificationConfig));
            newConfig.retryMissing = false;
            var notification = new ECRNotification(null, notificationText, newConfig, namespaceConfig, xpathConfig, logger);
            notification.contentLink = "http://catalogapiqa.ap.org/AP.MessageRepository.APIHost/Services/MessageRepository.svc/documents/bogus";
            notification.getAPPL(ecrNotificationConfig.retries.reingest, function (err, applText, etag) {
                should.exist(err);
                should.not.exist(applText);
                should.not.exist(etag);
                done();
            });
        });
    });

    describe("getAPPLJSON", function () {
        it("should retrieve the APPL JSON associated with the content Url", function (done) {
            var notification = new ECRNotification(null, notificationText, ecrNotificationConfig, namespaceConfig, xpathConfig, logger);
            notification.getAPPLJSON(ecrNotificationConfig.retries.default, function (err, jsonText, etag) {
                should.exist(jsonText);
                var appl = JSON.parse(jsonText);
                expect(appl.itemid).to.equal(notification.itemId);
                should.exist(etag);
                done();
            });
        });
        it("use bogus link and make sure we get an error in our callback after 3 retries", function (done) {
            var notification = new ECRNotification(null, notificationText, ecrNotificationConfig, namespaceConfig, xpathConfig, logger);
            notification.contentLink = "http://catalogapiqa.ap.org/AP.MessageRepository.APIHost/Services/MessageRepository.svc/documents/bogus";
            notification.getAPPLJSON(ecrNotificationConfig.retries.default, function (err, jsonText, etag) {
                should.exist(err);
                should.not.exist(jsonText);
                should.not.exist(etag);
                done();
            });
        });
        it("use bogus link and make sure we get an error in our callback after 1 retries", function (done) {
            var notification = new ECRNotification(null, notificationText, ecrNotificationConfig, namespaceConfig, xpathConfig, logger);
            notification.contentLink = "http://catalogapiqa.ap.org/AP.MessageRepository.APIHost/Services/MessageRepository.svc/documents/bogus";
            notification.getAPPLJSON(ecrNotificationConfig.retries.reingest, function (err, jsonText, etag) {
                should.exist(err);
                should.not.exist(jsonText);
                should.not.exist(etag);
                done();
            });
        });
    });

    describe("getLatestAPPLJSON", function () {
        it("should retrieve the Latest version of the APPL JSON associated with the content Url", function (done) {
            var notification = new ECRNotification(null, notificationText, ecrNotificationConfig, namespaceConfig, xpathConfig, logger);
            notification.getLatestAPPLJSON(ecrNotificationConfig.retries.default, function (err, jsonText, etag) {
                should.exist(jsonText);
                var appl = JSON.parse(jsonText);
                expect(appl.itemid).to.equal(notification.itemId);
                should.exist(etag);
                done();
            });
        });
    });

    describe("createNotificationFromAPPL", function () {
        it("should return a new notification for the item specified", function (done) {
            var notification = new ECRNotification(null, notificationText, ecrNotificationConfig, namespaceConfig, xpathConfig, logger);
            var testItemId = "da5b9285b879b7ba4980999922b6f69c";
            notification.createNotificationFromAPPL(testItemId, function (err, newNotification) {
                expect(newNotification.messageId).to.equal("RelatedRetrieval");
                expect(newNotification.itemId).to.equal(testItemId);
                done();
            });
        });
        it("should return an error as the specified item doesn't exist", function (done) {
            var notification = new ECRNotification(null, notificationText, ecrNotificationConfig, namespaceConfig, xpathConfig, logger);
            var testItemId = "xxxb9285b879b7ba4980999922b6f69c";
            notification.createNotificationFromAPPL(testItemId, function (err, newNotification, applText) {
                should.exist(err);
                should.not.exist(newNotification);
                should.not.exist(applText);
                done();
            });
        });
    });
});
