(function () {
    "use strict";

    var _ = require('lodash');
    var libxmljs = require('libxmljs2');
    var request = require('request');
    var async = require('async');
    var util = require('util');
    var moment = require('moment');
    var fs = require('fs');
    var path = require('path');
    var url = require('url');

    var LogFormatter = require('aplogutilities');

    module.exports = ecrNotification;

    var atomProperties = {
        "feedId": "string",
        "entryId": "string",
        "itemId": "string",
        "version": "string",
        "products": "numericArray",
        "savedSearchIds": "numericArray",
        "filingIds": "stringArray",
        "title": "string",
        "etag": "string",
        "contentLink": "string",
        "entryDateTime": "string",
        "feedDateTime": "string"
    };

    function ecrNotification(messageId, notificationText, ecrNotificationConfig, namespaceConfig, xpathConfig, logger) {
        /*jshint validthis: true */
        this.messageId = messageId;
        this.notificationText = notificationText;
        this.ecrNotificationConfig = ecrNotificationConfig;
        this.namespaces = namespaceConfig;
        this.xpathConfig = xpathConfig;
        this.logger = logger;
        this.logFormatter = new LogFormatter("ecrNotification", false);
        this.logFormatter.addKeyValue("messageId", this.messageId);

        try {
            this.notificationDoc = libxmljs.parseXml(notificationText);
        }
        catch (err) {
            logger.error(this.logFormatter.setMessage("Error parsing ECR Notification with text = %s: %s",
                this.notificationText, err).toString());
            throw err;
        }

        populateProperties.call(this, atomProperties);

        // Add Targets as a property so we can filter on them later
        var targetNodes = this.notificationDoc.find(this.xpathConfig.ecrNotification.targets, this.namespaces);
        this.targets = targetNodes.map(function(node) {
            return node.attr("name").value();
        });

        function getDocument(url, retryLimit, callback) {
            var self = this;
            var retries = 0;
            async.retry({
                    times: retryLimit,
                    interval: function(retryCount) {
                        return 500 * Math.pow(2, retryCount);
                    },
                },
                function (retryCallback) {
                    retries += 1;
                    self.logFormatter.newTiming("ecrNotification.getDocument");
                    request(url, function (err, response, body) {

                        // Retry if there was an error returned or the status code does not indicate success (aka 200)
                        if (err || response.statusCode !== 200) {
                            if (!err && response.statusCode !== 200) {
                                err = new Error(util.format("Bad HTTP status code = %d, message = %s",
                                    response.statusCode, response.statusMessage));
                            }
                            retryCallback(err, response, null, null);
                        }
                        else {
                            var returnETag = response.headers.etag.replace(/\"/g, "");
                            retryCallback(null, response, body, returnETag);
                        }
                    });
                },
                function (err, response, responseBody, etag) {
                    self.logFormatter.timeSince("ecrNotification.getDocument");
                    if (err) {
                        self.logger.error(self.logFormatter.setMessage("Error downloading document from %s after %d retries",
                            url, retries).toString());
                    }
                    else {
                        self.logger.info(self.logFormatter.setMessage("Successfully downloaded document from %s after %d retries",
                            url, retries).toString());
                        if (self.ecrNotificationConfig.populateMissingETag && /^0000/.test(self.etag)) {
                            self.etag = etag;
                        }
                    }
                    callback(err, responseBody, etag);
                });
        }

        this.getAPPL = function (retryLimit, callback) {
            getDocument.call(this, this.contentLink, retryLimit, callback);
        };

        this.getAPPLJSON = function (retryLimit, callback) {
            var contentLinkUrl = url.parse(this.contentLink);
            var params = contentLinkUrl.query;
            if (!params) {
                params = {};
            }
            params.doc_type = 'application/vnd.ap.esappl+json';
            contentLinkUrl.query = params;
            getDocument.call(this, contentLinkUrl.format(), retryLimit, callback);
        };

        this.getLatestAPPLJSON = function (retryLimit, callback) {
            var ecrUrl = url.parse(util.format(this.ecrNotificationConfig.ECRUrlTemplate, this.itemId));
            var params = ecrUrl.query;
            if (!params) {
                params = {};
            }
            params.doc_type = 'application/vnd.ap.esappl+json';
            ecrUrl.query = params;
            getDocument.call(this, ecrUrl.format(), retryLimit, callback);
        };

        this.containsTarget = function (targetName) {
            return (this.targets && this.targets.length > 0 && _.indexOf(this.targets, targetName) > -1);
        };

        this.containsTargets = function (targetNames) {
            return (this.targets && this.targets.length > 0 && _.intersection(this.targets, targetNames).length === targetNames.length);
        };

        function compareNumbers(a, b) {
            return a - b;
        }

        function populateProperties(propertyNames) {
            var self = this;

            _.each(Object.keys(propertyNames), function(propertyName) {
                var matchingNode = self.notificationDoc.get(self.xpathConfig.ecrNotification[propertyName], self.namespaces);
                var message;
                if (matchingNode) {
                    var propertyText = (matchingNode.type() === "attribute") ? matchingNode.value() : matchingNode.text();
                    switch (propertyNames[propertyName]) {
                        case "stringArray":
                            self[propertyName] = (propertyText.trim()) ? propertyText.split(",") : [];
                            break;

                        case "numericArray":
                            self[propertyName] = (propertyText.trim()) ? propertyText.split(",").map(Number).sort(compareNumbers) : [];
                            break;

                        case "number":
                            self[propertyName] = parseInt(propertyText);
                            break;

                        case "date":
                            self[propertyName] = moment(propertyText).toDate();
                            break;

                        case "string":
                            self[propertyName] = propertyText;
                            break;

                        default:
                            message = util.format("Unknown type %s specified for property = %s",
                                self[propertyName], propertyName);
                            logger.warn(self.logFormatter.setMessage(message).toString());
                            self[propertyName] = propertyText;
                            break;
                    }
                }
                else {
                    message = util.format("Could not find property = %s in ECR Notification", propertyName);
                    logger.warn(self.logFormatter.setMessage(message).toString());
                    switch (propertyNames[propertyName]) {
                        case "stringArray":
                        case "numericArray":
                            self[propertyName] = [];
                            break;

                        default:
                            self[propertyName] = undefined;
                            break;
                    }
                }
            });
        }

        this.createNotificationFromAPPL = function(itemId, createNotificationFromAPPLCallback) {
            var self = this;

            // retrieve APPL from ECR
            var ecrUrl = util.format(self.ecrNotificationConfig.ECRUrlTemplate, itemId);
            async.waterfall([
                function (callback) {
                    getDocument.call(self, ecrUrl, self.ecrNotificationConfig.retries.reingest, callback);
                },
                function (applText, etag, callback) {
                    var applDoc;
                    try {
                        applDoc = libxmljs.parseXml(applText);
                    }
                    catch (err) {
                        logger.error(self.logFormatter.setMessage("Error parsing APPL with text = %s: %s",
                            applText, err).toString());
                        throw err;
                    }

                    // Create the XML from our template
                    var templateFileName = path.join(__dirname, "ecrNotificationTemplate.xml");
                    fs.readFile(templateFileName, function (err, templateText) {
                        var notificationTemplateDoc;
                        try {
                            notificationTemplateDoc = libxmljs.parseXml(templateText);
                        }
                        catch (err) {
                            logger.error(self.logFormatter.setMessage("Error parsing APPL with text = %s: %s",
                                applText, err).toString());
                            throw err;
                        }
                        callback(err, applDoc, applText, etag, notificationTemplateDoc);
                    });
                },
                function (applDoc, applText, etag, notificationTemplateDoc, callback) {
                    var ecrXPath = self.xpathConfig.ecrNotification;
                    var applXPath = self.xpathConfig.appl;
                    var now = moment();

                    var recordSequenceNumber = applDoc.get(applXPath.recordSequenceNumber, self.namespaces).text();

                    var feedId = util.format("tag:pipelineingestion.ap.org,%s:%s,%d",
                        moment().format("YYYY-MM-DD"),
                        itemId,
                        recordSequenceNumber);
                    updateNodeValue.call(self, notificationTemplateDoc, ecrXPath.feedId, self.namespaces, feedId);
                    updateNodeValue.call(self, notificationTemplateDoc, ecrXPath.feedDateTime, self.namespaces,
                        now.toISOString());
                    updateNodeValue.call(self, notificationTemplateDoc, ecrXPath.itemId, self.namespaces, itemId);
                    updateNodeValue.call(self, notificationTemplateDoc, ecrXPath.version, self.namespaces, recordSequenceNumber);
                    updateNodeValue.call(self, notificationTemplateDoc, ecrXPath.contentLink, self.namespaces, ecrUrl);
                    updateNodeValue.call(self, notificationTemplateDoc, ecrXPath.etag, self.namespaces, etag);
                    var title = util.format("Item:%s,Version:%d", itemId, recordSequenceNumber);
                    updateNodeValue.call(self, notificationTemplateDoc, ecrXPath.title, self.namespaces, title);

                    var filingIdNodes = applDoc.find(applXPath.filingIds, self.namespaces);
                    if (filingIdNodes) {
                        var filingIds = filingIdNodes.map(function (filingIdNode) {
                            return filingIdNode.text();
                        }).join(',');
                        updateNodeValue.call(self, notificationTemplateDoc, ecrXPath.filingIds, self.namespaces, filingIds);
                    }
                    else {
                        var message = util.format("Could not find any filing ids using xpath = %s",
                            applXPath.filingIds);
                        var err = new Error(message);
                        logger.error(self.logFormatter.setMessage(message).toString());
                        async.setImmediate(function () {
                            callback(err, null, null);
                        });
                    }

                    var newNotification = new ecrNotification("RelatedRetrieval", notificationTemplateDoc.toString(),
                        self.ecrNotificationConfig, self.namespaces, self.xpathConfig, logger);
                    async.setImmediate(function () {
                        callback(err, newNotification, applText);
                    });
                }
            ],
            function (err, newNotification, applText) {
                createNotificationFromAPPLCallback(err, newNotification);
            });
        };

        function updateNodeValue(document, xPath, namespaces, value) {
            var node = document.get(xPath , namespaces);
            if (node) {
                if (node.type() === "attribute") {
                    node.value(value);
                }
                else {
                    node.text(value);
                }
            }
            else {
                logger.error(this.logFormatter.setMessage("Could not find node for XPath = %s", xPath).toString());
            }
        }
    }
}(module.exports));