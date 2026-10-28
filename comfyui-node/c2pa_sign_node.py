"""ComfyUI node: signs generated images with a C2PA manifest via the CP2A Go API (POST /api/v1/sign)."""
import io
import os
import uuid

import numpy as np
import requests
from PIL import Image

try:
    import folder_paths  # provided by ComfyUI
    OUT_DIR = folder_paths.get_output_directory()
except ImportError:  # allows importing outside ComfyUI
    OUT_DIR = "output"


class C2PASignImage:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "model_name": ("STRING", {"default": "FLUX.1-dev"}),
                "creator": ("STRING", {"default": ""}),
                "api_url": ("STRING", {"default": os.environ.get("C2PA_API_URL", "http://localhost:8080")}),
                "filename_prefix": ("STRING", {"default": "signed"}),
            },
            "optional": {
                "copyright": ("STRING", {"default": ""}),
                "prompt_optional": ("STRING", {"default": "", "multiline": True}),
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "sign"
    OUTPUT_NODE = True
    CATEGORY = "image/c2pa"

    def sign(self, images, model_name, creator, api_url, filename_prefix, copyright="", prompt_optional=""):
        os.makedirs(OUT_DIR, exist_ok=True)
        results = []
        for tensor in images:  # tensor: H x W x C floats in [0, 1]
            arr = np.clip(255.0 * tensor.cpu().numpy(), 0, 255).astype(np.uint8)
            buf = io.BytesIO()
            Image.fromarray(arr).save(buf, format="PNG")
            resp = requests.post(
                f"{api_url.rstrip('/')}/api/v1/sign",
                files={"image": ("image.png", buf.getvalue(), "image/png")},
                data={"model_name": model_name, "creator": creator, "copyright": copyright,
                      "prompt_optional": prompt_optional},
                timeout=60,
            )
            if not resp.ok:
                raise RuntimeError(f"C2PA signing failed ({resp.status_code}): {resp.text}")
            name = f"{filename_prefix}_{uuid.uuid4().hex[:8]}.png"
            with open(os.path.join(OUT_DIR, name), "wb") as f:
                f.write(resp.content)
            results.append({"filename": name, "subfolder": "", "type": "output"})
        return {"ui": {"images": results}}


NODE_CLASS_MAPPINGS = {"C2PASignImage": C2PASignImage}
NODE_DISPLAY_NAME_MAPPINGS = {"C2PASignImage": "C2PA Sign Image (EU AI Act Art. 50)"}
