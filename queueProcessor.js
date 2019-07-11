"use strict";

/*jshint -W069*/
(function () {
    var _ = require('lodash');
    const { Consumer } = require('sqs-consumer');
    var fs = require('fs');
    var expandHomeDir = require('expand-home-dir');
    var uuid = require('uuid');
    var async = require('async');
    var path = require('path');
    var util = require('util');

    var logObject = require('aplogutilities');
    var getAWSClients = require('getawsclients');

    module.exports = queueProcessor;

    function queueProcessor(queueConfig, messageProcessors, logger) {
        /*jshint -W040*/
        var self = this;
        this.logger = logger;
        this.messageProcessors = messageProcessors;
        this.logFormatter = new logObject("queueProcessor", false);

        var err;
        var requiredFields = ["queueName", "visibilityTimeout", "waitTime", "maxMessages"];
        _.each(requiredFields, function (requiredField) {
            if (queueConfig.hasOwnProperty(requiredField)) {
                self[requiredField] = queueConfig[requiredField];
            }
            else {
                err = new Error(util.format("Could not find required field %s in queue configuration", requiredField));
                logger.error(self.logFormatter.setMessage(err.message).setErrorLocation(err).toString());
                self.logFormatter.clearErrorLocation();
                throw err;
            }
        });
        this.logFormatter.addKeyValue("queueName", this.queueName);

        // AWS Credentials are provided as key/secret, profile or using the machine role
        if (queueConfig.hasOwnProperty("accessKey")) {
            this.accessKey = queueConfig.accessKey;
            this.secretKey = queueConfig.secretKey;
        }
        else if (queueConfig.hasOwnProperty("profile")) {
            this.profile = queueConfig.profile;
        }

        this.rawMessages = queueConfig.hasOwnProperty("rawMessages") ? queueConfig["rawMessages"] : false;
        this.persistMessages = queueConfig.hasOwnProperty("persistMessages") ? queueConfig["persistMessages"] : false;
        if (this.persistMessages) {
            if (queueConfig.persistPath) {
                this.persistPath = queueConfig.persistPath;
            }
            else {
                err = new Error("Persist messages is enabled but no path provided.");
                logger.error(this.logFormatter.setMessage(err.message).setErrorLocation(err).toString());
                self.logFormatter.clearErrorLocation();
                throw err;
            }
            this.persistExtension = (queueConfig.persistExtension) ? queueConfig.persistExtension : ".json";
        }

        // Initialize AWS client
        this.sqsClient = getAWSClients.getSQSClient(queueConfig);

        this.receiveMessage = function (queueMessage, messageLogFormatter, doneWithMessage) {
            var self = this;

            messageLogFormatter.addKeyValue("messageId", (self.rawMessages) ? "raw" : queueMessage.MessageId);
            messageLogFormatter.addKeyValue("queueName", self.queueName);
            messageLogFormatter.addKeyValue("queueUrl", self.queueUrl);
            var messagePayload = (self.rawMessages) ? queueMessage.Body : queueMessage;
            self.logger.info(messageLogFormatter.setMessage("Received message").toString());
            if (self.persistMessages) {
                messageLogFormatter.newTiming("receiveMessage");
                var messageFilename = path.join(expandHomeDir(self.persistPath),
                    util.format("%s%s",
                        ((self.rawMessages) ? uuid.v4() : queueMessage.MessageId).replace(/-/g, ''),
                        self.persistExtension));
                var persistText = (self.rawMessages) ? messagePayload : JSON.stringify(messagePayload, 4);
                fs.writeFile(messageFilename, persistText, function (err) {
                    messageLogFormatter.timeSince("receiveMessage");
                    if (err) {
                        self.logger.error(messageLogFormatter.setMessage("Error writing file %s: %s", messageFilename, err)
                            .setErrorLocation(err).toString());
                    }
                    else {
                        self.logger.info(messageLogFormatter.setMessage("Saved message body to file %s", messageFilename).toString());
                    }
                    processMessage.call(self, messagePayload, messageLogFormatter, doneWithMessage);
                });
            }
            else {
                processMessage.call(self, messagePayload, messageLogFormatter, doneWithMessage);
            }
        };

        this.handleQueueError = function (err) {
            this.logger.error(this.logFormatter.setMessage("Error processing queue message from %s: %s", this.queueName, err)
                .setErrorLocation(err).toString());
            this.logFormatter.clearErrorLocation();
        };

        this.start = function (startupCompletionCallback) {
            var self = this;

            // Get the URL of this queue and then create a consumer object for reading messages
            async.series([
                    function (callback) {
                        self.sqsClient.getQueueUrl({QueueName: self.queueName}, function (err, data) {
                            if (err) {
                                self.logger.error(self.logFormatter.setMessage("Error retrieving SQS queue url for queue %s: %s",
                                    self.queueName, err).setErrorLocation(err).toString());
                                self.logFormatter.clearErrorLocation();
                            }
                            else {
                                self.queueUrl = data.QueueUrl;
                            }
                            callback(err);
                        });
                    },
                    function (callback) {

                        // Set up our consumer to read messages from the queue
                        self.consumer = Consumer.create({
                            queueUrl: self.queueUrl,
                            handleMessage: async (messageText) => {
                                let messageLogFormatter = new logObject("queueProcessorMessage", false);
                                messageLogFormatter.newTiming("handleMessage");
                                let messageStartTime = new Date();
                                const sleep = new Promise((resolve, reject) => {
                                    self.receiveMessage(messageText, messageLogFormatter, err => {
                                        messageLogFormatter.timeSince("handleMessage");
                                        let message = (err) ?
                                            util.format("Message completed with error, leaving on queue: %s", err) :
                                            "Successfully finished processing message";
                                        self.logger.info(messageLogFormatter.setMessage(message).toString());

                                        // See if we went over the visibility timeout while processing
                                        let messageEndTime = new Date();
                                        let processingSeconds = (messageEndTime - messageStartTime) / 1000;
                                        if (processingSeconds > self.visibilityTimeout) {
                                            self.logger.warn(messageLogFormatter.setMessage("Message took %d seconds to process which is greater than the visibility timeout of %d seconds.",
                                                processingSeconds, self.visibilityTimeout).toString());
                                        }
                                        if (err) {
                                            reject(err);
                                        }
                                        else {
                                            resolve();
                                        }
                                    });
                                });
                                return await sleep;
                            },
                            sqs: self.sqsClient,
                            visibilityTimeout: self.visibilityTimeout,
                            batchSize: self.maxMessages,
                            waitTimeSeconds: self.waitTime
                        });
                        self.consumer.on('error', function (err) {
                            self.handleQueueError(err);
                        });
                        self.consumer.start();
                        callback(null);
                    }
                ],
                function (err) {
                    if (err) {
                        self.logger.error(self.logFormatter.setMessage("Error starting queue processor for queue named %s: %s",
                            self.queueName, err).setErrorLocation(err).toString());
                    }
                    else {
                        self.logger.trace(self.logFormatter.setMessage("Started queue processor handling queue named %s",
                            self.queueName).toString());
                    }
                    startupCompletionCallback(err);
                });
        };

        this.stop = function () {
            this.consumer.stop();
        };

        function processMessage(messagePayload, messageLogFormatter, doneWithMessage) {
            var self = this;
            if (self.messageProcessors) {
                messageLogFormatter.newTiming("processMessage");
                async.each(self.messageProcessors, function (messageProcessor, nextProcessor) {
                        messageProcessor.processMessage(messagePayload, nextProcessor);
                    },
                    function (err) {
                        messageLogFormatter.timeSince("processMessage");
                        if (!err) {
                            self.logger.info(messageLogFormatter.setMessage("Successfully processed message in %d processors",
                                self.messageProcessors.length).toString());
                        }
                        doneWithMessage(err);
                    });
            }
            else {
                doneWithMessage(null);
            }
        }
    }
}(module.exports));