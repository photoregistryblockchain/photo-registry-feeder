(function () {
    "use strict";

    const util = require('util');
    const _ = require('lodash');
    const libxmljs = require('libxmljs2');
    const request = require('request');

    const { Client, createAccount, argString } = require('orbs-client-sdk');

    const logObject = require('aplogutilities');
    const ecrNotification = require('ecrnotification');

    const rightsModel = {
        id: 'ap42',
        name: 'editorialOnly',
        restrictions: 'no online or web use'
    };

    module.exports = photoRegistryMessageProcessor;

    function photoRegistryMessageProcessor(globalConfig, logger) {
        /*jshint -W040*/
        this.globalConfig = globalConfig;
        this.namespaceConfig = this.globalConfig.namespaces;
        this.xPathConfig = this.globalConfig.xpaths;
        this.processorConfig = this.globalConfig.photoRegistry;

        this.logger = logger;
        this.logFormatter = new logObject("photoRegistryMessageProcessor", false);

        this.initialize = function (initializeCallback) {
            initializeCallback(null);
        };

        function intersect(array1, array2) {
            return array1.filter(value => array2.includes(value));
        }

        this.processMessage = function (queueMessageEnvelope, doneWithMessage) {
            let self = this;

            self.logFormatter.clearTimings();
            let queueMessage = JSON.parse(queueMessageEnvelope.Body);
            let messageLogFormatter = new logObject("photoRegistryMessageProcessor.message", false);
            messageLogFormatter.addKeyValue("messageId", queueMessageEnvelope.MessageId);
            let notification;
            try {
                notification = new ecrNotification(queueMessageEnvelope.MessageId, queueMessage.Message, self.globalConfig.ecrNotification,
                    self.namespaceConfig, self.xPathConfig, self.logger);
            } catch (err) {
                self.logger.error(messageLogFormatter.setMessage("Error creating ECR Notification: %s", err)
                    .setErrorLocation(err).toString());
                return doneWithMessage(err);
            }
            messageLogFormatter.addKeyValue("notificationId", notification.feedId);

            self.logger.info(messageLogFormatter.setMessage("Received ECR notification for item id = %s, RSN = %s, filing ids = %s",
                notification.itemId, notification.version, notification.filingIds.join(',')).toString());

            // filter by product id
            let includedProducts = intersect(notification.products, self.processorConfig.productIds);
            if (includedProducts.length > 0) {

                notification.getAPPL(notification.ecrNotificationConfig.retries.default, (err, applText, etag, callback) => {
                    if (err) {
                        doneWithMessage(err);
                    } else {
                        evaluateMessage.call(self, notification, applText, messageLogFormatter, (err, photoRegistryItem) => {
                            if (err) {
                                self.logger.error(messageLogFormatter.setMessage("Error evaluating message for item id = %s, RSN = %s: %s",
                                    notification.itemId, notification.version, err).setErrorLocation(err).toString());
                                doneWithMessage(err);
                            }
                            else if (photoRegistryItem) {
                                calculatePhotoHash.call(self, notification, photoRegistryItem, messageLogFormatter, (err, photoRegistryItem, photoHash) => {
                                    if (err) {
                                        self.logger.error(messageLogFormatter.setMessage("Error calculating photo hash for item id = %s, RSN = %s: %s",
                                            notification.itemId, notification.version, err).setErrorLocation(err).toString());
                                    }
                                    else {
                                        callBlockChainService.call(self, notification, photoRegistryItem, photoHash, messageLogFormatter, err => {
                                            if (err) {
                                                self.logger.error(messageLogFormatter.setMessage("Error calling blockchain service for item id = %s, RSN = %s: %s",
                                                    notification.itemId, notification.version, err).setErrorLocation(err).toString());
                                            }
                                            else {
                                                self.logger.info(messageLogFormatter.setMessage('Successfully processed notification for item id = %s, RSN = %s with hash = %s',
                                                    notification.itemId, notification.version, photoHash).toString());
                                            }
                                            doneWithMessage(null);
                                        });
                                    }
                                });
                            }
                            else {
                                doneWithMessage(null);
                            }
                        });
                    }
                });
            }
            else {
                self.logger.info(messageLogFormatter.setMessage('Notification for item id = %s, RSN = %s does not include required products = %s',
                    notification.itemId, notification.version, JSON.stringify(self.processorConfig.productIds)).toString());
                doneWithMessage(null);
            }
        };

        function evaluateMessage(notification, applText, logFormatter, callback) {
            let self = this;

            try {
                this.applDoc = libxmljs.parseXml(applText);
            } catch (err) {
                let message = util.format("Error parsing APPL for item id = %s, RSN = %s: %s",
                    notification.itemId, notification.version, err);
                this.logger.error(logFormatter.setMessage(message)
                    .setErrorLocation(err).toString());
                return callback(err);
            }

            let mediaType = self.applDoc.get(self.xPathConfig.appl['mediaType'], self.namespaceConfig).text();
            if (mediaType == 'Photo') {
                const applPropertyMap = [
                    {applField: "itemId", registryField: "id"},
                    {applField: "title", registryField: "title"},
                    {applField: "photographerName", registryField: "author.name"},
                    {applField: "photographerTitle", registryField: "author.title"},
                    {applField: "photographerId", registryField: "author.id"},
                    {applField: "credit", registryField: "credit"},
                    {applField: "copyright", registryField: "copyright"},
                    {applField: "firstCreatedDateTime", registryField: "createdDateTime"},
                    {applField: "itemStartDateTime", registryField: "publishedDateTime"},
                    {applField: "caption", registryField: "description"}
                ];

                let contentRegistryItem = {
                    rightModel: rightsModel,
                    url: `${this.processorConfig.mapiBaseUrl}/${notification.itemId}/preview/preview.jpg`
                };
                _.each(applPropertyMap, function (applPropertyMapping) {
                    let matchingNode = self.applDoc.get(self.xPathConfig.appl[applPropertyMapping.applField], self.namespaceConfig);
                    if (matchingNode) {
                        let fieldTokens = applPropertyMapping.registryField.split('.');
                        if (fieldTokens.length == 1) {
                            if (applPropertyMapping.applField == "firstCreatedDateTime") {
                                contentRegistryItem[fieldTokens[0]] =
                                    matchingNode.attr('Year').value() + "-" +
                                    matchingNode.attr('Month').value() + "-" +
                                    matchingNode.attr('Day').value() + "T" +
                                    matchingNode.attr('Time').value();
                            } else {
                                contentRegistryItem[fieldTokens[0]] =
                                    (matchingNode.type() === "attribute") ? matchingNode.value() : matchingNode.text();
                            }
                        }

                        // Only deal with 1 level deep objects
                        else {
                            if (!contentRegistryItem[fieldTokens[0]])
                                contentRegistryItem[fieldTokens[0]] = {};
                            if (matchingNode)
                                contentRegistryItem[fieldTokens[0]][fieldTokens[1]] =
                                    (matchingNode.type() === "attribute") ? matchingNode.value() : matchingNode.text();
                        }
                    } else {
                        let message = util.format("Could not find %s in APPL for item id = %s, RSN = %s",
                            applPropertyMapping.applField, notification.itemId, notification.version);
                        self.logger.warn(logFormatter.setMessage(message).toString());
                    }
                });
                callback(null, contentRegistryItem);
            } else {
                self.logger.info(util.format('item id = %s, RSN = %s is not a photo',
                    notification.itemId, notification.version));
                callback(null, null);
            }
        }

        function calculatePhotoHash(notification, registryItem, logFormatter, callback) {
            let self = this;

            let hashServiceRequest = {
                url: registryItem.url
            };
            request.post({
                url: self.processorConfig.photoHashUrl,
                json: hashServiceRequest
            }, function (err, response, body) {
                if (err) {
                    callback(err, registryItem, null);
                }
                else {
                    let hash = body;
                    callback(null, registryItem, hash);
                }
            });
        }

        function callBlockChainService(notification, registryItem, photoHash, logFormatter, callback) {
            let self = this;

            const account = createAccount();
            const client = new Client(self.processorConfig.blockChainServiceUrl, 6666, 'TEST_NET');
            let registryJSON = JSON.stringify(registryItem);
            const [tx, txId] = client.createTransaction(account.publicKey, account.privateKey,
                "registry", "register", [argString(photoHash), argString(registryJSON)]);
            client.sendTransaction(tx).then(txResponse => {

                callback(null, txResponse);
            }).catch(err => {
                callback(err);
            });
        }
    }
}(module.exports));