class CharacterLab:
    def generate_dna(self, name: str, traits: list):
        return {
            "name": name,
            "visual_descriptors": {"hair": "unknown", "eyes": "unknown"},
            "personality": traits
        }