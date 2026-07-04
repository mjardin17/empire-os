# EMPIRE OS AUTOMATION CODES & RULES
## The Strictly Enforced Behavior Policies for Autonomous Agents

These rules are designed to prevent systemic drift, avoid redundant processing, and maintain a perfectly clean workspace. All AIs (including you, currently reading this file) must comply with these guidelines.

---

## 1. CORE OPERATIONAL LAWS

### Rule 1: Never Duplicate Code or Architecture
Before writing a helper script, endpoint, or front-end component, **you must search the workspace**.
- Use dedicated search tools or grep to scan for existing implementations.
- If a utility or function already exists, **reuse it**. Do not create alternative files (e.g., `helper_v2.py`, `utils_custom.ts`).

### Rule 2: Respect Physical Folder Boundaries
All outputs must be placed inside the standard paths defined in `FOLDER_STRUCTURE.md`.
- Never create scratchpad or temp folders directly in the root directory `/`.
- Clean up any temporary files upon task completion.

### Rule 3: Maintain Code Safety & System Stability
- When modifying the Node/Express backend (`server.ts`), ensure that existing routes are preserved.
- Never write credentials or API keys directly in files. Always read them from environment variables.

---

## 2. STAGE-GATE INDEPENDENT RESILIENCE (Joshua Directive)

- **Do Not Redesign the System**: Do not rewrite existing modules (such as CrossPost or the Documentary Factory) to change their fundamental architectures. Connect them.
- **Stage Autonomy**: Every step of a pipeline must work independently. If Step 5 (Voiceover) fails, the system must allow a retry of Step 5 *only*. Under no circumstances should the entire pipeline (Steps 1-4) be rerun from scratch.
- **No Overlapping Scraping**: Reuse headless browser proxies and central caching routines to prevent IP bans.

---

## 3. DOCUMENTATION & MANIFEST COMPLIANCE

Any AI making changes to the codebase **must**:
1. Document the modified files.
2. If new capabilities are added, update the `PROJECT_INDEX.md` and `EMPIRE_SYSTEM_MANUAL.md`.
3. Verify changes using `lint_applet` and `compile_applet` before finishing.
