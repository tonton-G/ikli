output "account_id" {
  description = "AWS account ID resolved from current credentials"
  value       = data.aws_caller_identity.current.account_id
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
  description = "ARN of the ALB-facing ACM certificate (ap-southeast-1)"
  value       = aws_acm_certificate.alb.arn
}