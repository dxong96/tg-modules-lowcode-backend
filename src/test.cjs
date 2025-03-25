const parser = require('@evops/hcl-terraform-parser');
const content = `
variable "region" {
    description = "AWS region"
}


variable "tls_private_key_algorithm" {
  type        = string
  description = "The name of the algorithm to use for the certificate key. Currently-supported values are RSA and ECDSA"
}

variable "tls_cert_subject" {
  description = ""
  type        = map(any)
  default     = {}
}
`
console.log(JSON.stringify(parser.parse(content), null, 2));