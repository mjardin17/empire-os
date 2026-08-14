"""
Smoke tests for Empire Automation Studio (Phase 5).

Everything here runs fully offline, same philosophy as
`test_publishing_studio.py`:
  - FormatPackageGenerator only touches local disk (real EPUB via the
    stdlib EpubExporter; print/audiobook formats write real spec files)
  - CampaignManager / WorkflowEngine / Scheduler / AnalyticsEngine /
    ImprovementEngine are exercised with FakePublishingProvider /
    FakeMarketingProvider test doubles (same Provider interfaces real
    adapters implement) so no network call or API key is ever required
  - AutomationStudio only touches local SQLite

Run with `pytest tests/` from `storyforge-engine/`.
"""

from __future__ import annotations

import time
import uuid

import pytest

from core.publishing.models import BookMetadata, PlatformPackage
from core.automation.analytics import AnalyticsEngine
from core.automation.campaign_manager import CampaignManager, CampaignManagerError
from core.automation.formats import FormatGenerationError, FormatPackageGenerator
from core.automation.improvement_engine import ImprovementEngine
from core.automation.models import (
    CAMPAIGN_PLATFORMS, FORMAT_TYPES, WorkflowDefinition, WorkflowRun, WorkflowStepDef,
)
from core.automation.providers import MarketingProvider, ProviderError, PublishingProvider
from core.automation.scheduler import Scheduler, register_job_handler
from core.automation.studio import AutomationStudio
from core.automation.workflow import WorkflowEngine, list_step_types
from core.video.providers import VideoGenerationResult, VideoProvider, register_video_provider


class FakePublishingProvider(PublishingProvider):
    name = "fake"

    def publish(self, metadata, platform, source_assets=None):
        return PlatformPackage(
            id=str(uuid.uuid4()), project_id=metadata.project_id, book_metadata_id=metadata.id,
            platform=platform, status="ready", listing_fields={"title": metadata.title},
            created_at=time.time(), updated_at=time.time(),
        )


class FakeMarketingProvider(MarketingProvider):
    name = "fake"

    def generate(self, project_id, book_summary, marketing_copy, channels):
        return [
            {"id": str(uuid.uuid4()), "project_id": project_id, "channel": c, "copy_text": f"copy for {c}",
             "image_asset_id": None, "status": "draft", "created_at": time.time()}
            for c in channels
        ]


class BoomPublishingProvider(PublishingProvider):
    name = "boom"

    def publish(self, metadata, platform, source_assets=None):
        raise ProviderError("simulated marketplace outage")


class FakeVideoProvider(VideoProvider):
    """Offline stand-in for VideoPipelineVideoProvider (Phase 5) — the
    real one needs VIDEO_PIPELINE_PATH + a working video-bot-pipeline
    checkout, neither available in this offline test suite."""
    name = "fake"

    def generate(self, title, description, output_dir, cover_image_path=None,
                 author="", size="1080x1920", extra=None):
        return VideoGenerationResult(output_path="fake_trailer.mp4", provider=self.name, size=size)


register_video_provider("fake", FakeVideoProvider)


@pytest.fixture()
def studio(tmp_path):
    s = AutomationStudio(db_path=str(tmp_path / "automation.db"))
    yield s
    s.close()


@pytest.fixture()
def metadata():
    now = time.time()
    return BookMetadata(
        id="bm1", project_id="proj1", title="Little Zeus and the Lantern", subtitle="",
        description="A brave tale about a small god learning courage.", author="Josh",
        categories=["childrens"], keywords=["myth", "kids", "bravery"], price=9.99,
        page_count=32, created_at=now, updated_at=now,
    )


# ---------------------------------------------------------------------
# project readiness (the "watcher")
# ---------------------------------------------------------------------

def test_mark_ready_and_query_status(studio):
    status = studio.mark_ready("proj1", "bm1")
    assert status.status == "ready"
    fetched = studio.get_project_status("proj1")
    assert fetched.book_metadata_id == "bm1"
    assert any(p.project_id == "proj1" for p in studio.list_ready_projects())


