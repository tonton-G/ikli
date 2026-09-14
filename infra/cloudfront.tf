resource "aws_cloudfront_origin_access_control" "assets" {
  name                              = "ikli-assets-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}