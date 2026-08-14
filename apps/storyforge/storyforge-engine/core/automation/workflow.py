"""
StoryForge Empire Automation Studio -- Workflow Designer
------------------------------------------------------------
Custom pipelines as a small step graph: each `WorkflowStepDef` has a
type, config, and an `on_success` / `on_failure` pointer to the next
step id. That's the entire data model a drag-and-drop UI needs to
build workflows like:

    Story -> Images -> Voice -> Video -> Publish -> Marketing

or

    Story -> KDP -> Etsy -> Pinterest -> Ads

`WorkflowEngine` just walks the graph from `start_step_id`, calling a
registered handler per step type and recording a `WorkflowStepRun` for
every step it touches. Step handlers are a plain registry (same seam
pattern as AIProvider/ImageProvider/PublishingConnector) so adding a
new step type never touches the engine itself.

Each built-in handler is intentionally honest about what it actually
does versus what's a manual/seam step -- see individual docstrings.
"""

from __future__ import annotations

import time
from typing import Any, Callable, Dict, Optional

from core.automation.events import (
    EVENT_WORKFLOW_COMPLETED, EVENT_WORKFLOW_FAILED, EVENT_WORKFLOW_STARTED,
    EVENT_WORKFLOW_STEP_COMPLETED, EventBus,
)
from core.automation.models import WorkflowDefinition, WorkflowRun, WorkflowStepRun
from core.automation.providers import MarketingProvider, PublishingProvider

StepHandler = Callable[[Dict[str, Any], Dict[str, Any]], Dict[str, Any]]
# handler(step_config, run_context) -> output dict merged into run_context["last_output"]
# Raise an exception to mark the step (and by default the run) failed.


class WorkflowError(ValueError):
    pass