# ---------------------------------------------------------------------
# format packages
# ---------------------------------------------------------------------

def test_format_types_cover_the_full_spec_list():
    expected = {
        "kdp", "epub", "pdf", "hardcover", "paperback", "large_print",
        "coloring_book", "activity_book", "audiobook", "marketing_package",
    }
    assert expected.issubset(FORMAT_TYPES)


def test_epub_without_chapters_produces_honest_spec_not_a_fake_binary(tmp_path, metadata):
    gen = FormatPackageGenerator(output_root=str(tmp_path / "formats"))
    package = gen.generate(metadata, "epub")
    assert package.status == "spec_ready"
    assert "spec" in package.asset_paths


def test_epub_with_chapters_produces_a_real_openable_epub(tmp_path, metadata):
    import zipfile

    gen = FormatPackageGenerator(output_root=str(tmp_path / "formats"))
    chapters = [{"title": "Chapter 1", "html_body": "<p>Once upon a time...</p>"}]
    package = gen.generate(metadata, "epub", chapters=chapters)
    assert package.status == "generated"
    z = zipfile.ZipFile(package.output_path)
    names = z.namelist()
    assert names[0] == "mimetype"
    assert "META-INF/container.xml" in names
    assert z.testzip() is None


def test_print_formats_produce_real_spec_files(tmp_path, metadata):
    gen = FormatPackageGenerator(output_root=str(tmp_path / "formats"))
    for fmt in ("pdf", "hardcover", "paperback", "large_print", "coloring_book", "activity_book"):
        package = gen.generate(metadata, fmt)
        assert package.status == "spec_ready"
        assert "spec" in package.asset_paths


def test_audiobook_produces_narration_script(tmp_path, metadata):
    gen = FormatPackageGenerator(output_root=str(tmp_path / "formats"))
    chapters = [{"title": "Chapter 1", "narration_text": "Once, in a small temple..."}]
    package = gen.generate(metadata, "audiobook", chapters=chapters)
    assert package.status == "spec_ready"
    assert "script" in package.asset_paths


def test_unknown_format_rejected(tmp_path, metadata):
    gen = FormatPackageGenerator(output_root=str(tmp_path / "formats"))
    with pytest.raises(FormatGenerationError):
        gen.generate(metadata, "nonsense_format")


def test_format_packages_are_versioned_never_overwritten(tmp_path, studio, metadata):
    gen = FormatPackageGenerator(output_root=str(tmp_path / "formats"))
    p1 = gen.generate(metadata, "epub")
    studio.save_format_package(p1)
    p2 = gen.generate(metadata, "epub")
    studio.save_format_package(p2)
    all_epub = [p for p in studio.list_format_packages("proj1", "epub")]
    assert sorted(p.version for p in all_epub) == [1, 2]
    # both rows still retrievable -- nothing was overwritten
    assert len({p.id for p in all_epub}) == 2


# ---------------------------------------------------------------------
# campaign manager
# ---------------------------------------------------------------------

def test_create_campaign_rejects_unknown_platform():
    cm = CampaignManager()
    with pytest.raises(CampaignManagerError):
        cm.create_campaign("proj1", "bm1", "Launch", ["not_a_real_platform"])


def test_create_and_start_campaign(studio, metadata):
    cm = CampaignManager(event_bus=studio.events)
    campaign = cm.create_campaign("proj1", "bm1", "Gods & Glory Launch", ["kdp", "etsy"])
    studio.save_campaign(campaign)
    result = cm.start_campaign(campaign, metadata, FakePublishingProvider(), FakeMarketingProvider())
    assert campaign.status == "active"
    assert set(result["platform_packages"].keys()) == {"kdp", "etsy"}
    assert len(result["marketing_assets"]) > 0
    events = studio.list_events("proj1", event_type="campaign.started")
    assert len(events) == 1


