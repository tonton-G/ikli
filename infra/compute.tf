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

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "ikli-app" }
  }

  tag_specifications {
    resource_type = "volume"
    tags          = { Name = "ikli-app" }
  }


}