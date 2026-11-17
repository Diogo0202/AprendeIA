"""Regra de dependência da arquitetura hexagonal: as setas apontam para o domínio."""

import ast
import unittest
from pathlib import Path

PACKAGE = Path(__file__).parent / "aprendeia"
FRAMEWORKS = ("fastapi", "starlette", "supabase", "supabase_auth", "openai", "dotenv")

# Para cada camada, os prefixos de módulo que ela não pode importar.
FORBIDDEN = {
    "domain": ("aprendeia.application", "aprendeia.adapters", "aprendeia.config", "aprendeia.container",
               "aprendeia.bootstrap", "pydantic", *FRAMEWORKS),
    "application": ("aprendeia.adapters", "aprendeia.config", "aprendeia.container", "aprendeia.bootstrap",
                    *FRAMEWORKS),
    "adapters/outbound": ("aprendeia.adapters.inbound", "aprendeia.container", "aprendeia.bootstrap",
                          "fastapi", "starlette"),
    "adapters/inbound": ("aprendeia.bootstrap", "supabase", "supabase_auth", "openai"),
}


def imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.add(node.module)
    return modules


def violations(layer: str) -> list[str]:
    found = []
    for path in sorted((PACKAGE / layer).rglob("*.py")):
        for module in imported_modules(path):
            if any(module == prefix or module.startswith(prefix + ".") for prefix in FORBIDDEN[layer]):
                found.append(f"{path.relative_to(PACKAGE).as_posix()} importa {module}")
    return found


class LayerDependencyTests(unittest.TestCase):
    def test_each_layer_imports_only_inward(self):
        for layer in FORBIDDEN:
            with self.subTest(layer=layer):
                self.assertEqual(violations(layer), [])

    def test_inbound_adapters_reach_persistence_only_through_the_container(self):
        """Rotas falam com casos de uso; nenhuma monta consulta ao banco."""

        offenders = [
            path.name
            for path in sorted((PACKAGE / "adapters" / "inbound").rglob("*.py"))
            if ".table(" in path.read_text(encoding="utf-8") or ".rpc(" in path.read_text(encoding="utf-8")
        ]
        self.assertEqual(offenders, [])


if __name__ == "__main__":
    unittest.main()
