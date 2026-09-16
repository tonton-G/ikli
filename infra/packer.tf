resource "aws_security_group" "packer_build" {
  name        = "ikli-packer-build-sg"
  description = "Temporary packer build instance, outbound only (ssm communicator)"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "ikli-packer-build-sg"
  }
}

resource "aws_vpc_security_group_egress_rule" "packer_build_all" {
  security_group_id = aws_security_group.packer_build.id
  description       = "all outboud, package install,git clone, SSM"

  cidr_ipv4   = "0.0.0.0/0"
  ip_protocol = "-1"

}