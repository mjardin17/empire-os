"""
orchestrator/agents/scene_builder.py — The puzzle assembler.

Takes ONE scene from an episode script and produces a finished
scene_NN_final.mp4, using ALL available tools simultaneously:

  Step 1: image_scout in PARALLEL for all 4 image prompts (each prompt
          itself scouts Wikimedia + Pollinations + Gemini concurrently)
  Step 2: action scenes (battle/charge/... keywords) → video_agent tries
          the free video providers for a real motion clip
  Step 3: TTS narration via Kokoro (Voice Music Factory)
  Step 4: Ken Burns across ALL 4 images (narration/4 each) OR the real
          video clip if video_agent succeeded
  Step 5: Combine narration + visuals into the scene clip (+ lower third)
  Step 6: Council evaluation — 3 rounds. If a round fails, retry ONLY the
          step that round points at (combine / tts / images), up to
          MAX_STEP_RETRIES times per step.

Never raises — returns the finished clip Path or None.
"""

from __future__ import annotations

import shutil
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Optional

BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from orchestrator.agents import council_evaluator, video_agent  # noqa: E402
from orchestrator.agents.image_scout import ImageResult, scout_image  # noqa: E402

TAG = "[scene_builder]"
MAX_WORKERS = 4          # parallel image prompts per scene
MAX_STEP_RETRIES = 2     # retries per failed build step (council-directed)


def _log(msg: str) -> None:
    """Tagged stdout log line."""
    print(f"{TAG} {msg}", flush=True)


def _scene_prompts(scene: dict, episode_title: str) -> list[str]:
    """
    The scene's image prompts (4 per scene is the GG standard). Legacy scenes
    without image_prompts fall back to a single wikimedia_query/title prompt.
    """
    prompts = [p.strip() for p in (scene.get("image_prompts") or [])
               if isinstance(p, str) and p.strip()]
    if prompts:
        return prompts
    fallback = (scene.get("wikimedia_query") or scene.get("visual_prompt")
                or scene.get("title") or episode_title)
    return [str(fallback)]


# ── Build steps (each independently retryable) ────────────────────────────────
def _step_tts(narration: str, wav: Path, voice: str, speed: float) -> Optional[float]:
    """Step 3: Kokoro TTS. Returns narration duration or None."""
    from empire_render import probe_duration, tts_narrate
    wav.unlink(missing_ok=True)
    if not tts_narrate(narration, wav, voice, speed):
        return None
    return probe_duration(wav)


def _step_images(scene: dict, work_dir: Path, n: int, episode_title: str,
                 mission_tag: str) -> list[Path]:
    """
    Step 1: scout ALL image prompts in parallel. For each prompt the best
    ranked result wins. Returns best image per prompt, prompt order preserved.
    """
    prompts = _scene_prompts(scene, episode_title)
    best: dict[int, Path] = {}
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {
            pool.submit(scout_image, prompt, work_dir, f"scene_{n:02d}_img{i + 1}"): i
            for i, prompt in enumerate(prompts)
        }
        for future in as_completed(futures):
            i = futures[future]
            try:
                results: list[ImageResult] = future.result()
            except Exception as e:
                _log(f"{mission_tag} image_scout img{i + 1} crashed: {e}")
                continue
            if results:
                top = results[0]
                _log(f"{mission_tag} — image_scout: {top.source} ✅ ({top.size_kb}KB)")
                best[i] = top.path
    return [best[i] for i in sorted(best)]


def _step_visuals(scene: dict, images: list[Path], video_clip: Optional[Path],
                  work_dir: Path, n: int, narr_dur: float, index: int) -> Optional[Path]:
    """
    Step 4: silent visual track. Real video clip (fitted to narration, played
    once, never looped) if video_agent succeeded; otherwise Ken Burns across
    ALL images — each shown narration/len(images) seconds.
    """
    from empire_render import (fit_clip_to_narration, make_ken_burns_slideshow,
                               probe_duration)
    kb = work_dir / f"scene_{n:02d}_kb.mp4"
    kb.unlink(missing_ok=True)

    if video_clip is not None:
        clip_dur = probe_duration(video_clip)
        if clip_dur and fit_clip_to_narration(video_clip, narr_dur, clip_dur, kb):
            return kb
        _log(f"scene {n:02d}: video clip fit failed — falling back to Ken Burns images")

    if not images:
        return None
    # Wipe stale per-image segments so the slideshow rebuilds fresh
    for seg in work_dir.glob(f"scene_{n:02d}_kb[0-9]*.mp4"):
        seg.unlink(missing_ok=True)
    if make_ken_burns_slideshow(images, kb, work_dir, n, narr_dur, preset_index=index):
        return kb
    return None


