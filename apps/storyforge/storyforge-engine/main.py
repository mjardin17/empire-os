"""
StoryForge Engine -- FastAPI entrypoint.

Preserves the original root route exactly, and adds real, working
endpoints for every Phase 1 module: Story Science, Character Memory,
Creative Council, and Book Export.
"""

import time
import uuid
from dataclasses import asdict
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from core.science.engine import StoryScienceLab
from core.memory.character_memory import CharacterMemory
from core.council.specialists import CreativeCouncil, SPECIALISTS
from core.book.exporter import BookManifest, Chapter, EpubExporter
from core.ai.provider import ProviderError
from core.world.world_engine import WorldEngine
from core.world.continuity import ContinuityValidator
from core.image.image_studio import ImageStudio, ImageStudioError, asset_to_dict
from core.image.models import IMAGE_TYPES
from core.image.providers import list_image_providers
from core.publishing.models import (
    BOOK_CATEGORIES, MARKETING_CHANNELS, SELLING_PLATFORMS, TrendListing,
)
from core.publishing.research import analyze_listings
from core.publishing.design_brief import DesignBriefGenerator
from core.publishing.optimizer import BookOptimizer, BookOptimizerError
from core.publishing.marketing import MarketingGenerator, MarketingGeneratorError
from core.publishing.platform_export import PlatformExportError, publish_package, register_connector
from core.publishing.connectors.kdp_connector import KDPConnector
from core.publishing.connectors.d2d_connector import D2DConnector
from core.publishing.connectors.payhip_connector import PayhipConnector
from core.publishing.studio import PublishingStudio, PublishingStudioError
from dataclasses import asdict as _dataclass_asdict

# -- Phase 5: Empire Automation Studio (purely additive) -----------------
from core.automation.analytics import AnalyticsEngine
from core.automation.campaign_manager import CampaignManager, CampaignManagerError
from core.automation.formats import FormatGenerationError, FormatPackageGenerator
from core.automation.improvement_engine import ImprovementEngine
from core.automation.models import (
    CAMPAIGN_PLATFORMS, FORMAT_TYPES, MARKETING_SURFACES, ProjectReadiness,
    WorkflowDefinition, WorkflowRun, WorkflowStepDef,
)
from core.automation.providers import (
    ProviderError as AutomationProviderError, get_marketing_provider, get_publishing_provider,
    list_providers,
)
from core.automation.scheduler import Scheduler
from core.automation.studio import AutomationStudio, AutomationStudioError
from core.automation.workflow import WorkflowEngine, WorkflowError, list_step_types

# -- Empire OS adapter (sibling package, wires this engine into the ---
# -- Empire OS module gateway + event/memory bus) ----------------------
from empire_hooks.router import empire_router, setup_event_bridge
from empire_hooks.memory_sync import make_sync

# -- Patterson-formula book generation (additive router) ---------------
from core.book.router import book_router

# -- Book trailer video generation (additive router) --------------------
from core.video.router import video_router
import core.video.workflow_hooks as _video_workflow_hooks
import core.book.workflow_hooks as _book_workflow_hooks

app = FastAPI(title="StoryForge Engine")
app.include_router(empire_router)
app.include_router(book_router)
app.include_router(video_router)

# --- Original route, unchanged ---------------------------------------

@app.get("/")
def read_root():
    return {"status": "StoryForge Engine Online", "integration": "Empire OS"}


# --- Shared singletons -------------------------------------------------

_science_lab = StoryScienceLab()
_character_memory = CharacterMemory(db_path="storyforge_characters.db")
_epub_exporter = EpubExporter()
_world_engine = WorldEngine(db_path="storyforge_world.db", memory_sync=make_sync())
_continuity_validator = ContinuityValidator(_world_engine)
_image_studio = ImageStudio(db_path="storyforge_images.db", output_dir="generated_images")
_publishing_studio = PublishingStudio(db_path="storyforge_publishing.db", output_root="publishing_exports")

# Real direct-publish connectors (KDP/D2D/Payhip). Each is_configured()
# gracefully reports false if the relevant credentials aren't set - no
# credentials are set here, Josh adds real ones to .env himself.
register_connector("kdp", KDPConnector())
register_connector("d2d", D2DConnector())
register_connector("payhip", PayhipConnector())

# Real "video" workflow step (was a manual_or_provider_required stub).
_video_workflow_hooks.register()

# Phase 5: Empire Automation Studio singletons.
_automation_studio = AutomationStudio(db_path="storyforge_automation.db")
_format_generator = FormatPackageGenerator(output_root="automation_formats")
_campaign_manager = CampaignManager(event_bus=_automation_studio.events)
_analytics_engine = AnalyticsEngine(event_bus=_automation_studio.events)
_improvement_engine = ImprovementEngine(event_bus=_automation_studio.events)
_workflow_engine = WorkflowEngine(event_bus=_automation_studio.events)
_scheduler = Scheduler(event_bus=_automation_studio.events)

# Forward every AutomationStudio event to Empire OS (fire-and-forget;
# no-ops safely if EMPIRE_OS_EVENT_URL isn't set/reachable).
setup_event_bridge(_automation_studio)

# "chapters"/"epub_export"/"submit_platform_packages" -- new step types,
# nothing to override (workflow.py never had a book-generation concept).
_book_workflow_hooks.register()

# The single end-to-end pipeline: chapters -> epub -> prepare KDP/D2D/
# Payhip packages -> actually submit them -> trailer video -> queue for
# social distribution. Saved once at startup under a fixed id so it's
# immediately runnable via POST /automation/workflows/{id}/run without
# the caller having to construct this graph themselves first.
_STORYFORGE_PIPELINE_ID = "storyforge-book-pipeline"
if _automation_studio.get_workflow(_STORYFORGE_PIPELINE_ID) is None:
    _pipeline_now = time.time()
    _automation_studio.save_workflow(WorkflowDefinition(
        id=_STORYFORGE_PIPELINE_ID,
        name="StoryForge: Patterson book -> covers -> trailer -> publish -> distribute",
        start_step_id="chapters",
        created_at=_pipeline_now,
        updated_at=_pipeline_now,
        steps=[
            WorkflowStepDef(id="chapters", type="chapters", name="Generate + validate chapters",
                             on_success="epub_export"),
            WorkflowStepDef(id="epub_export", type="epub_export", name="Export EPUB",
                             on_success="kdp"),
            WorkflowStepDef(id="kdp", type="kdp", name="Prepare KDP listing", on_success="d2d"),
            WorkflowStepDef(id="d2d", type="d2d", name="Prepare Draft2Digital listing", on_success="payhip"),
            WorkflowStepDef(id="payhip", type="payhip", name="Prepare Payhip listing",
                             on_success="submit_packages"),
            WorkflowStepDef(id="submit_packages", type="submit_platform_packages",
                             name="Submit to KDP/D2D/Payhip", on_success="video"),
            # on_failure=on_success: a missing/broken trailer shouldn't
            # fail a run that already wrote and submitted the book --
            # same "best-effort, never take down the core result"
            # philosophy as Phase 4's cover generation. The distribute
            # step already handles a missing video_output_path
            # gracefully (returns skipped, not an exception).
            WorkflowStepDef(id="video", type="video", name="Generate trailer",
                             on_success="distribute", on_failure="distribute"),
            WorkflowStepDef(id="distribute", type="distribute_social",
                             name="Queue for Instagram/TikTok/Facebook (never YouTube — manual approval only)"),
        ],
    ))