def test_campaign_track_asset_and_revisions(studio, metadata):
    cm = CampaignManager(event_bus=studio.events)
    campaign = cm.create_campaign("proj1", "bm1", "Launch", ["kdp"])
    cm.track_asset(campaign, "artwork", "img-123")
    cm.track_asset(campaign, "keywords", "myth")
    cm.add_revision(campaign, "cover swapped", "tested a brighter palette")
    assert "img-123" in campaign.artwork
    assert "myth" in campaign.keywords
    assert len(campaign.revisions) == 1
    with pytest.raises(CampaignManagerError):
        cm.track_asset(campaign, "not_a_field", "x")


def test_publishing_provider_failure_surfaces_as_provider_error(metadata):
    cm = CampaignManager()
    campaign = cm.create_campaign("proj1", "bm1", "Launch", ["kdp"])
    with pytest.raises(ProviderError):
        cm.start_campaign(campaign, metadata, BoomPublishingProvider())


# ---------------------------------------------------------------------
# analytics engine
# ---------------------------------------------------------------------

def test_analytics_summary_computes_ctr_and_conversion(studio):
    ae = AnalyticsEngine(event_bus=studio.events)
    for v in (1000,):
        studio.save_metric(ae.record_metric("proj1", "views", v, "camp1", platform="kdp"))
    studio.save_metric(ae.record_metric("proj1", "downloads", 40, "camp1", platform="kdp"))
    studio.save_metric(ae.record_metric("proj1", "sales", 10, "camp1", platform="kdp"))
    metrics = studio.list_metrics("proj1", "camp1")
    summary = ae.summarize(metrics)
    assert summary["computed_ctr"] == pytest.approx(0.04)
    assert summary["computed_conversion_rate"] == pytest.approx(0.01)


def test_sales_milestone_emits_event(studio):
    ae = AnalyticsEngine(event_bus=studio.events)
    studio.save_metric(ae.record_metric("proj1", "sales", 1, "camp1"))
    events = studio.list_events("proj1", event_type="sales.milestone")
    assert len(events) == 1


def test_analytics_never_fabricates_missing_signal(studio):
    ae = AnalyticsEngine()
    metric = ae.record_metric("proj1", "views", 500, "camp1")
    summary = ae.summarize([metric])
    assert "computed_ctr" not in summary
    assert "computed_conversion_rate" not in summary


# ---------------------------------------------------------------------
# improvement engine
# ---------------------------------------------------------------------

def test_improvement_engine_flags_low_ctr(studio, metadata):
    cm = CampaignManager()
    campaign = cm.create_campaign("proj1", "bm1", "Launch", ["kdp"])
    ie = ImprovementEngine(event_bus=studio.events)
    summary = {"computed_ctr": 0.005}
    recs = ie.analyze_campaign(campaign, metadata, summary, existing_recommendation_count=0)
    categories = {r.category for r in recs}
    assert "cover" in categories
    assert all(r.version == 1 for r in recs)


def test_improvement_engine_recommendations_are_versioned_never_overwritten(studio, metadata):
    cm = CampaignManager()
    campaign = cm.create_campaign("proj1", "bm1", "Launch", ["kdp"])
    ie = ImprovementEngine()
    first_batch = ie.analyze_campaign(campaign, metadata, {"computed_ctr": 0.001}, 0)
    for r in first_batch:
        studio.save_recommendation(r)
    count = studio.count_recommendations(campaign.id)
    second_batch = ie.analyze_campaign(campaign, metadata, {"computed_ctr": 0.001}, count)
    for r in second_batch:
        studio.save_recommendation(r)
    all_recs = studio.list_recommendations(campaign.id)
    assert len(all_recs) == len(first_batch) + len(second_batch)
    versions = {r.version for r in second_batch}
    assert versions == {2}


def test_improvement_engine_flags_missing_category_and_title(studio):
    now = time.time()
    incomplete = BookMetadata(id="bm2", project_id="proj1", title="", created_at=now, updated_at=now)
    cm = CampaignManager()
    campaign = cm.create_campaign("proj1", "bm2", "Launch", ["kdp"])
    ie = ImprovementEngine()
    recs = ie.analyze_campaign(campaign, incomplete, {}, 0)
    categories = {r.category for r in recs}
    assert "title" in categories
    assert "category" in categories


# ---------------------------------------------------------------------
# workflow designer
# ---------------------------------------------------------------------

