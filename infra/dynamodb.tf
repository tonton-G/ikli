resource "aws_dynamodb_table" "links" {
  name         = "${local.name}-links"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "slug"

  attribute {
    name = "slug"
    type = "S"
  }

  # Visitor markers (v# keys) set expiresAt, so "unique visitors" counts
  # within a rolling window rather than all time. Link records never set
  # the attribute and are never expired.
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = false
  }
  deletion_protection_enabled = false

  tags = {
    Name = "${local.name}-links"
  }
}
