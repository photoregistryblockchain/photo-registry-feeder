(function () {
    "use strict";

    const countingProcessor = require('./countingMessageProcessor');
    const photoRegistryProcessor = require('./photoRegistryMessageProcessor');

    const messageProcessorFactory = {
        createProcessor: function(type, config, logger) {
            let returnObject;
            switch (type.toLowerCase()) {

                case "photoregistry":
                    returnObject = new photoRegistryProcessor(config, logger);
                    break;

                case "counting":
                    returnObject = new countingProcessor(config, logger);
                    break;
            }
            return returnObject;
        }
    };
    module.exports = messageProcessorFactory;
})(module.exports);
