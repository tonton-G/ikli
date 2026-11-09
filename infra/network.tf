module "network" {
  source = "./modules/network"

  name                 = local.name
  vpc_cidr             = var.vpc_cidr
  public_subnets       = var.public_subnets
  private_subnets      = var.private_subnets
  app_port             = local.app_port
  enable_ssm_endpoints = var.enable_ssm_endpoints
}