# =======================================================================
# STORY SCIENCE
# =======================================================================

class ManuscriptRequest(BaseModel):
    text: str


@app.post("/science/analyze")
def analyze_manuscript(req: ManuscriptRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text must not be empty")
    report = _science_lab.evaluate_manuscript(req.text)
    return {
        "readability": asdict(report.readability),
        "emotion": asdict(report.emotion),
        "conflict": asdict(report.conflict),
        "pacing": asdict(report.pacing),
        "plot_hole_flags": report.plot_hole_flags,
        "notes": report.notes,
    }


# =======================================================================
# CHARACTER MEMORY
# =======================================================================

class CreateCharacterRequest(BaseModel):
    project_id: str
    name: str
    attributes: Optional[Dict[str, str]] = None


class SetAttributeRequest(BaseModel):
    key: str
    value: str
    force: bool = False


class AddEventRequest(BaseModel):
    event_type: str
    description: str
    story_context: Optional[str] = None


@app.post("/characters")
def create_character(req: CreateCharacterRequest):
    char = _character_memory.create_character(req.project_id, req.name, req.attributes)
    return {"id": char.id, "project_id": char.project_id, "name": char.name, "attributes": char.attributes}


@app.get("/characters/{character_id}")
def get_character(character_id: str):
    char = _character_memory.get_character(character_id)
    if not char:
        raise HTTPException(status_code=404, detail="character not found")
    return {"id": char.id, "project_id": char.project_id, "name": char.name, "attributes": char.attributes}


@app.get("/projects/{project_id}/characters")
def list_characters(project_id: str):
    chars = _character_memory.list_characters(project_id)
    return [{"id": c.id, "name": c.name, "attributes": c.attributes} for c in chars]


@app.post("/characters/{character_id}/attributes")
def set_attribute(character_id: str, req: SetAttributeRequest):
    issue = _character_memory.set_attribute(character_id, req.key, req.value, force=req.force)
    if issue:
        # 409 Conflict -- a real consistency violation, not silently accepted
        raise HTTPException(status_code=409, detail=issue.message)
    return {"status": "ok", "key": req.key, "value": req.value}


@app.post("/characters/{character_id}/events")
def add_event(character_id: str, req: AddEventRequest):
    event_id = _character_memory.add_event(character_id, req.event_type, req.description, req.story_context)
    return {"id": event_id, "status": "recorded"}


@app.get("/characters/{character_id}/history")
def get_history(character_id: str):
    return _character_memory.get_history(character_id)


# =======================================================================
# CREATIVE COUNCIL
# =======================================================================

class CouncilReviewRequest(BaseModel):
    project_context: str
    specialists: Optional[List[str]] = None
    provider: str = "openrouter"
    model: str = "anthropic/claude-sonnet-4"


@app.get("/council/roster")
def council_roster():
    return [{"name": s.name, "role": s.role, "expertise": s.expertise} for s in SPECIALISTS]


@app.post("/council/review")
def council_review(req: CouncilReviewRequest):
    try:
        council = CreativeCouncil(provider_name=req.provider, model=req.model)
    except ProviderError as e:
        raise HTTPException(status_code=400, detail=str(e))
    report = council.review_project(req.project_context, req.specialists)
    return report.to_dict()


# =======================================================================
# BOOK STUDIO -- EPUB EXPORT
# =======================================================================

class ChapterInput(BaseModel):
    title: str
    html_body: str


class ExportBookRequest(BaseModel):
    title: str
    author: str
    chapters: List[ChapterInput]
    output_path: str = "output_book"
    language: str = "en"


@app.post("/book/export/epub")
def export_epub(req: ExportBookRequest):
    manifest = BookManifest(
        title=req.title,
        author=req.author,
        language=req.language,
        chapters=[Chapter(title=c.title, html_body=c.html_body) for c in req.chapters],
    )
    try:
        path = _epub_exporter.export(manifest, req.output_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "exported", "path": path}


# =======================================================================
# WORLD ENGINE
# =======================================================================
# Persistent world memory: maps, locations, timeline, cultures,
# governments, species, magic systems, tech levels, character
# relationships, lore, encyclopedia search, and continuity validation.
# This is the shared substrate every other StoryForge module (Character
# Memory, Council, Franchise Engine, etc.) can build on.

class CreateWorldRequest(BaseModel):
    project_id: str
    name: str


class CreateLocationRequest(BaseModel):
    name: str
    location_type: str
    description: str = ""
    parent_location_id: Optional[str] = None
    coordinates: Optional[Dict[str, float]] = None


class CreateTimelineEventRequest(BaseModel):
    title: str
    era_order: int
    description: str = ""
    date_label: str = ""
    location_id: Optional[str] = None
    character_ids: Optional[List[str]] = None


class CreateCultureRequest(BaseModel):
    name: str
    description: str = ""
    values: Optional[List[str]] = None
    traditions: Optional[List[str]] = None
    related_species_ids: Optional[List[str]] = None


class CreateGovernmentRequest(BaseModel):
    name: str
    government_type: str = ""
    ruling_location_id: Optional[str] = None
    leader_character_id: Optional[str] = None
    laws: Optional[List[str]] = None


class CreateSpeciesRequest(BaseModel):
    name: str
    description: str = ""
    traits: Optional[List[str]] = None
    abilities: Optional[List[str]] = None
    homeland_location_id: Optional[str] = None


class CreateMagicSystemRequest(BaseModel):
    name: str
    source: str = ""
    rules: Optional[List[str]] = None
    costs: Optional[List[str]] = None
    limitations: Optional[List[str]] = None


class CreateTechLevelRequest(BaseModel):
    name: str
    description: str = ""
    applies_to_location_ids: Optional[List[str]] = None


class CreateRelationshipRequest(BaseModel):
    character_a_id: str
    character_b_id: str
    relationship_type: str
    description: str = ""


class CreateLoreEntryRequest(BaseModel):
    title: str
    body: str
    tags: Optional[List[str]] = None


class SetWorldAttributeRequest(BaseModel):
    entity_type: str
    entity_id: str
    key: str
    value: str
    force: bool = False


@app.post("/worlds")
def create_world(req: CreateWorldRequest):
    world_id = _world_engine.create_world(req.project_id, req.name)
    return {"id": world_id, "project_id": req.project_id, "name": req.name}


@app.get("/worlds/{world_id}")
def get_world(world_id: str):
    world = _world_engine.get_world(world_id)
    if not world:
        raise HTTPException(status_code=404, detail="world not found")
    return world


@app.post("/worlds/{world_id}/locations")
def create_location(world_id: str, req: CreateLocationRequest):
    loc = _world_engine.create_location(
        world_id, req.name, req.location_type, req.description,
        req.parent_location_id, req.coordinates,
    )
    return {"id": loc.id, "name": loc.name, "location_type": loc.location_type,
            "parent_location_id": loc.parent_location_id, "coordinates": loc.coordinates}


@app.get("/worlds/{world_id}/locations")
def list_locations(world_id: str):
    return [
        {"id": l.id, "name": l.name, "location_type": l.location_type,
         "description": l.description, "parent_location_id": l.parent_location_id,
         "coordinates": l.coordinates}
        for l in _world_engine.list_locations(world_id)
    ]


@app.get("/worlds/{world_id}/map")
def get_map(world_id: str):
    return _world_engine.get_map(world_id)


@app.post("/worlds/{world_id}/timeline")
def create_timeline_event(world_id: str, req: CreateTimelineEventRequest):
    event = _world_engine.create_timeline_event(
        world_id, req.title, req.era_order, req.description,
        req.date_label, req.location_id, req.character_ids,
    )
    return {"id": event.id, "title": event.title, "era_order": event.era_order}


@app.get("/worlds/{world_id}/timeline")
def list_timeline(world_id: str):
    return [
        {"id": e.id, "title": e.title, "description": e.description, "era_order": e.era_order,
         "date_label": e.date_label, "location_id": e.location_id, "character_ids": e.character_ids}
        for e in _world_engine.list_timeline(world_id)
    ]


@app.post("/worlds/{world_id}/cultures")
def create_culture(world_id: str, req: CreateCultureRequest):
    c = _world_engine.create_culture(world_id, req.name, req.description, req.values,
                                      req.traditions, req.related_species_ids)
    return {"id": c.id, "name": c.name}


@app.get("/worlds/{world_id}/cultures")
def list_cultures(world_id: str):
    return [{"id": c.id, "name": c.name, "description": c.description, "values": c.values,
             "traditions": c.traditions, "related_species_ids": c.related_species_ids}
            for c in _world_engine.list_cultures(world_id)]


@app.post("/worlds/{world_id}/governments")
def create_government(world_id: str, req: CreateGovernmentRequest):
    g = _world_engine.create_government(world_id, req.name, req.government_type,
                                         req.ruling_location_id, req.leader_character_id, req.laws)
    return {"id": g.id, "name": g.name}


@app.get("/worlds/{world_id}/governments")
def list_governments(world_id: str):
    return [{"id": g.id, "name": g.name, "government_type": g.government_type,
             "ruling_location_id": g.ruling_location_id, "leader_character_id": g.leader_character_id,
             "laws": g.laws}
            for g in _world_engine.list_governments(world_id)]


@app.post("/worlds/{world_id}/species")
def create_species(world_id: str, req: CreateSpeciesRequest):
    s = _world_engine.create_species(world_id, req.name, req.description, req.traits,
                                      req.abilities, req.homeland_location_id)
    return {"id": s.id, "name": s.name}


@app.get("/worlds/{world_id}/species")
def list_species(world_id: str):
    return [{"id": s.id, "name": s.name, "description": s.description, "traits": s.traits,
             "abilities": s.abilities, "homeland_location_id": s.homeland_location_id}
            for s in _world_engine.list_species(world_id)]


@app.post("/worlds/{world_id}/magic-systems")
def create_magic_system(world_id: str, req: CreateMagicSystemRequest):
    m = _world_engine.create_magic_system(world_id, req.name, req.source, req.rules,
                                           req.costs, req.limitations)
    return {"id": m.id, "name": m.name}


@app.get("/worlds/{world_id}/magic-systems")
def list_magic_systems(world_id: str):
    return [{"id": m.id, "name": m.name, "source": m.source, "rules": m.rules,
             "costs": m.costs, "limitations": m.limitations}
            for m in _world_engine.list_magic_systems(world_id)]


@app.post("/worlds/{world_id}/tech-levels")
def create_tech_level(world_id: str, req: CreateTechLevelRequest):
    t = _world_engine.create_tech_level(world_id, req.name, req.description, req.applies_to_location_ids)
    return {"id": t.id, "name": t.name}


@app.get("/worlds/{world_id}/tech-levels")
def list_tech_levels(world_id: str):
    return [{"id": t.id, "name": t.name, "description": t.description,
             "applies_to_location_ids": t.applies_to_location_ids}
            for t in _world_engine.list_tech_levels(world_id)]


@app.post("/worlds/{world_id}/relationships")
def create_relationship(world_id: str, req: CreateRelationshipRequest):
    r = _world_engine.create_relationship(world_id, req.character_a_id, req.character_b_id,
                                           req.relationship_type, req.description)
    return {"id": r.id, "relationship_type": r.relationship_type}


@app.get("/worlds/{world_id}/relationships")
def list_relationships(world_id: str, character_id: Optional[str] = None):
    return [{"id": r.id, "character_a_id": r.character_a_id, "character_b_id": r.character_b_id,
             "relationship_type": r.relationship_type, "description": r.description}
            for r in _world_engine.list_relationships(world_id, character_id)]


@app.post("/worlds/{world_id}/lore")
def create_lore_entry(world_id: str, req: CreateLoreEntryRequest):
    l = _world_engine.create_lore_entry(world_id, req.title, req.body, req.tags)
    return {"id": l.id, "title": l.title}


@app.get("/worlds/{world_id}/lore")
def list_lore(world_id: str):
    return [{"id": l.id, "title": l.title, "body": l.body, "tags": l.tags}
            for l in _world_engine.list_lore(world_id)]


@app.post("/world-attributes")
def set_world_attribute(req: SetWorldAttributeRequest):
    issue = _world_engine.set_attribute(req.entity_type, req.entity_id, req.key, req.value, force=req.force)
    if issue:
        raise HTTPException(status_code=409, detail=issue.message)
    return {"status": "ok", "key": req.key, "value": req.value}


@app.get("/worlds/{world_id}/encyclopedia/search")
def search_encyclopedia(world_id: str, q: str, limit: int = 20):
    return _world_engine.search_encyclopedia(world_id, q, limit)


@app.get("/worlds/{world_id}/continuity/validate")
def validate_continuity(world_id: str):
    issues = _continuity_validator.run_full_validation(world_id)
    return {
        "issue_count": len(issues),
        "issues": [
            {"check": i.check, "severity": i.severity, "message": i.message, "entity_ids": i.entity_ids}
            for i in issues
        ],
    }


# =======================================================================
# IMAGE STUDIO
# =======================================================================
# Provider-agnostic image generation (character sheets, expression
# sheets, turnarounds, scene illustrations, backgrounds, props, book
# covers, coloring pages, thumbnails, merchandise art). Every generation
# is persisted with its full prompt, provider, model, seed, dimensions,
# and links back into projects/characters/scenes/worlds. Providers are
# swappable via core/image/providers.py -- nothing here is tied to one
# image backend.

class GenerateImageRequest(BaseModel):
    project_id: str
    image_type: str
    prompt: str
    negative_prompt: str = ""
    provider: str = "placeholder"
    model: str = ""
    seed: Optional[int] = None
    width: int = 1024
    height: int = 1024
    character_id: Optional[str] = None
    scene_id: Optional[str] = None
    world_id: Optional[str] = None
    extra: Optional[Dict[str, object]] = None


@app.get("/image-types")
def get_image_types():
    return {"image_types": sorted(IMAGE_TYPES)}


@app.get("/image-providers")
def get_image_providers():
    return {"providers": list_image_providers()}


@app.post("/images/generate")
def generate_image(req: GenerateImageRequest):
    try:
        asset = _image_studio.generate_image(
            project_id=req.project_id,
            image_type=req.image_type,
            prompt=req.prompt,
            provider=req.provider,
            negative_prompt=req.negative_prompt,
            model=req.model,
            seed=req.seed,
            width=req.width,
            height=req.height,
            character_id=req.character_id,
            scene_id=req.scene_id,
            world_id=req.world_id,
            extra=req.extra,
        )
    except ImageStudioError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ProviderError as e:
        # Upstream/provider failure, not a bad request -- the attempt is
        # still recorded (status="failed") and retrievable via GET.
        raise HTTPException(status_code=502, detail=str(e))
    return asset_to_dict(asset)


@app.get("/images/{image_id}")
def get_image(image_id: str):
    asset = _image_studio.get_image(image_id)
    if not asset:
        raise HTTPException(status_code=404, detail="image not found")
    return asset_to_dict(asset)


@app.get("/images")
def list_images(
    project_id: Optional[str] = None,
    character_id: Optional[str] = None,
    scene_id: Optional[str] = None,
    world_id: Optional[str] = None,
    image_type: Optional[str] = None,
    provider: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
):
    try:
        assets = _image_studio.list_images(
            project_id=project_id,
            character_id=character_id,
            scene_id=scene_id,
            world_id=world_id,
            image_type=image_type,
            provider=provider,
            status=status,
            limit=limit,
        )
    except ImageStudioError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return [asset_to_dict(a) for a in assets]


@app.delete("/images/{image_id}")
def delete_image(image_id: str):
    deleted = _image_studio.delete_image(image_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="image not found")
    return {"status": "deleted", "id": image_id}


# =======================================================================
# PUBLISHING INTELLIGENCE STUDIO
# =======================================================================
# Purely additive: market research aggregation, original design-brief
# generation, AI-assisted listing copy, platform export packaging, and
# a marketing-copy generator, orchestrated by an approval/checklist
# workflow. Nothing above this line was changed. See
# core/publishing/*.py module docstrings for what is real/deterministic
# vs. AI-assisted vs. a deliberately-manual seam (no live marketplace
# scraping or auto-submission -- see platform_export.NullConnector).

class TrendListingInput(BaseModel):
    title: str
    category: str = ""
    price: Optional[float] = None
    page_count: Optional[int] = None
    rank: Optional[int] = None
    keywords: Optional[List[str]] = None
    cover_colors: Optional[List[str]] = None
    cover_style_notes: str = ""
    typography_notes: str = ""
    interior_layout_notes: str = ""
    illustration_style: str = ""
    review_snippets: Optional[List[str]] = None
    requested_features: Optional[List[str]] = None
    source: str = "manual"


class AnalyzeMarketRequest(BaseModel):
    project_id: str
    category: str
    listings: List[TrendListingInput]


class GenerateDesignBriefRequest(BaseModel):
    research_report_id: str
    working_title: str = ""
    use_ai: bool = False
    provider: str = "openrouter"
    model: str = "anthropic/claude-sonnet-4"


class CreateBookMetadataRequest(BaseModel):
    project_id: str
    title: str = ""
    subtitle: str = ""
    description: str = ""
    author: str = ""
    categories: Optional[List[str]] = None
    keywords: Optional[List[str]] = None
    marketing_copy: str = ""
    price: Optional[float] = None
    page_count: Optional[int] = None
    language: str = "en"


class UpdateBookMetadataRequest(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    description: Optional[str] = None
    author: Optional[str] = None
    categories: Optional[List[str]] = None
    keywords: Optional[List[str]] = None
    marketing_copy: Optional[str] = None
    price: Optional[float] = None
    page_count: Optional[int] = None


class GenerateListingCopyRequest(BaseModel):
    project_id: str
    manuscript_summary: str
    research_report_id: str
    design_brief_id: Optional[str] = None
    author: str = ""
    extra_keywords: Optional[List[str]] = None
    provider: str = "openrouter"
    model: str = "anthropic/claude-sonnet-4"


class GenerateMarketingRequest(BaseModel):
    project_id: str
    book_summary: str
    marketing_copy: str = ""
    channels: Optional[List[str]] = None
    provider: str = "openrouter"
    model: str = "anthropic/claude-sonnet-4"


class ExportPlatformPackageRequest(BaseModel):
    project_id: str
    book_metadata_id: str
    platform: str
    source_assets: Optional[Dict[str, str]] = None


class ApproveBookRequest(BaseModel):
    project_id: str
    book_metadata_id: str
    platforms: List[str]
    source_assets: Optional[Dict[str, str]] = None
    marketing_asset_ids: Optional[List[str]] = None


@app.get("/publishing/book-categories")
def publishing_book_categories():
    return {"categories": sorted(BOOK_CATEGORIES)}


@app.get("/publishing/platforms")
def publishing_platforms():
    return {"platforms": sorted(SELLING_PLATFORMS)}


@app.get("/publishing/marketing-channels")
def publishing_marketing_channels():
    return {"channels": sorted(MARKETING_CHANNELS)}


# -- market research ----------------------------------------------------

@app.post("/publishing/research/analyze")
def analyze_market_research(req: AnalyzeMarketRequest):
    listings = [
        TrendListing(
            title=l.title, category=l.category, price=l.price, page_count=l.page_count,
            rank=l.rank, keywords=l.keywords or [], cover_colors=l.cover_colors or [],
            cover_style_notes=l.cover_style_notes, typography_notes=l.typography_notes,
            interior_layout_notes=l.interior_layout_notes, illustration_style=l.illustration_style,
            review_snippets=l.review_snippets or [], requested_features=l.requested_features or [],
            source=l.source,
        )
        for l in req.listings
    ]
    report = analyze_listings(req.project_id, req.category, listings)
    _publishing_studio.save_research_report(report)
    return _dataclass_asdict(report)


@app.get("/publishing/research/{report_id}")
def get_market_research(report_id: str):
    report = _publishing_studio.get_research_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="research report not found")
    return _dataclass_asdict(report)


@app.get("/publishing/projects/{project_id}/research")
def list_market_research(project_id: str):
    return [_dataclass_asdict(r) for r in _publishing_studio.list_research_reports(project_id)]


# -- design briefs --------------------------------------------------------

@app.post("/publishing/design-briefs")
def generate_design_brief(req: GenerateDesignBriefRequest):
    report = _publishing_studio.get_research_report(req.research_report_id)
    if not report:
        raise HTTPException(status_code=404, detail="research report not found")
    ai_provider = None
    if req.use_ai:
        try:
            from core.ai.provider import get_provider
            ai_provider = get_provider(req.provider)
        except ProviderError as e:
            raise HTTPException(status_code=400, detail=str(e))
    generator = DesignBriefGenerator(ai_provider=ai_provider)
    brief = generator.generate(report, working_title=req.working_title)
    _publishing_studio.save_design_brief(brief)
    return _dataclass_asdict(brief)


@app.get("/publishing/design-briefs/{brief_id}")
def get_design_brief(brief_id: str):
    brief = _publishing_studio.get_design_brief(brief_id)
    if not brief:
        raise HTTPException(status_code=404, detail="design brief not found")
    return _dataclass_asdict(brief)


@app.get("/publishing/projects/{project_id}/design-briefs")
def list_design_briefs(project_id: str):
    return [_dataclass_asdict(b) for b in _publishing_studio.list_design_briefs(project_id)]


# -- book metadata / listing copy -----------------------------------------

@app.post("/publishing/book-metadata")
def create_book_metadata(req: CreateBookMetadataRequest):
    from core.publishing.models import BookMetadata
    now = time.time()
    metadata = BookMetadata(
        id=str(uuid.uuid4()), project_id=req.project_id, title=req.title, subtitle=req.subtitle,
        description=req.description, author=req.author, categories=req.categories or [],
        keywords=req.keywords or [], marketing_copy=req.marketing_copy, price=req.price,
        page_count=req.page_count, language=req.language, created_at=now, updated_at=now,
    )
    _publishing_studio.save_book_metadata(metadata)
    return _dataclass_asdict(metadata)


@app.post("/publishing/book-metadata/generate")
def generate_book_metadata(req: GenerateListingCopyRequest):
    report = _publishing_studio.get_research_report(req.research_report_id)
    if not report:
        raise HTTPException(status_code=404, detail="research report not found")
    brief = _publishing_studio.get_design_brief(req.design_brief_id) if req.design_brief_id else None
    try:
        optimizer = BookOptimizer(provider_name=req.provider, model=req.model)
        metadata = optimizer.generate_listing_copy(
            project_id=req.project_id, manuscript_summary=req.manuscript_summary, report=report,
            brief=brief, author=req.author, extra_keywords=req.extra_keywords,
        )
    except BookOptimizerError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ProviderError as e:
        raise HTTPException(status_code=502, detail=str(e))
    _publishing_studio.save_book_metadata(metadata)
    return _dataclass_asdict(metadata)


@app.get("/publishing/book-metadata/{metadata_id}")
def get_book_metadata(metadata_id: str):
    metadata = _publishing_studio.get_book_metadata(metadata_id)
    if not metadata:
        raise HTTPException(status_code=404, detail="book metadata not found")
    return _dataclass_asdict(metadata)


@app.post("/publishing/book-metadata/{metadata_id}/update")
def update_book_metadata(metadata_id: str, req: UpdateBookMetadataRequest):
    metadata = _publishing_studio.get_book_metadata(metadata_id)
    if not metadata:
        raise HTTPException(status_code=404, detail="book metadata not found")
    updates = req.dict(exclude_unset=True)
    for key, value in updates.items():
        setattr(metadata, key, value)
    metadata.updated_at = time.time()
    _publishing_studio.save_book_metadata(metadata)
    return _dataclass_asdict(metadata)


@app.get("/publishing/projects/{project_id}/book-metadata")
def list_book_metadata(project_id: str):
    return [_dataclass_asdict(m) for m in _publishing_studio.list_book_metadata(project_id)]


# -- marketing -------------------------------------------------------------

@app.post("/publishing/marketing/generate")
def generate_marketing(req: GenerateMarketingRequest):
    try:
        generator = MarketingGenerator(provider_name=req.provider, model=req.model)
        assets = generator.generate_channel_set(
            project_id=req.project_id, book_summary=req.book_summary,
            marketing_copy=req.marketing_copy, channels=req.channels,
        )
    except MarketingGeneratorError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ProviderError as e:
        raise HTTPException(status_code=502, detail=str(e))
    for asset in assets:
        _publishing_studio.save_marketing_asset(asset)
    return [_dataclass_asdict(a) for a in assets]


@app.get("/publishing/projects/{project_id}/marketing-assets")
def list_marketing_assets(project_id: str):
    return [_dataclass_asdict(a) for a in _publishing_studio.list_marketing_assets(project_id)]


# -- platform export --------------------------------------------------------

@app.post("/publishing/platform-export")
def export_platform_package(req: ExportPlatformPackageRequest):
    metadata = _publishing_studio.get_book_metadata(req.book_metadata_id)
    if not metadata:
        raise HTTPException(status_code=404, detail="book metadata not found")
    try:
        package = _publishing_studio.exporter.export(metadata, req.platform, req.source_assets)
    except PlatformExportError as e:
        raise HTTPException(status_code=400, detail=str(e))
    _publishing_studio.save_platform_package(package)
    return _dataclass_asdict(package)


class SubmitPlatformPackageRequest(BaseModel):
    credentials: Optional[Dict[str, str]] = None


@app.post("/publishing/platform-packages/{package_id}/submit")
def submit_platform_package(package_id: str, req: SubmitPlatformPackageRequest):
    """The call site that PublishingConnector/register_connector/
    get_connector never had: builds a PlatformPackage's listing, but
    prior to this nothing ever invoked connector.submit() on it. This
    does — real KDP/D2D/Payhip connectors are registered at startup
    (or NullConnector's honest manual-review response for anything
    else), and the resulting status is persisted."""
    package = _publishing_studio.get_platform_package(package_id)
    if not package:
        raise HTTPException(status_code=404, detail="platform package not found")

    result = publish_package(package, req.credentials)
    _publishing_studio.update_platform_package(package)
    return {**result, "package": _dataclass_asdict(package)}


@app.get("/publishing/projects/{project_id}/platform-packages")
def list_platform_packages(project_id: str, book_metadata_id: Optional[str] = None):
    return [_dataclass_asdict(p) for p in _publishing_studio.list_platform_packages(project_id, book_metadata_id)]


# -- approval / automation ---------------------------------------------------

@app.post("/publishing/approve")
def approve_book(req: ApproveBookRequest):
    try:
        approval = _publishing_studio.approve_book(
            project_id=req.project_id, book_metadata_id=req.book_metadata_id,
            platforms=req.platforms, source_assets=req.source_assets,
            marketing_asset_ids=req.marketing_asset_ids,
        )
    except PublishingStudioError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _dataclass_asdict(approval)


@app.get("/publishing/approvals/{approval_id}")
def get_approval(approval_id: str):
    approval = _publishing_studio.get_approval(approval_id)
    if not approval:
        raise HTTPException(status_code=404, detail="approval record not found")
    return _dataclass_asdict(approval)


@app.get("/publishing/projects/{project_id}/approvals")
def list_approvals(project_id: str):
    return [_dataclass_asdict(a) for a in _publishing_studio.list_approvals(project_id)]


# =======================================================================
# PHASE 5 -- EMPIRE AUTOMATION STUDIO
# =======================================================================
# Purely additive. Nothing above this line was changed. Watches every
# StoryForge project for "Ready" status and automatically generates
# format packages, campaigns, marketing, scheduling, analytics, and
# improvement recommendations on top of Phase 4's Publishing Intelligence
# Studio -- see core/automation/*.py module docstrings for the honest
# breakdown of what's real/deterministic vs. an AI-assisted call vs. a
# deliberately-manual seam (no live ad-platform buying, no TTS/video
# synthesis, no direct marketplace submission -- same "NullConnector"
# philosophy Phase 4 already established).

from core.publishing.models import MarketingAsset as _MarketingAssetModel
from core.automation.events import EVENT_BOOK_EXPORTED, EVENT_PROJECT_READY
from core.automation.scheduler import register_job_handler as _register_job_handler


def _job_handler_publish_platform(job) -> Dict[str, object]:
    metadata = _publishing_studio.get_book_metadata(job.payload.get("book_metadata_id", ""))
    if not metadata:
        raise RuntimeError(f"book metadata '{job.payload.get('book_metadata_id')}' not found")
    provider = get_publishing_provider(job.payload.get("provider", "storyforge"))
    package = provider.publish(metadata, job.platform, job.payload.get("source_assets"))
    _publishing_studio.save_platform_package(package)
    return {"package_id": package.id, "status": package.status}


def _job_handler_post_marketing(job) -> Dict[str, object]:
    provider = get_marketing_provider(job.payload.get("provider", "storyforge"))
    assets = provider.generate(
        project_id=job.project_id,
        book_summary=job.payload.get("book_summary", ""),
        marketing_copy=job.payload.get("marketing_copy", ""),
        channels=job.payload.get("channels", []),
    )
    saved_ids = []
    for a in assets:
        try:
            saved_ids.append(_publishing_studio.save_marketing_asset(_MarketingAssetModel(**a)))
        except TypeError:
            continue  # e.g. a provider-error placeholder dict shaped differently
    return {"asset_count": len(assets), "saved_ids": saved_ids}


_register_job_handler("publish_platform", _job_handler_publish_platform)
_register_job_handler("post_marketing", _job_handler_post_marketing)


# -- project watcher / readiness -----------------------------------------

class MarkReadyRequest(BaseModel):
    book_metadata_id: str


@app.post("/automation/projects/{project_id}/ready")
def mark_project_ready(project_id: str, req: MarkReadyRequest):
    metadata = _publishing_studio.get_book_metadata(req.book_metadata_id)
    if not metadata:
        raise HTTPException(status_code=404, detail="book metadata not found")
    status = _automation_studio.mark_ready(project_id, req.book_metadata_id)
    _automation_studio.events.publish(
        EVENT_PROJECT_READY, project_id=project_id, payload={"book_metadata_id": req.book_metadata_id},
    )
    return _dataclass_asdict(status)


@app.get("/automation/projects/{project_id}/status")
def get_project_status(project_id: str):
    status = _automation_studio.get_project_status(project_id)
    if not status:
        raise HTTPException(status_code=404, detail="no readiness record for this project")
    return _dataclass_asdict(status)


@app.get("/automation/ready-projects")
def list_ready_projects():
    return [_dataclass_asdict(p) for p in _automation_studio.list_ready_projects()]


# -- format packages ------------------------------------------------------

class ChapterInputAuto(BaseModel):
    title: str = ""
    html_body: str = ""
    narration_text: str = ""


class GenerateFormatRequest(BaseModel):
    project_id: str
    book_metadata_id: str
    format_type: str
    chapters: Optional[List[ChapterInputAuto]] = None
    book_summary: str = ""
    marketing_provider: str = "storyforge"
    publishing_provider: str = "storyforge"


@app.get("/automation/format-types")
def get_format_types():
    return {"format_types": sorted(FORMAT_TYPES)}


@app.post("/automation/format-packages/generate")
def generate_format_package(req: GenerateFormatRequest):
    metadata = _publishing_studio.get_book_metadata(req.book_metadata_id)
    if not metadata:
        raise HTTPException(status_code=404, detail="book metadata not found")
    chapters = [c.dict() for c in req.chapters] if req.chapters else None
    try:
        pub_provider = get_publishing_provider(req.publishing_provider) if req.format_type == "kdp" else None
        mkt_provider = get_marketing_provider(req.marketing_provider) if req.format_type == "marketing_package" else None
        package = _format_generator.generate(
            metadata=metadata, format_type=req.format_type, publishing_provider=pub_provider,
            marketing_provider=mkt_provider, chapters=chapters, book_summary=req.book_summary,
        )
    except FormatGenerationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except AutomationProviderError as e:
        raise HTTPException(status_code=502, detail=str(e))
    _automation_studio.save_format_package(package)
    _automation_studio.events.publish(
        EVENT_BOOK_EXPORTED, project_id=req.project_id,
        payload={"format_type": req.format_type, "format_package_id": package.id, "version": package.version},
    )
    return _dataclass_asdict(package)


@app.post("/automation/format-packages/generate-all")
def generate_all_format_packages(req: GenerateFormatRequest):
    """Convenience endpoint: generates every FORMAT_TYPES package for one
    book in a single call -- the "automatically generate a publishing
    workflow" behavior described in the spec, in its simplest form."""
    metadata = _publishing_studio.get_book_metadata(req.book_metadata_id)
    if not metadata:
        raise HTTPException(status_code=404, detail="book metadata not found")
    chapters = [c.dict() for c in req.chapters] if req.chapters else None
    results = []
    for format_type in sorted(FORMAT_TYPES):
        pub_provider = get_publishing_provider(req.publishing_provider) if format_type == "kdp" else None
        mkt_provider = get_marketing_provider(req.marketing_provider) if format_type == "marketing_package" else None
        try:
            package = _format_generator.generate(
                metadata=metadata, format_type=format_type, publishing_provider=pub_provider,
                marketing_provider=mkt_provider, chapters=chapters, book_summary=req.book_summary,
            )
            _automation_studio.save_format_package(package)
            results.append(_dataclass_asdict(package))
        except (FormatGenerationError, AutomationProviderError) as e:
            results.append({"format_type": format_type, "status": "failed", "error": str(e)})
    _automation_studio.events.publish(
        EVENT_BOOK_EXPORTED, project_id=req.project_id, payload={"format_count": len(results)},
    )
    return results


@app.get("/automation/projects/{project_id}/format-packages")
def list_format_packages(project_id: str, format_type: Optional[str] = None):
    return [_dataclass_asdict(p) for p in _automation_studio.list_format_packages(project_id, format_type)]


# -- campaign manager -------------------------------------------------------

class CreateCampaignRequest(BaseModel):
    project_id: str
    book_metadata_id: str
    name: str
    platforms: List[str]
    keywords: Optional[List[str]] = None


class StartCampaignRequest(BaseModel):
    book_summary: str = ""
    publishing_provider: str = "storyforge"
    marketing_provider: Optional[str] = "storyforge"


class TrackAssetRequest(BaseModel):
    kind: str
    value: str


class AddRevisionRequest(BaseModel):
    label: str
    detail: str = ""


@app.get("/automation/campaign-platforms")
def get_campaign_platforms():
    return {"platforms": sorted(CAMPAIGN_PLATFORMS)}


@app.post("/automation/campaigns")
def create_campaign(req: CreateCampaignRequest):
    try:
        campaign = _campaign_manager.create_campaign(
            req.project_id, req.book_metadata_id, req.name, req.platforms, req.keywords,
        )
    except CampaignManagerError as e:
        raise HTTPException(status_code=400, detail=str(e))
    _automation_studio.save_campaign(campaign)
    return _dataclass_asdict(campaign)


@app.post("/automation/campaigns/{campaign_id}/start")
def start_campaign(campaign_id: str, req: StartCampaignRequest):
    campaign = _automation_studio.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="campaign not found")
    metadata = _publishing_studio.get_book_metadata(campaign.book_metadata_id)
    if not metadata:
        raise HTTPException(status_code=404, detail="book metadata not found")
    try:
        pub_provider = get_publishing_provider(req.publishing_provider)
        mkt_provider = get_marketing_provider(req.marketing_provider) if req.marketing_provider else None
        result = _campaign_manager.start_campaign(
            campaign, metadata, pub_provider, mkt_provider, book_summary=req.book_summary,
        )
    except AutomationProviderError as e:
        raise HTTPException(status_code=502, detail=str(e))
    for asset in result["marketing_assets"]:
        try:
            asset_id = _publishing_studio.save_marketing_asset(_MarketingAssetModel(**asset))
            _campaign_manager.track_asset(campaign, "marketing_asset_ids", asset_id)
        except TypeError:
            continue
    _automation_studio.save_campaign(campaign)
    return {
        "campaign": _dataclass_asdict(campaign),
        "platform_packages": {p: _dataclass_asdict(pkg) for p, pkg in result["platform_packages"].items()},
    }


