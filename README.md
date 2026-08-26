# Gravity

An N-body sandbox. A Rust engine computes gravity with the Fast Multipole
Method. A WebGL2 worker draws the particles. The UI uses Svelte 5 and
Tailwind CSS 4.

## Run it

```sh
pnpm install
pnpm run dev
```

You need Rust, `wasm-pack`, and pnpm. The first build compiles the wasm
engine.

## Controls

- **Particles** - set the number of particles.
- **Particle size** - set the draw size.
- **Speed** - set how fast time runs. Low values give smooth slow motion.
- **Distribution** - choose the starting layout: uniform disc, star
  cluster, spiral galaxy, two clusters, ring, or galaxy crash.

## Deploy

Every push to `main` runs tests, builds the wasm engine and the site, and
publishes to GitHub Pages. The site lives at `pixelrick420.github.io/Gravity`. 
