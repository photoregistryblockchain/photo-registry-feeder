"use strict";

var config = require('config');
var log4js = require('log4js');
var async = require('async');
var util = require('util');

var logConfig = config.get('logging');
log4js.configure(logConfig);
var logger = log4js.getLogger();

var LogObject = require('aplogutilities');
var appLogFormatter = new LogObject("photo-registry-feeder", false);

var queueProcessor = require('./queueProcessor');
var messageProcessorFactory = require('./MessageProcessors/messageProcessorFactory');

var sqsConfig = config.get('sqs');
var queueConfig = sqsConfig[sqsConfig.inputQueue];

process.on('uncaughtException', function (err) {
    var message = util.format('Photo Registry Feeder Critical Error - stopping the process : %s', err);
    appLogFormatter.setErrorLocation(err, 0);
    logger.error(appLogFormatter.setMessage(message)
        .setErrorLocation(err).toString());
    flushAndShutdown();
});

var messageProcessors = [];
async.eachSeries(config.messageProcessors, function (messageProcessorType, nextMessageProcessor) {
        var messageProcessor = messageProcessorFactory.createProcessor(messageProcessorType, config, logger);
        messageProcessor.initialize(function (err) {
            if (err) {
                logger.error(appLogFormatter.setMessage("Error initializing message processor: %s", err)
                    .setErrorLocation(err).toString());
                flushAndShutdown();
            }
            else {
                messageProcessors.push(messageProcessor);
                nextMessageProcessor(null);
            }
        });
    },
    function (err) {
        if (err) {
            logger.error(appLogFormatter.setMessage("Error initializing message processors: %s", err)
                .setErrorLocation(err).toString());
            flushAndShutdown();
        }
        var processor = new queueProcessor(queueConfig, messageProcessors, logger);
        processor.start(function (err) {
            if (err) {
                logger.error(appLogFormatter.setMessage("Error starting queue processor: %s", err)
                    .setErrorLocation(err).toString());
                flushAndShutdown();
            }
            else {
                logger.info(appLogFormatter.setMessage("Successfully completed startup of main queue processor").toString());
            }
        });
    });

function flushAndShutdown() {
    // Make sure we flush the logs before killing our process
    log4js.shutdown(function () {
        process.exit(1);
    });
}