@app.post("/automation/campaigns/{campaign_id}/complete")
def complete_campaign(campaign_id: str):
    campaign = _automation_studio.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="campaign not found")
    _campaign_manager.complete_campaign(campaign)
    _automation_studio.save_campaign(campaign)
    return _dataclass_asdict(campaign)


@app.post("/automation/campaigns/{campaign_id}/track")
def track_campaign_asset(campaign_id: str, req: TrackAssetRequest):
    campaign = _automation_studio.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="campaign not found")
    try:
        _campaign_manager.track_asset(campaign, req.kind, req.value)
    except CampaignManagerError as e:
        raise HTTPException(status_code=400, detail=str(e))
    _automation_studio.save_campaign(campaign)
    return _dataclass_asdict(campaign)


@app.post("/automation/campaigns/{campaign_id}/revisions")
def add_campaign_revision(campaign_id: str, req: AddRevisionRequest):
    campaign = _automation_studio.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="campaign not found")
    _campaign_manager.add_revision(campaign, req.label, req.detail)
    _automation_studio.save_campaign(campaign)
    return _dataclass_asdict(campaign)


@app.get("/automation/campaigns/{campaign_id}")
def get_campaign(campaign_id: str):
    campaign = _automation_studio.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="campaign not found")
    return _dataclass_asdict(campaign)


