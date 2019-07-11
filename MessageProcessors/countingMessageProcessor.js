(function () {
    "use strict";

    module.exports = countingMessageProcessor;

    function countingMessageProcessor(processorConfig) {
        /*jshint -W040*/
        this.expectedCount = processorConfig.expectedCount;
        this.finishCallback = processorConfig.finishCallback;
        this.currentCount = 0;

        this.initialize = function(initializeCallback) {
            initializeCallback(null);
        };

        this.processMessage = function (messageText, doneWithMessage) {
            let self = this;
            console.log("Received message %s", messageText);
            self.currentCount += 1;
            doneWithMessage(null);
            if (self.currentCount === self.expectedCount) {

                // This is a hack to make sure we clean up the queue. We'll defer calling the
                // test done() method for 5 seconds
                setTimeout(function () {
                    self.finishCallback();
                }, 5 * 1000);
            }
        };
    }
}(module.exports));