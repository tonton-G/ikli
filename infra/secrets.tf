resource "random_password" "cf_origin_secret" {
  length  = 32
  special = false
}

resource "aws_ssm_parameter" "cf_origin_secret" {
  name  = "/ikli/cloudfront-origin-secret"
  type  = "SecureString"
  value = random_password.cf_origin_secret.result
}