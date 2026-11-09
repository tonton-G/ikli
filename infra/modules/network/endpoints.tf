# The module has no provider block of its own, so this reads the region of
# the provider configuration it inherited from the root.
data "aws_region" "current" {}

resource "aws_vpc_endpoint" "dynamodb" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${data.aws_region.current.region}.dynamodb"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id]

  tags = {
    Name = "${var.name}-dynamodb-endpoint"
  }
}

# Conditional for_each: a bool picks between the full set and an empty one,
# so the endpoints exist only when enabled. Each instance is addressed by
# service name, e.g. aws_vpc_endpoint.ssm["ssmmessages"].
resource "aws_vpc_endpoint" "ssm" {
  for_each = var.enable_ssm_endpoints ? toset(["ssm", "ssmmessages", "ec2messages"]) : toset([])

  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.region}.${each.key}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = values(aws_subnet.private)[*].id
  security_group_ids  = [aws_security_group.endpoints[0].id]
  private_dns_enabled = true

  tags = {
    Name = "${var.name}-${each.key}-endpoint"
  }
}
