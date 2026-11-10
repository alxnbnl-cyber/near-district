# Yielvy illustration prompts (for ChatGPT / DALL·E or Midjourney)

The app ships with hand-made SVG placeholders in `apps/web/src/components/art/Art.tsx`. Use these prompts to
generate polished replacements in one consistent style. Export each image as a **transparent PNG or SVG,
1024×1024**, then swap it in where the matching component is used.

## Shared style block — paste this at the start of every prompt

> Flat 2.5D game-UI illustration for a professional exploration-and-rewards platform. Dark navy background
> (#0b0f15) or transparent. Brand palette only: warm orange #FF9138 (primary), treasure gold #FFC24B and
> #F5A524 (rewards), cool cyan #32C8EF (exploration accents), slate greys #2f3a4d / #9aa6b5. Soft inner glow
> on gold objects, subtle rim light, thick dark outlines (#0b0f15), gentle gradients, no text, no letters, no
> logos, no people's faces. Premium mobile-game quality (like a polished strategy-game icon set), not childish,
> not cartoonish like Duolingo, not photorealistic. Centered single object, generous padding, consistent
> 3/4 top-down angle across the whole set.

## The set

| File name | Used for | Prompt (after the style block) |
|---|---|---|
| `treasure-chest.png` | Prize cards, hunt finish, quest preview | An open treasure chest overflowing with gold coins, a soft golden light beam rising from inside, a few coins mid-air. |
| `treasure-map.png` | Hunt start, empty states, quest type card | A folded parchment-style treasure map in dark navy tones with a dotted orange trail winding to a glowing gold X; a small compass rose in one corner. |
| `vault-door.png` | Owner onboarding, roadmap step 1 | A round futuristic bank-vault door, brushed dark steel with an orange segmented ring and a gold center dial, slightly ajar with warm light leaking out. |
| `coin-stack.png` | Prize funding, interest prize | Three neat stacks of gold coins with one large coin floating above, a faint cyan sparkle trail around it. |
| `compass.png` | Explore tab, welcome scene | A navigator's compass, dark metal casing, orange needle, cyan dotted ring, glowing gold center pin. |
| `hourglass.png` | "Waiting for approval" roadmap step | An elegant hourglass with orange caps and glowing gold sand, a few sparkles at the neck. |
| `rocket-flag.png` | "Go live" roadmap step, publish | A planted flag on a small rocky island, the flag orange with a gold star, a tiny rocket trail streak behind it. |
| `linked-vaults.png` | Cooperation page, trails | Two small vault-door icons on floating islands connected by a dashed cyan bridge path with a glowing node in the middle. |
| `lightbulb.png` | Creative Challenge type | A glowing lavender-violet lightbulb (#9B87F5) with small gold sparks floating around it. |
| `key.png` | "Unlock hint with an activity" | An ornate gold key with a soft glow, slightly tilted. |
| `trophy.png` | Winners, rewards page | A gold trophy cup with orange ribbon handles, a soft gold halo behind. |
| `hero-map-scene.png` (16:9, 1920×1080) | Welcome / marketing hero | Wide isometric view of a dark navy futuristic harbor city at night, glowing orange map pins rising above several buildings, one building glowing gold like a treasure vault, a dashed cyan route connecting three pins, river and islands, cinematic but clean, room on the left third for headline text. |

## Tips

- Generate the whole set in one ChatGPT conversation, and say "same style as the previous image" for each new one so the
  angle and lighting stay consistent.
- If an image comes back too busy, add: "simpler shapes, fewer details, more empty space".
- For tiny icon sizes (under 48 px), ask for a "bold silhouette version with fewer details".
