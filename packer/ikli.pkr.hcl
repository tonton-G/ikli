packer {
  required_plugins {
    amazon = {
      version = ">= 1.3.1"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

variable "github_token" {
  type      = string
  sensitive = true
}

variable "subnet_id" {
  type = string
}

variable "security_group_id" {
  type = string
}

variable "instance_profile_name" {
  type = string
}

variable "region" {
  type    = string
  default = "ap-southeast-1"
}

source "amazon-ebs" "ikli" {
  region        = var.region
  instance_type = "t3.micro"
  ami_name      = "ikli-app-{{timestamp}}"

  source_ami_filter {
    filters = {
      name                = "al2023-ami-2023.*-x86_64"
      virtualization-type = "hvm"
      root-device-type    = "ebs"
    }
    owners      = ["amazon"]
    most_recent = true
  }

  subnet_id                   = var.subnet_id
  associate_public_ip_address = true
  security_group_id           = var.security_group_id
  iam_instance_profile        = var.instance_profile_name

  communicator  = "ssh"
  ssh_username  = "ec2-user"
  ssh_interface = "session_manager"

  tags = {
    Name = "ikli-app-ami"
  }
}

build {
  sources = ["source.amazon-ebs.ikli"]

  provisioner "shell" {
    inline = [
      "sudo dnf update -y",
      "sudo dnf install -y nodejs20 nodejs20-npm git",
      "node -v && npm -v",
    ]
  }

  provisioner "shell" {
    inline = [
      "git clone https://${var.github_token}@github.com/tonton-G/ikli.git /tmp/ikli",
      "rm -rf /tmp/ikli/.git",
      "cd /tmp/ikli && npm install",
      "cd /tmp/ikli && npm run build",
      "sudo mkdir -p /opt/ikli",
      "sudo cp -r /tmp/ikli/. /opt/ikli/",
      "sudo chown -R ec2-user:ec2-user /opt/ikli",
    ]
  }

  provisioner "file" {
    content     = <<-EOF
      [Unit]
      Description=ikli app
      After=network.target

      [Service]
      Environment=DYNAMODB_TABLE=ikli-links
      Environment=AWS_REGION=ap-southeast-1
      Environment=PORT=3000
      WorkingDirectory=/opt/ikli
      ExecStart=/usr/bin/node /opt/ikli/server/dist/index.js
      Restart=always
      User=ec2-user

      [Install]
      WantedBy=multi-user.target
    EOF
    destination = "/tmp/ikli.service"
  }

  provisioner "shell" {
    inline = [
      "sudo mv /tmp/ikli.service /etc/systemd/system/ikli.service",
      "sudo systemctl daemon-reload",
      "sudo systemctl enable ikli.service",
    ]
  }
}