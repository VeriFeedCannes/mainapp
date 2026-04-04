from pathlib import Path
import cv2
import numpy as np
import iris
from iris.io import dataclasses as iris_dc


def save_iris_outputs(image_path, output_dir="iris_outputs", eye_side="right", template_index=0):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    img_pixels = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
    if img_pixels is None:
        raise ValueError(f"Cannot read image: {image_path}")

    ir_img = iris.IRImage(
        img_data=img_pixels,
        image_id="image_id",
        eye_side=eye_side,
    )

    iris_pipeline = iris.IRISPipeline(env=iris.IRISPipeline.DEBUGGING_ENVIRONMENT)
    output = iris_pipeline(ir_img)

    if output["error"] is not None:
        raise RuntimeError(f'{output["error"]["error_type"]}: {output["error"]["message"]}')

    geometry_polygons = iris_pipeline.call_trace["vectorization"]
    if geometry_polygons is None:
        geometry_polygons = iris_pipeline.call_trace["geometry_estimation"]

    iris_template = output["iris_template"]

    if isinstance(geometry_polygons, dict):
        geometry_polygons = iris_dc.GeometryPolygons.deserialize(geometry_polygons)

    if isinstance(iris_template, dict):
        iris_template = iris_dc.IrisTemplate.deserialize(iris_template)

    if template_index < 0 or template_index >= len(iris_template.iris_codes):
        raise ValueError(f"template_index must be between 0 and {len(iris_template.iris_codes) - 1}")

    original_path = output_dir / "original.png"
    cv2.imwrite(str(original_path), img_pixels)

    seg_img = cv2.cvtColor(img_pixels, cv2.COLOR_GRAY2BGR)

    pupil_pts = np.round(geometry_polygons.pupil_array).astype(np.int32).reshape((-1, 1, 2))
    iris_pts = np.round(geometry_polygons.iris_array).astype(np.int32).reshape((-1, 1, 2))
    eyeball_pts = np.round(geometry_polygons.eyeball_array).astype(np.int32).reshape((-1, 1, 2))

    cv2.polylines(seg_img, [eyeball_pts], True, (0, 255, 0), 2)
    cv2.polylines(seg_img, [iris_pts], True, (0, 191, 255), 2)
    cv2.polylines(seg_img, [pupil_pts], True, (255, 128, 0), 2)

    segmentation_path = output_dir / "segmentation_overlay.png"
    cv2.imwrite(str(segmentation_path), seg_img)

    iris_code = iris_template.iris_codes[template_index]
    mask_code = iris_template.mask_codes[template_index]

    template_real = (iris_code[:, :, 0].astype(np.uint8) * 255)
    template_imag = (iris_code[:, :, 1].astype(np.uint8) * 255)
    mask_real = (mask_code[:, :, 0].astype(np.uint8) * 255)
    mask_imag = (mask_code[:, :, 1].astype(np.uint8) * 255)

    template_real_path = output_dir / "template_long_real.png"
    template_imag_path = output_dir / "template_long_imag.png"
    template_pair_path = output_dir / "template_long_pair.png"
    mask_real_path = output_dir / "template_long_mask_real.png"
    mask_imag_path = output_dir / "template_long_mask_imag.png"

    cv2.imwrite(str(template_real_path), template_real)
    cv2.imwrite(str(template_imag_path), template_imag)
    cv2.imwrite(str(template_pair_path), np.concatenate([template_real, template_imag], axis=1))
    cv2.imwrite(str(mask_real_path), mask_real)
    cv2.imwrite(str(mask_imag_path), mask_imag)

    return {
        "original_path": str(original_path),
        "segmentation_path": str(segmentation_path),
        "template_real_path": str(template_real_path),
        "template_imag_path": str(template_imag_path),
        "template_pair_path": str(template_pair_path),
        "mask_real_path": str(mask_real_path),
        "mask_imag_path": str(mask_imag_path),
    }


if __name__ == "__main__":
    results = save_iris_outputs(
        image_path="./sample_ir_image.png",
        output_dir="./iris_outputs",
        eye_side="right",
        template_index=0,
    )

    print(results["original_path"])
    print(results["segmentation_path"])
    print(results["template_real_path"])
    print(results["template_imag_path"])
    print(results["template_pair_path"])
    print(results["mask_real_path"])
    print(results["mask_imag_path"])