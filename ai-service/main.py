import re
from typing import Annotated, Literal

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field, ValidationError
from starlette.datastructures import UploadFile as StarletteUploadFile

app = FastAPI(title="Healthcare Document Summarizer")

MAX_DOCUMENT_BYTES = 1_000_000
SUPPORTED_TEXT_TYPES = {"text/plain", "text/markdown"}
SYMPTOM_PATTERNS = {
    "cough": r"\bcough(?:ing)?\b",
    "fever": r"\bfever(?:ish)?\b",
    "headache": r"\bheadaches?\b",
    "nausea": r"\bnausea\b",
    "vomiting": r"\bvomit(?:ing)?\b",
    "fatigue": r"\bfatigue\b",
    "dizziness": r"\bdizz(?:y|iness)\b",
    "shortness of breath": r"\bshortness of breath\b",
    "pain": r"\bpain\b",
}


class TextDocument(BaseModel):
    text: Annotated[str, Field(min_length=1, max_length=MAX_DOCUMENT_BYTES)]


class SummaryResponse(BaseModel):
    summary: str
    detectedSymptoms: list[str]
    urgencyLevel: Literal["not_assessed"]
    recommendations: list[str]
    disclaimer: str


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "healthy"}


def summarize_text(text: str) -> SummaryResponse:
    normalized_text = " ".join(text.split())
    if not normalized_text:
        raise HTTPException(status_code=400, detail="Document text must not be empty.")

    sentences = re.split(r"(?<=[.!?])\s+", normalized_text)
    excerpt = " ".join(sentences[:3])
    if len(excerpt) > 500:
        excerpt = excerpt[:497].rsplit(" ", 1)[0] + "..."

    symptoms = [
        name
        for name, pattern in SYMPTOM_PATTERNS.items()
        if re.search(pattern, normalized_text, re.IGNORECASE)
    ]

    return SummaryResponse(
        summary=excerpt,
        detectedSymptoms=symptoms,
        urgencyLevel="not_assessed",
        recommendations=[
            "Have a qualified healthcare professional review this document.",
            "Seek emergency care for severe or rapidly worsening symptoms.",
        ],
        disclaimer=(
            "This demo uses keyword matches, which may include negated or historical "
            "mentions. It is not a diagnosis, clinical urgency assessment, or "
            "substitute for medical care."
        ),
    )


async def read_uploaded_text(upload: StarletteUploadFile) -> str:
    try:
        content_type = (upload.content_type or "").split(";", 1)[0].lower()
        filename = (upload.filename or "").lower()
        if content_type not in SUPPORTED_TEXT_TYPES and not filename.endswith((".txt", ".md")):
            raise HTTPException(
                status_code=415,
                detail="Upload a plain-text (.txt) or Markdown (.md) document.",
            )

        content = await upload.read(MAX_DOCUMENT_BYTES + 1)
        if len(content) > MAX_DOCUMENT_BYTES:
            raise HTTPException(status_code=413, detail="Document exceeds the 1 MB size limit.")

        return content.decode("utf-8")
    except UnicodeDecodeError as error:
        raise HTTPException(
            status_code=400,
            detail="Uploaded document must be UTF-8 encoded text.",
        ) from error
    finally:
        await upload.close()


@app.post("/api/summarize-doc", response_model=SummaryResponse)
async def summarize_document(request: Request) -> SummaryResponse:
    content_type = request.headers.get("content-type", "").lower()

    if content_type.startswith("application/json"):
        try:
            document = TextDocument.model_validate(await request.json())
        except ValidationError as error:
            raise HTTPException(
                status_code=422,
                detail="text must be a non-empty string within the size limit.",
            ) from error
        except ValueError as error:
            raise HTTPException(status_code=400, detail="Request body must be valid JSON.") from error
        text = document.text
    elif content_type.startswith("multipart/form-data"):
        form = await request.form()
        uploaded_file = form.get("file")
        text_field = form.get("text")

        if uploaded_file is not None and text_field is not None:
            raise HTTPException(status_code=400, detail="Provide either a file or text, not both.")
        if isinstance(uploaded_file, StarletteUploadFile):
            text = await read_uploaded_text(uploaded_file)
        elif isinstance(text_field, str):
            text = text_field
        else:
            raise HTTPException(
                status_code=422,
                detail="Provide a text field or a file field.",
            )
    else:
        raise HTTPException(
            status_code=415,
            detail="Use application/json or multipart/form-data.",
        )

    if not text.strip():
        raise HTTPException(status_code=400, detail="Document text must not be empty.")
    if len(text.encode("utf-8")) > MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=413, detail="Document exceeds the 1 MB size limit.")

    return summarize_text(text)
