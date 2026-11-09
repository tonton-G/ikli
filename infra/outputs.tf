output "account_id" {
  description = "AWS account ID resolved from current credentials"
  value       = data.aws_caller_identity.current.account_id
  # sensitive hides the value in plan/apply output only. It is still stored
  # in plain text in state, which is why the state bucket is encrypted.
  sensitive = true
}

output "links_table_name" {
  description = "DynamoDB table backing the link store; set as DYNAMODB_TABLE on instances"
  value       = aws_dynamodb_table.links.name
}

output "acm_certificate_arn_cloudfront" {
  description = "ARN of the CloudFront-facing ACM certificate (us-east-1)"
  value       = aws_acm_certificate.cloudfront.arn
}

output "acm_certificate_arn_alb" {
  description = "ARN of the ALB-facing ACM certificate"
  value       = aws_acm_certificate.alb.arn
}

output "cloudfront_distribution_domain" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.main.domain_name
}

output "vpc_id" {
  description = "ID of the VPC, passed through from the network module"
  value       = module.network.vpc_id
}

output "app_instance_profile_name" {
  description = "IAM instance profile name used by packer and the ASG launch template"
  value       = aws_iam_instance_profile.app.name
}

output "packer_build_security_group_id" {
  description = "Security group for the packer build instance"
  value       = aws_security_group.packer_build.id
}

output "public_subnets_id" {
  description = "Public subnet used by packer build"
  value       = module.network.public_subnet_ids["a"]
}