def _step_combine(visuals: Path, wav: Path, work_dir: Path, n: int,
                  narr_dur: float, scene: dict) -> Optional[Path]:
    """Step 5: merge visuals + narration, trim to narration, burn lower third."""
    from empire_render import apply_lower_third, combine_clip_and_narration
    narrated = work_dir / f"scene_{n:02d}_narrated.mp4"
    final = work_dir / f"scene_{n:02d}_final.mp4"
    narrated.unlink(missing_ok=True)
    final.unlink(missing_ok=True)

    if not combine_clip_and_narration(visuals, wav, narrated, narr_dur):
        return None
    lower_third = (scene.get("lower_third") or "").strip()
    if lower_third:
        if not apply_lower_third(narrated, final, lower_third):
            shutil.copy2(narrated, final)  # cosmetic — never kills the scene
    else:
        shutil.copy2(narrated, final)
    return final


# ── Public API ────────────────────────────────────────────────────────────────
def build_scene(scene: dict, index: int, total: int, work_dir: Path,
                episode_title: str, voice: str, speed: float,
                mission_id: str = "") -> Optional[Path]:
    """
    Assemble one scene end-to-end with council QC.

    Args:
        scene:         Scene dict from the episode JSON.
        index:         0-based scene index (Ken Burns preset rotation).
        total:         Total scenes in the episode (logging).
        work_dir:      Episode working directory.
        episode_title: For prompt fallbacks.
        voice/speed:   Kokoro voice + pace for the channel.
        mission_id:    Mission board id for log lines (optional).

    Returns:
        Finished scene clip Path, or None if the scene could not be built
        even after council-directed retries. Never raises.
    """
    n = int(scene.get("scene_number", index + 1))
    mtag = f"Mission {mission_id}: " if mission_id else ""
    tag = f"{mtag}scene {n:02d}/{total}"
    work_dir.mkdir(parents=True, exist_ok=True)
    wav = work_dir / f"scene_{n:02d}.wav"

    narration = (scene.get("narration") or "").strip()
    if not narration:
        _log(f"{tag} ❌ no narration text — skipping")
        return None

    try:
        # Step 3 first — narration duration drives everything else
        narr_dur = _step_tts(narration, wav, voice, speed)
        if not narr_dur:
            _log(f"{tag} ❌ TTS failed")
            return None
        _log(f"{tag} — tts: kokoro ✅ ({narr_dur:.1f}s)")

        # Steps 1+2 run in parallel: all image prompts + optional video agent
        video_clip: Optional[Path] = None
        with ThreadPoolExecutor(max_workers=2) as pool:
            img_future = pool.submit(_step_images, scene, work_dir, n, episode_title, tag)
            vid_future = pool.submit(video_agent.generate_action_clip, scene, work_dir,
                                     f"scene_{n:02d}", narr_dur)
            images = img_future.result()
            try:
                video_clip = vid_future.result()
            except Exception as e:
                _log(f"{tag} video_agent crashed: {e}")

        if not images and video_clip is None:
            _log(f"{tag} ❌ no visuals from any source")
            return None
        _log(f"{tag} — visuals: {len(images)} image(s)"
             + (f" + real video clip" if video_clip else ""))

        # Steps 4-5
        visuals = _step_visuals(scene, images, video_clip, work_dir, n, narr_dur, index)
        if visuals is None:
            _log(f"{tag} ❌ visual track build failed")
            return None
        final = _step_combine(visuals, wav, work_dir, n, narr_dur, scene)
        if final is None:
            _log(f"{tag} ❌ combine failed")
            return None

        # Step 6: council — 3 rounds; council-directed retries per failed step
        retries: dict[str, int] = {"combine": 0, "tts": 0, "images": 0}
        while True:
            verdict = council_evaluator.evaluate(final, narr_dur, tag)
            if verdict.passed:
                _log(f"{tag} ✅ council approved (3/3 rounds)")
                return final

            step = verdict.retry_step
            retries[step] = retries.get(step, 0) + 1
            if retries[step] > MAX_STEP_RETRIES:
                _log(f"{tag} ❌ council rejected after {MAX_STEP_RETRIES} '{step}' "
                     f"retries — {verdict.reason}")
                return None
            _log(f"{tag} ⟳ council round {verdict.round_failed} failed "
                 f"({verdict.reason}) — retrying step '{step}' "
                 f"[{retries[step]}/{MAX_STEP_RETRIES}]")

            if step == "tts":
                narr_dur = _step_tts(narration, wav, voice, speed) or narr_dur
                # narration changed → visuals must be re-fitted too
                visuals = _step_visuals(scene, images, video_clip, work_dir, n,
                                        narr_dur, index)
            elif step == "images":
                video_clip = None  # frame defect may come from the video clip
                images = _step_images(scene, work_dir, n, episode_title, tag)
                visuals = _step_visuals(scene, images, None, work_dir, n,
                                        narr_dur, index)
            # step == "combine" → visuals unchanged, just recombine below
            if visuals is None:
                _log(f"{tag} ❌ retry of step '{step}' could not rebuild visuals")
                return None
            final = _step_combine(visuals, wav, work_dir, n, narr_dur, scene)
            if final is None:
                _log(f"{tag} ❌ recombine failed during retry")
                return None

    except Exception as e:  # absolute backstop — the builder never raises
        _log(f"{tag} ❌ unexpected error: {e}")
        return None
