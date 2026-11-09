# Security groups — ALB, app instances, VPC interface endpoints

data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_security_group" "alb" {
  name        = "${var.name}-alb-sg"
  description = "ALB: accepts client traffic, forwards to instances"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${var.name}-alb-sg"
  }
}

resource "aws_security_group" "app" {
  name        = "${var.name}-app-sg"
  description = "App instances: accept only from the ALB"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${var.name}-app-sg"
  }
}

# count as an on/off switch: 0 or 1 instances. Unlike the for_each on the
# endpoints, a single optional object reads most naturally with count, and
# is referenced by index: aws_security_group.endpoints[0].
resource "aws_security_group" "endpoints" {
  count = var.enable_ssm_endpoints ? 1 : 0

  name        = "${var.name}-endpoints-sg"
  description = "VPC interface endpoints: accept HTTPS from app instances"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${var.name}-endpoints-sg"
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_https_from_cloudfront" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTPS from cloudfront"

  prefix_list_id = data.aws_ec2_managed_prefix_list.cloudfront.id
  from_port      = 443
  to_port        = 443
  ip_protocol    = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "alb_to_app" {
  security_group_id = aws_security_group.alb.id
  description       = "Forward to app instances"

  referenced_security_group_id = aws_security_group.app.id
  from_port                    = var.app_port
  to_port                      = var.app_port
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "app_from_alb" {
  security_group_id = aws_security_group.app.id
  description       = "App port from the ALB only"

  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = var.app_port
  to_port                      = var.app_port
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "app_to_endpoints" {
  count = var.enable_ssm_endpoints ? 1 : 0

  security_group_id = aws_security_group.app.id
  description       = "HTTPS to interface endpoints for SSM"

  referenced_security_group_id = aws_security_group.endpoints[0].id
  from_port                    = 443
  to_port                      = 443
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "endpoints_from_app" {
  count = var.enable_ssm_endpoints ? 1 : 0

  security_group_id = aws_security_group.endpoints[0].id
  description       = "HTTPS from app instances"

  referenced_security_group_id = aws_security_group.app.id
  from_port                    = 443
  to_port                      = 443
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "app_to_dynamodb" {
  security_group_id = aws_security_group.app.id
  description       = "HTTPS to DynamoDB via gateway endpoint"

  prefix_list_id = aws_vpc_endpoint.dynamodb.prefix_list_id
  from_port      = 443
  to_port        = 443
  ip_protocol    = "tcp"
}
