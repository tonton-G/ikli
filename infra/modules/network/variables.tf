# Module inputs. Validation of the network shape lives on the root
# variables, where a bad value is caught before this module is evaluated.

variable "name" {
  description = "Prefix for resource names and Name tags"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
}

variable "public_subnets" {
  description = "Public subnets keyed by short name; each subnet's CIDR is cidrsubnet(vpc_cidr, 8, netnum)"
  type        = map(object({ az = string, netnum = number }))
}

variable "private_subnets" {
  description = "Private subnets keyed by short name; each subnet's CIDR is cidrsubnet(vpc_cidr, 8, netnum)"
  type        = map(object({ az = string, netnum = number }))
}

variable "app_port" {
  description = "Port the app instances listen on, opened from the ALB only"
  type        = number
}

variable "enable_ssm_endpoints" {
  description = "Create the SSM interface endpoints (billed hourly per AZ) so Session Manager can reach private instances"
  type        = bool
}
