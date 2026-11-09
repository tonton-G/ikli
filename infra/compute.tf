data "aws_ami" "app" {
  owners = ["self"]

  filter {
    name   = "image-id"
    values = [var.app_ami_id]
  }

  lifecycle {
    postcondition {
      condition     = self.architecture == "x86_64"
      error_message = "app_ami_id must be an x86_64 AMI: every type in instance_types is x86."
    }

    postcondition {
      condition     = self.state == "available"
      error_message = "app_ami_id is not in the available state."
    }
  }
}

resource "aws_launch_template" "app" {
  name                   = "${local.name}-app-lt"
  update_default_version = true

  image_id = data.aws_ami.app.id

  # Referencing the resource (not typing its name) creates an implicit
  # dependency, so Terraform creates the instance profile first.
  iam_instance_profile {
    name = aws_iam_instance_profile.app.name
  }

  network_interfaces {
    associate_public_ip_address = false
    security_groups             = [module.network.app_security_group_id]
  }

  user_data = base64encode(<<-EOF
    #!/bin/bash
    mkdir -p /etc/systemd/system/ikli.service.d
    cat > /etc/systemd/system/ikli.service.d/override.conf <<'OVERRIDE'
    [Service]
    Environment=NODE_ENV=production
    Environment=TRUST_PROXY_HOPS=2
    Environment=BASE_URL=https://${local.domain}
    Environment=AWS_REGION=${var.aws_region}
    Environment=DYNAMODB_TABLE=${aws_dynamodb_table.links.name}
    OVERRIDE
    systemctl daemon-reload
    systemctl restart ikli.service
  EOF
  )

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${local.name}-app" }
  }

  tag_specifications {
    resource_type = "volume"
    tags          = { Name = "${local.name}-app" }
  }
}
