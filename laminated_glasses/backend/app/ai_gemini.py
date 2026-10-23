"""Gemini (Google AI) bilan ishlash: oynani xona rasmiga realistik joylash.

Faqat standart kutubxona (urllib) ishlatiladi -- yangi pip paket kerak emas.
Bu modul HECH QACHON foydalanuvchi rasmlarini diskka yozmaydi.

Xatolar `AiError` ostidagi aniq turlarga ajratiladi, shunda router
foydalanuvchiga to'g'ri va chiroyli tushuntirish ko'rsata oladi:

  AiQuotaError    -- Google limiti/kvotasi tugagan (429 / RESOURCE_EXHAUSTED)
  AiBlockedError  -- Gemini xavfsizlik filtri rasmni rad etdi yoki rasm qaytarmadi
  AiConfigError   -- kalit yo'q/noto'g'ri (admin tuzatadi, foydalanuvchiga ko'rsatilmaydi)
  AiUnavailable   -- tarmoq/timeout/5xx -- vaqtincha ishlamayapti
"""

import base64
import json
import logging
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Optional, Tuple

from . import config

logger = logging.getLogger("laminated_glasses.ai")


class AiError(Exception):
    code = "ai_error"


class AiQuotaError(AiError):
    code = "provider_quota"

    def __init__(self, message: str = "", retry_after_seconds: Optional[int] = None):
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class AiBlockedError(AiError):
    code = "blocked"


class AiConfigError(AiError):
    code = "config"


class AiUnavailable(AiError):
    code = "unavailable"


@dataclass
class AiImage:
    mime: str
    data: bytes


# Gemini qo'llab-quvvatlaydigan nisbatlar.
_RATIOS = {
    "1:1": 1.0, "2:3": 2 / 3, "3:2": 3 / 2, "3:4": 3 / 4, "4:3": 4 / 3,
    "4:5": 4 / 5, "5:4": 5 / 4, "9:16": 9 / 16, "16:9": 16 / 9, "21:9": 21 / 9,
}


def nearest_aspect_ratio(width: float, height: float) -> str:
    if not (width > 0 and height > 0):
        return "4:3"
    r = width / height
    return min(_RATIOS, key=lambda k: abs(_RATIOS[k] - r))


def build_prompt(
    *,
    glass_w_cm: float,
    glass_h_cm: float,
    pane_count: int,
    has_artwork_image: bool,
    room_light_hint: str = "",
) -> str:
    """Inglizcha prompt (rasm modellari uchun eng barqaror). Foydalanuvchi matni
    bu yerga KIRMAYDI -- faqat tekshirilgan raqamlar, shuning uchun prompt-injection yo'q."""
    panes = (
        f"{pane_count} separate glass panels with a thin visible gap between them"
        if pane_count > 1
        else "one laminated glass panel"
    )
    lines = [
        "You are a photorealistic interior-visualization retoucher.",
        "IMAGE 1 is the customer's real room photo (the base image).",
        "IMAGE 2 is the SAME photo with a rough flat preview of the glass pasted at the "
        "exact position, size and perspective chosen by the customer.",
    ]
    if has_artwork_image:
        lines.append(
            "IMAGE 3 is the flat artwork/print of the glass (transparent areas are the gaps)."
        )
    lines += [
        "",
        f"TASK: Output IMAGE 1 edited so that {panes} with printed decorative artwork "
        f"(real size about {glass_w_cm:.0f} x {glass_h_cm:.0f} cm) is realistically installed "
        "exactly where IMAGE 2 shows it.",
        "",
        "RULES:",
        "- Keep the glass at the SAME position, SAME size and SAME perspective as in IMAGE 2. Do not move, resize, crop or re-compose it.",
        "- Keep the artwork (colors, pattern, text, layout) faithful to the design in IMAGE 2"
        + (" and IMAGE 3." if has_artwork_image else "."),
        "- Match the room: light direction, brightness, color temperature, shadows, slight room-color tint, camera grain and sharpness.",
        "- Add realistic glass behaviour: very subtle soft reflections and highlights, a thin bright glass edge, "
        "a soft contact shadow on the wall, and natural depth. Do not make it look like a flat sticker.",
        "- Do NOT change anything else in the room: walls, furniture, floor, objects and framing must stay identical to IMAGE 1.",
        "- Keep the exact same aspect ratio and framing as IMAGE 1.",
        "- No text, no watermark, no borders, no extra objects, no people added.",
    ]
    if room_light_hint:
        lines.append(f"- Room lighting hint: {room_light_hint}.")
    return "\n".join(lines)


