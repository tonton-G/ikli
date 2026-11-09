# moved blocks record a change of resource address so Terraform updates
# state instead of destroying the old object and creating a new one. They
# are the declarative, reviewable replacement for `terraform state mv`:
# the move shows in `terraform plan` ("has moved to") and runs on apply.
#
# ---------- Renamed in place ----------

moved {
  from = aws_lb.alb
  to   = aws_lb.main
}

# ---------- Moved into module "network" ----------
# Moving a resource that uses for_each moves every instance with its key,
# so aws_subnet.public["a"] becomes module.network.aws_subnet.public["a"].

moved {
  from = aws_vpc.main
  to   = module.network.aws_vpc.main
}

moved {
  from = aws_internet_gateway.main
  to   = module.network.aws_internet_gateway.main
}

moved {
  from = aws_subnet.public
  to   = module.network.aws_subnet.public
}

moved {
  from = aws_subnet.private
  to   = module.network.aws_subnet.private
}

moved {
  from = aws_route_table.public
  to   = module.network.aws_route_table.public
}

moved {
  from = aws_route_table.private
  to   = module.network.aws_route_table.private
}

moved {
  from = aws_route_table_association.public
  to   = module.network.aws_route_table_association.public
}

moved {
  from = aws_route_table_association.private
  to   = module.network.aws_route_table_association.private
}

moved {
  from = aws_vpc_endpoint.dynamodb
  to   = module.network.aws_vpc_endpoint.dynamodb
}

moved {
  from = aws_security_group.alb
  to   = module.network.aws_security_group.alb
}

moved {
  from = aws_security_group.app
  to   = module.network.aws_security_group.app
}

moved {
  from = aws_vpc_security_group_ingress_rule.alb_https_from_cloudfront
  to   = module.network.aws_vpc_security_group_ingress_rule.alb_https_from_cloudfront
}

moved {
  from = aws_vpc_security_group_egress_rule.alb_to_app
  to   = module.network.aws_vpc_security_group_egress_rule.alb_to_app
}

moved {
  from = aws_vpc_security_group_ingress_rule.app_from_alb
  to   = module.network.aws_vpc_security_group_ingress_rule.app_from_alb
}

moved {
  from = aws_vpc_security_group_egress_rule.app_to_dynamodb
  to   = module.network.aws_vpc_security_group_egress_rule.app_to_dynamodb
}

# ---------- Moved into the module AND given count ----------
# These became optional (count = 0 or 1), so the destination is instance
# [0]. With enable_ssm_endpoints = false, [0] is not in the configuration
# and Terraform plans the moved object for destruction — the intended
# result of turning the feature off.

moved {
  from = aws_security_group.endpoints
  to   = module.network.aws_security_group.endpoints[0]
}

moved {
  from = aws_vpc_security_group_egress_rule.app_to_endpoints
  to   = module.network.aws_vpc_security_group_egress_rule.app_to_endpoints[0]
}

moved {
  from = aws_vpc_security_group_ingress_rule.endpoints_from_app
  to   = module.network.aws_vpc_security_group_ingress_rule.endpoints_from_app[0]
}
