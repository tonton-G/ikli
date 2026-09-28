variable "aws_account_id" {
  description = "AWS account these bootstrap resources are created in"
  type        = string
}

variable "github_repo" {
  description = "GitHub repo allowed to assume the CI roles, as owner@owner_id/repo@repo_id (GitHub's immutable OIDC sub format)"
  type        = string
  default     = "tonton-G@83625612/ikli@1359646642"
}