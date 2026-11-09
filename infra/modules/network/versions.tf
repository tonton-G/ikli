# A child module declares which providers it needs but never configures
# them: it inherits the root module's default `aws` provider.
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}