@app.get("/automation/projects/{project_id}/campaigns")
def list_campaigns(project_id: str):
    return [_dataclass_asdict(c) for c in _automation_studio.list_campaigns(project_id)]


# -- analytics --------------------------------------------------------------

class RecordMetricRequest(BaseModel):
    project_id: str
    metric_type: str
    value: float
    campaign_id: Optional[str] = None
    platform: str = ""
    keyword: str = ""
    meta: Optional[Dict[str, object]] = None


@app.post("/automation/analytics/metrics")
def record_metric(req: RecordMetricRequest):
    metric = _analytics_engine.record_metric(
        req.project_id, req.metric_type, req.value, req.campaign_id, req.platform, req.keyword, req.meta,
    )
    _automation_studio.save_metric(metric)
    return _dataclass_asdict(metric)


@app.get("/automation/projects/{project_id}/analytics/summary")
def get_analytics_summary(project_id: str, campaign_id: Optional[str] = None):
    metrics = _automation_studio.list_metrics(project_id, campaign_id)
    return _analytics_engine.summarize(metrics)


@app.get("/automation/campaigns/{campaign_id}/analytics")
def get_campaign_analytics(campaign_id: str):
    campaign = _automation_studio.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="campaign not found")
    metrics = _automation_studio.list_metrics(campaign.project_id, campaign_id)
    return {
        "metrics": [_dataclass_asdict(m) for m in metrics],
        "summary": _analytics_engine.summarize(metrics),
    }