def _handle_story(config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Validates the story/manuscript is actually present in context --
    this step never invents manuscript content itself (that's Phase 1's
    Story Science / Council, upstream of this pipeline)."""
    manuscript = context.get("manuscript_summary") or context.get("manuscript_text")
    if not manuscript:
        raise WorkflowError("story step: no manuscript_summary/manuscript_text in workflow context")
    return {"manuscript_present": True}


def _handle_images(config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Confirms Image Studio assets referenced in context; does not
    generate images itself -- call Phase 4's `/images/generate` upstream
    and pass the resulting asset ids in via context['image_asset_ids']."""
    image_ids = context.get("image_asset_ids", [])
    return {"image_count": len(image_ids), "image_asset_ids": image_ids}


def _handle_voice(config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Seam step: no TTS provider ships with core StoryForge. Records
    intent so a real voice-synthesis provider can be plugged in later
    without changing the workflow graph."""
    return {"status": "manual_or_provider_required", "note": "Register a TTS provider to automate this step."}


def _handle_video(config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Seam step, same rationale as voice: video assembly is outside
    this repo's current scope. Higgsfield or another video provider can
    be wired in here."""
    return {"status": "manual_or_provider_required", "note": "Register a video provider to automate this step."}


def _handle_publish_platform(platform: str, config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    provider: Optional[PublishingProvider] = context.get("publishing_provider")
    metadata = context.get("book_metadata")
    if provider is None or metadata is None:
        raise WorkflowError(f"{platform} step: workflow context missing 'publishing_provider' or 'book_metadata'")
    package = provider.publish(metadata, platform, context.get("source_assets"))
    context.setdefault("platform_packages", {})[platform] = package
    return {"platform": platform, "package_id": package.id, "status": package.status}


def _handle_publish(config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Generic 'publish' step: publishes to every platform listed in
    config['platforms'] (falls back to context['campaign'].platforms)."""
    platforms = config.get("platforms") or getattr(context.get("campaign"), "platforms", [])
    results = {}
    for platform in platforms:
        results[platform] = _handle_publish_platform(platform, config, context)
    return {"platforms_published": list(results.keys()), "results": results}


def _handle_marketing(config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    provider: Optional[MarketingProvider] = context.get("marketing_provider")
    metadata = context.get("book_metadata")
    if provider is None or metadata is None:
        raise WorkflowError("marketing step: workflow context missing 'marketing_provider' or 'book_metadata'")
    channels = config.get("channels") or [
        "pinterest_pin", "instagram_post", "facebook_ad", "tiktok_video_script",
    ]
    assets = provider.generate(
        project_id=context.get("project_id", ""),
        book_summary=context.get("book_summary", metadata.description),
        marketing_copy=metadata.marketing_copy,
        channels=channels,
    )
    context.setdefault("marketing_assets", []).extend(assets)
    return {"asset_count": len(assets), "channels": channels}


def _handle_ads(config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Seam step: buying/managing paid ads requires ad-platform
    credentials this repo does not hold. Records the intended spend/
    targeting config for a human (or a real Ads provider) to execute."""
    return {
        "status": "manual_or_provider_required",
        "requested_config": config,
        "note": "Register an ads provider (Meta/Google/TikTok Ads API) to automate this step.",
    }


_STEP_HANDLERS: Dict[str, StepHandler] = {
    "story": _handle_story,
    "images": _handle_images,
    "voice": _handle_voice,
    "video": _handle_video,
    "publish": _handle_publish,
    "marketing": _handle_marketing,
    "ads": _handle_ads,
    "kdp": lambda c, ctx: _handle_publish_platform("kdp", c, ctx),
    "etsy": lambda c, ctx: _handle_publish_platform("etsy", c, ctx),
    "shopify": lambda c, ctx: _handle_publish_platform("shopify", c, ctx),
    "gumroad": lambda c, ctx: _handle_publish_platform("gumroad", c, ctx),
    "payhip": lambda c, ctx: _handle_publish_platform("payhip", c, ctx),
    "woocommerce": lambda c, ctx: _handle_publish_platform("woocommerce", c, ctx),
    "pinterest": lambda c, ctx: _handle_marketing({**c, "channels": ["pinterest_pin"]}, ctx),
}


def register_step_handler(step_type: str, handler: StepHandler) -> None:
    """Add or override a step type. Nothing else in the engine changes --
    same registration seam as every other provider registry in this repo."""
    _STEP_HANDLERS[step_type] = handler


def list_step_types() -> list:
    return sorted(_STEP_HANDLERS.keys())


class WorkflowEngine:
    def __init__(self, event_bus: Optional[EventBus] = None):
        self.event_bus = event_bus

    def run(self, workflow: WorkflowDefinition, run: WorkflowRun) -> WorkflowRun:
        if self.event_bus:
            self.event_bus.publish(
                EVENT_WORKFLOW_STARTED, project_id=run.project_id,
                payload={"workflow_id": workflow.id, "run_id": run.id},
            )

        steps_by_id = {s.id: s for s in workflow.steps}
        current_id = workflow.start_step_id
        visited = 0
        max_steps = len(workflow.steps) + 1  # simple cycle guard

        while current_id and visited <= max_steps:
            step = steps_by_id.get(current_id)
            if step is None:
                run.status = "failed"
                run.step_history.append(WorkflowStepRun(
                    step_id=current_id, step_type="unknown", status="failed",
                    error=f"step id '{current_id}' not found in workflow", started_at=time.time(),
                    finished_at=time.time(),
                ))
                break

            handler = _STEP_HANDLERS.get(step.type)
            step_run = WorkflowStepRun(step_id=step.id, step_type=step.type, status="running", started_at=time.time())
            if handler is None:
                step_run.status = "failed"
                step_run.error = f"no handler registered for step type '{step.type}'"
                step_run.finished_at = time.time()
                run.step_history.append(step_run)
                current_id = step.on_failure
                if current_id is None:
                    run.status = "failed"
                    break
                visited += 1
                continue

            try:
                output = handler(step.config, run.context)
                step_run.status = "succeeded"
                step_run.output = output or {}
                run.context["last_output"] = step_run.output
                if self.event_bus:
                    self.event_bus.publish(
                        EVENT_WORKFLOW_STEP_COMPLETED, project_id=run.project_id,
                        payload={"workflow_id": workflow.id, "run_id": run.id, "step_id": step.id, "step_type": step.type},
                    )
                current_id = step.on_success
            except Exception as e:
                step_run.status = "failed"
                step_run.error = str(e)
                current_id = step.on_failure
                if current_id is None:
                    run.status = "failed"
            finally:
                step_run.finished_at = time.time()
                run.step_history.append(step_run)

            if run.status == "failed":
                break
            visited += 1

        if run.status == "running":
            run.status = "succeeded"

        run.finished_at = time.time()
        if self.event_bus:
            event_type = EVENT_WORKFLOW_COMPLETED if run.status == "succeeded" else EVENT_WORKFLOW_FAILED
            self.event_bus.publish(
                event_type, project_id=run.project_id,
                payload={"workflow_id": workflow.id, "run_id": run.id, "status": run.status},
            )
        return run
