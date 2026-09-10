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

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Project   = "ikli"
      ManagedBy = "terraform"
    }
  }
}