# -- improvement engine -------------------------------------------------------

@app.post("/automation/campaigns/{campaign_id}/improve")
def run_improvement_analysis(campaign_id: str):
    campaign = _automation_studio.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="campaign not found")
    metadata = _publishing_studio.get_book_metadata(campaign.book_metadata_id)
    if not metadata:
        raise HTTPException(status_code=404, detail="book metadata not found")
    metrics = _automation_studio.list_metrics(campaign.project_id, campaign_id)
    summary = _analytics_engine.summarize(metrics)
    existing_count = _automation_studio.count_recommendations(campaign_id)
    recs = _improvement_engine.analyze_campaign(campaign, metadata, summary, existing_count)
    for rec in recs:
        _automation_studio.save_recommendation(rec)
    return [_dataclass_asdict(r) for r in recs]


@app.get("/automation/campaigns/{campaign_id}/recommendations")
def list_recommendations(campaign_id: str):
    return [_dataclass_asdict(r) for r in _automation_studio.list_recommendations(campaign_id)]


# -- workflow designer -------------------------------------------------------

class WorkflowStepInput(BaseModel):
    id: str
    type: str
    name: str = ""
    config: Optional[Dict[str, object]] = None
    on_success: Optional[str] = None
    on_failure: Optional[str] = None


class CreateWorkflowRequest(BaseModel):
    name: str
    start_step_id: str
    steps: List[WorkflowStepInput]
    project_id: Optional[str] = None


