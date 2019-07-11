var chai = require('chai'),
    expect = chai.expect,
    should = chai.should();

var config = require('config');

var getAWSClients = require('../getAWSClients');

describe("getAWSClients", function () {

    describe("SQS client", function () {
        it("should create an sqs client and list all queues", function (done) {
            var sqsClient = getAWSClients.getSQSClient(config.get("sqs"));
            sqsClient.listQueues({}, function (err, data) {
                should.not.exist(err);
                expect(data.QueueUrls.length).to.be.above(0);
                done();
            });
        });
    });

    describe("SNS client", function () {
        it("should create an sns client and list all topics", function (done) {
            var snsClient = getAWSClients.getSNSClient(config.get("sns"));
            snsClient.listTopics({}, function (err, data) {
                should.not.exist(err);
                expect(data.Topics.length).to.be.above(0);
                done();
            });
        });
    });

    describe("S3 client", function () {
        it("should create an S3 client and list all buckets", function (done) {
            var s3Client = getAWSClients.getS3Client(config.get("s3"));
            s3Client.listBuckets({}, function (err, data) {
                should.not.exist(err);
                expect(data.Buckets.length).to.be.above(0);
                done();
            });
        });
    });

    describe("Dynamo Db client", function () {
        it("should create a dynamo db client and list all tables", function (done) {
            var dynamoClient = getAWSClients.getDynamoDbClient(config.get("dynamo"));
            dynamoClient.listTables({}, function (err, data) {
                should.not.exist(err);
                expect(data.TableNames.length).to.be.above(0);
                done();
            });
        });
    });

    // Can't really test Document client as it is only used to interact with an existing table
    describe.skip("Dynamo Db Document client", function () {
        it("should create a dynamo db client and list all tables", function (done) {
            var dynamoDocumentClient = getAWSClients.getDynamoDbDocumentClient(config.get("dynamo"));
            dynamoDocumentClient.listTables({}, function (err, data) {
                should.not.exist(err);
                expect(data.TableNames.length).to.be.above(0);
                done();
            });
        });
    });

    describe("Kinesis client", function () {
        it("should create a Kinesis stream client and list streams", function (done) {
            var kinesisClient = getAWSClients.getKinesisClient(config.get("kinesis"));
            kinesisClient.listStreams({}, function (err, data) {
                should.not.exist(err);
                should.exist(data.StreamNames);
                done();
            });
        });
    });
});
