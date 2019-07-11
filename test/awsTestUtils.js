(function () {
    "use strict";
    var chai = require('chai'),
        should = chai.should();
    var uuid = require('uuid');
    var async = require('async');
    var util = require('util');

    var getAWSClients = require('getawsclients');

    var awsTestUtils = {

        createTestQueueName: function () {
            return util.format("keystone-unittest-queue-%s", uuid.v4().replace(/-/g, ''));
        },

        createTestTopicName: function () {
            return util.format("keystone-unittest-topic-%s", uuid.v4().replace(/-/g, ''));
        },

        createTopic: function(topicConfig, done) {
            var snsClient = getAWSClients.getSNSClient(topicConfig);
            topicConfig.topicName = awsTestUtils.createTestTopicName();
            snsClient.createTopic({Name: topicConfig.topicName}, function (err, result) {
                if (err) {
                    console.log("Error creating topic:\n%s", err);
                }
                should.not.exist(err);
                done(err, result);
            });
        },
    
        createTopicAndSubscribeQueue: function (queueConfig, topicConfig, done) {
            var snsClient = getAWSClients.getSNSClient(topicConfig);
            var sqsClient = getAWSClients.getSQSClient(queueConfig);
            async.waterfall([
                    function (callback) {
                        topicConfig.topicName = awsTestUtils.createTestTopicName();
                        snsClient.createTopic({Name: topicConfig.topicName}, function (err, result) {
                            if (err) {
                                console.log("Error creating topic:\n%s", err);
                            }
                            callback(err, result);
                        });
                    },
                    function (createResult, callback) {
                        topicConfig.topicArn = createResult.TopicArn;
                        queueConfig.queueName = awsTestUtils.createTestQueueName();
                        sqsClient.createQueue({QueueName: queueConfig.queueName}, function (err, result) {
                            if (err) {
                                console.log("Error creating queue:\n%s", err);
                            }
                            callback(err, result);
                        });
                    },
                    function (createResult, callback) {
                        queueConfig.queueUrl = createResult.QueueUrl;
                        sqsClient.getQueueAttributes({
                            QueueUrl: queueConfig.queueUrl,
                            AttributeNames: ["QueueArn"]
                        }, function (err, result) {
                            if (err) {
                                console.log("Error getting queue attributes:\n%s", err);
                            }
                            callback(err, result);
                        });
                    },
                    function (attributeResults, callback) {
                        queueConfig.queueArn = attributeResults.Attributes.QueueArn;
                        snsClient.subscribe({
                            'TopicArn': topicConfig.topicArn,
                            'Protocol': 'sqs',
                            'Endpoint': queueConfig.queueArn
                        }, function (err, result) {
                            if (err) {
                                console.log("Error subscribing queue to topic:\n%s", err);
                            }
                            callback(err, result);
                        });
                    },
                    function (subscribeResult, callback) {
                        topicConfig.subscriptionArn = subscribeResult.SubscriptionArn;
                        var queueAttributes = {
                            "Version": "2008-10-17",
                            "Id": queueConfig.queueArn + "/SQSDefaultPolicy",
                            "Statement": [{
                                "Sid": "Sid" + new Date().getTime(),
                                "Effect": "Allow",
                                "Principal": {
                                    "AWS": "*"
                                },
                                "Action": "SQS:SendMessage",
                                "Resource": queueConfig.queueArn,
                                "Condition": {
                                    "ArnEquals": {
                                        "aws:SourceArn": topicConfig.topicArn
                                    }
                                }
                            }
                            ]
                        };
                        sqsClient.setQueueAttributes({
                            QueueUrl: queueConfig.queueUrl,
                            Attributes: {
                                'Policy': JSON.stringify(queueAttributes)
                            }
                        }, function (err, result) {
                            if (err) {
                                console.log("Error setting queue attributes:\n%s", err);
                            }
                            callback(err, result);
                        });
                    }
                ],
                function (err) {
                    should.not.exist(err);
                    done();
                });
        },

        createQueue: function (queueConfig, done) {
            var sqsClient = getAWSClients.getSQSClient(queueConfig);

            // Create the test queue
            queueConfig.queueName = awsTestUtils.createTestQueueName();
            sqsClient.createQueue({QueueName: queueConfig.queueName}, function (err, result) {
                if (err) {
                    console.log("Error creating queue:\n%s", err);
                }
                else {
                    queueConfig.queueUrl = result.QueueUrl;
                }
                done(err);
            });
        },

        populateQueue: function (queueConfig, messageArray, done) {
            var sqsClient = getAWSClients.getSQSClient(queueConfig);
            async.forEach(messageArray, function (messageText, next) {
                    sqsClient.sendMessage({
                        QueueUrl: queueConfig.queueUrl,
                        MessageBody: messageText
                    }, function (err, result) {
                        if (err) {
                            console.log("Error sending message to queue:\n%s", err);
                        }
                        next(err);
                    });
                },
                function (err) {
                    should.not.exist(err);
                    done();
                });
        },

        populateTopic: function (topicConfig, messageArray, done) {
            var snsClient = getAWSClients.getSNSClient(topicConfig);
            async.forEach(messageArray, function (messageText, next) {
                    var publishParams = {
                        Message: messageText,
                        TopicArn: topicConfig.topicArn
                    };
                    snsClient.publish(publishParams, function (err) {
                        if (err) {
                            console.log("Error publishing to topic %s:\n%s", topicConfig.topicName, err);
                        }
                        next(err);
                    });
                },
                function (err) {
                    should.not.exist(err);
                    done();
                });
        },

        deleteQueue: function (queueConfig, done) {
            var sqsClient = getAWSClients.getSQSClient(queueConfig);
            sqsClient.deleteQueue({QueueUrl: queueConfig.queueUrl}, function (err) {
                if (err) {
                    console.log("Error deleting queue %s:\n%s", queueConfig.queueName, err);
                }
                done(err);
            });
        },

        deleteTopic: function(topicConfig, done) {
            var snsClient = getAWSClients.getSNSClient(topicConfig);
            snsClient.deleteTopic({TopicArn: topicConfig.topicArn}, function (err, result) {
                if (err) {
                    console.log("Error deleting topic %s:\n%s", topicConfig.topicName, err);
                }
                done(err, result);
            });
        },
        
        deleteTopicAndQueue: function (queueConfig, topicConfig, done) {
            var snsClient = getAWSClients.getSNSClient(topicConfig);
            async.series([
                    async.apply(awsTestUtils.deleteQueue, queueConfig),
                    function (callback) {
                        snsClient.unsubscribe({ SubscriptionArn: topicConfig.subscriptionArn}, function (err, result) {
                            if (err) {
                                console.log("Error removing subscription %s:\n%s", topicConfig.subscriptionArn, err);
                            }
                            callback(err);
                        });
                    },
                    function (callback) {
                        snsClient.deleteTopic({TopicArn: topicConfig.topicArn}, function (err, result) {
                            if (err) {
                                console.log("Error deleting topic %s:\n%s", topicConfig.topicName, err);
                            }
                            callback(err);
                        });
                    }
                ],
                function (err) {
                    should.not.exist(err);
                    done();
                });
        },

        isQueueEmpty: function (queueConfig, callback) {
            var sqsClient = getAWSClients.getSQSClient(queueConfig);
            sqsClient.getQueueAttributes({
                QueueUrl: queueConfig.queueUrl,
                AttributeNames: ['All']
            }, function (err, result) {
                if (err) {
                    console.log("Error getting queue attributes for queue %s:\n%s", queueConfig.queueName, err);
                    callback(err, false);
                }
                else {
                    callback(err, (parseInt(result.Attributes.ApproximateNumberOfMessages) === 0 &&
                        parseInt(result.Attributes.ApproximateNumberOfMessagesNotVisible) === 0));
                }
            });
        }
    };

    module.exports = awsTestUtils;
})(module.exports);