class RunWorkflowRequest(BaseModel):
    project_id: str
    book_metadata_id: Optional[str] = None
    campaign_id: Optional[str] = None
    context: Optional[Dict[str, object]] = None
    publishing_provider: str = "storyforge"
    marketing_provider: str = "storyforge"


@app.get("/automation/workflow-step-types")
def get_workflow_step_types():
    return {"step_types": list_step_types()}


@app.post("/automation/workflows")
def create_workflow(req: CreateWorkflowRequest):
    now = time.time()
    workflow = WorkflowDefinition(
        id=str(uuid.uuid4()), name=req.name, start_step_id=req.start_step_id, project_id=req.project_id,
        steps=[
            WorkflowStepDef(id=s.id, type=s.type, name=s.name, config=s.config or {},
                             on_success=s.on_success, on_failure=s.on_failure)
            for s in req.steps
        ],
        created_at=now, updated_at=now,
    )
    _automation_studio.save_workflow(workflow)
    return _dataclass_asdict(workflow)


@app.get("/automation/workflows/{workflow_id}")
def get_workflow(workflow_id: str):
    workflow = _automation_studio.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="workflow not found")
    return _dataclass_asdict(workflow)


@app.get("/automation/workflows")
def list_workflows(project_id: Optional[str] = None):
    return [_dataclass_asdict(w) for w in _automation_studio.list_workflows(project_id)]


