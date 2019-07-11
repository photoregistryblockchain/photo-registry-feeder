"use strict";

const chai = require('chai'),
    expect = chai.expect,
    should = chai.should();
const config = require('config');

const log4js = require('log4js');
const logConfig = config.get('logging');
log4js.configure(logConfig);
const logger = log4js.getLogger();

describe("messageProcessorFactory", function() {

    let factory = require('../MessageProcessors/messageProcessorFactory');
    let countingProcessor = require('../MessageProcessors/countingMessageProcessor');
    let photoRegistryProcessor = require('../MessageProcessors/photoRegistryMessageProcessor');

    it ("should create all the different message processor factories we know about", function(done) {
        let processor = factory.createProcessor("counting", config, logger);
        expect(processor instanceof countingProcessor).to.equal(true);
        processor = factory.createProcessor("photoRegistry", config, logger);
        expect(processor instanceof photoRegistryProcessor).to.equal(true);
        done();
    });
});
