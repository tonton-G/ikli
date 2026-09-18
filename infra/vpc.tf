# VPC
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "ikli-vpc"
  }
}
# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "ikli-igw"
  }
}
# Subnets
locals {
  public_subnets = {
    a = { cidr = "10.0.0.0/24", az = "ap-southeast-1a" }
    b = { cidr = "10.0.1.0/24", az = "ap-southeast-1b" }
  }

  private_subnets = {
    a = { cidr = "10.0.10.0/24", az = "ap-southeast-1a" }
    b = { cidr = "10.0.11.0/24", az = "ap-southeast-1b" }
  }
}

resource "aws_subnet" "public" {
  for_each = local.public_subnets

  vpc_id            = aws_vpc.main.id
  cidr_block        = each.value.cidr
  availability_zone = each.value.az

  tags = {
    Name = "ikli-public-${each.value.az}"
    Tier = "public"
  }
}

resource "aws_subnet" "private" {
  for_each = local.private_subnets

  vpc_id            = aws_vpc.main.id
  cidr_block        = each.value.cidr
  availability_zone = each.value.az

  tags = {
    Name = "ikli-private-${each.value.az}"
    Tier = "private"
  }
}

# Route Tables
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "ikli-public-rt"
  }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  # No default route. Private subnets have no outbound internet path.
  # DynamoDB is reached via a VPC Gateway Endpoint

  tags = {
    Name = "ikli-private-rt"
  }
}

resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public

  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  for_each = aws_subnet.private

  subnet_id      = each.value.id
  route_table_id = aws_route_table.private.id
}



# Security Groups — ALB, app instances, VPC interface endpoints
resource "aws_security_group" "alb" {
  name        = "ikli-alb-sg"
  description = "ALB: accepts client traffic, forwards to instances"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "ikli-alb-sg"
  }
}

resource "aws_security_group" "app" {
  name        = "ikli-app-sg"
  description = "App instances: accept only from the ALB"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "ikli-app-sg"
  }
}

resource "aws_security_group" "endpoints" {
  name        = "ikli-endpoints-sg"
  description = "VPC interface endpoints: accept HTTPS from app instances"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "ikli-endpoints-sg"
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_from_me" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP from my workstation during the build"

  cidr_ipv4   = var.my_ip_cidr
  from_port   = 80
  to_port     = 80
  ip_protocol = "tcp"
}
resource "aws_vpc_security_group_ingress_rule" "alb_https_from_me" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTPS from my workstation during the build"

  cidr_ipv4   = var.my_ip_cidr
  from_port   = 443
  to_port     = 443
  ip_protocol = "tcp"
}


resource "aws_vpc_security_group_egress_rule" "alb_to_app" {
  security_group_id = aws_security_group.alb.id
  description       = "Forward to app instances"

  referenced_security_group_id = aws_security_group.app.id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "app_from_alb" {
  security_group_id = aws_security_group.app.id
  description       = "App port from the ALB only"

  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "app_to_endpoints" {
  security_group_id = aws_security_group.app.id
  description       = "HTTPS to interface endpoints for SSM"

  referenced_security_group_id = aws_security_group.endpoints.id
  from_port                    = 443
  to_port                      = 443
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "endpoints_from_app" {
  security_group_id = aws_security_group.endpoints.id
  description       = "HTTPS from app instances"

  referenced_security_group_id = aws_security_group.app.id
  from_port                    = 443
  to_port                      = 443
  ip_protocol                  = "tcp"
}
#endpoint to dynamodb

resource "aws_vpc_security_group_egress_rule" "app_to_dynamodb" {
  security_group_id = aws_security_group.app.id
  description       = "HTTPS to DynamoDB via gateway endpoint"

  prefix_list_id = aws_vpc_endpoint.dynamodb.prefix_list_id
  from_port      = 443
  to_port        = 443
  ip_protocol    = "tcp"
}

