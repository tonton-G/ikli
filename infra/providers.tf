provider "aws" {
  region = "ap-southeast-1"

  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Project   = "ikli"
      ManagedBy = "terraform"
    }
  }
}