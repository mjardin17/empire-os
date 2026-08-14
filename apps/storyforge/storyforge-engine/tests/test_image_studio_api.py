"""
Smoke tests for the Image Studio REST endpoints wired into main.py.

Uses FastAPI's TestClient against the real `app` object -- these do not
mock the HTTP layer, only the underlying provider stays offline
(placeholder provider, no network). Also asserts that Phase 1 / World
Engine routes are still present and unbroken, since Image Studio must
be purely additive.
"""

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture()
def client(tmp_path, monkeypatch):
    # Keep this test run's SQLite files and generated images out of the
    # repo working directory.
    monkeypatch.chdir(tmp_path)
    return TestClient(main.app)


def test_root_route_unchanged(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert resp.json() == {"status": "StoryForge Engine Online", "integration": "Empire OS"}


def test_phase1_and_world_engine_routes_still_present():
    # Newer Starlette wraps app.include_router()'d routers as an
    # _IncludedRouter entry rather than immediately flattening them into
    # plain APIRoute objects — those entries have no .path of their own
    # (their paths live one level down, on their nested .routes). None
    # of the bare @app.get/post routes checked below are affected either
    # way; skip non-APIRoute entries rather than crashing on them.
    route_paths = {route.path for route in main.app.routes if hasattr(route, "path")}
    for expected in (
        "/science/analyze",
        "/characters",
        "/council/roster",
        "/book/export/epub",
        "/worlds",
        "/worlds/{world_id}/continuity/validate",
    ):
        assert expected in route_paths, f"Phase 1/World Engine route missing: {expected}"


def test_image_types_endpoint(client):
    resp = client.get("/image-types")
    assert resp.status_code == 200
    types = resp.json()["image_types"]
    for expected in (
        "character_sheet", "expression_sheet", "turnaround", "scene_illustration",
        "background", "prop", "book_cover", "coloring_page", "thumbnail", "merchandise_art",
    ):
        assert expected in types


def test_image_providers_endpoint(client):
    resp = client.get("/image-providers")
    assert resp.status_code == 200
    providers = resp.json()["providers"]
    assert providers["placeholder"] is True
    assert "comfyui" in providers
    assert "openai" in providers
    assert "higgsfield" in providers


def test_generate_get_and_list_image(client):
    gen_resp = client.post(
        "/images/generate",
        json={
            "project_id": "proj-api-1",
            "image_type": "book_cover",
            "prompt": "a glowing sword on a dark cover",
            "provider": "placeholder",
            "width": 768,
            "height": 1024,
        },
    )
    assert gen_resp.status_code == 200
    body = gen_resp.json()
    assert body["status"] == "completed"
    assert body["provider"] == "placeholder"
    image_id = body["id"]

    get_resp = client.get(f"/images/{image_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == image_id

    list_resp = client.get("/images", params={"project_id": "proj-api-1"})
    assert list_resp.status_code == 200
    listed = list_resp.json()
    assert len(listed) == 1
    assert listed[0]["id"] == image_id


def test_generate_with_character_scene_world_links(client):
    resp = client.post(
        "/images/generate",
        json={
            "project_id": "proj-api-2",
            "image_type": "scene_illustration",
            "prompt": "the hero standing at the cliff edge at dawn",
            "character_id": "char-99",
            "scene_id": "scene-1",
            "world_id": "world-1",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["character_id"] == "char-99"
    assert body["scene_id"] == "scene-1"
    assert body["world_id"] == "world-1"

    filtered = client.get("/images", params={"character_id": "char-99"}).json()
    assert len(filtered) == 1
    assert filtered[0]["id"] == body["id"]


def test_generate_rejects_unknown_image_type(client):
    resp = client.post(
        "/images/generate",
        json={"project_id": "proj-api-3", "image_type": "not_real", "prompt": "anything"},
    )
    assert resp.status_code == 400


def test_generate_rejects_unknown_provider(client):
    resp = client.post(
        "/images/generate",
        json={"project_id": "proj-api-3", "image_type": "thumbnail", "prompt": "x", "provider": "nope"},
    )
    assert resp.status_code == 502


def test_get_missing_image_is_404(client):
    resp = client.get("/images/does-not-exist")
    assert resp.status_code == 404


def test_delete_image(client):
    gen_resp = client.post(
        "/images/generate",
        json={"project_id": "proj-api-4", "image_type": "thumbnail", "prompt": "delete me"},
    )
    image_id = gen_resp.json()["id"]

    del_resp = client.delete(f"/images/{image_id}")
    assert del_resp.status_code == 200

    get_resp = client.get(f"/images/{image_id}")
    assert get_resp.status_code == 404

    second_delete = client.delete(f"/images/{image_id}")
    assert second_delete.status_code == 404
