#!/usr/bin/env python3
"""
auto_render.py — Hands-free video pipeline for all Viral Engine channels.

Uses real AI photos (Pollinations Flux, free/no key) + edge-tts neural voices + FFmpeg.
One command → 100% complete MP4, ready to upload.

Usage:
    python auto_render.py --episode ML_EP001
    python auto_render.py --episode LO_EP002
    python auto_render.py --episode GG_EP006
    python auto_render.py --episode ML_EP001 --skip-images        # reuse cached images
    python auto_render.py --episode ML_EP001 --music epic.mp3     # add background music
    python auto_render.py --episode ML_EP001 --portrait           # 1080x1920 Shorts format

Install edge-tts once:
    pip install edge-tts
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures
import hashlib
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional

# ── Config ────────────────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).resolve().parent
PROMPTS_DIR = BASE_DIR / "prompts"
OUTPUT_DIR  = BASE_DIR / "output"
ASSETS_DIR  = BASE_DIR / "assets"
CHARS_DIR   = BASE_DIR / "character_images"   # real character art goes here


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader (avoids requiring python-dotenv as a dependency)."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


_load_dotenv(BASE_DIR / ".env")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# Gemini's free tier has a strict requests-per-minute cap. The image prefetch
# pool runs several Pollinations workers concurrently, and when Pollinations
# is rate-limited, all of them fall through to Gemini at once — which then
# gets rate-limited too. Serialize Gemini calls across threads and enforce a
# minimum gap between them so the fallback source doesn't get hammered into
# uselessness by the same concurrency that broke the primary source.
_GEMINI_LOCK = threading.Lock()
_GEMINI_MIN_INTERVAL_SEC = 5.0
_gemini_last_call_at = 0.0

W_LAND, H_LAND = 1920, 1080   # landscape (standard YouTube)
W_PORT, H_PORT = 1080, 1920   # portrait  (Shorts / TikTok)

FPS  = 30
ZOOM = 0.0003   # Ken Burns zoom — subtle and cinematic

# Pollinations free image API (Flux model — best free option)
POLL_URL = (
    "https://image.pollinations.ai/prompt/{prompt}"
    "?width={w}&height={h}&model=flux&nologo=true&seed={seed}&enhance=true"
)

STYLE_SUFFIX: dict[str, str] = {
    "ML": (
        "cinematic dark sci-fi, dramatic volumetric lighting, mechanical detail, "
        "photorealistic, 8k, ultra detailed, widescreen composition"
    ),
    "LO": (
        "Pixar 3D animation style, toddler characters aged 2-3, chubby round faces, "
        "oversized eyes taking up 40% of face, tiny button nose, rosy cheeks, "
        "soft rounded everything, bright saturated colors, simple clean backgrounds, "
        "NOT comic book style, NOT flat 2D illustration, warm soft render lighting, widescreen"
    ),
    "GG": (
        "epic historical painting, cinematic battle scene, dramatic side lighting, "
        "ultra detailed, photorealistic, 8k, widescreen composition"
    ),
    "EO": (
        "cinematic documentary photography, dramatic atmospheric lighting, ancient ruins, "
        "moody fog and golden hour, ultra detailed, photorealistic, 8k, widescreen composition, "
        "National Geographic style"
    ),
    "IL": (
        "80s 90s retro cartoon animation style, vibrant electric colors, dramatic robot mech battle, "
        "Transformers G.I. Joe He-Man aesthetic, cel-shaded anime art, bold outlines, "
        "cinematic action composition, neon blue and orange energy beams, steel chrome surfaces, "
        "ultra detailed, widescreen 16:9, Saturday morning cartoon meets modern anime"
    ),
}
DEFAULT_STYLE = "cinematic, dramatic lighting, ultra detailed, photorealistic, 8k"

CHANNEL_LABELS: dict[str, str] = {
    "ML": "MECH LEGENDS",
    "LO": "LITTLE OLYMPUS",
    "GG": "GODS & GLORY",
    "EO": "ECHOES OF ETERNITY",
    "IL": "IRON LEGENDS",
}
# ── TTS Engine: Kokoro (replaces edge-tts) ───────────────────────────────────
# Kokoro voices — run voice-music-factory/run_factory.py to preview
# am_* = American male  |  af_* = American female
CHANNEL_VOICE: dict[str, str] = {
    "GG": "bm_george",  # British male — BBC documentary authority, best for historical narration
    "ML": "am_adam",    # Energetic male — action energy
    "LO": "af_bella",   # Warm female — storyteller/kids
    "EO": "am_adam",    # Cinematic deep male — Echoes of Eternity
    "IL": "am_fenrir",  # Dramatic American male — Saturday morning cartoon energy
}
# Kokoro speed multipliers (1.0 = normal; <1.0 = slower; >1.0 = faster)
# Mirrors old edge-tts rate percentages: -35% → 0.65, +8% → 1.08, etc.
CHANNEL_RATE: dict[str, float] = {
    "GG": 0.65,   # Slowed for gravitas — targets 45+ min runtime
    "ML": 1.05,   # Slightly faster — action energy
    "LO": 0.90,   # Slower — kids need time to follow
    "EO": 0.92,   # Slow and deliberate — mystery and weight
    "IL": 1.08,   # Fast and punchy — Saturday morning cartoon energy
}

# Kokoro TTS CLI — called via venv Python so no import conflicts
KOKORO_PYTHON = (
    Path(__file__).parent / "voice-music-factory" / "venv" / "Scripts" / "python.exe"
)
KOKORO_CLI = Path(__file__).parent / "voice-music-factory" / "tts_cli.py"


# ── FFmpeg ─────────────────────────────────────────────────────────────────────
def find_ffmpeg() -> str:
    f = shutil.which("ffmpeg")
    if f:
        return f
    for c in [
        # Local repo copy (highest priority — always works without PATH setup)
        str(Path(__file__).parent / "ffmpeg_bin" / "ffmpeg.exe"),
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files (x86)\ffmpeg\bin\ffmpeg.exe",
        str(Path.home() / "ffmpeg" / "bin" / "ffmpeg.exe"),
    ]:
        if Path(c).exists():
            return c
    sys.exit("ERROR: ffmpeg not found. Run:  winget install ffmpeg  then reopen PowerShell.")


def get_duration(path: Path, ffmpeg: str) -> float:
    ff_dir   = Path(ffmpeg).parent
    ffprobe  = str(ff_dir / "ffprobe.exe")
    if not Path(ffprobe).exists():
        ffprobe = shutil.which("ffprobe") or ffmpeg.replace("ffmpeg", "ffprobe")
    try:
        r = subprocess.run(
            [ffprobe, "-v", "quiet",
             "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1",
             "-i", str(path)],
            capture_output=True, timeout=15,
        )
        return float(r.stdout.strip())
    except Exception:
        return 5.0


# ── Episode JSON ──────────────────────────────────────────────────────────────
def find_episode_json(episode_id: str) -> Path:
    eid_low = episode_id.lower()
    # Skip backup/cache dirs (e.g. "_backups", "__pycache__") — any path with a
    # component starting in "_" is never a live, authoritative script. Without
    # this filter, "_backups" sorts before "gods_glory" (underscore < letters),
    # so a stale backup would silently win over the real current episode file.
    candidates = [
        p for p in PROMPTS_DIR.rglob("*.json")
        if not any(part.startswith("_") for part in p.relative_to(PROMPTS_DIR).parts[:-1])
    ]

    def _prefer_final(p: Path) -> tuple:
        """Sort key: .final files first, then alphabetical. Never pick captions_source."""
        name = p.stem.lower()
        is_final = "final" in name
        is_captions = "captions" in name or "source" in name
        return (0 if is_final else 2 if is_captions else 1, str(p))

    for p in sorted(candidates, key=_prefer_final):
        if p.stem.lower() == eid_low:
            return p
    for p in sorted(candidates, key=_prefer_final):
        if eid_low in p.stem.lower():
            return p
    raise FileNotFoundError(f"No episode JSON found for '{episode_id}' in {PROMPTS_DIR}")


# ── Local image library ────────────────────────────────────────────────────────
# Maps keywords found in visual_prompt / scene title → preferred local image filename
# (partial filename match — first file whose name contains the keyword wins)
LOCAL_IMAGE_KEYWORDS: list[tuple[str, str]] = [
    # ── EP006 Salamis (most specific first) ──────────────────────────────────
    ("xerxes.*watch.*fleet|watches.*fleet.*burn|fleet.*destroyed.*xerxes|persian.*fleet.*destroyed",
                                                       "xerxes_watches_fleet_burn_v1"),
    ("salamis.*battle|battle.*salamis|greek.*fleet.*victory|naval.*victory.*greece|trireme.*ram",
                                                       "athens_siege_naval_battle_v1"),
    ("salamis.*burning|fleet.*burning|overhead.*fleet|fleet.*fire.*overhead|persian.*ship.*burn",
                                                       "salamis_burning_fleet_overhead_v1"),
    ("naval.*commander.*watch|commander.*naval.*assault|admiral.*overlook|themistocles.*command.*fleet",
                                                       "athens_siege_naval_battle_v3"),
    ("strait.*salamis|salamis.*strait|narrow.*channel.*fleet|channel.*trap.*persian",
                                                       "athens_siege_naval_battle_v2"),
    ("persian.*fleet.*arrive|xerxes.*fleet.*arrive|armada.*persian|massive.*persian.*fleet",
                                                       "xerxes_watches_fleet_burn_v2"),
    # ── EP002 Gaugamela ──────────────────────────────────────────────────────
    ("parmenion.*crisis|left.*flank.*crisis|crisis.*left.*flank|flank.*collapsing",
                                                       "gaugamela_parmenion_crisis_left_flank"),
    ("pursuit.*darius|darius.*pursuit|alexander.*chase|darius.*escape.*horse",
                                                       "gaugamela_pursuit_darius_escapes"),
    ("alexander.*honor.*dead|honor.*dead.*gaugamela|aftermath.*gaugamela|persian.*guard.*honor",
                                                       "gaugamela_aftermath_honors_persian_guard"),
    ("babylon.*gate.*open|gate.*babylon|babylon.*welcome|city.*babylon.*surrender",
                                                       "gaugamela_babylon_gates_open"),
    ("persepolis.*burn|burn.*persepolis|palace.*persepolis.*fire|persian.*capital.*fire",
                                                       "gaugamela_persepolis_burning"),
    ("death.*darius|darius.*death|bessus.*stab|darius.*dying.*road|dying.*king.*persian",
                                                       "gaugamela_death_of_darius_bessus"),
    ("alexander.*persian.*robe|persian.*robe.*alexander|alexander.*adopt.*persian|alexander.*court",
                                                       "gaugamela_alexander_persian_court"),
    ("hellenistic.*age|hellenistic.*world|alexandria.*library|greek.*east.*blend|blending.*culture",
                                                       "gaugamela_hellenistic_age_library"),
    ("military.*academy|west.*point.*ancient|general.*study.*gaugamela|every.*general.*since",
                                                       "gaugamela_military_legacy_west_point"),
    ("darius.*reassess|reassessing.*darius|darius.*tragic|noble.*darius|persian.*king.*human",
                                                       "gaugamela_darius_reassessed"),
    ("modern.*plain.*gaugamela|gaugamela.*today|plain.*arbela|modern.*iraq.*battle",
                                                       "gaugamela_modern_plain_legacy"),
    ("gaugamela.*overlook|alexander.*overlook.*persian.*camp|persian.*campfire.*gaugamela",
                                                       "gaugamela_alexander_overlook_persian_camp"),
    ("persian.*empire.*peak|empire.*million|darius.*throne.*empire",
                                                       "gaugamela_persian_empire_peak"),
    ("darius.*iii.*portrait|portrait.*darius|darius.*king.*persia",
                                                       "gaugamela_darius_iii_portrait"),
    ("alexander.*biography|young.*alexander|alexander.*born|alexander.*youth",
                                                       "gaugamela_alexander_biography"),
    ("terrain.*gaugamela|gaugamela.*terrain|flat.*plain.*battle|chariot.*terrain",
                                                       "gaugamela_terrain_preparation"),
    ("army.*scale|macedonian.*vs.*persian.*size|250000.*persian|47000.*macedonian",
                                                       "gaugamela_armies_scale_comparison"),
    ("macedonian.*phalanx.*sarissa|sarissa.*phalanx|pike.*macedonian|phalanx.*21.*foot",
                                                       "gaugamela_macedonian_phalanx_sarissa"),
    ("scythe.*chariot|chariot.*scythe|scythed.*chariot|chariot.*blade",
                                                       "gaugamela_scythed_chariots"),
    ("alexander.*night.*battle|eve.*gaugamela|parmenion.*night.*attack|night.*before.*gaugamela",
                                                       "gaugamela_alexander_night_before"),
    ("chariot.*neutralize|chariot.*charge.*fail|open.*gap|oblique.*advance",
                                                       "gaugamela_chariot_charge_neutralized"),
    ("companion.*cavalry|companion.*charge|hetairoi|cavalry.*charge.*darius",
                                                       "gaugamela_companion_cavalry_charge"),
    ("darius.*flee|flee.*darius|darius.*abandon.*army|king.*flee.*battlefield",
                                                       "gaugamela_darius_flees"),
    # ── EP003 Cannae ─────────────────────────────────────────────────────────
    ("70000.*dead|seventy.*thousand.*dead|cannae.*dead|worst.*defeat.*rome|hook.*cannae",
                                                       "cannae_70000_dead_hook"),
    ("hannibal.*background|hannibal.*born|hannibal.*childhood|hannibal.*father.*hamilcar",
                                                       "cannae_hannibal_background"),
    ("carthage.*rome.*context|punic.*war.*context|first.*punic|carthage.*vs.*rome",
                                                       "cannae_carthage_vs_rome_context"),
    ("alps.*cross|hannibal.*alps|elephant.*alps|crossing.*alps",
                                                       "cannae_alps_crossing"),
    ("trebia|trasimene|fabius.*maximus|dictator.*delay|fabius.*strategy",
                                                       "cannae_trebia_trasimene_fabius"),
    ("varro|paullus|consul.*cannae|roman.*consul.*216",
                                                       "cannae_consuls_varro_paullus"),
    ("army.*composition.*cannae|punic.*army|african.*infantry|gaul.*spain.*mercenary",
                                                       "cannae_army_composition"),
    ("ground.*cannae|cannae.*terrain|ofanto.*river|hannibal.*choose.*ground",
                                                       "cannae_ground_selection"),
    ("roman.*legion.*system|manipular.*system|roman.*formation|centuries.*maniple",
                                                       "cannae_roman_legion_system"),
    ("weak.*center.*trap|center.*bend|hannibal.*plan|crescent.*formation",
                                                       "cannae_weak_center_trap"),
    ("hasdrubal.*cavalry|cavalry.*hasdrubal|ride.*around|cavalry.*rear",
                                                       "cannae_cavalry_hasdrubal_ride"),
    ("center.*bend.*back|center.*bends|roman.*push.*forward.*trap",
                                                       "cannae_center_bends"),
    ("african.*veteran.*pivot|veterans.*pivot|wings.*close|african.*turn.*inward",
                                                       "cannae_african_veterans_pivot"),
    ("encirclement.*close|encirclement.*complete|trap.*close|surrounded.*roman",
                                                       "cannae_encirclement_closes"),
    ("killing.*ground|interior.*encirclement|roman.*cannot.*swing.*sword|crushing.*mass",
                                                       "cannae_killing_ground_interior"),
    ("death.*paullus|paullus.*die|consul.*fall|paullus.*killed",
                                                       "cannae_death_of_paullus"),
    ("counting.*dead|dead.*count|aftermath.*cannae|70000.*bodies|bodies.*field",
                                                       "cannae_dead_count_aftermath"),
    ("maharbal.*reproach|maharbal.*rome|you.*know.*conquer|know.*not.*use|hannibal.*delay",
                                                       "cannae_maharbal_reproach"),
    ("rome.*refuse.*break|rome.*does.*not.*break|senate.*meets|rome.*recover|roman.*resilience",
                                                       "cannae_rome_refuses_to_break"),
    ("scipio.*africanus|young.*scipio|scipio.*promise|rome.*new.*general",
                                                       "cannae_scipio_africanus"),
    ("general.*study.*cannae|every.*general.*cannae|why.*military.*cannae|cannae.*taught",
                                                       "cannae_why_generals_study_it"),
    ("schlieffen|schlieffen.*plan|1914.*cannae|german.*encirclement.*plan",
                                                       "cannae_schlieffen_plan_1914"),
    ("hannibal.*reassess|reassess.*hannibal|hannibal.*tragic|why.*not.*rome",
                                                       "cannae_reassessment_hannibal"),
    ("cannae.*legacy|perfect.*battle|legacy.*perfect|lesson.*cannae",
                                                       "cannae_legacy_perfect_battle"),
    # ── EP004 Mongols ─────────────────────────────────────────────────────────
    ("largest.*empire|mongol.*empire.*map|empire.*24.*million|mongol.*aerial",
                                                       "mongols_largest_empire_aerial"),
    ("steppe.*civilization|mongol.*steppe|nomad.*life|life.*steppe.*mongol",
                                                       "mongols_steppe_civilization"),
    ("temujin.*origin|temujin.*birth|genghis.*childhood|young.*temujin|born.*temujin",
                                                       "mongols_temujin_origin"),
    ("coalition.*build|uniting.*tribes|tribe.*alliance.*mongol|borjigin.*tribe",
                                                       "mongols_coalition_building"),
    ("genghis.*coronation|kurultai|great.*assembly.*mongol|proclaimed.*great.*khan",
                                                       "mongols_genghis_coronation"),
    ("horse.*archer.*system|mongol.*horse.*archer|composite.*bow.*horse|archer.*horse.*speed",
                                                       "mongols_horse_archer_system"),
    ("feigned.*retreat|fake.*retreat|mongol.*retreat.*tactic|draw.*enemy.*out",
                                                       "mongols_feigned_retreat"),
    ("psychological.*warfare.*surrender|surrender.*mercy|refuse.*die|psychological.*mongol",
                                                       "mongols_psychological_warfare_surrender"),
    ("siege.*capability|mongol.*siege|chinese.*engineer.*mongol|catapult.*mongol",
                                                       "mongols_siege_capabilities"),
    ("china.*xi.*xia|jin.*dynasty.*mongol|conquest.*china|northern.*china.*mongol",
                                                       "mongols_china_xi_xia_jin"),
    ("khwarezmian|samarkand.*mongol|shah.*khwarezm|central.*asia.*conquer",
                                                       "mongols_khwarezmian_samarkand"),
    ("merv.*destroy|merv.*massacre|1.7.*million.*merv|city.*destroy.*mongol",
                                                       "mongols_merv_destroyed"),
    ("genghis.*dies|genghis.*death|death.*genghis.*khan|empire.*after.*genghis",
                                                       "mongols_genghis_dies_empire_accelerates"),
    ("russia.*mongol|europe.*nearly.*fall|battle.*mohi|battle.*legnica|mongol.*europe",
                                                       "mongols_russia_europe_nearly_fall"),
    ("baghdad.*1258|1258.*baghdad|sack.*baghdad|abbasid.*caliphate.*end|caliph.*killed",
                                                       "mongols_baghdad_1258_burning"),
    ("house.*wisdom|tigris.*ink|books.*tigris|library.*destroy.*mongol",
                                                       "mongols_house_of_wisdom_tigris_ink"),
    ("ain.*jalut|first.*defeat.*mongol|mamluk.*defeat.*mongol|mongol.*stopped",
                                                       "mongols_ain_jalut_defeat"),
    ("empire.*fracture|khanate.*split|mongol.*divide|four.*khanate",
                                                       "mongols_empire_fractures"),
    ("kublai.*khan|yuan.*dynasty|mongol.*china.*dynasty|kublai.*court",
                                                       "mongols_kublai_yuan_dynasty"),
    ("pax.*mongolica|silk.*road.*secure|mongol.*trade|trade.*route.*mongol|safe.*travel",
                                                       "mongols_pax_mongolica_silk_road"),
    ("black.*death.*mongol|plague.*mongol|bubonic.*mongol|disease.*spread.*trade",
                                                       "mongols_black_death_connection"),
    ("khanate.*collapse|mongol.*decline|end.*mongol.*empire|timur.*rise",
                                                       "mongols_khanates_collapse"),
    ("death.*toll.*mongol|40.*million.*dead|mongol.*casualty|reckoning.*mongol",
                                                       "mongols_death_toll_reckoning"),
    ("modern.*mongolia|modern.*legacy.*mongol|mongol.*genetics|descendants.*mongol",
                                                       "mongols_modern_legacy_genetics"),
    # ── EP005 Constantinople ──────────────────────────────────────────────────
    ("aerial.*constantinople|constantinople.*1453|city.*1453|byzantine.*last.*days",
                                                       "constantinople_aerial_city_1453"),
    ("dying.*empire|byzantine.*dying|empire.*shadow|eastern.*rome.*decline",
                                                       "constantinople_dying_empire"),
    ("mehmed.*obsess|mehmed.*dream|mehmed.*city|mehmed.*young.*sultan",
                                                       "constantinople_mehmed_ii_obsession"),
    ("theodosian.*wall|triple.*wall.*constantine|ancient.*wall.*constantinople|wall.*breach",
                                                       "constantinople_theodosian_walls"),
    ("urban.*cannon|giant.*cannon|urban.*hungarian|great.*bombard|bronze.*cannon.*cast",
                                                       "constantinople_urbans_cannon"),
    ("ottoman.*arrival|ottoman.*army.*arrives|mehmed.*marches|200000.*ottoman",
                                                       "constantinople_ottoman_arrival"),
    ("constantine.*xi.*diplomacy|last.*emperor.*plea|constantine.*seek.*help|byzantine.*plea",
                                                       "constantinople_constantine_diplomacy"),
    ("giustiniani|genoese.*defend|genoa.*defender|giustiniani.*arrive",
                                                       "constantinople_giustiniani_genoese"),
    ("cannon.*bombardment|wall.*crack|cannon.*wall|bombard.*theodosian",
                                                       "constantinople_cannon_bombardment"),
    ("chain.*golden.*horn|boom.*chain|harbor.*chain|ottoman.*harbor.*blocked",
                                                       "constantinople_chain_golden_horn"),
    ("ship.*drag.*overland|rollers.*ship|mehmed.*ships.*land|overland.*fleet",
                                                       "constantinople_ships_dragged_overland"),
    ("encirclement.*defender|defender.*surround|all.*side.*attack|siege.*complete",
                                                       "constantinople_encirclement_defenders"),
    ("final.*night.*hagia.*sophia|last.*prayer.*hagia|hagia.*sophia.*night|eve.*fall.*city",
                                                       "constantinople_final_night_hagia_sophia"),
    ("three.*front.*assault|final.*assault.*1453|all.*gate.*attack|may.*29.*assault",
                                                       "constantinople_three_front_assault"),
    ("giustiniani.*wound|giustiniani.*retreat|genoese.*captain.*wound|defender.*leave",
                                                       "constantinople_giustiniani_wounded"),
    ("constantine.*last.*stand|emperor.*last.*stand|constantine.*die|last.*emperor.*fall",
                                                       "constantinople_constantine_last_stand"),
    ("city.*falls|constantinople.*fall|1453.*fall|ottoman.*enter.*city",
                                                       "constantinople_city_falls"),
    ("mehmed.*enter|sultan.*enter.*city|mehmed.*hagia.*sophia|fatih.*mehmed",
                                                       "constantinople_mehmed_enters"),
    ("scholar.*flee.*west|greek.*scholar.*italy|knowledge.*west|manuscript.*flee",
                                                       "constantinople_scholars_flee_west"),
    ("ottoman.*rise|ottoman.*empire.*power|istanbul.*new.*capital|ottoman.*golden.*age",
                                                       "constantinople_ottoman_rise"),
    ("renaissance.*connection|fall.*sparked.*renaissance|greek.*knowledge.*europe",
                                                       "constantinople_renaissance_connection"),
    ("hinge.*history|turning.*point.*1453|world.*changed.*1453|age.*exploration.*1453",
                                                       "constantinople_hinge_of_history"),
    ("legacy.*summary.*istanbul|legacy.*constantinople|then.*now.*istanbul",
                                                       "constantinople_legacy_summary"),
    ("city.*endures|istanbul.*today|modern.*city.*legacy|next.*episode.*teaser",
                                                       "constantinople_next_episode"),
    # ── Thermopylae specific (most specific first) ───────────────────────────
    # NEW high-quality user images — checked first
    # Athens burning
    ("athens.*burn|burn.*athens|xerxes.*revenge|revenge.*xerxes|city.*burn.*siege|siege.*night.*fire|acropolis.*fire|fireballs.*catapult",
                                                       "athens_siege_night_fireballs"),
    ("spartan.*watch.*burn|watch.*city.*burn|did.*thermopylae.*matter|thermopylae.*matter",
                                                       "athens_burning_spartan_view_sunset"),
    # Persian Immortals (specific banner image)
    ("persian.immortal|immortal.*persian|immortals.fail|day.one.*immortal|10000.*immortal",
                                                       "persian_immortals_marching"),
    # Spartans vs Persians clash at pass
    ("spartans.*vs.*persian|persian.*clash|spears.*clash|phalanx.*work|phalanx.*narrow|day.two|immortals.fail",
                                                       "spartans_vs_persians_clash_pass"),
    # Bloodied Leonidas
    ("bloodied|battle.worn|exhausted.*warrior|warrior.*exhausted|why.*stayed|spartan.*stayed",
                                                       "leonidas_bloodied_battle_worn"),
    # Gods watching
    ("zeus.*athena.*poseidon|gods.*watch.*battle|divine.*watch|olymp.*gods.*therm|gods.*therm",
                                                       "greek_gods_zeus_athena_poseidon_watching"),
    # Spartans holding the pass — cliff/sea
    ("holding.*pass|narrow.pass|cliff.*sea.*pass|pass.*cliff.*sea",
                                                       "spartans_holding_thermopylae_pass_cliff_sea"),
    # Spartan army marching wide shot
    ("spartan.*march.*wide|army.*march.*lambda|march.*thermopylae|the.pass|allied.greek|monument",
                                                       "spartan_army_marching_thermopylae_wide"),
    # 300 tight phalanx
    ("300.*shield|tight.*formation|300.*phalanx|why.only.300|phalanx.*formation",
                                                       "spartan_300_phalanx_formation"),
    # Leonidas overlooking Persian army
    ("leonidas.*overlook|overlook.*persian|leonidas.*rock.*valley|persians.arrive|persian.*arrive",
                                                       "leonidas_overlooking_persian_army"),
    # Xerxes on chariot
    ("xerxes.*chariot|chariot.*xerxes|xerxes.*command|persian.empire.*peak|numbers.*persian",
                                                       "xerxes_commanding_army_pass"),
    # Leonidas character shots — lucid-origin fallbacks
    ("leonidas.*wound|wounded.*king|leonidas.*broken|alone.*battle|leonidas.*stand",
                                                       "lucid-origin_King_Leonidas_standing_alone"),
    ("leonidas.*lead|leonidas.*warrior|king.*lead.*spartan|lead.*into.battle",
                                                       "lucid-origin_King_Leonidas_leading_Spartan_warriors"),
    # Final stand / day 3
    ("final.stand|last.stand|spartan.*surround|surround.*spartan|day.three|day 3",
                                                       "lucid-origin_Spartan_warriors_making_their_final_stand"),
    # Aerial / overview
    ("aerial|coastal.pass|drone.shot|overhead|thermopylae.*mountain|mountain.*sea.*pass|narrow.coastal",
                                                       "lucid-origin_Massive_aerial_view_of_the_Battle_of_Thermopylae"),
    # Persian Immortals
    ("persian.immortal|immortal.*persian|black.armor.*gold",
                                                       "lucid-origin_Ancient_Persian_Immortals_marching"),
    # Persian army march
    ("persian.army.*cross|huge.persian.army|persian.*march|persian.*advance",
                                                       "lucid-origin_Huge_Persian_army_crossing"),
    # Persian navy
    ("persian.naval|naval.fleet|persian.*fleet|warship",
                                                       "lucid-origin_Massive_naval_fleet_of_ancient_Persia"),
    # Athens/city burning
    ("city.*attack|attack.*city|athens.*burn|burn.*athens|city.*fire|greek.city.*destroy",
                                                       "lucid-origin_Massive_ancient_Greek_city_under_attack"),
    # Gods watching — lucid fallback
    ("gods.*watch|olympus.*battle|gods.*olymp",        "lucid-origin_Greek_gods_watching_over_the_Battle"),
    # Oracle / Delphi
    ("oracle|delphi|temple.*priest|ephialtes.*exile|haunted.*exile|exile.*thessaly",
                                                       "lucid-origin_Ancient_Greek_oracle_temple"),
    # Sparta temple at sunset
    ("sparta.*sunset|temple.*sparta|sparta.*temple|temple.*column.*fire",
                                                       "lucid-origin_Ancient_Greek_temple_overlooking_Sparta"),
    # Sparta at night
    ("sparta.*night|city.*night.*sparta|ancient.sparta.*dark",
                                                       "lucid-origin_Ancient_city_of_Sparta_at_night"),
    # Battlefield fog / aftermath / legacy / analysis
    ("battlefield.*fog|fog.*smoke.*battle|aftermath|legacy.*seq|roman.*greek.*tactic|historical.*impact|modern.relevance|why.*still.matter|analysis.seq|honest.analysis|real.number|timeline.*thermopylae",
                                                       "lucid-origin_Ancient_Greek_battlefield_covered_in_fog"),
    # Rain / shields
    ("spartan.*rain|rain.*battle|shield.*rain|shield.*locked|who.were.spartan",
                                                       "lucid-origin_Ancient_Spartan_warriors_standing_in_heavy_rain"),
    # Blacksmith
    ("blacksmith|forging|forge.*shield",               "lucid-origin_Ancient_Spartan_blacksmith"),
    # Spartan childhood / agoge
    ("spartan.*child|agoge|training.*child|child.*train",
                                                       "lucid-origin_Ancient_Spartan_soldiers_training_as_children"),
    # Battlefield broken shields
    ("battlefield.*broken|broken.*shield.*spear",      "gemini-2.5-flash-image_Ancient_Spartan_battlefield"),
    # ── Character references ──────────────────────────────────────────────────
    ("king.leonidas|leonidas",                         "leonidas_reference"),
    ("xerxes",                                         "xerxes_reference"),
    ("themistocles",                                   "themistocles_ref"),
    ("alexander.*great|great.*alexander",              "alexander_reference"),
    ("darius",                                         "darius_iii_reference"),
    ("julius.caesar|caesar",                           "julius_caesar_reference"),
    ("hannibal",                                       "hannibal_barca_reference"),
    ("hamilcar",                                       "hamilcar_barca_reference"),
    ("scipio",                                         "scipio_africanus_reference"),
    ("war.elephant|elephant.*battle",                  "war_elephant_reference"),
    ("miltiades|marathon.*battle|battle.*marathon",    "miltiades_reference"),
    ("artemisia",                                      "artemisia_reference"),
    ("macedonian|phalangite",                          "macedonian_phalangite_reference"),
    ("sacred.band",                                    "sacred_band_reference"),
    ("quinquereme|trireme",                            "quinquereme_reference"),
    ("spartacus",                                      "spartacus_reference"),
]

import re as _re

# Tracks images already assigned to a scene, BY CONTENT (md5 of the file's
# bytes) rather than by filename/path. This is persisted to disk so it
# survives across episodes too — rebuild_all_episodes_v2.bat invokes this
# script once per episode as a separate `py` process, so an in-memory-only
# set would silently reset every episode and let the same picture (saved
# under a different filename, e.g. "*_dup23.png") slip through again.
# Channel policy: no image is ever reused across scenes OR across episodes.
USED_IMAGE_HASHES_PATH = BASE_DIR / "_used_image_hashes.json"


def _load_used_hashes() -> set:
    try:
        return set(json.loads(USED_IMAGE_HASHES_PATH.read_text(encoding="utf-8")))
    except Exception:
        return set()


def _save_used_hashes(hashes: set) -> None:
    try:
        USED_IMAGE_HASHES_PATH.write_text(
            json.dumps(sorted(hashes), indent=2), encoding="utf-8"
        )
    except Exception as e:
        print(f"   [WARN] could not persist used-image-hash log: {e}")


def _hash_file(path: Path) -> Optional[str]:
    try:
        return hashlib.md5(path.read_bytes()).hexdigest()
    except Exception:
        return None


_USED_LOCAL_IMAGES: set = set()          # paths already used this process
_USED_IMAGE_HASHES: set = _load_used_hashes()   # content hashes, persisted
_HASH_LOCK = threading.Lock()            # guards _USED_IMAGE_HASHES across prefetch threads


def _mark_image_used(path: Path) -> None:
    """Record a path AND its content hash as used, and persist immediately
    (so even a mid-run crash/kill doesn't lose the dedup history)."""
    _USED_LOCAL_IMAGES.add(str(path))
    h = _hash_file(path)
    if h:
        with _HASH_LOCK:
            _USED_IMAGE_HASHES.add(h)
            _save_used_hashes(_USED_IMAGE_HASHES)


def find_local_image(prompt: str, title: str, episode_id: str, scene_num: int) -> Optional[Path]:
    """Check for a usable local image before hitting Pollinations.

    Priority order:
    1. Exact scene asset:  assets/{episode_id}/scene_{nn}.{jpg,png}
    2. Keyword match in character_images/ against visual_prompt + title —
       skipping any file already used by an earlier scene (this run OR any
       previous run, tracked by CONTENT hash, not just path/filename) so the
       same picture never appears twice in one episode or across episodes —
       even if it's saved under a different filename in the pool.
    """
    # 1. Per-episode scene asset
    for ext in ("jpg", "png", "jpeg"):
        p = ASSETS_DIR / episode_id.upper() / f"scene_{scene_num:02d}.{ext}"
        if p.exists():
            h = _hash_file(p)
            if h and h in _USED_IMAGE_HASHES:
                print(f"   [DEDUP] Skipping {p.name} — identical content already used elsewhere")
            else:
                _mark_image_used(p)
                return p

    # 2. Keyword match against CHARS_DIR
    # Files with "_reference_" in the name are AI-generation style references
    # (plain stock-style photos), not finished cinematic art — never use them
    # as an actual scene visual even if their filename matches a keyword.
    combined = f"{prompt} {title}".lower()
    for pattern, filename_prefix in LOCAL_IMAGE_KEYWORDS:
        if _re.search(pattern, combined):
            for candidate in sorted(CHARS_DIR.glob("*")):
                if "_reference_" in candidate.stem.lower():
                    continue
                if str(candidate) in _USED_LOCAL_IMAGES:
                    continue
                if not candidate.stem.lower().startswith(filename_prefix.lower()):
                    continue
                h = _hash_file(candidate)
                if h and h in _USED_IMAGE_HASHES:
                    # Same picture as some other file already used (e.g. a
                    # "*_dupNN" copy) — skip it and keep looking.
                    _USED_LOCAL_IMAGES.add(str(candidate))
                    continue
                _mark_image_used(candidate)
                return candidate
    return None


# ── Image fetching ─────────────────────────────────────────────────────────────
def fetch_image(
    prompt: str,
    out_path: Path,
    seed: int,
    channel: str,
    w: int,
    h: int,
    retries: int = 3,
) -> bool:
    """Download an image from Pollinations Flux (free, no API key)."""
    style = STYLE_SUFFIX.get(channel, DEFAULT_STYLE)
    full_prompt = f"{prompt}, {style}"
    encoded    = urllib.parse.quote(full_prompt)
    url        = POLL_URL.format(prompt=encoded, w=w, h=h, seed=seed)

    for attempt in range(retries):
        try:
            print(f"         Fetching image (attempt {attempt+1}/{retries})…")
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = resp.read()
            out_path.write_bytes(data)
            print(f"         ✓ Image saved ({len(data)//1024} KB)")
            return True
        except Exception as e:
            is_rate_limit = "429" in str(e) or "Too Many Requests" in str(e)
            print(f"         ✗ Attempt {attempt+1} failed: {e}")
            if attempt < retries - 1:
                # Pollinations' free tier rate-limits hard under concurrent
                # load — a flat 3s retry isn't enough to clear it and just
                # burns through the whole retry budget on more 429s. Back
                # off much longer specifically for rate-limit errors.
                time.sleep(20 if is_rate_limit else 3)

    # Pollinations exhausted its retries (almost always a 429 rate-limit
    # under concurrent load). Try Gemini's native image generation as a
    # second free source before giving up to a flat-color fallback card.
    if GEMINI_API_KEY:
        print("         Pollinations exhausted — trying Gemini fallback…")
        if fetch_image_gemini(prompt, out_path, channel, w, h):
            return True
    return False


GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image"
GEMINI_URL_TMPL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_IMAGE_MODEL}:generateContent?key={{api_key}}"
)


