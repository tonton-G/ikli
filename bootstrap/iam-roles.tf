data "aws_iam_policy_document" "plan_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:pull_request"]
    }
  }
}

resource "aws_iam_role" "gha_plan" {
  name               = "gha-ikli-plan"
  assume_role_policy = data.aws_iam_policy_document.plan_trust.json
}

resource "aws_iam_role_policy_attachment" "gha_plan_readonly" {
  role       = aws_iam_role.gha_plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

data "aws_iam_policy_document" "apply_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:environment:production"]
    }
  }
}

resource "aws_iam_role" "gha_apply" {
  name               = "gha-ikli-apply"
  assume_role_policy = data.aws_iam_policy_document.apply_trust.json
}

resource "aws_iam_role_policy_attachment" "gha_apply_ec2" {
  role       = aws_iam_role.gha_apply.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2FullAccess" # VPC, subnets, SGs, launch templates, VPC endpoints
}

resource "aws_iam_role_policy_attachment" "gha_apply_asg" {
  role       = aws_iam_role.gha_apply.name
  policy_arn = "arn:aws:iam::aws:policy/AutoScalingFullAccess"
}

resource "aws_iam_role_policy_attachment" "gha_apply_elb" {
  role       = aws_iam_role.gha_apply.name
  policy_arn = "arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess"
}

resource "aws_iam_role_policy_attachment" "gha_apply_acm" {
  role       = aws_iam_role.gha_apply.name
  policy_arn = "arn:aws:iam::aws:policy/AWSCertificateManagerFullAccess"
}

resource "aws_iam_role_policy_attachment" "gha_apply_cloudfront" {
  role       = aws_iam_role.gha_apply.name
  policy_arn = "arn:aws:iam::aws:policy/CloudFrontFullAccess"
}

resource "aws_iam_role_policy_attachment" "gha_apply_s3" {
  role       = aws_iam_role.gha_apply.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3FullAccess" # 
}

resource "aws_iam_role_policy_attachment" "gha_apply_dynamodb" {
  role       = aws_iam_role.gha_apply.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
}

resource "aws_iam_role_policy_attachment" "gha_apply_route53" {
  role       = aws_iam_role.gha_apply.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonRoute53FullAccess"
}

resource "aws_iam_role_policy_attachment" "gha_apply_cloudwatch" {
  role       = aws_iam_role.gha_apply.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchFullAccess" # alarms + dashboard
}

data "aws_iam_policy_document" "apply_ssm_parameter" {
  statement {
    sid    = "OriginSecretParameter"
    effect = "Allow"
    actions = [
      "ssm:PutParameter",
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:DeleteParameter",
      "ssm:AddTagsToResource",
      "ssm:ListTagsForResource",
      "ssm:RemoveTagsFromResource",
    ]
    resources = ["arn:aws:ssm:ap-southeast-1:${var.aws_account_id}:parameter/ikli/*"]
  }
}

resource "aws_iam_role_policy" "gha_apply_ssm_parameter" {
  name   = "ikli-ssm-parameter"
  role   = aws_iam_role.gha_apply.id
  policy = data.aws_iam_policy_document.apply_ssm_parameter.json
}

data "aws_iam_policy_document" "apply_service_linked_roles" {
  statement {
    sid       = "ServiceLinkedRoles"
    effect    = "Allow"
    actions   = ["iam:CreateServiceLinkedRole", "iam:DeleteServiceLinkedRole"]
    resources = ["arn:aws:iam::${var.aws_account_id}:role/aws-service-role/*"]

    condition {
      test     = "StringEquals"
      variable = "iam:AWSServiceName"
      values = [
        "autoscaling.amazonaws.com",
        "elasticloadbalancing.amazonaws.com",
      ]
    }
  }
}

resource "aws_iam_role_policy" "gha_apply_service_linked_roles" {
  name   = "ikli-service-linked-roles"
  role   = aws_iam_role.gha_apply.id
  policy = data.aws_iam_policy_document.apply_service_linked_roles.json
}
data "aws_iam_policy_document" "apply_iam_carveout" {
  statement {
    sid     = "AppRoleManagement"
    effect  = "Allow"
    actions = ["iam:*"]
    resources = [
      "arn:aws:iam::${var.aws_account_id}:role/ikli-app*",
      "arn:aws:iam::${var.aws_account_id}:instance-profile/ikli-app*",
    ]
  }

  statement {
    sid       = "PassAppRole"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${var.aws_account_id}:role/ikli-app-role"]
  }
}

resource "aws_iam_role_policy" "gha_apply_iam_carveout" {
  name   = "ikli-app-iam-carveout"
  role   = aws_iam_role.gha_apply.id
  policy = data.aws_iam_policy_document.apply_iam_carveout.json
}