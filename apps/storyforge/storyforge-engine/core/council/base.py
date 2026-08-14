from pydantic import BaseModel
from typing import List

class AI_Specialist(BaseModel):
    name: str
    role: str
    expertise: str
    goals: List[str]

    def get_system_prompt(self):
        return f"You are {self.name}, {self.role}. Focus: {self.expertise}."