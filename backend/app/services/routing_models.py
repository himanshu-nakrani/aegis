from pydantic import BaseModel, Field


class RouterDecision(BaseModel):
    route: str = Field(description="Selected route key")
    reasoning: str = ""