@app.post("/automation/workflows/{workflow_id}/run")
def run_workflow(workflow_id: str, req: RunWorkflowRequest):
    workflow = _automation_studio.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="workflow not found")

    context: Dict[str, object] = dict(req.context or {})
    context["project_id"] = req.project_id
    if req.book_metadata_id:
        metadata = _publishing_studio.get_book_metadata(req.book_metadata_id)
        if not metadata:
            raise HTTPException(status_code=404, detail="book metadata not found")
        context["book_metadata"] = metadata
    if req.campaign_id:
        campaign = _automation_studio.get_campaign(req.campaign_id)
        if campaign:
            context["campaign"] = campaign
    try:
        context["publishing_provider"] = get_publishing_provider(req.publishing_provider)
        context["marketing_provider"] = get_marketing_provider(req.marketing_provider)
    except AutomationProviderError as e:
        raise HTTPException(status_code=400, detail=str(e))

    run = WorkflowRun(
        id=str(uuid.uuid4()), workflow_id=workflow_id, project_id=req.project_id,
        status="running", context=context, started_at=time.time(),
    )
    try:
        _workflow_engine.run(workflow, run)
    except WorkflowError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # `context` may hold live objects (dataclass instances) picked up from
    # Phase 4 lookups above -- strip them back down to plain data before
    # persisting the run record.
    run.context = {k: v for k, v in run.context.items() if k not in ("publishing_provider", "marketing_provider", "book_metadata", "campaign")}
    _automation_studio.save_workflow_run(run)
    return _dataclass_asdict(run)


