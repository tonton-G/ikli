# A module's resources are private to it. Outputs are the only way the
# root module can read them, as module.network.<output>.

output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

# A for expression turns the subnet resources into a plain key => id map.
output "public_subnet_ids" {
  description = "Public subnet IDs keyed by subnet name"
  value       = { for k, s in aws_subnet.public : k => s.id }
}

output "private_subnet_ids" {
  description = "Private subnet IDs keyed by subnet name"
  value       = { for k, s in aws_subnet.private : k => s.id }
}

output "alb_security_group_id" {
  description = "Security group for the ALB"
  value       = aws_security_group.alb.id
}

output "app_security_group_id" {
  description = "Security group for the app instances"
  value       = aws_security_group.app.id
}
