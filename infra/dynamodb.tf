
resource "aws_dynamodb_table" "links" {
  name         = "ikli-links"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "slug"

  attribute {
    name = "slug"
    type = "S"
  }

  # all time. Link records never set the attribute and are never expired.
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = false
  }
  deletion_protection_enabled = false

  tags = {
    Name = "ikli-links"
  }
}
