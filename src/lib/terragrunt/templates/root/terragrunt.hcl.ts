const _terragruntHcl = `
# ROOT

# Terragrunt variables from parent files
locals {
  account_vars = read_terragrunt_config(find_in_parent_folders("account.hcl"))
  region_vars = read_terragrunt_config(find_in_parent_folders("region.hcl","dont_exist.hcl"), {locals = {}})
  environment_vars = read_terragrunt_config(find_in_parent_folders("env.hcl","dont_exist.hcl"), {locals = {}})
  zone_vars = read_terragrunt_config(find_in_parent_folders("zone.hcl", "dont_exist.hcl"), {locals = {}})
  tier_vars = read_terragrunt_config(find_in_parent_folders("tier.hcl", "dont_exist.hcl"), {locals = {}})
}

# Global state template
remote_state {
  backend = "s3"
  config = {
    bucket  = "storsvc-s3-\${local.account_vars.locals.agency_name}-\${local.environment_vars.locals.env_name}\${local.zone_vars.locals.zone_name}-tfstate"
    key     = "\${path_relative_to_include()}/terragrunt_state.tfstate"
    region  = "ap-southeast-1"
  }
}

# Map terragrunt variables to terraform input variables (like tfvars)
inputs = merge(
  local.account_vars.locals,
  local.region_vars.locals,
  local.environment_vars.locals,
  local.zone_vars.locals,
  local.tier_vars.locals
)

terraform {
  # before_hook "credentials" {
  #     commands = ["init-from-module", "init", "validate", "plan", "apply", "destroy", "refresh"]
  #     execute = ["yay", "\${local.account_vars.locals.account_ref}"]
  # }

  # after_hook "credentials_after" {
  #     commands = ["terragrunt-read-config"]
  #     execute = ["yay", "\${local.account_vars.locals.account_ref}"]
  # }
}
`
export const rootTerragruntHcl = _terragruntHcl.trim();