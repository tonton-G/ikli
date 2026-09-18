resource "aws_launch_template" "app" {
  name                   = "ikli-app-lt"
  update_default_version = true


  image_id = var.app_ami_id

  iam_instance_profile {
    name = "ikli-app-profile"
  }

  network_interfaces {
    associate_public_ip_address = false
    security_groups             = [aws_security_group.app.id]
  }

  user_data = base64encode(<<-EOF
    #!/bin/bash
    mkdir -p /etc/systemd/system/ikli.service.d
    cat > /etc/systemd/system/ikli.service.d/override.conf <<'OVERRIDE'
    [Service]
    Environment=NODE_ENV=production
    Environment=TRUST_PROXY_HOPS=2
    Environment=BASE_URL=https://ikli.fyi
    OVERRIDE
    systemctl daemon-reload
    systemctl restart ikli.service
  EOF
  )




  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "ikli-app" }
  }

  tag_specifications {
    resource_type = "volume"
    tags          = { Name = "ikli-app" }
  }


}