from pydantic import BaseModel


class CommitRequest(BaseModel):
    path: str
    content: str
    branch: str
