from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    anthropic_api_key: str
    google_client_id: str = ""
    google_client_secret: str = ""
    demo_bypass_code: str = ""  # if empty, demo login is disabled; must not be a known-weak value
    demo_admin_code: str = ""   # if set, grants admin role to demo login with this code
    secret_key: str
    initial_admin_email: str = ""  # if set, auto-added to allowed_emails as admin on startup
    secure_cookies: bool = False  # set True in Railway; TLS terminates at the proxy so cookies are HTTPS to clients
    env: str = ""  # set to "production" in Railway to harden API visibility

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
