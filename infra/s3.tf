resource "aws_s3_bucket" "assets" {
  bucket        = "ikli-assets-${data.aws_caller_identity.current.account_id}"
  force_destroy = true

  tags = {
    Name = "ikli-assets"
  }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true

}