variable "aws_account_id" {
  description = "AWS account ID this configuration is allowed to target"
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be exactly 12 digits."
  }
}

variable "aws_region" {
  description = "Region for everything except the CloudFront certificate"
  type        = string
  default     = "ap-southeast-1"
}

variable "app_ami_id" {
  description = "AMI ID for ikli app instances, baked by packer"
  type        = string

  validation {
    condition     = can(regex("^ami-[0-9a-f]{8,17}$", var.app_ami_id))
    error_message = "app_ami_id must look like ami-0123456789abcdef0."
  }
}

# ---------- Network ----------

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"

  # can() turns an error into false: cidrhost() fails on anything that
  # isn't a valid CIDR, so this rejects typos like "10.0.0.0/33".
  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "vpc_cidr must be a valid IPv4 CIDR block."
  }
}

# Availability zones are listed explicitly rather than derived from
# data.aws_availability_zones: the CIDR-to-AZ mapping is a design decision,
# and deriving it from list order would let it shift silently.
variable "public_subnets" {
  description = "Public subnets keyed by short name; CIDR is cidrsubnet(vpc_cidr, 8, netnum)"
  type        = map(object({ az = string, netnum = number }))
  default = {
    a = { az = "ap-southeast-1a", netnum = 0 }
    b = { az = "ap-southeast-1b", netnum = 1 }
  }

  validation {
    condition     = alltrue([for s in values(var.public_subnets) : s.netnum >= 0 && s.netnum <= 9])
    error_message = "Public subnet netnums must be 0-9 (the public tier)."
  }

  validation {
    condition     = alltrue([for s in values(var.public_subnets) : startswith(s.az, var.aws_region)])
    error_message = "Every public subnet AZ must be in aws_region."
  }
}

variable "private_subnets" {
  description = "Private subnets keyed by short name; CIDR is cidrsubnet(vpc_cidr, 8, netnum)"
  type        = map(object({ az = string, netnum = number }))
  default = {
    a = { az = "ap-southeast-1a", netnum = 10 }
    b = { az = "ap-southeast-1b", netnum = 11 }
  }

  validation {
    condition     = alltrue([for s in values(var.private_subnets) : s.netnum >= 10 && s.netnum <= 19])
    error_message = "Private subnet netnums must be 10-19 (the private tier)."
  }

  validation {
    condition     = alltrue([for s in values(var.private_subnets) : startswith(s.az, var.aws_region)])
    error_message = "Every private subnet AZ must be in aws_region."
  }
}

variable "enable_ssm_endpoints" {
  description = "Create SSM interface endpoints so Session Manager reaches private instances (billed hourly per AZ)"
  type        = bool
  default     = false
}

# ---------- Compute ----------

variable "instance_types" {
  description = "Instance types the ASG may launch, in priority order; more types give Spot more pools to draw from"
  type        = list(string)
  default     = ["t3.micro", "t3.small", "t3a.micro", "t3a.small"]

  validation {
    condition     = length(var.instance_types) > 0
    error_message = "instance_types needs at least one entry."
  }
}

variable "asg_capacity" {
  description = "Auto Scaling group size"
  type = object({
    min     = number
    max     = number
    desired = number
  })
  default = {
    min     = 2
    max     = 4
    desired = 2
  }

  validation {
    condition     = var.asg_capacity.min <= var.asg_capacity.desired && var.asg_capacity.desired <= var.asg_capacity.max
    error_message = "asg_capacity must satisfy min <= desired <= max."
  }

  validation {
    condition     = var.asg_capacity.min >= 1
    error_message = "asg_capacity.min must be at least 1 to keep the On-Demand base instance."
  }
}
