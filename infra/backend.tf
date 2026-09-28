terraform {
  backend "s3" {
    bucket = "ikli-terraform-state-8f2a41c9"
    key          = "infra/terraform.tfstate"
    region       = "ap-southeast-1"
    use_lockfile = true
    encrypt      = true
  }
}