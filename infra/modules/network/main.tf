resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${var.name}-vpc"
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.name}-igw"
  }
}

# Subnets. for_each over a map gives stable instance keys ("a", "b"), so
# adding or removing one subnet never renumbers the others — unlike count.
# cidrsubnet(vpc_cidr, 8, netnum) turns a /16 into the netnum-th /24.
resource "aws_subnet" "public" {
  for_each = var.public_subnets

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, each.value.netnum)
  availability_zone = each.value.az

  tags = {
    Name = "${var.name}-public-${each.value.az}"
    Tier = "public"
  }
}

resource "aws_subnet" "private" {
  for_each = var.private_subnets

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, each.value.netnum)
  availability_zone = each.value.az

  tags = {
    Name = "${var.name}-private-${each.value.az}"
    Tier = "private"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${var.name}-public-rt"
  }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  # No default route. Private subnets have no outbound internet path.
  # DynamoDB is reached via a VPC Gateway Endpoint

  tags = {
    Name = "${var.name}-private-rt"
  }
}

# for_each over another resource: one association per subnet instance,
# keyed the same way as the subnets.
resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public

  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  for_each = aws_subnet.private

  subnet_id      = each.value.id
  route_table_id = aws_route_table.private.id
}
