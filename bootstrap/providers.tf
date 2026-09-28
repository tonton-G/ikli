terraform {
  required_version = ">=1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

}

provider "aws" {
  region              = "ap-southeast-1"
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Project   = "ikli"
      ManagedBy = "terraform-bootstrap"
    }
  }
}

