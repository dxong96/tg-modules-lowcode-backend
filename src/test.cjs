const parser = require('@evops/hcl-terraform-parser');
const content = `
terraform {
    source = "git::git@sgts.gitlab-dedicated.com:wog/mha/ica-e-services/ica_common_services/app/aws_tg.git//tg-modules//iam-v2"
}

include "root" {
    path = find_in_parent_folders()
}

locals {
    app_vars = read_terragrunt_config(find_in_parent_folders("app.hcl"))
    app_name = local.app_vars.locals.app_name
    env_vars         = read_terragrunt_config(find_in_parent_folders("env.hcl"))
    env_name         = local.env_vars.locals.env_name
}

inputs = {
    app_name = "\${local.env_name}-\${local.app_name}"

    custom_policies = [
        ["mqpolicy", "mq.tpl"]
    ]
    
    arn_policies = [
        "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
    ]
}
`
console.log(JSON.stringify(parser.parse(content), null, 2));