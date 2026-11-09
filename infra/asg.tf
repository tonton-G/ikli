resource "aws_autoscaling_group" "app" {
  name                = "${local.name}-app-asg"
  min_size            = var.asg_capacity.min
  max_size            = var.asg_capacity.max
  desired_capacity    = var.asg_capacity.desired
  vpc_zone_identifier = values(module.network.private_subnet_ids)

  health_check_type         = "ELB"
  health_check_grace_period = 300

  target_group_arns = [aws_lb_target_group.app.arn]

  capacity_rebalance = true

  enabled_metrics     = ["GroupInServiceInstances", "GroupDesiredCapacity"]
  metrics_granularity = "1Minute"

  mixed_instances_policy {
    launch_template {
      launch_template_specification {
        launch_template_id = aws_launch_template.app.id
        version            = "$Latest"
      }

      # dynamic block: generates one nested `override` block per element.
      # The iterator is named after the block, so override.value is the
      # current instance type.
      dynamic "override" {
        for_each = var.instance_types
        content {
          instance_type = override.value
        }
      }
    }

    # 1 On-Demand instance always on
    instances_distribution {
      on_demand_base_capacity                  = 1
      on_demand_percentage_above_base_capacity = 0
      spot_allocation_strategy                 = "price-capacity-optimized"
    }
  }

  tag {
    key                 = "Name"
    value               = "${local.name}-app"
    propagate_at_launch = true
  }
}

resource "aws_autoscaling_policy" "app_cpu" {
  name                   = "${local.name}-app-cpu-target-tracking"
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = 50
  }
}
