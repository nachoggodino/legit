from pydantic import BaseModel


class EditRequest(BaseModel):
    path: str
    content: str
    instruction: str
