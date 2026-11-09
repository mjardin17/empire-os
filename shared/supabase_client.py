import os
from dotenv import load_dotenv
from supabase import create_client, Client
from shared.logger import logger

# Load .env file if present
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)

def get_supabase_client() -> Client:
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_ANON_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

    if not url or not key:
        logger.error("Supabase credentials missing in environment (.env)", factory="FOUNDATION")
        raise ValueError("SUPABASE_URL and SUPABASE_KEY must be configured in environment.")

    try:
        client = create_client(url, key)
        logger.info("Supabase client initialized successfully", factory="FOUNDATION", data={"url_host": url.split("//")[-1].split("/")[0]})
        return client
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {str(e)}", factory="FOUNDATION")
        raise
