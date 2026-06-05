from app.pipeline.cameras import FACES, camera_for


def test_each_face_has_a_unique_axis_sign():
    seen = set()
    for face in FACES:
        cam = camera_for(face)
        key = (cam.axis, cam.sign)
        assert key not in seen, f"duplicate axis/sign for {face}"
        seen.add(key)
    assert len(seen) == 6


def test_uv_axes_avoid_the_camera_axis():
    for face in FACES:
        cam = camera_for(face)
        assert cam.u_axis != cam.axis
        assert cam.v_axis != cam.axis
        assert cam.u_axis != cam.v_axis
