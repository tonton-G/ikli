variable "aws_account_id" {
  description = "AWS account these bootstrap resources are created in"
  type        = string
}

variable "github_repo" {
  description = "GitHub repo allowed to assume the CI roles, as owner/repo"
  type        = string
  default     = "tonton-G/ikli"
}