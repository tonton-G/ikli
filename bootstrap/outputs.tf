output "gha_plan_role_arn" {
  description = "Set as the AWS_ROLE_PLAN repo variable in GitHub Actions"
  value       = aws_iam_role.gha_plan.arn
}

output "gha_apply_role_arn" {
  description = "Set as the AWS_ROLE_APPLY repo variable in Github Actions"
  value       = aws_iam_role.gha_apply.arn
}

output "state_bucket_name" {
  description = "Set as the bucket in infra/bucket.tf"
  value       = aws_s3_bucket.terraform_state.id
}