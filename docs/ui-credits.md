# UI sources and custom components

The current application uses Rare UI's **Gooey Nav**, by Swami Malode under the MIT license. The source is in `apps/web/src/components/ui/gooey-nav.tsx`; its license is preserved beside it. The copied Animated Counter is also retained for reuse but is not currently mounted in the task-wallet interface.

- [Rare UI components](https://www.rareui.com/components)
- [Gooey Nav source](https://github.com/swamimalode07/rare-ui/blob/main/components/ui/gooey-nav.tsx)
- [Animated Counter source](https://github.com/swamimalode07/rare-ui/blob/main/components/ui/animated-counter.tsx)

Next.js-specific navigation was adapted to Vite. Motion supplies the spring engine, while application tokens control colour, type and geometry.

Melt's **SessionSeal** is a custom paper-wallet sleeve whose geometry reflects the actual session lifecycle. **CapacityRibbon** is a custom folded allowance display with pointer response and fractional ETH support. Both live under `apps/web/src/`; continuous activity motion pauses when the document or component is hidden, and reduced motion is supported. They reuse the earlier Melt design language without adopting a voice-mode orb.

Manrope is self-hosted with its bundled OFL notice. The fixture's abstract print is native CSS. No generated stock artwork or remote font tracking is required.
