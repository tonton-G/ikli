data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app" {
  name               = "ikli-app-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json

  tags = {
    Name = "ikli-app-role"
  }
}

data "aws_iam_policy_document" "app_dynamodb" {
  statement {
    effect = "Allow"

    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
    ]

    resources = [aws_dynamodb_table.links.arn]
  }
}

resource "aws_iam_role_policy" "app_dynamodb" {
  name   = "ikli-app-dynamodb"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.app_dynamodb.json
}

resource "aws_iam_instance_profile" "app" {
  name = "ikli-app-profile"
  role = aws_iam_role.app.name

  tags = {
    Name = "ikli-app-profile"
  }
}