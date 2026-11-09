provider "aws" {
  region = var.aws_region

  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = local.common_tags
  }
}

# Provider alias: a second configuration of the same provider. Resources
# opt in with `provider = aws.us_east_1`. CloudFront only reads ACM
# certificates from us-east-1, so this region is fixed, not a variable.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = local.common_tags
  }
}