def test_workflow_step_types_include_spec_examples():
    step_types = list_step_types()
    for t in ("story", "images", "voice", "video", "publish", "marketing", "kdp", "etsy", "pinterest", "ads"):
        assert t in step_types


def test_workflow_story_to_video_to_publish_to_marketing(studio, metadata):
    steps = [
        WorkflowStepDef(id="s1", type="story", on_success="s2"),
        WorkflowStepDef(id="s2", type="images", on_success="s3"),
        WorkflowStepDef(id="s3", type="voice", on_success="s4"),
        # config={"provider": "fake"}: harmless no-op if this test runs
        # in isolation (the "video" step type is still the original
        # manual_or_provider_required stub, which ignores config) —
        # but matters when the full suite runs and some other test's
        # import of main.py has already registered the real handler
        # (Phase 5), which would otherwise try the real, offline-
        # unavailable video_pipeline provider and fail this step.
        WorkflowStepDef(id="s4", type="video", config={"provider": "fake"}, on_success="s5"),
        WorkflowStepDef(id="s5", type="publish", config={"platforms": ["kdp"]}, on_success="s6"),
        WorkflowStepDef(id="s6", type="marketing", on_success=None),
    ]
    wf = WorkflowDefinition(id="wf1", name="Full pipeline", start_step_id="s1", steps=steps,
                             created_at=time.time(), updated_at=time.time())
    engine = WorkflowEngine(event_bus=studio.events)
    ctx = {
        "manuscript_summary": "A brave fox story", "book_metadata": metadata,
        "publishing_provider": FakePublishingProvider(), "marketing_provider": FakeMarketingProvider(),
        "project_id": "proj1", "image_asset_ids": ["img1", "img2"],
    }
    run = WorkflowRun(id="run1", workflow_id="wf1", project_id="proj1", context=ctx, started_at=time.time())
    engine.run(wf, run)
    assert run.status == "succeeded"
    assert [s.step_type for s in run.step_history] == ["story", "images", "voice", "video", "publish", "marketing"]
    assert all(s.status == "succeeded" for s in run.step_history)


def test_workflow_story_kdp_etsy_pinterest_ads(studio, metadata):
    steps = [
        WorkflowStepDef(id="s1", type="story", on_success="s2"),
        WorkflowStepDef(id="s2", type="kdp", on_success="s3"),
        WorkflowStepDef(id="s3", type="etsy", on_success="s4"),
        WorkflowStepDef(id="s4", type="pinterest", on_success="s5"),
        WorkflowStepDef(id="s5", type="ads", on_success=None),
    ]
    wf = WorkflowDefinition(id="wf2", name="Story to Ads", start_step_id="s1", steps=steps,
                             created_at=time.time(), updated_at=time.time())
    engine = WorkflowEngine()
    ctx = {
        "manuscript_summary": "A brave fox story", "book_metadata": metadata,
        "publishing_provider": FakePublishingProvider(), "marketing_provider": FakeMarketingProvider(),
        "project_id": "proj1",
    }
    run = WorkflowRun(id="run2", workflow_id="wf2", project_id="proj1", context=ctx, started_at=time.time())
    engine.run(wf, run)
    assert run.status == "succeeded"


def test_workflow_fails_cleanly_on_missing_context():
    steps = [WorkflowStepDef(id="s1", type="story", on_success=None)]
    wf = WorkflowDefinition(id="wf3", name="Broken", start_step_id="s1", steps=steps,
                             created_at=time.time(), updated_at=time.time())
    engine = WorkflowEngine()
    run = WorkflowRun(id="run3", workflow_id="wf3", project_id="proj1", context={}, started_at=time.time())
    engine.run(wf, run)
    assert run.status == "failed"
    assert run.step_history[0].status == "failed"


