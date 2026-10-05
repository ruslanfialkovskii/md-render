# Vendored: marked

| File | From |
| --- | --- |
| `marked.js` | `marked@18.0.14`, `lib/marked.esm.js`, unmodified |
| `marked.d.ts` | `marked@18.0.14`, `lib/marked.d.ts`, unmodified |
| `marked.LICENSE` | `marked@18.0.14`, `LICENSE` (MIT) |

The npm tarball matched the registry's integrity hash
`sha512-mBHK6FBHuBAlhgRe88w9F0O1AbwwXJUcQibUbC/QcdTbVGAD7aWza+xt3N6oT/jCZx3/OMeS+8rnuiHZcQ9s7A==`
(published 2026-09-22). `marked.js` has SHA-256
`528a1b88bef88fc27277e06036ce7f4afb6a220b18110ba57c09e292b24a7ce0`.

The hooks module runs with no Node and no `import()`, so the ESM build is
imported by relative path from `../parse.ts`. To update, run
`npm pack marked@<version>`, check the tarball against
`npm view marked@<version> dist.integrity`, copy the three files, and run
`claude plugin test` on the mod.
