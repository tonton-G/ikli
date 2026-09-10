variable "aws_account_id" {
  description = "AWS account ID this configuration is allowed to target"
  type        = string
}
variable "my_ip_cidr" {
  description = "Workstation IP as a /32, for ALB access during the build"
  type        = string
}