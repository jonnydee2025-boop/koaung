from typing import Any

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

from .config import GOOGLE_CLIENT_SECRET_FILE, GOOGLE_TOKEN_FILE, SCOPES, logger


def get_google_credentials(force_reauth: bool = False) -> Credentials:
    credentials = None

    if GOOGLE_TOKEN_FILE.exists() and not force_reauth:
        credentials = Credentials.from_authorized_user_file(
            str(GOOGLE_TOKEN_FILE), SCOPES
        )

    if credentials and not credentials.has_scopes(SCOPES):
        logger.warning(
            "token.json is missing required OAuth scopes (needs youtube.force-ssl "
            "for public publish). Delete token.json and re-authenticate."
        )
        credentials = None

    if not credentials or not credentials.valid:
        if credentials and credentials.expired and credentials.refresh_token:
            credentials.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                str(GOOGLE_CLIENT_SECRET_FILE), SCOPES
            )
            credentials = flow.run_local_server(port=0)

        GOOGLE_TOKEN_FILE.write_text(credentials.to_json(), encoding="utf-8")

    return credentials


def build_google_services() -> tuple[Any, Any]:
    credentials = get_google_credentials()
    sheets = build("sheets", "v4", credentials=credentials)
    youtube = build("youtube", "v3", credentials=credentials)
    return sheets, youtube


def build_drive_service(force_reauth: bool = False) -> Any:
    credentials = get_google_credentials(force_reauth=force_reauth)
    return build("drive", "v3", credentials=credentials)

