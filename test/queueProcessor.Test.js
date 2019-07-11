"use strict";

let chai = require('chai'),
    expect = chai.expect,
    should = chai.should();
let config = require('config');
let async = require('async');
let fs = require('fs');
let uuid = require('uuid');
let util = require('util');

let queueProcessor = require('../queueProcessor');
let messageProcessorFactory = require('../MessageProcessors/messageProcessorFactory');
let awsTestUtils = require('./awsTestUtils');

let log4js = require('log4js');
let logConfig = config.get('logging');
log4js.configure(logConfig);
let logger = log4js.getLogger();

let profileQueueConfig = {
    "profile": "Dev VPC",
    "region": "us-east-1",
    "queueName": "",
    "visibilityTimeout": 30,
    "maxMessages": 5,
    "waitTime": 15
};

let keyedQueueConfig = {
    "accessKey": "AKIAJMZD45NHJQJYZXUA",
    "secretKey": "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",
    "region": "us-east-1",
    "queueName": "",
    "persistMessages": true,
    "persistPath": "~/Downloads/Notifications/",
    "visibilityTimeout": 30,
    "maxMessages": 5,
    "waitTime": 15,
    "rawMessages": false
};

let testTopicConfig = {
    "profile": "Dev VPC",
    "region": "us-east-1",
    "topic": ""
};

let testPushTopicConfig = {
    "profile": "Dev VPC",
    "region": "us-east-1",
    "topic": ""
};

let testPushQueueConfig = {
    "profile": "Dev VPC",
    "region": "us-east-1",
    "queueName": "",
    "visibilityTimeout": 30,
    "maxMessages": 5,
    "waitTime": 15
};

describe("queueProcessor", function () {

    describe("constructor", function () {
        it("create a queue processor with certain fields set to default as they're not provided", function (done) {
            let processor = new queueProcessor(profileQueueConfig, null, logger);
            expect(processor.rawMessages).to.equal(false);
            expect(processor.persistMessages).to.equal(false);
            done();
        });
        it("create a queue processor with more fields populated than simple case", function (done) {
            let processor = new queueProcessor(keyedQueueConfig, null, logger);
            expect(processor.rawMessages).to.equal(false);
            expect(processor.persistMessages).to.equal(true);
            expect(processor.persistPath).to.equal(keyedQueueConfig.persistPath);
            done();
        });
    });

    describe("consume simple", function () {
        this.timeout(0);
        let processor;
        let messagesToPush = 20;
        before(function (done) {
            async.series([
                    function (callback) {
                        awsTestUtils.createQueue(keyedQueueConfig, callback);
                    },
                    function (callback) {
                        let messageArray = [];
                        for (let i = 0; i < messagesToPush; i++) {
                            messageArray.push(util.format("Test message #%d", i + 1));
                        }
                        awsTestUtils.populateQueue(keyedQueueConfig, messageArray, callback);
                    }
                ],
                function (err) {
                    should.not.exist(err);
                    done();
                });
        });
        after(function (done) {
            processor.stop();
            setTimeout(function () {
                awsTestUtils.deleteQueue(keyedQueueConfig, done);
            }, 2 * 1000);
        });

        it("should successfully start reading from a queue and successfully process a full message", function (done) {
            let completedProcessors = 0;
            let processorCount = 3;
            let processorConfig = {
                messageProcessors: [],
                expectedCount: messagesToPush,
                finishCallback: function () {
                    completedProcessors += 1;
                    if (completedProcessors === processorCount) {
                        done();
                    }
                }
            };
            for (let i = 0; i < processorCount; i++) {
                processorConfig.messageProcessors.push("counting");
            }
            let messageProcessors = [];
            async.eachSeries(processorConfig.messageProcessors, function (messageProcessorType, nextMessageProcessor) {
                    let messageProcessor = messageProcessorFactory.createProcessor(messageProcessorType, processorConfig, logger);
                    messageProcessor.initialize(function (err) {
                        if (err) {
                            logger.error(util.format("Error initializing message processor: %s", err));
                        }
                        else {
                            messageProcessors.push(messageProcessor);
                        }
                        nextMessageProcessor(err);
                    });
                },
                function (err) {
                    if (err) {
                        logger.error(util.format("Error initializing message processors: %s", err));
                    }
                    else {
                        processor = new queueProcessor(keyedQueueConfig, messageProcessors, logger);
                        processor.start();
                    }
                });
        });
    });

    describe("consume concurrent video", function () {
        this.timeout(0);
        let messagesToPush = 20;
        before(function (done) {
            async.waterfall([
                    async.apply(awsTestUtils.createTopicAndSubscribeQueue, keyedQueueConfig, testTopicConfig),
                    function (callback) {
                        fs.readFile("test/testData/ECRNotification-Video.xml", "utf-8", function (err, data) {
                            if (err) {
                                console.log("Error reading notification text:\n%s", err);
                            }
                            callback(err, data);
                        });
                    },
                    function (data, callback) {
                        let messageArray = [];
                        for (let i = 0; i < messagesToPush; i++) {
                            messageArray.push(data);
                        }
                        awsTestUtils.populateTopic(testTopicConfig, messageArray, callback);
                    },
                    function (callback) {
                        awsTestUtils.createTopicAndSubscribeQueue(testPushQueueConfig, testPushTopicConfig, callback);
                    }
                ],
                function (err) {
                    should.not.exist(err);
                    done();
                });
        });
        after(function (done) {
            async.series([
                    async.apply(awsTestUtils.deleteTopicAndQueue, keyedQueueConfig, testTopicConfig),
                    function (callback) {
                        awsTestUtils.deleteTopicAndQueue(testPushQueueConfig, testPushTopicConfig, callback);
                    }
                ],
                function (err) {
                    should.not.exist(err);
                    done();
                });
        });
        it("it should process " + messagesToPush + " of the same message and only deliver a single work order for matching rules", function (done) {
            let queueConfig = keyedQueueConfig;

            let messageProcessors = [];
            messageProcessors.push(messageProcessorFactory.createProcessor("hatfield", config, logger));
            messageProcessors[0].initialize(function (err) {
                if (err) {
                    logger.error(util.format("Error getting rules:\n%s", err));
                    process.exit(1);
                }

                // Modify the topic we push to in the rules on the message processor
                for (let ruleIndex = 0; ruleIndex < messageProcessors[0].contentRules.length; ruleIndex++) {
                    for (let endpointIndex = 0; endpointIndex < messageProcessors[0].contentRules[ruleIndex].ruleEndpoints.length; endpointIndex++) {
                        messageProcessors[0].contentRules[ruleIndex].ruleEndpoints[endpointIndex].workerTopic = testPushTopicConfig.topicArn;
                    }
                }
                let processor = new queueProcessor(queueConfig, messageProcessors, logger);

                // Another test hack to see if the queue is empty and if so stop the queue processor
                // and end the test
                let checkIfEmptyTimer = setInterval(function () {
                    awsTestUtils.isQueueEmpty(keyedQueueConfig, function (err, result) {
                        if (result) {
                            clearInterval(checkIfEmptyTimer);
                            processor.stop();
                            setTimeout(function () {
                                done();
                            }, 2 * 1000);
                        }
                    });
                }, 10 * 1000);
                processor.start();
            });
        });
    });
});