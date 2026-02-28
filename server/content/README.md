# Content Packs

Last updated: February 28, 2026

This folder defines curated content packs used in live gameplay.

What is active:

- JSON pack manifests in `packs/`
- schema validation (`npm run packs:validate`)
- registry + featured selection
- pack metadata in lobby/results payloads
- pack metrics endpoint support

Runtime behavior:

- `contentPackId` is host-selectable lobby state.
- pack content is primary for scenario/twist generation.
- selected theme nudges pack output rather than bypassing pack identity.

Validation command:

- `npm run packs:validate`
