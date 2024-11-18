#!/bin/sh
set -eu
attempt=0
until aws --endpoint-url "$S3_ENDPOINT" --cli-connect-timeout 2 --cli-read-timeout 2 s3api list-buckets >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "S3 endpoint did not become ready" >&2
    exit 1
  fi
  sleep 2
done
if ! aws --endpoint-url "$S3_ENDPOINT" s3api head-bucket --bucket "$S3_PRIVATE_BUCKET" >/dev/null 2>&1; then
  aws --endpoint-url "$S3_ENDPOINT" s3api create-bucket --bucket "$S3_PRIVATE_BUCKET"
fi
aws --endpoint-url "$S3_ENDPOINT" s3api put-bucket-ownership-controls --bucket "$S3_PRIVATE_BUCKET" --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerPreferred}]'
aws --endpoint-url "$S3_ENDPOINT" s3api put-bucket-acl --bucket "$S3_PRIVATE_BUCKET" --acl private
aws --endpoint-url "$S3_ENDPOINT" s3api put-bucket-cors --bucket "$S3_PRIVATE_BUCKET" --cors-configuration file:///init/cors.json
aws --endpoint-url "$S3_ENDPOINT" s3api head-bucket --bucket "$S3_PRIVATE_BUCKET"