def test_workflow_run_persists_even_with_live_objects_in_context(studio, metadata):
    steps = [WorkflowStepDef(id="s1", type="story", on_success=None)]
    wf = WorkflowDefinition(id="wf4", name="Persist check", start_step_id="s1", steps=steps,
                             created_at=time.time(), updated_at=time.time())
    engine = WorkflowEngine()
    ctx = {"manuscript_summary": "x", "publishing_provider": FakePublishingProvider(), "book_metadata": metadata}
    run = WorkflowRun(id="run4", workflow_id="wf4", project_id="proj1", context=ctx, started_at=time.time())
    engine.run(wf, run)
    studio.save_workflow_run(run)  # must not raise even though ctx has a live provider object
    fetched = studio.get_workflow_run("run4")
    assert fetched.status == "succeeded"


# ---------------------------------------------------------------------
# scheduler
# ---------------------------------------------------------------------

def test_scheduler_retries_then_succeeds(studio):
    scheduler = Scheduler(event_bus=studio.events)
    attempts = []

    def flaky(job):
        attempts.append(job.attempts)
        if job.attempts < 2:
            raise RuntimeError("transient")
        return {"ok": True}

    register_job_handler("test_flaky_pytest", flaky)
    job = scheduler.schedule("proj1", "test_flaky_pytest", max_attempts=3)
    job = scheduler.execute(job)
    assert job.status == "retrying"
    job.run_at = time.time() - 1
    job = scheduler.execute(job)
    assert job.status == "succeeded"
    assert attempts == [1, 2]


def test_scheduler_marks_failed_after_max_attempts_and_supports_recovery(studio):
    scheduler = Scheduler(event_bus=studio.events)

    def always_fail(job):
        raise RuntimeError("permanent")

    register_job_handler("test_always_fail_pytest", always_fail)
    job = scheduler.schedule("proj1", "test_always_fail_pytest", max_attempts=1)
    job = scheduler.execute(job)
    assert job.status == "failed"
    recovered = Scheduler.recover_failed(job)
    assert recovered.status == "pending"
    assert recovered.run_at <= time.time()


def test_scheduler_unknown_job_type_fails_without_crashing(studio):
    scheduler = Scheduler(event_bus=studio.events)
    job = scheduler.schedule("proj1", "totally_unregistered_type")
    job = scheduler.execute(job)
    assert job.status == "failed"
    assert "no job handler registered" in job.last_error


def test_run_due_only_executes_ready_jobs(studio):
    scheduler = Scheduler(event_bus=studio.events)
    register_job_handler("noop_pytest", lambda job: {"ok": True})
    future_job = scheduler.schedule("proj1", "noop_pytest", run_at=time.time() + 3600)
    due_job = scheduler.schedule("proj1", "noop_pytest", run_at=time.time() - 10)
    studio.save_job(future_job)
    studio.save_job(due_job)
    due = studio.list_due_jobs()
    assert {j.id for j in due} == {due_job.id}
    executed = scheduler.run_due(due)
    assert len(executed) == 1
    assert executed[0].status == "succeeded"


# ---------------------------------------------------------------------
# event bus / studio persistence
# ---------------------------------------------------------------------

def test_events_persist_and_are_listable(studio):
    studio.events.publish("story.approved", project_id="proj1", payload={"x": 1})
    studio.events.publish("published", project_id="proj1", payload={"platform": "kdp"})
    all_events = studio.list_events("proj1")
    assert len(all_events) == 2
    published_only = studio.list_events("proj1", event_type="published")
    assert len(published_only) == 1


def test_event_bus_subscriber_receives_events():
    from core.automation.events import EventBus

    received = []
    bus = EventBus()
    bus.subscribe(lambda e: received.append(e), event_type="published")
    bus.publish("published", project_id="proj1")
    bus.publish("story.approved", project_id="proj1")  # not subscribed to this one
    assert len(received) == 1
    assert received[0].event_type == "published"


def test_event_bus_subscriber_exception_does_not_break_publish():
    from core.automation.events import EventBus

    bus = EventBus()
    bus.subscribe(lambda e: (_ for _ in ()).throw(RuntimeError("boom")))
    # must not raise
    event = bus.publish("published", project_id="proj1")
    assert event.event_type == "published"


def test_campaign_platforms_match_phase4_selling_platforms():
    from core.publishing.models import SELLING_PLATFORMS

    assert CAMPAIGN_PLATFORMS == SELLING_PLATFORMS
