output "account_id" {
  description = "AWS account ID resolved from current credentials"
  value       = data.aws_caller_identity.current.account_id
}

output "links_table_name" {
  description = "DynamoDB table backing the link store; set as DYNAMODB_TABLE on instances"
  value       = aws_dynamodb_table.links.name
}
