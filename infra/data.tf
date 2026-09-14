data "aws_caller_identity" "current" {}

data "aws_route53_zone" "main" {
  name         = "ikli.fyi"
  private_zone = false
}