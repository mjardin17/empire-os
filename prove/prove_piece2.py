import sys
import os
from pathlib import Path

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from shared import logger
from adapters.video_studio import VideoStudioAdapter

def main():
    logger.info("Starting Piece 2 Verification Run: Video Studio Job API", factory="VIDEO_STUDIO")

    adapter = VideoStudioAdapter()
    
    # 1. Submit 10-second test video job
    result = adapter.submit_job(
        channel="GG",
        episode_id="GG_TEST_10S",
        prompt="Empire OS Video Studio 10-second test clip",
        duration_seconds=10,
        joshua_approved=False
    )

    # 2. Verify outputs exist
    video_path = Path(result["video_path"]) if result.get("video_path") else None
    thumb_path = Path(result["thumbnail_path"]) if result.get("thumbnail_path") else None

    video_exists = video_path and video_path.exists() and video_path.stat().st_size > 0
    thumb_exists = thumb_path and thumb_path.exists() and thumb_path.stat().st_size > 0

    print("\n--- PIECE 2 PROOF RESULT ---")
    print(f"Job ID: {result['job_id']}")
    print(f"Status: {result['status']}")
    print(f"Gate Mode: {result['gate_mode']}")
    print(f"Video Output: {video_path} (Exists: {video_exists}, Size: {video_path.stat().st_size if video_exists else 0} bytes)")
    print(f"Thumbnail Output: {thumb_path} (Exists: {thumb_exists}, Size: {thumb_path.stat().st_size if thumb_exists else 0} bytes)")

    # Document Kokoro TTS / HF cache environment ticket
    ticket = """
--------------------------------------------------------------------------------
TICKET: VIDEO_STUDIO_KOKORO_DISK_LIMITATION
Component: viral-engine / Kokoro-82M TTS & HuggingFace Cache
Error: [TTS-CLI] ERROR: Task error: File reconstruction error: IO Error: There is not enough space on the disk. (os error 112)
Impact: Full Kokoro-82M model weight extraction fails on low disk space (~1.6GB free).
Workaround/Action: Standardized job API completed lightweight ffmpeg video+thumbnail rendering proof.
Fix Required: Free 3GB+ disk space or set HF_HOME to external storage before invoking full Kokoro-82M TTS.
--------------------------------------------------------------------------------
"""
    print(ticket)

    if video_exists and thumb_exists and result["status"] == "COMPLETED":
        print("PIECE 2 VERIFIED: Video Studio job API (submit job -> render -> return video + thumbnail) working end-to-end.\n")
    else:
        print("PIECE 2 FAILED: Video or thumbnail artifact missing.\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
