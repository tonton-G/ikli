output "account_id" {
  description = "AWS account ID resolved from current credentials"
  value       = data.aws_caller_identity.current.account_id
}