# ── Service Account ────────────────────────────────────────────

resource "google_service_account" "identity_sa" {
  account_id   = "identity-sa"
  display_name = "Identity Service Account"
  description  = "Service account for the Identity domain service"
  project      = data.terraform_remote_state.shared.outputs.tech_dev_project_id
}

resource "google_project_iam_member" "identity_sa_roles" {
  for_each = toset([
    "roles/datastore.user",
  ])

  project = data.terraform_remote_state.shared.outputs.tech_dev_project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.identity_sa.email}"
}

# ── Cloud Run Service ──────────────────────────────────────────

variable "identity_image_uri" {
  description = "Google Artifacts image URI for the Identity service"
  type        = string
}

resource "google_cloud_run_service" "from_the_hart_identity" {
  project  = data.terraform_remote_state.shared.outputs.tech_dev_project_id
  name     = "from-the-hart-identity"
  location = "africa-south1"

  metadata {
    annotations = {
      "run.googleapis.com/ingress"        = "all"
      "run.googleapis.com/ingress-status" = "all"
    }
  }

  template {
    spec {
      containers {
        image = var.identity_image_uri

        ports {
          container_port = 8080
          name           = "http1"
        }

        resources {
          limits = {
            memory = "512Mi"
            cpu    = "1000m"
          }
        }

        env {
          name  = "FIREBASE_PROJECT_ID"
          value = data.terraform_remote_state.shared.outputs.tech_dev_project_id
        }

        env {
          name  = "AUTH_SERVICE_ACCOUNT_EMAIL"
          value = "auth-firebase-adminsdk-fbsvc@${data.terraform_remote_state.shared.outputs.tech_dev_project_id}.iam.gserviceaccount.com"
        }

        env {
          name  = "FIRESTORE_DATABASE_NAME"
          value = google_firestore_database.tech_identity_firestore_database.name
        }

        startup_probe {
          http_get {
            path = "/identity/health"
            port = 8080
          }
          initial_delay_seconds = 10
          timeout_seconds       = 5
          period_seconds        = 10
          failure_threshold     = 12
        }
      }

      service_account_name = google_service_account.identity_sa.email

      timeout_seconds       = 30
      container_concurrency = 80
    }

    metadata {
      annotations = {
        "autoscaling.knative.dev/minScale"         = "0"
        "autoscaling.knative.dev/maxScale"         = "1"
        "run.googleapis.com/execution-environment" = "gen2"
        "run.googleapis.com/startup-cpu-boost"     = "true"
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  autogenerate_revision_name = true
}

# ── Cloud Run IAM (who can invoke this service) ─────────────────

resource "google_cloud_run_service_iam_member" "cloudflare_worker_invoker" {
  project  = data.terraform_remote_state.shared.outputs.tech_dev_project_id
  service  = google_cloud_run_service.from_the_hart_identity.name
  location = google_cloud_run_service.from_the_hart_identity.location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${data.terraform_remote_state.shared.outputs.cloudflare_worker_cloud_run_invoker_service_account_email}"
}

resource "google_cloud_run_service_iam_member" "auth_service_invoker" {
  project  = data.terraform_remote_state.shared.outputs.tech_dev_project_id
  service  = google_cloud_run_service.from_the_hart_identity.name
  location = google_cloud_run_service.from_the_hart_identity.location
  role     = "roles/run.invoker"
  member   = "serviceAccount:auth-firebase-adminsdk-fbsvc@${data.terraform_remote_state.shared.outputs.tech_dev_project_id}.iam.gserviceaccount.com"
}

# ── Firestore Named Database ────────────────────────────────────

resource "google_firestore_database" "tech_identity_firestore_database" {
  project     = data.terraform_remote_state.shared.outputs.tech_dev_project_id
  name        = "identity"
  location_id = "africa-south1"
  type        = "FIRESTORE_NATIVE"
}

# ── Outputs ─────────────────────────────────────────────────────

output "service_url" {
  value = google_cloud_run_service.from_the_hart_identity.status[0].url
}

output "identity_service_account_email" {
  value = google_service_account.identity_sa.email
}
