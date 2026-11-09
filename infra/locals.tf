locals {
  name     = "ikli"
  domain   = "ikli.fyi"
  app_port = 3000 # baked into the AMI's systemd unit by Packer

  common_tags = {
    Project   = local.name
    ManagedBy = "terraform"
  }
}
