(function () {
    "use strict";

    var AWS = require('aws-sdk');
    var https = require('https');

    var getAWSClients = {
        getSNSClient: function (snsConfig) {
            var clientConfig = this.buildClientConfig(snsConfig);
            return new AWS.SNS(clientConfig);
        },

        getSQSClient: function (sqsConfig) {
            var clientConfig = this.buildClientConfig(sqsConfig);
            return new AWS.SQS(clientConfig);
        },

        getS3Client: function(s3Config) {
            var clientConfig = this.buildClientConfig(s3Config);
            return new AWS.S3(clientConfig);
        },

        getDynamoDbClient: function(dynamoConfig) {
            var clientConfig = this.buildClientConfig(dynamoConfig);
            return new AWS.DynamoDB(clientConfig);
        },

        getDynamoDbDocumentClient: function (dynamoConfig) {
            var clientConfig = this.buildClientConfig(dynamoConfig);

            // workaround for EPROTO errors:
            // https://github.com/aws/aws-sdk-js/issues/862
            clientConfig.httpOptions = {
                agent: new https.Agent(
                    {
                        secureProtocol: "TLSv1_method",
                        ciphers: "ALL"
                    }
                )
            };
            return new AWS.DynamoDB.DocumentClient(clientConfig);
        },

        getKinesisClient: function(kinesisConfig) {
            var clientConfig = this.buildClientConfig(kinesisConfig);
            return new AWS.Kinesis(clientConfig);
        },

        buildClientConfig: function (inputConfig) {
            var credentials;
            if (inputConfig.hasOwnProperty("accessKey")) {
                credentials = new AWS.Credentials(inputConfig.accessKey, inputConfig.secretKey);
            }
            else if (inputConfig.hasOwnProperty("profile")) {
                credentials = new AWS.SharedIniFileCredentials({profile: inputConfig.profile});
            }
            var clientConfig = {};
            clientConfig.region = inputConfig.region;
            if (credentials) {
                clientConfig.credentials = credentials;
            }
            return clientConfig;
        }
    };

    module.exports = getAWSClients;
})(module.exports);