def _endpoint() -> str:
    return f"{config.GEMINI_API_BASE}/models/{config.GEMINI_IMAGE_MODEL}:generateContent"


def _post(payload: dict) -> dict:
    req = urllib.request.Request(
        _endpoint(),
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": config.GEMINI_API_KEY,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=config.GEMINI_TIMEOUT_SECONDS) as resp:
            return json.loads(resp.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", "replace")
        except Exception:
            pass
        raise _map_http_error(e.code, body, e.headers.get("Retry-After") if e.headers else None)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        logger.warning("Gemini tarmoq xatosi: %s", e)
        raise AiUnavailable(str(e))
    except ValueError as e:
        raise AiUnavailable(f"Gemini javobi o'qilmadi: {e}")


def _map_http_error(status: int, body: str, retry_after: Optional[str]) -> AiError:
    msg, gstatus = "", ""
    try:
        err = (json.loads(body) or {}).get("error") or {}
        msg = str(err.get("message") or "")
        gstatus = str(err.get("status") or "")
    except Exception:
        msg = body[:200]
    logger.warning("Gemini HTTP %s %s: %s", status, gstatus, msg[:300])
    if status == 429 or gstatus == "RESOURCE_EXHAUSTED":
        secs = None
        try:
            secs = int(retry_after) if retry_after else None
        except ValueError:
            secs = None
        return AiQuotaError(msg, secs)
    if status in (401, 403) or gstatus in ("UNAUTHENTICATED", "PERMISSION_DENIED"):
        return AiConfigError(f"Gemini kaliti rad etildi ({status} {gstatus}): {msg[:160]}")
    if status == 404:
        return AiConfigError(f"Model topilmadi: {config.GEMINI_IMAGE_MODEL}")
    if status == 400:
        return AiError(f"Gemini so'rovi noto'g'ri (400): {msg[:200]}")
    return AiUnavailable(f"Gemini xatosi {status}: {msg[:160]}")


def _extract_image(data: dict) -> AiImage:
    fb = (data.get("promptFeedback") or {})
    if fb.get("blockReason"):
        raise AiBlockedError(f"blockReason={fb.get('blockReason')}")
    cands = data.get("candidates") or []
    if not cands:
        raise AiBlockedError("Gemini hech narsa qaytarmadi")
    cand = cands[0]
    for part in (cand.get("content") or {}).get("parts") or []:
        inline = part.get("inlineData") or part.get("inline_data")
        if inline and inline.get("data"):
            raw = base64.b64decode(inline["data"])
            mime = inline.get("mimeType") or inline.get("mime_type") or "image/png"
            return AiImage(mime=mime, data=raw)
    reason = cand.get("finishReason") or "NO_IMAGE"
    raise AiBlockedError(f"Rasm qaytmadi (finishReason={reason})")


def generate_room_preview(
    *,
    room_jpeg: bytes,
    guide_jpeg: bytes,
    artwork_png: Optional[bytes],
    prompt: str,
    aspect_ratio: str,
) -> AiImage:
    """Gemini'ga xona rasmi + qo'lda joylashtirilgan ko'rinish (+ dizayn) yuboradi
    va realistik natija rasmini qaytaradi."""
    if not config.GEMINI_API_KEY:
        raise AiConfigError("GEMINI_API_KEY sozlanmagan")

    def b64(b: bytes) -> str:
        return base64.b64encode(b).decode("ascii")

    parts = [
        {"text": prompt},
        {"text": "IMAGE 1 (room photo):"},
        {"inlineData": {"mimeType": "image/jpeg", "data": b64(room_jpeg)}},
        {"text": "IMAGE 2 (customer's placement preview):"},
        {"inlineData": {"mimeType": "image/jpeg", "data": b64(guide_jpeg)}},
    ]
    if artwork_png:
        parts += [
            {"text": "IMAGE 3 (glass artwork):"},
            {"inlineData": {"mimeType": "image/png", "data": b64(artwork_png)}},
        ]

    payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {"aspectRatio": aspect_ratio},
        },
    }
    try:
        data = _post(payload)
    except AiError as e:
        # Ba'zi modellar imageConfig'ni tanimasa (400) -- usiz bir marta qayta urinamiz.
        if type(e) is AiError and "400" in str(e):
            payload["generationConfig"].pop("imageConfig", None)
            data = _post(payload)
        else:
            raise
    return _extract_image(data)
