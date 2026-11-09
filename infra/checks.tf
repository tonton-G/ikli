# A check block validates the deployed infrastructure as a whole, on every
# plan and apply. Unlike validation and pre/postconditions, a failing check
# only warns — it never blocks. Its scoped data source exists only inside
# the check, and an error reading it (e.g. the site is down)
# reported as a warning rather than failing the run.
check "site_health" {
  data "http" "health" {
    url = "https://${local.domain}/api/health"
  }

  assert {
    condition     = data.http.health.status_code == 200
    error_message = "https://${local.domain}/api/health returned ${data.http.health.status_code}, expected 200."
  }
}
