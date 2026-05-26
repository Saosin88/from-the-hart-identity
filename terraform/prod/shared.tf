data "terraform_remote_state" "shared" {
  backend = "gcs"
  config = {
    bucket = "from-the-hart-terraform"
    prefix = "state/shared.tfstate"
  }
}