@app.get("/automation/workflow-runs/{run_id}")
def get_workflow_run(run_id: str):
    run = _automation_studio.get_workflow_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="workflow run not found")
    return _dataclass_asdict(run)


@app.get("/automation/workflows/{workflow_id}/runs")
def list_workflow_runs(workflow_id: str):
    return [_dataclass_asdict(r) for r in _automation_studio.list_workflow_runs(workflow_id)]


# -- scheduler ----------------------------------------------------------------

class ScheduleJobRequest(BaseModel):
    project_id: str
    job_type: str
    run_at: Optional[float] = None
    payload: Optional[Dict[str, object]] = None
    campaign_id: Optional[str] = None
    platform: str = ""
    max_attempts: int = 3


@app.get("/automation/job-types")
def get_job_types():
    from core.automation.scheduler import list_job_types
    return {"job_types": list_job_types()}


@app.post("/automation/schedule")
def schedule_job(req: ScheduleJobRequest):
    job = _scheduler.schedule(
        req.project_id, req.job_type, req.run_at, req.payload, req.campaign_id, req.platform, req.max_attempts,
    )
    _automation_studio.save_job(job)
    return _dataclass_asdict(job)


@app.get("/automation/scheduled-jobs")
def list_scheduled_jobs(project_id: Optional[str] = None, status: Optional[str] = None):
    return [_dataclass_asdict(j) for j in _automation_studio.list_jobs(project_id, status)]


@app.post("/automation/scheduler/run-due")
def run_due_jobs():
    due = _automation_studio.list_due_jobs()
    executed = _scheduler.run_due(due)
    for job in executed:
        _automation_studio.save_job(job)
    return [_dataclass_asdict(j) for j in executed]


@app.post("/automation/scheduled-jobs/{job_id}/recover")
def recover_failed_job(job_id: str):
    job = _automation_studio.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    if job.status != "failed":
        raise HTTPException(status_code=400, detail=f"job status is '{job.status}', not 'failed'")
    Scheduler.recover_failed(job)
    _automation_studio.save_job(job)
    return _dataclass_asdict(job)


@app.get("/automation/projects/{project_id}/failed-jobs")
def list_failed_jobs(project_id: str):
    return [_dataclass_asdict(j) for j in _automation_studio.list_failed_jobs(project_id)]


# -- provider abstraction & events --------------------------------------------

@app.get("/automation/providers")
def get_automation_providers():
    return list_providers()


@app.get("/automation/events")
def list_automation_events(project_id: Optional[str] = None, event_type: Optional[str] = None, limit: int = 100):
    return [_dataclass_asdict(e) for e in _automation_studio.list_events(project_id, event_type, limit)]


@app.get("/automation/event-types")
def get_automation_event_types():
    from core.automation.events import EVENT_TYPES
    return {"event_types": sorted(EVENT_TYPES)}
