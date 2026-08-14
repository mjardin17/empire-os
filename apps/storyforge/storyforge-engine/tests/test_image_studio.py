"""
Smoke tests for Image Studio's core logic (providers + persistence).

These run entirely offline using the PlaceholderProvider -- no network,
no API keys, no external services required. They exist to catch
regressions in the provider-adapter contract and the SQLite persistence
layer, not to validate any specific paid/self-hosted provider's output.
"""

import os
from pathlib import Path

import pytest

from core.ai.provider import ProviderError
from core.image.image_studio import ImageStudio, ImageStudioError
from core.image.models import IMAGE_TYPES
from core.image.providers import (
    HiggsfieldImageAdapter,
    OpenAIImageProvider,
    get_image_provider,
    list_image_providers,
)


@pytest.fixture()
def studio(tmp_path) -> ImageStudio:
    db_path = str(tmp_path / "images.db")
    output_dir = str(tmp_path / "generated")
    s = ImageStudio(db_path=db_path, output_dir=output_dir)
    yield s
    s.close()


# -- provider registry ---------------------------------------------------

def test_unknown_provider_raises():
    with pytest.raises(ProviderError):
        get_image_provider("does-not-exist")


def test_placeholder_always_configured():
    providers = list_image_providers()
    assert providers["placeholder"] is True
    assert "comfyui" in providers
    assert "openai" in providers
    assert "higgsfield" in providers


def test_openai_provider_requires_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    provider = OpenAIImageProvider()
    assert provider.is_configured() is False
    with pytest.raises(ProviderError):
        provider.generate(
            prompt="a red fox", negative_prompt="", width=1024, height=1024,
            seed=None, model="", output_dir="/tmp",
        )


def test_higgsfield_adapter_requires_config(monkeypatch):
    monkeypatch.delenv("HIGGSFIELD_API_KEY", raising=False)
    monkeypatch.delenv("HIGGSFIELD_API_URL", raising=False)
    adapter = HiggsfieldImageAdapter()
    assert adapter.is_configured() is False
    with pytest.raises(ProviderError):
        adapter.generate(
            prompt="a blue fox", negative_prompt="", width=512, height=512,
            seed=1, model="", output_dir="/tmp",
        )


# -- ImageStudio: generation ----------------------------------------------

def test_generate_with_placeholder_creates_real_file(studio):
    asset = studio.generate_image(
        project_id="proj-1",
        image_type="character_sheet",
        prompt="a knight with a red cape, front and side view",
        provider="placeholder",
        width=512,
        height=512,
    )
    assert asset.status == "completed"
    assert asset.provider == "placeholder"
    assert asset.seed is not None
    assert asset.output_path is not None
    path = Path(asset.output_path)
    assert path.exists()
    assert path.stat().st_size > 0


def test_generate_rejects_unknown_image_type(studio):
    with pytest.raises(ImageStudioError):
        studio.generate_image(
            project_id="proj-1",
            image_type="not_a_real_type",
            prompt="anything",
        )


def test_generate_rejects_empty_prompt(studio):
    with pytest.raises(ImageStudioError):
        studio.generate_image(project_id="proj-1", image_type="thumbnail", prompt="   ")


def test_every_declared_image_type_is_generatable(studio):
    # Every image type in the public IMAGE_TYPES set must actually work
    # end-to-end against at least the placeholder provider.
    for image_type in IMAGE_TYPES:
        asset = studio.generate_image(
            project_id="proj-all-types",
            image_type=image_type,
            prompt=f"test prompt for {image_type}",
        )
        assert asset.status == "completed"
        assert asset.image_type == image_type


# -- ImageStudio: linking to characters/scenes/worlds/projects -----------

def test_generated_image_links_to_character_scene_world(studio):
    asset = studio.generate_image(
        project_id="proj-1",
        image_type="turnaround",
        prompt="full body turnaround of the hero",
        character_id="char-42",
        scene_id="scene-7",
        world_id="world-9",
    )
    fetched = studio.get_image(asset.id)
    assert fetched.character_id == "char-42"
    assert fetched.scene_id == "scene-7"
    assert fetched.world_id == "world-9"
    assert fetched.project_id == "proj-1"


# -- ImageStudio: retrieval & filtering ------------------------------------

def test_get_image_roundtrip(studio):
    asset = studio.generate_image(project_id="proj-2", image_type="prop", prompt="a rusty sword")
    fetched = studio.get_image(asset.id)
    assert fetched is not None
    assert fetched.id == asset.id
    assert fetched.prompt == "a rusty sword"


def test_get_missing_image_returns_none(studio):
    assert studio.get_image("does-not-exist") is None


def test_list_images_filters_by_project_and_type(studio):
    studio.generate_image(project_id="proj-A", image_type="background", prompt="a forest")
    studio.generate_image(project_id="proj-A", image_type="prop", prompt="a lantern")
    studio.generate_image(project_id="proj-B", image_type="background", prompt="a desert")

    proj_a_images = studio.list_images(project_id="proj-A")
    assert len(proj_a_images) == 2
    assert all(a.project_id == "proj-A" for a in proj_a_images)

    proj_a_backgrounds = studio.list_images(project_id="proj-A", image_type="background")
    assert len(proj_a_backgrounds) == 1
    assert proj_a_backgrounds[0].prompt == "a forest"


def test_list_images_filters_by_character(studio):
    studio.generate_image(
        project_id="proj-C", image_type="expression_sheet", prompt="happy face", character_id="char-1"
    )
    studio.generate_image(
        project_id="proj-C", image_type="expression_sheet", prompt="sad face", character_id="char-2"
    )
    char_1_images = studio.list_images(character_id="char-1")
    assert len(char_1_images) == 1
    assert char_1_images[0].prompt == "happy face"


def test_list_images_rejects_unknown_status(studio):
    with pytest.raises(ImageStudioError):
        studio.list_images(status="not-a-real-status")


# -- ImageStudio: deletion --------------------------------------------------

def test_delete_image(studio):
    asset = studio.generate_image(project_id="proj-D", image_type="thumbnail", prompt="a thumbnail")
    assert studio.delete_image(asset.id) is True
    assert studio.get_image(asset.id) is None
    assert studio.delete_image(asset.id) is False


# -- persistence across failures -------------------------------------------

def test_failed_generation_is_still_recorded(studio, monkeypatch):
    # Force the placeholder provider to blow up mid-generation and make
    # sure the failure is persisted (status="failed") rather than lost.
    import core.image.providers as providers_mod

    def boom(self, *args, **kwargs):
        raise ProviderError("simulated upstream failure")

    monkeypatch.setattr(providers_mod.PlaceholderProvider, "generate", boom)

    with pytest.raises(ProviderError):
        studio.generate_image(project_id="proj-E", image_type="book_cover", prompt="a cover")

    images = studio.list_images(project_id="proj-E", status="failed")
    assert len(images) == 1
    assert images[0].error_message == "simulated upstream failure"
