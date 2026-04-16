import os
import io
import boto3
from botocore.exceptions import ClientError


def get_s3_client():
    return boto3.client(
        "s3",
        region_name=os.environ["AWS_REGION"],
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    )


def download_image_bytes(s3_key: str, bucket: str | None = None) -> bytes:
    """Download an image from S3 and return its raw bytes."""
    client = get_s3_client()
    bucket = bucket or os.environ["AWS_S3_BUCKET_NAME"]
    try:
        response = client.get_object(Bucket=bucket, Key=s3_key)
        return response["Body"].read()
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code == "NoSuchKey":
            raise FileNotFoundError(f"S3 key not found: {s3_key}") from e
        raise


def upload_image_bytes(
    data: bytes,
    s3_key: str,
    content_type: str = "image/jpeg",
    bucket: str | None = None,
) -> None:
    """Upload raw bytes to S3 without writing to disk."""
    client = get_s3_client()
    bucket = bucket or os.environ["AWS_S3_BUCKET_NAME"]
    client.put_object(
        Bucket=bucket,
        Key=s3_key,
        Body=data,
        ContentType=content_type,
    )


def download_image_to_buffer(s3_key: str, bucket: str | None = None) -> io.BytesIO:
    """Download an image from S3 into an in-memory buffer."""
    data = download_image_bytes(s3_key, bucket=bucket)
    buf = io.BytesIO(data)
    buf.seek(0)
    return buf