def fetch_image_gemini(prompt: str, out_path: Path, channel: str, w: int, h: int) -> bool:
    """Second free image source: Gemini's native image generation
    (gemini-2.5-flash-image, aka "Nano Banana"). Same GEMINI_API_KEY env
    var used for any Gemini chat usage — free tier covers a few hundred
    images/day, no GCP billing account required. Used as a fallback when
    Pollinations gets rate-limited."""
    style = STYLE_SUFFIX.get(channel, DEFAULT_STYLE)
    full_prompt = (
        f"{prompt}, {style}. Image should be composed for a "
        f"{'portrait' if h > w else 'landscape'} {w}x{h} frame."
    )
    url = GEMINI_URL_TMPL.format(api_key=GEMINI_API_KEY)
    body = json.dumps({"contents": [{"parts": [{"text": full_prompt}]}]}).encode()

    global _gemini_last_call_at
    with _GEMINI_LOCK:
        wait = _GEMINI_MIN_INTERVAL_SEC - (time.time() - _gemini_last_call_at)
        if wait > 0:
            time.sleep(wait)
        try:
            req = urllib.request.Request(
                url, data=body, method="POST",
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                result = json.loads(resp.read())
            parts = result["candidates"][0]["content"]["parts"]
            for part in parts:
                inline = part.get("inlineData") or part.get("inline_data")
                if inline and inline.get("data"):
                    data = base64.b64decode(inline["data"])
                    out_path.write_bytes(data)
                    print(f"         ✓ Gemini image saved ({len(data)//1024} KB)")
                    return True
            print("         ✗ Gemini response had no image data")
            return False
        except Exception as e:
            print(f"         ✗ Gemini fallback failed: {e}")
            return False
        finally:
            _gemini_last_call_at = time.time()


# ── Fallback image card ────────────────────────────────────────────────────────────────────────────────
def make_fallback_card(path: Path, w: int, h: int, bg: list) -> bool:
    """Create a solid-color fallback image using FFmpeg (no Pillow needed).
    Returns True on success, False if FFmpeg failed (path will not exist / be empty)."""
    color = (bg[0] if bg else "#1a1a2e").lstrip("#")
    ffmpeg = find_ffmpeg()
    result = subprocess.run(
        [ffmpeg, "-y", "-f", "lavfi",
         "-i", f"color=c=#{color}:size={w}x{h}:rate=1",
         "-frames:v", "1", str(path)],
        capture_output=True,
    )
    if result.returncode != 0 or not path.exists() or path.stat().st_size == 0:
        print(f"   [WARN] make_fallback_card failed for {path.name} "
              f"(rc={result.returncode}): {result.stderr.decode(errors='replace')[:120]}")
        # Remove empty/corrupt file so callers don't treat it as valid
        if path.exists():
            try:
                path.unlink()
            except OSError:
                pass
        return False
    return True


# ── Premium video-provider node chain ──────────────────────────────────────────
# Pluggable nodes — providers/{higgsfield,kling,runway,veo}.py. Each node is
# gated purely on whether its own API key is set in .env (HIGGSFIELD_API_KEY,
# KLING_API_KEY, RUNWAY_API_KEY, VEO_API_KEY). With zero keys set, this whole
# chain is a no-op and every scene falls through to the free Pollinations/
# Gemini-image + Ken Burns path exactly as before — add a key to "light up"
# that node without touching anything else.
PROVIDER_NODE_ORDER = ["higgsfield", "kling", "runway", "veo"]


def _load_provider_nodes() -> list:
    nodes = []
    try:
        from providers.higgsfield import HiggssfieldProvider
        from providers.kling import KlingProvider
        from providers.runway import RunwayProvider
        from providers.veo import VeoProvider
    except Exception as e:
        print(f"   [VID]  Provider nodes unavailable ({e}) — skipping premium chain")
        return nodes
    for cls in (HiggssfieldProvider, KlingProvider, RunwayProvider, VeoProvider):
        try:
            nodes.append(cls())
        except Exception:
            continue
    return nodes


def generate_clip_via_premium_provider(
    prompt: str,
    clip_path: Path,
    duration_sec: float,
    ffmpeg: str,
    ref_image: Optional[Path] = None,
    poll_attempts: int = 30,
    poll_interval: int = 10,
) -> bool:
    """Try each connected premium video-generation node, in priority order,
    before the caller falls back to the free Ken Burns pipeline."""
    nodes = [n for n in _load_provider_nodes() if n.is_connected()]
    if not nodes:
        return False
    for provider in nodes:
        name = provider.__class__.__name__.replace("Provider", "").replace("Higgssfield", "Higgsfield")
        print(f"   [VID]  {name} node connected — requesting AI video clip…")
        submission = provider.generate_video(
            prompt,
            reference_image_path=str(ref_image) if ref_image else None,
            aspect_ratio="16:9",
            duration_sec=max(1, int(round(duration_sec))),
        )
        if submission.get("status") != "submitted" or not submission.get("job_id"):
            print(f"   [VID]  {name} submission failed: {submission.get('raw', submission)}")
            continue
        job_id = submission["job_id"]
        output_url = None
        for _ in range(poll_attempts):
            time.sleep(poll_interval)
            status = provider.get_job_status(job_id)
            st = str(status.get("status", "")).lower()
            if st in ("completed", "succeed", "succeeded", "success", "done"):
                output_url = status.get("output_url")
                break
            if st in ("failed", "error"):
                print(f"   [VID]  {name} job failed: {status}")
                break
        if not output_url:
            print(f"   [VID]  {name} didn't return a usable video in time — trying next node")
            continue
        try:
            req = urllib.request.Request(output_url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read()
            clip_path.write_bytes(data)
            if is_valid_clip(clip_path, ffmpeg, min_duration=duration_sec * 0.5):
                print(f"   [VID]  ✓ {name} clip downloaded ({len(data)//1024} KB)")
                return True
            clip_path.unlink(missing_ok=True)
        except Exception as e:
            print(f"   [VID]  {name} download failed: {e}")
    return False


# ── Render one scene → MP4 clip ────────────────────────────────────────────────
def is_valid_clip(path: Path, ffmpeg: str, min_duration: float = 0.5) -> bool:
    """Verify a media file actually exists, opens, and has real duration.
    This catches corrupted/truncated files that a simple size check misses
    (e.g. 'moov atom not found' from an interrupted write)."""
    if not path.exists() or path.stat().st_size < 10_000:
        return False
    ffprobe_bin = str(Path(ffmpeg).with_name(
        Path(ffmpeg).name.replace("ffmpeg", "ffprobe")
    ))
    try:
        result = subprocess.run(
            [ffprobe_bin, "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", str(path)],
            capture_output=True, text=True, timeout=20,
        )
        if result.returncode != 0 or not result.stdout.strip():
            return False
        return float(result.stdout.strip()) >= min_duration
    except Exception:
        return False


def render_scene(
    img_path: Path,
    audio_path: Path,
    clip_path: Path,
    dur: float,
    w: int,
    h: int,
    ffmpeg: str,
    zoom: float = ZOOM,
) -> bool:
    """Ken Burns zoom + TTS audio → MP4 clip."""
    zoom_end   = 1.0 + zoom * dur * FPS
    vf = (
        f"scale={w*2}:{h*2},"
        f"zoompan=z='min(zoom+{zoom:.6f},{zoom_end:.4f})':d={int(dur*FPS)}:"
        f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={w}x{h}:fps={FPS},"
        f"format=yuv420p"
    )
    cmd = [
        ffmpeg, "-y",
        "-loop", "1", "-i", str(img_path),
        "-i",           str(audio_path),
        "-vf",          vf,
        "-c:v",         "libx264",
        "-preset",      "fast",
        "-crf",         "23",
        "-c:a",         "aac",
        "-b:a",         "192k",
        "-shortest",
        "-movflags",    "+faststart",
        str(clip_path),
    ]
    result = subprocess.run(cmd, capture_output=True, timeout=300)
    return result.returncode == 0


# ── Subtitles (burned-in captions) ──────────────────────────────────────────────
def _split_into_caption_chunks(text: str, max_chars: int = 58) -> list:
    words, chunks, cur, cur_len = text.split(), [], [], 0
    for word in words:
        if cur and cur_len + len(word) + 1 > max_chars:
            chunks.append(" ".join(cur))
            cur, cur_len = [word], len(word)
        else:
            cur.append(word)
            cur_len += len(word) + 1
    if cur:
        chunks.append(" ".join(cur))
    return chunks


def _srt_timestamp(t: float) -> str:
    t = max(0.0, t)
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    ms = int((s - int(s)) * 1000)
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{ms:03d}"


def build_srt(text: str, duration: float, out_path: Path) -> Path:
    """Simple SRT for one scene's narration, paced proportionally (by word
    count) across the scene's actual audio duration — no external deps."""
    chunks = _split_into_caption_chunks(text) if text else []
    total_words = sum(len(c.split()) for c in chunks) or 1
    t = 0.0
    lines = []
    for i, chunk in enumerate(chunks, 1):
        share = len(chunk.split()) / total_words
        seg_dur = max(0.8, duration * share)
        start, end = t, min(duration, t + seg_dur)
        lines.append(f"{i}\n{_srt_timestamp(start)} --> {_srt_timestamp(end)}\n{chunk}\n")
        t = end
    out_path.write_text("\n".join(lines), encoding="utf-8")
    return out_path


def burn_subtitles(in_video: Path, srt_path: Path, out_video: Path, ffmpeg: str) -> bool:
    """Burn an SRT into a video via ffmpeg's subtitles filter (libass)."""
    srt_arg = str(srt_path).replace("\\", "/").replace(":", "\\:")
    style = (
        "FontSize=14,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,"
        "BorderStyle=3,Outline=1,Shadow=0,MarginV=60"
    )
    vf = f"subtitles='{srt_arg}':force_style='{style}'"
    cmd = [
        ffmpeg, "-y", "-i", str(in_video),
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "copy",
        str(out_video),
    ]
    result = subprocess.run(cmd, capture_output=True, timeout=300)
    return result.returncode == 0


def render_scene_multi(
    img_paths: list,
    audio_path: Path,
    clip_path: Path,
    dur: float,
    w: int,
    h: int,
    ffmpeg: str,
    zoom: float = ZOOM,
    narration: str = "",
) -> bool:
    """Ken Burns across 2+ images (minimum 2 per scene, per channel policy) +
    one continuous audio track → single MP4 clip. Each image gets an equal
    share of the scene duration; segments are concatenated silently, then
    the full narration is muxed on top."""
    n = max(2, len(img_paths))
    imgs = list(img_paths)
    while len(imgs) < n:
        imgs.append(imgs[-1])
    seg_dur = dur / n
    work_dir = clip_path.parent
    seg_files = []

    for i, img in enumerate(imgs):
        seg_path = work_dir / f"{clip_path.stem}_seg{i}.mp4"
        zoom_end = 1.0 + zoom * seg_dur * FPS
        vf = (
            f"scale={w*2}:{h*2},"
            f"zoompan=z='min(zoom+{zoom:.6f},{zoom_end:.4f})':d={int(seg_dur*FPS)}:"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={w}x{h}:fps={FPS},"
            f"format=yuv420p"
        )
        cmd = [
            ffmpeg, "-y", "-loop", "1", "-i", str(img),
            "-t", str(seg_dur),
            "-vf", vf,
            "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-an",
            str(seg_path),
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=300)
        if result.returncode != 0 or not is_valid_clip(seg_path, ffmpeg, min_duration=0.3):
            for sf in seg_files + [seg_path]:
                try: sf.unlink()
                except Exception: pass
            return False
        seg_files.append(seg_path)

    list_path = work_dir / f"{clip_path.stem}_concat.txt"
    with open(list_path, "w") as f:
        for sf in seg_files:
            f.write(f"file '{sf.name}'\n")
    silent_video = work_dir / f"{clip_path.stem}_silent.mp4"
    subprocess.run(
        [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(list_path), "-c", "copy", str(silent_video)],
        capture_output=True, cwd=str(work_dir), timeout=300,
    )

    result2 = subprocess.run(
        [ffmpeg, "-y", "-i", str(silent_video), "-i", str(audio_path),
         "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
         "-movflags", "+faststart", str(clip_path)],
        capture_output=True, timeout=300,
    )

    ok_mux = result2.returncode == 0 and is_valid_clip(clip_path, ffmpeg)

    # Burn in subtitles, paced to the real (post -shortest) clip duration.
    if ok_mux and narration.strip():
        srt_path = work_dir / f"{clip_path.stem}.srt"
        sub_out  = work_dir / f"{clip_path.stem}_subbed.mp4"
        try:
            real_dur = get_duration(clip_path, ffmpeg) or dur
            build_srt(narration, real_dur, srt_path)
            if burn_subtitles(clip_path, srt_path, sub_out, ffmpeg) and is_valid_clip(sub_out, ffmpeg):
                shutil.move(str(sub_out), str(clip_path))
            else:
                print(f"   [SUB]  Subtitle burn failed for {clip_path.name} — keeping clip without captions")
        except Exception as e:
            print(f"   [SUB]  Subtitle step error: {e}")
        finally:
            for p in (srt_path, sub_out):
                try: p.unlink()
                except Exception: pass

    for sf in seg_files + [silent_video, list_path]:
        try: sf.unlink()
        except Exception: pass

    return ok_mux


# ── Concatenate all scene clips → final video ───────────────────────────────────
def concat_scenes(scene_files: list, out_path: Path, ffmpeg: str) -> bool:
    """Write a concat list and merge all scene clips.
    Returns True only if ffmpeg succeeded AND the resulting file is actually
    valid — a corrupted clip mid-list can make ffmpeg's concat demuxer stop
    early and silently write a truncated file otherwise."""
    list_path = out_path.parent / "concat_list.txt"
    with open(list_path, "w") as f:
        for sf in scene_files:
            f.write(f"file '{sf}'\n")
    result = subprocess.run(
        [ffmpeg, "-y", "-f", "concat", "-safe", "0",
         "-i", str(list_path),
         "-c", "copy", str(out_path)],
        capture_output=True,
        timeout=600,
    )
    if result.returncode != 0:
        err = result.stderr.decode(errors="replace")[-800:]
        print(f"   [CONCAT] ✗ ffmpeg exited {result.returncode}:\n{err}")
        return False

    expected = sum(get_duration(sf, ffmpeg) for sf in scene_files)
    actual   = get_duration(out_path, ffmpeg)
    if not is_valid_clip(out_path, ffmpeg, min_duration=1.0):
        print(f"   [CONCAT] ✗ output failed validity check")
        return False
    if expected > 0 and actual < expected * 0.9:
        print(f"   [CONCAT] ✗ output is shorter than expected "
              f"({actual:.1f}s vs {expected:.1f}s expected) — treating as failed")
        return False
    return True


# ── Optional music mix ─────────────────────────────────────────────────────────────
def mix_music(video_path: Path, music_path: Path, out_path: Path, ffmpeg: str) -> None:
    """Mix background music under narration (narration wins)."""
    dur = get_duration(video_path, ffmpeg)
    subprocess.run(
        [ffmpeg, "-y",
         "-i", str(video_path),
         "-stream_loop", "-1", "-i", str(music_path),
         "-filter_complex",
         "[1:a]volume=0.12[music];[0:a][music]amix=inputs=2:duration=first[aout]",
         "-map", "0:v", "-map", "[aout]",
         "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
         "-t", str(dur), str(out_path)],
        capture_output=True,
        timeout=600,
    )


# ── Parallel image prefetch (speed bot) ─────────────────────────────────────────
def prefetch_images_parallel(
    scenes: list,
    episode_id: str,
    channel: str,
    work_dir: Path,
    w: int,
    h: int,
    max_workers: int = 3,
) -> set:
    """Fetch every image this episode needs from Pollinations CONCURRENTLY,
    before the main per-scene loop runs sequentially.

    Image download/generation — one request at a time, with sleep-based
    retries — is the single biggest chunk of total render time, far more
    than TTS or ffmpeg muxing. Running a few fetches in flight at once
    still cuts wall-clock time noticeably. Kept deliberately low (3, not
    8+) because Pollinations' free tier rate-limits hard (HTTP 429) under
    heavier concurrent load — past that point more workers just means more
    failed fetches falling back to flat-color cards, which is strictly
    worse than going a bit slower and actually getting real images.

    Local-pool lookups (slot 1 keyword matches in character_images/) stay
    synchronous here since they're disk copies, not network calls, and go
    through the same content-hash dedup as the sequential path.

    Returns the set of paths this pass actually wrote, so the main loop
    knows to reuse them instead of re-fetching from scratch.
    """
    jobs: list = []      # (path, prompt, seed) for Pollinations fetches
    written: set = set()

    VARIANT_SUFFIXES = [
        "",
        ", alternate camera angle, different composition",
        ", close-up detail shot, dramatic framing",
        ", wide establishing shot, sweeping cinematic angle",
    ]
    N_IMAGES_PER_SCENE = 4

    for idx, scene in enumerate(scenes):
        num    = scene.get("scene_number", idx + 1)
        prompt = scene.get("visual_prompt", "")
        stitle = scene.get("title", f"Scene {num}")

        for slot in range(1, N_IMAGES_PER_SCENE + 1):
            img_path = work_dir / f"scene_{num:02d}_{slot}.jpg"
            if img_path.exists() and img_path.stat().st_size < 10_000:
                try:
                    img_path.unlink()
                except Exception:
                    pass
            if img_path.exists():
                continue
            if slot == 1:
                local = find_local_image(prompt, stitle, episode_id, num)
                if local:
                    shutil.copy2(str(local), str(img_path))
                    written.add(img_path)
                    continue
            variant_prompt = f"{prompt}{VARIANT_SUFFIXES[(slot - 1) % len(VARIANT_SUFFIXES)]}"
            q = f"{variant_prompt}, sharp focus, highly detailed, crisp linework, professional concept art"
            jobs.append((img_path, q, num * 13 + idx + slot * 97))

    if not jobs:
        return written

    print(f"\n[PREFETCH] Fetching {len(jobs)} image(s) concurrently "
          f"({max_workers} at a time)…")

    def _run_job(job) -> tuple:
        path, prompt, seed = job
        ok = fetch_image(prompt, path, seed=seed, channel=channel, w=w, h=h)
        if ok:
            # Same quality + dedup gates the sequential path applies.
            if path.stat().st_size < 40_000:
                ok = fetch_image(prompt, path, seed=seed + 7777, channel=channel, w=w, h=h)
            h_new = _hash_file(path) if ok else None
            with _HASH_LOCK:
                if h_new and h_new in _USED_IMAGE_HASHES:
                    ok = fetch_image(prompt, path, seed=seed + 50000, channel=channel, w=w, h=h)
                    h_new = _hash_file(path) if ok else None
                if h_new:
                    _USED_IMAGE_HASHES.add(h_new)
                    _save_used_hashes(_USED_IMAGE_HASHES)
        return path, ok

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as pool:
        for path, ok in pool.map(_run_job, jobs):
            written.add(path)
            status = "ok" if ok else "FAILED (fallback card will be used)"
            print(f"   [PREFETCH] {path.name}: {status}")

    return written


# ── Main render loop ─────────────────────────────────────────────────────────────────
def main() -> None:
    ap = argparse.ArgumentParser(description="Viral Engine — hands-free video pipeline")
    ap.add_argument("--episode",      required=True,  help="e.g. GG_EP001, ML_EP002")
    ap.add_argument("--skip-images",  action="store_true", help="Reuse cached scene images")
    ap.add_argument("--music",        default=None,   help="Path to background music MP3")
    ap.add_argument("--portrait",     action="store_true", help="1080x1920 Shorts format")
    ap.add_argument("--images-only",  action="store_true", help="Generate the 2 images per scene and stop (no TTS/video) — for review before full render")
    args = ap.parse_args()

    episode_id = args.episode.upper()
    channel    = episode_id.split('_')[0]   # GG / ML / LO

    # Per-process path cache only — the real dedup guarantee is the
    # content-hash set in _used_image_hashes.json, which persists across
    # episodes (see find_local_image() / _mark_image_used()).
    _USED_LOCAL_IMAGES.clear()

    w, h = (W_PORT, H_PORT) if args.portrait else (W_LAND, H_LAND)

    ffmpeg = find_ffmpeg()
    print(f"\n{'='*60}")
    print(f"  VIRAL ENGINE  —  {CHANNEL_LABELS.get(channel, channel)}  —  {episode_id}")
    print(f"{'='*60}\n")

    # ── Load episode JSON ─────────────────────────────────────────────────────────────
    try:
        ep_path = find_episode_json(episode_id)
    except FileNotFoundError as exc:
        sys.exit(f"ERROR: {exc}")

    with open(ep_path, encoding="utf-8") as f:
        ep_data = json.load(f)

    scenes = ep_data.get("scenes", [])
    if not scenes:
        sys.exit("ERROR: No scenes found in episode JSON.")

    title   = ep_data.get("title", episode_id)
    voice   = CHANNEL_VOICE.get(channel, "am_adam")
    rate    = CHANNEL_RATE.get(channel,  0.90)   # Kokoro speed multiplier

    print(f"  Episode : {title}")
    print(f"  Scenes  : {len(scenes)}")
    print(f"  Voice   : {voice}  ({rate})")
    print(f"  Size    : {w}x{h}\n")

    # ── Work directory ─────────────────────────────────────────────────────────────────
    work_dir = OUTPUT_DIR / episode_id
    work_dir.mkdir(parents=True, exist_ok=True)

    renders_dir = BASE_DIR / "renders"
    renders_dir.mkdir(exist_ok=True)

    final_raw  = work_dir / f"{episode_id}_raw.mp4"
    final_out  = renders_dir / f"{episode_id}_final.mp4"

    scene_files: list[Path] = []

    # ── Parallel image prefetch ───────────────────────────────────────────────────────
    # Skipped only when --skip-images is set (user explicitly wants to reuse
    # whatever's already on disk without touching the network at all).
    prefetched: set = set()
    if not args.skip_images:
        prefetched = prefetch_images_parallel(scenes, episode_id, channel, work_dir, w, h)

    # ── Scene loop ─────────────────────────────────────────────────────────────────────
    for idx, scene in enumerate(scenes):
        num    = scene.get("scene_number", idx + 1)
        narr   = scene.get("narration",    "")
        prompt = scene.get("visual_prompt", "")
        stitle = scene.get("title",        f"Scene {num}")
        dur    = float(scene.get("duration_sec", 47))
        bg     = scene.get("bg_colors",   ["#1a1a2e"])

        audio_path = work_dir / f"scene_{num:02d}.mp3"
        clip_path  = work_dir / f"scene_{num:02d}.mp4"
        # 4 images per scene (channel policy: no static single-image scenes,
        # and images are never shared across episodes/scenes).
        N_IMAGES_PER_SCENE = 4
        img_paths = [work_dir / f"scene_{num:02d}_{i}.jpg" for i in range(1, N_IMAGES_PER_SCENE + 1)]
        VARIANT_SUFFIXES = [
            "",
            ", alternate camera angle, different composition",
            ", close-up detail shot, dramatic framing",
            ", wide establishing shot, sweeping cinematic angle",
        ]

        print(f"\n── Scene {num:02d}/{len(scenes)}  [{stitle}] ──")

        # Step 1 — Images (4 per scene)
        for slot, img_path in enumerate(img_paths, start=1):
            if img_path.exists() and img_path.stat().st_size < 10_000:
                # Empty/truncated placeholder (e.g. from a dedup cleanup pass)
                # — must NOT be treated as "already done" even in skip-images mode.
                try:
                    img_path.unlink()
                except Exception:
                    pass
            if args.skip_images and img_path.exists():
                print(f"   [IMG]  Reusing cached {img_path.name}")
                continue
            if img_path in prefetched and img_path.exists() and img_path.stat().st_size >= 10_000:
                print(f"   [IMG {slot}]  Using prefetched {img_path.name}")
                continue
            local = find_local_image(prompt, stitle, episode_id, num) if slot == 1 else None
            if local:
                print(f"   [IMG {slot}]  Local image → {local.name}")
                shutil.copy2(str(local), str(img_path))
            else:
                print(f"   [IMG {slot}]  Pollinations Flux…")
                variant_prompt = f"{prompt}{VARIANT_SUFFIXES[(slot - 1) % len(VARIANT_SUFFIXES)]}"
                quality_prompt = f"{variant_prompt}, sharp focus, highly detailed, crisp linework, professional concept art"
                seed = num * 13 + idx + slot * 97
                ok = fetch_image(quality_prompt, img_path, seed=seed,
                                 channel=channel, w=w, h=h)
                if ok:
                    # Quality gate: only retry if the image is suspiciously
                    # tiny (e.g. a near-blank render or transient bad fetch).
                    # Normal Pollinations Flux output here typically runs
                    # 60-100KB, so a 150KB floor was retrying nearly every
                    # single image for no benefit and roughly doubling fetch
                    # time across the board.
                    if img_path.stat().st_size < 40_000:
                        print(f"   [IMG {slot}]  Low-detail image detected (small file size) — retrying…")
                        retry_ok = fetch_image(quality_prompt, img_path, seed=seed + 7777,
                                                channel=channel, w=w, h=h)
                        if retry_ok and img_path.stat().st_size > 40_000:
                            ok = True
                        elif not retry_ok:
                            ok = False
                    h_new = _hash_file(img_path)
                    if h_new and h_new in _USED_IMAGE_HASHES:
                        # Extremely rare, but enforce the policy: never the
                        # same picture twice. One retry with a different seed.
                        print(f"   [IMG {slot}]  Duplicate content detected — retrying with new seed…")
                        ok = fetch_image(quality_prompt, img_path, seed=seed + 50000,
                                         channel=channel, w=w, h=h)
                        h_new = _hash_file(img_path) if ok else None
                    if h_new:
                        _USED_IMAGE_HASHES.add(h_new)
                        _save_used_hashes(_USED_IMAGE_HASHES)
                if not ok:
                    print(f"   [IMG {slot}]  Fallback card (all fetches failed)")
                    make_fallback_card(img_path, w, h, bg)

        if args.images_only:
            print(f"   [IMG]  images-only mode — skipping narration/video for this scene")
            continue

        # Step 2 — TTS narration
        if audio_path.exists() and not is_valid_clip(audio_path, ffmpeg, min_duration=0.5):
            print(f"   [TTS]  ⚠ Existing narration is corrupted — discarding and regenerating")
            try:
                audio_path.unlink()
            except Exception:
                pass

        if not audio_path.exists():
            print(f"   [TTS]  Generating narration (Kokoro voice={voice}, speed={rate})...")
            kokoro_ok = False
            if KOKORO_PYTHON.exists() and KOKORO_CLI.exists():
                try:
                    wav_out = audio_path.with_suffix(".wav")
                    result = subprocess.run(
                        [
                            str(KOKORO_PYTHON), str(KOKORO_CLI),
                            "--text",  narr,
                            "--voice", voice,
                            "--speed", str(rate),
                            "--out",   str(wav_out),
                        ],
                        capture_output=True, text=True,
                        timeout=180,
                        encoding="utf-8", errors="replace",
                    )
                    if result.returncode == 0 and wav_out.exists() and wav_out.stat().st_size > 1000:
                        # Convert WAV -> MP3 for pipeline compatibility
                        subprocess.run(
                            [ffmpeg, "-y", "-i", str(wav_out), str(audio_path)],
                            capture_output=True, timeout=60,
                        )
                        wav_out.unlink(missing_ok=True)
                        if audio_path.exists() and audio_path.stat().st_size > 1000:
                            print(f"   [TTS]  [OK] Kokoro -> {audio_path.name}")
                            kokoro_ok = True
                        else:
                            print(f"   [TTS]  [WARN] Kokoro WAV->MP3 failed -- trying SAPI")
                    else:
                        err = (result.stderr or "").strip()
                        print(f"   [TTS]  [WARN] Kokoro failed (exit {result.returncode}): {err[:120]}")
                except Exception as e:
                    print(f"   [TTS]  [WARN] Kokoro exception: {e}")
            else:
                print(f"   [TTS]  [WARN] Kokoro venv not found -- using SAPI fallback")

            if not kokoro_ok:
                # SAPI fallback (Windows built-in, no internet required)
                print("   [TTS]  Trying SAPI fallback...")
                try:
                    wav_str   = str(audio_path.with_suffix(".wav"))
                    safe_narr = narr.replace("'", "").replace('"', "")
                    subprocess.run(
                        ["powershell", "-Command",
                         "Add-Type -AssemblyName System.Speech; "
                         "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer; "
                         f"$s.SetOutputToWaveFile('{wav_str}'); "
                         f"$s.Speak('{safe_narr}'); $s.Dispose()"],
                        capture_output=True, timeout=60,
                    )
                    wav = audio_path.with_suffix(".wav")
                    if wav.exists() and wav.stat().st_size > 1000:
                        subprocess.run(
                            [ffmpeg, "-y", "-i", str(wav), str(audio_path)],
                            capture_output=True,
                        )
                        wav.unlink(missing_ok=True)
                        print(f"   [TTS]  [OK] SAPI fallback -> {audio_path.name}")
                    else:
                        print(f"   [TTS]  [WARN] SAPI produced no audio -- using silence")
                        _make_silence(audio_path, dur, ffmpeg)
                except Exception as e:
                    print(f"   [TTS]  [FAIL] SAPI failed: {e} -- using silence")
                    _make_silence(audio_path, dur, ffmpeg)
        else:
            print(f"   [TTS]  Reusing {audio_path.name}")

        # Step 3 — Render scene clip (validated, with automatic retry + fallback)
        if clip_path.exists() and not is_valid_clip(clip_path, ffmpeg):
            print(f"   [VID]  ⚠ Existing clip is corrupted — discarding and re-rendering")
            try:
                clip_path.unlink()
            except Exception:
                pass

        if clip_path.exists():
            print(f"   [VID]  Reusing {clip_path.name}")
        elif generate_clip_via_premium_provider(
            f"{prompt}, {STYLE_SUFFIX.get(channel, DEFAULT_STYLE)}",
            clip_path, dur, ffmpeg,
            ref_image=img_paths[0] if img_paths and img_paths[0].exists() else None,
        ):
            scene_files.append(clip_path)
            continue
        else:
            MAX_RETRIES = 3
            ok = False
            for attempt in range(1, MAX_RETRIES + 1):
                print(f"   [VID]  Rendering {len(img_paths)}-image Ken Burns clip… (attempt {attempt}/{MAX_RETRIES})")
                ok = render_scene_multi(img_paths, audio_path, clip_path, dur, w, h, ffmpeg, narration=narr)
                if ok and is_valid_clip(clip_path, ffmpeg):
                    print(f"   [VID]  ✓ {clip_path.name}")
                    break
                print(f"   [VID]  ✗ attempt {attempt} produced an invalid/failed clip")
                try:
                    clip_path.unlink()
                except Exception:
                    pass
                ok = False

            if not ok:
                # Guaranteed-valid last resort so this scene can never silently
                # vanish from the episode: fallback cards + silence track.
                print(f"   [VID]  Falling back to title cards + silence for scene {num}")
                for img_path in img_paths:
                    make_fallback_card(img_path, w, h, bg)
                if not is_valid_clip(audio_path, ffmpeg, min_duration=0.1):
                    _make_silence(audio_path, dur, ffmpeg)
                ok = render_scene_multi(img_paths, audio_path, clip_path, dur, w, h, ffmpeg, narration=narr)
                if not ok or not is_valid_clip(clip_path, ffmpeg):
                    print(f"   [VID]  ✗✗ FATAL for scene {num} — skipping, episode will be missing this scene")
                    continue

        scene_files.append(clip_path)

    if args.images_only:
        print(f"\n{'='*60}")
        print(f"  ✓ IMAGES READY FOR REVIEW — {episode_id}")
        print(f"  {len(scenes)} scenes × 2 images in: {work_dir}")
        print(f"  Re-run without --images-only (with --skip-images) to finish the episode.")
        print(f"{'='*60}\n")
        return

    # ── Concat all clips ───────────────────────────────────────────────────────────
    if not scene_files:
        sys.exit("ERROR: No scene clips were produced.")

    print(f"\n── Concatenating {len(scene_files)} clips…")
    concat_ok = concat_scenes(scene_files, final_raw, ffmpeg)
    if not concat_ok:
        print("   [CONCAT] Retrying after re-validating every individual clip…")
        valid_files = [f for f in scene_files if is_valid_clip(f, ffmpeg)]
        dropped = len(scene_files) - len(valid_files)
        if dropped:
            print(f"   [CONCAT] Dropped {dropped} clip(s) that failed validation on recheck")
        concat_ok = concat_scenes(valid_files, final_raw, ffmpeg)
        scene_files = valid_files

    if not concat_ok:
        sys.exit(
            f"FATAL: concat failed even after filtering invalid clips.\n"
            f"  {episode_id} is INCOMPLETE — do not treat any existing "
            f"{final_out} as finished. Re-run this episode."
        )

    # ── Optional music mix ─────────────────────────────────────────────────────────────
    if args.music and Path(args.music).exists():
        print(f"── Mixing background music: {args.music}…")
        mix_music(final_raw, Path(args.music), final_out, ffmpeg)
    else:
        shutil.copy2(str(final_raw), str(final_out))

    # ── Final hard validation — never report success on a broken/short file ──────────
    expected_total = sum(float(s.get("duration_sec", 47)) for s in scenes)
    actual_total   = get_duration(final_out, ffmpeg)
    if not is_valid_clip(final_out, ffmpeg, min_duration=10.0):
        sys.exit(f"FATAL: {final_out} failed final validity check. Episode is NOT complete.")
    if expected_total > 0 and actual_total < expected_total * 0.85:
        sys.exit(
            f"FATAL: {final_out} is suspiciously short "
            f"({actual_total:.0f}s vs ~{expected_total:.0f}s expected from the script). "
            f"Treating as INCOMPLETE — do not upload this file. Re-run this episode."
        )

    mins, secs = divmod(int(actual_total), 60)

    print(f"\n{'='*60}")
    print(f"  ✓ DONE!  {episode_id}  ({len(scene_files)}/{len(scenes)} scenes)")
    print(f"  Duration : {mins}m {secs}s")
    print(f"  Output   : {final_out}")
    print(f"{'='*60}\n")


def _make_silence(path: Path, dur: float, ffmpeg: str) -> None:
    """Generate a silent audio file of the given duration."""
    subprocess.run(
        [ffmpeg, "-y", "-f", "lavfi", "-i", f"anullsrc=r=44100:cl=mono",
         "-t", str(dur), "-c:a", "aac", str(path)],
        capture_output=True,
    )


if __name__ == "__main__":
    main()
