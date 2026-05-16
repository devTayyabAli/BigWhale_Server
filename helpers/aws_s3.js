const { S3Client } = require('@aws-sdk/client-s3');

const config = {
  region: process.env.AWS_S3_BUCKET_REGION,
  credentials: {
    accessKeyId: process.env.AWS_S3_BUCKET_ACCESS_KEY,
    secretAccessKey: process.env.AWS_S3_BUCKET_SECRET_ACCESS_KEY,
  },
};
const s3 = new S3Client(config);

module.exports = s3;
