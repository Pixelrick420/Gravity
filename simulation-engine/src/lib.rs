mod complex;
mod fmm;
#[cfg(test)]
mod testutil;
pub mod config;
pub mod sim;

use config::{parse_distribution, Config, MAX_PARTICLES};
use sim::{velocity_verlet_step, Particles};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Simulation {
    particles: Particles,
    config: Config,
}

#[wasm_bindgen]
impl Simulation {
    #[wasm_bindgen(constructor)]
    pub fn new(count: u32, seed: u32, distribution: String) -> Result<Simulation, JsError> {
        console_error_panic_hook::set_once();
        let dist =
            parse_distribution(&distribution).ok_or_else(|| JsError::new("unknown distribution"))?;
        let mut cfg = Config::default();
        cfg.clamp_order();
        let n = (count as usize).clamp(1, MAX_PARTICLES);
        Ok(Simulation {
            particles: Particles::new(n, seed, dist),
            config: cfg,
        })
    }

    pub fn step(&mut self, dt: f32) -> Result<(), JsError> {
        velocity_verlet_step(&mut self.particles, &self.config, dt);
        if !self.particles.all_finite() {
            return Err(JsError::new("simulation diverged"));
        }
        Ok(())
    }

    /// Write render buffer at display fraction `alpha` between two states.
    pub fn render(&mut self, alpha: f32) {
        self.particles.render(alpha.clamp(0.0, 1.0));
    }

    pub fn reset(&mut self, count: u32, seed: u32, distribution: String) -> Result<(), JsError> {
        let dist =
            parse_distribution(&distribution).ok_or_else(|| JsError::new("unknown distribution"))?;
        let n = (count as usize).clamp(1, MAX_PARTICLES);
        self.particles.seed(n, seed, dist);
        Ok(())
    }

    pub fn particles_ptr(&self) -> *const f32 {
        self.particles.render.as_ptr()
    }

    pub fn render_len(&self) -> usize {
        self.particles.len() * 5
    }

    pub fn count(&self) -> u32 {
        self.particles.len() as u32
    }
}
