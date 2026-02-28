# SETTINGS OS OVERHAUL --- CHANGELOG & GPT-4.1 FIX GUIDE

This document describes every structural and architectural change
introduced during the Settings OS overhaul, plus guidance on how to fix
common issues using GPT‑4.1.

------------------------------------------------------------------------

# 1. NEW FILES ADDED

## css/settings.css

Purpose: Fully namespaced "Settings OS" design system.

What it does: - Introduces `.settings-os` namespace to prevent global
bleed - Adds Radar, Carousel, Mode Inspector sheet, Power strip, Styled
chips - Adds scroll locking hook: `body.settings-sheet-open` - Uses CSS
variables with fallbacks

Possible conflicts: - base.css overriding backgrounds - lobby.css still
applying transparency or legacy layout rules

------------------------------------------------------------------------

## js/settings.js

Purpose: All UI behavior for the new Settings OS.

Handles: - Mode card clicks → open bottom sheet - Close/reset buttons -
Collection pill filtering - Power strip buttons - Sheet scroll locking -
"Now Playing" syncing

Conflicts if: - updateSetting() not global - app.js also manipulates
same DOM nodes - duplicate scroll locking exists

------------------------------------------------------------------------

## index.html

Purpose: Replaces old #settingsTab block with full new Settings OS
structure.

Major changes: - Wrapped everything in `.settings-os` - Added Radar, Now
Playing, dual host/read-only home, Carousel, bottom sheet - Wrapped
audio + credits in `.systems-block`

Compatibility IDs preserved: - #settingsContent - #hostNote -
#difficulty - #theme - #contentPack - #plotTwists - #customScenario

------------------------------------------------------------------------

## app.js

Small integration patch: - Refreshes Now Playing UI - Syncs host badge
visibility - Ensures read-only home toggles correctly

------------------------------------------------------------------------

# 2. KNOWN ISSUES & GPT‑4.1 FIX PROMPTS


## ISSUE 1 --- Ready Up Footer Always Visible

FIXED

**Change:**
- Moved the `.lobby-actions-sticky` footer into a container with id `lobbyActionsBar` and set its default style to `display: none;` in index.html.
- Added a script in app.js to listen for `screenChanged` events and only show the footer when the current screen is `lobby`.

**Patch:**
- index.html: Wrapped the footer in a container with id and set style to `display: none;`.
- app.js: Added event listener to toggle footer visibility based on screen.

This ensures the ready/join footer only appears on the lobby screen, as required.

------------------------------------------------------------------------

## ISSUE 2 --- Styled Boxes Appear Transparent

Prompt:


FIXED

**Change:**
- Added a high-specificity CSS block to settings.css that unsets background and box-shadow for all .settings-os children, then reapplies intended frosted backgrounds to key Settings OS containers (sheet, card, modal, block, pane, section, chips, buttons).
- Ensured .settings-os backgrounds win over base.css and lobby.css, preventing unwanted transparency and restoring the frosted look.

**Patch:**
```
/* --- Settings OS: Ensure backgrounds win over base.css and lobby.css --- */
.settings-os *,
.settings-os *:before,
.settings-os *:after {
	background: unset;
	background-color: unset;
	box-shadow: unset;
}

/* Restore intended backgrounds for key Settings OS containers */
.settings-os .settings-sheet,
.settings-os .settings-card,
.settings-os .settings-modal,
.settings-os .settings-block,
.settings-os .settings-pane,
.settings-os .settings-section {
	background: linear-gradient(180deg, var(--settings-bg, rgba(255,255,255,0.12)), rgba(255,255,255,0.02));
	backdrop-filter: blur(16px) saturate(1.2);
	-webkit-backdrop-filter: blur(16px) saturate(1.2);
	box-shadow: 0 2px 16px 0 rgba(0,0,0,0.08);
}

/* Ensure chips, pills, and buttons retain frosted backgrounds */
.settings-os .chip,
.settings-os .chip-strong,
.settings-os .chip-muted,
.settings-os .btn,
.settings-os .btn-secondary {
	background: rgba(255,255,255,0.10);
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);
}

/* Prevent lobby.css/base.css from making settings transparent */
.settings-os .settings-card,
.settings-os .settings-block,
.settings-os .settings-pane {
	background-clip: padding-box;
	border-radius: 16px;
}
```

This ensures Settings OS boxes render with the correct frosted look and are not made transparent by lobby.css or base.css overrides.


------------------------------------------------------------------------

## ISSUE 3 --- Remapping the color/bg in settings tab 

Prompt:

Look at the attached md file in full to see all new Settings OS
additions.

Remap all of the background and card color/pallete/texture in the settings tab to complement other look and feel throughout the game. Make VERY sure they aren't being overridden in base.css or lobby - they likely are.css. see .mode-sheet-panel as a possible example to model some of the cards after or to get a good idea of how this settings tab can be rebranded. 


------------------------------------------------------------------------

## ISSUE 4 --- Modals Cannot Scroll

Prompt:

Look at the attached md file in full to see all new Settings OS
additions.

Old and new modals no longer scroll correctly.

Search for: - body overflow rules - .mode-sheet scroll handling -
duplicate modal CSS

Ensure only background locks and modal scroll works. Return minimal
patch.

------------------------------------------------------------------------

## ISSUE 5 --- Safely Commenting Out lobby.css

Known suspicious ranges: - Lines 1161--1257 - Lines 1863--1869

Prompt:

Look at the attached md file in full to see all new Settings OS
additions.

In lobby.css, legacy settings styles were kept. Search for:

-   Old #settingsTab styles
-   Old .settings-grid styles
-   Old modal containers
-   Conflicts with .settings-os namespace

Known ranges: 1161-1257 1863-1869

For each: - Determine if still referenced - Safely comment out if
unused - Explain why safe

Return annotated diff.

------------------------------------------------------------------------

# 3. ARCHITECTURAL CHANGES

Before: - Static settings grid - Inline modals - Global styling

After: - Namespaced Settings OS - Carousel + sheet - Dual host/read-only
home - Scoped CSS - Scroll containment

------------------------------------------------------------------------

# 4. RULES WHEN FIXING

Always instruct GPT‑4.1 to: 1. Preserve IDs used by app.js 2. Avoid
breaking accessibility attributes 3. Avoid !important unless necessary
4. Return minimal diffs only

------------------------------------------------------------------------

# END
