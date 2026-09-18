resource "aws_lb" "alb" {
  name               = "ikli-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [aws_subnet.public["a"].id, aws_subnet.public["b"].id]
}

resource "aws_lb_target_group" "app" {
  name        = "ikli-app-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_subnet.public["a"].vpc_id
  target_type = "instance"

  health_check {
    path                = "/api/health"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }
}