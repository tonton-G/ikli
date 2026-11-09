resource "aws_security_group" "packer_build" {
  name        = "${local.name}-packer-build-sg"
  description = "Temporary packer build instance, outbound only (ssm communicator)"
  vpc_id      = module.network.vpc_id

  tags = {
    Name = "${local.name}-packer-build-sg"
  }
}

resource "aws_vpc_security_group_egress_rule" "packer_build_all" {
  security_group_id = aws_security_group.packer_build.id
  description       = "all outbound: package install, git clone, SSM"

  cidr_ipv4   = "0.0.0.0/0"
  ip_protocol = "-1"

}