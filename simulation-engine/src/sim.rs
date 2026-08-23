//! Particle state, seeded layouts, and the velocity-Verlet integrator.

use crate::config::{Config, Distribution, TOTAL_MASS, WORLD_HALF};

pub struct XorShift64Star {
    state: u64,
}

impl XorShift64Star {
    pub fn new(seed: u32) -> Self {
        Self {
            state: (seed as u64).max(1) | 1,
        }
    }

    fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.state = x;
        x.wrapping_mul(0x2545F4914F6CDD1D)
    }

    /// Uniform sample in [0, 1).
    pub fn uniform(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }
}

/// Structure-of-arrays particle state. `render` mirrors position, velocity,
/// and mass into one interleaved buffer for zero-copy GPU reads. `prev_*`
/// holds the positions from before the last step, for render interpolation.
pub struct Particles {
    pub pos_x: Vec<f32>,
    pub pos_y: Vec<f32>,
    pub prev_x: Vec<f32>,
    pub prev_y: Vec<f32>,
    pub vel_x: Vec<f32>,
    pub vel_y: Vec<f32>,
    pub mass: Vec<f32>,
    pub acc_x: Vec<f32>,
    pub acc_y: Vec<f32>,
    pub render: Vec<f32>,
}

/// Rough circular-orbit speed for the preset layouts (assumes g = 1).
fn orbital_speed(r: f32) -> f32 {
    (TOTAL_MASS * r / 4.0).sqrt()
}

impl Particles {
    pub fn new(n: usize, seed: u32, distribution: Distribution) -> Self {
        let mut p = Particles {
            pos_x: Vec::with_capacity(n),
            pos_y: Vec::with_capacity(n),
            prev_x: Vec::with_capacity(n),
            prev_y: Vec::with_capacity(n),
            vel_x: Vec::with_capacity(n),
            vel_y: Vec::with_capacity(n),
            mass: Vec::with_capacity(n),
            acc_x: vec![0.0; n],
            acc_y: vec![0.0; n],
            render: vec![0.0; n * 5],
        };
        p.seed(n, seed, distribution);
        p
    }

    /// Reseed to `n` particles of the given layout. Masses vary per particle,
    /// then renormalize so the total stays at TOTAL_MASS.
    pub fn seed(&mut self, n: usize, seed: u32, distribution: Distribution) {
        self.pos_x.clear();
        self.pos_y.clear();
        self.vel_x.clear();
        self.vel_y.clear();
        self.mass.clear();
        self.acc_x.clear();
        self.acc_y.clear();

        let mut rng = XorShift64Star::new(seed);
        for k in 0..n {
            match distribution {
                Distribution::UniformDisc => {
                    let r = WORLD_HALF * 0.9 * (rng.uniform().sqrt() as f32);
                    let theta = (rng.uniform() * std::f64::consts::TAU) as f32;
                    self.pos_x.push(r * theta.cos());
                    self.pos_y.push(r * theta.sin());
                    self.vel_x.push((rng.uniform() as f32 - 0.5) * 0.05);
                    self.vel_y.push((rng.uniform() as f32 - 0.5) * 0.05);
                }
                Distribution::Plummer => {
                    let m = rng.uniform().clamp(1e-6, 0.999_999);
                    let r3d = ((m.powf(-2.0 / 3.0) - 1.0).sqrt().recip() as f32).min(20.0);
                    let scale = 0.35_f32;
                    let theta = (rng.uniform() * std::f64::consts::TAU) as f32;
                    let z = rng.uniform() as f32 * 2.0 - 1.0;
                    let xy = (1.0 - z * z).sqrt();
                    let px = scale * r3d * xy * theta.cos();
                    let py = scale * r3d * xy * theta.sin();
                    let r = (px * px + py * py).sqrt().max(0.02);
                    // Circular velocity for the Plummer potential, projected
                    // onto the tangential direction.
                    let vt = 0.55 * (TOTAL_MASS * r).sqrt() / (r + scale);
                    self.pos_x.push(px);
                    self.pos_y.push(py);
                    self.vel_x.push(-vt * py / r);
                    self.vel_y.push(vt * px / r);
                }
                Distribution::Spiral => {
                    // Two logarithmic-ish arms winding out from the center.
                    let frac = k as f32 / n as f32;
                    let r = 0.15 + 0.75 * frac;
                    let tau = std::f64::consts::TAU as f32;
                    let theta = (k % 2) as f32 * std::f64::consts::PI as f32
                        + frac * 2.0 * tau
                        + (rng.uniform() as f32 - 0.5) * 0.3;
                    self.pos_x.push(r * theta.cos());
                    self.pos_y.push(r * theta.sin());
                    let v = orbital_speed(r);
                    self.vel_x.push(-v * theta.sin());
                    self.vel_y.push(v * theta.cos());
                }
                Distribution::TwoClusters => {
                    // Two dense balls that fall into each other and merge.
                    let (cx, cy) = if k % 2 == 0 { (-0.45, -0.35) } else { (0.45, 0.35) };
                    let rad = 0.12 * rng.uniform().sqrt() as f32;
                    let phi = (rng.uniform() * std::f64::consts::TAU) as f32;
                    self.pos_x.push(cx + rad * phi.cos());
                    self.pos_y.push(cy + rad * phi.sin());
                    // Slow spin around the cluster center, plus a gentle push
                    // toward the other cluster.
                    let spin = 3.0;
                    let drift = if k % 2 == 0 { 0.4 } else { -0.4 };
                    self.vel_x.push(-spin * phi.sin() + drift * 0.8);
                    self.vel_y.push(spin * phi.cos() + drift * 0.6);
                }
                Distribution::Ring => {
                    // A thin ring of particles orbiting at circular speed.
                    let tau = std::f64::consts::TAU as f32;
                    let r = 0.7 + (rng.uniform() as f32 - 0.5) * 0.04;
                    let phi = (k as f32 / n as f32) * tau + (rng.uniform() as f32 - 0.5) * 0.02;
                    self.pos_x.push(r * phi.cos());
                    self.pos_y.push(r * phi.sin());
                    let v = orbital_speed(r);
                    self.vel_x.push(-v * phi.sin());
                    self.vel_y.push(v * phi.cos());
                }
                Distribution::Collision => {
                    // Two spinning discs launched straight at each other.
                    let side = if k % 2 == 0 { -1.0 } else { 1.0 };
                    let cx = side * 0.6;
                    let rad = 0.28 * rng.uniform().sqrt() as f32;
                    let phi = (rng.uniform() * std::f64::consts::TAU) as f32;
                    self.pos_x.push(cx + rad * phi.cos());
                    self.pos_y.push(rad * phi.sin());
                    let swirl = 2.5;
                    let bulk = -side * 0.9;
                    self.vel_x.push(bulk - swirl * phi.sin());
                    self.vel_y.push(swirl * phi.cos());
                }
            }
            self.mass
                .push(TOTAL_MASS / n as f32 * (0.5 + rng.uniform() as f32));
        }
        self.acc_x.resize(n, 0.0);
        self.acc_y.resize(n, 0.0);
        self.prev_x.clear();
        self.prev_y.clear();
        self.prev_x.resize(n, 0.0);
        self.prev_y.resize(n, 0.0);
        self.render.resize(n * 5, 0.0);

        let mass_sum: f32 = self.mass.iter().sum();
        let norm = TOTAL_MASS / mass_sum.max(1e-9);
        for m in &mut self.mass {
            *m *= norm;
        }
        self.prev_x.copy_from_slice(&self.pos_x);
        self.prev_y.copy_from_slice(&self.pos_y);
        self.render(0.0);
    }

    pub fn len(&self) -> usize {
        self.pos_x.len()
    }

    /// Write the GPU buffer at display time `alpha` in [0, 1) between the
    /// last two physics states. Positions interpolate; velocity and mass do
    /// not need to.
    pub fn render(&mut self, alpha: f32) {
        for i in 0..self.len() {
            let o = i * 5;
            self.render[o] = self.prev_x[i] + alpha * (self.pos_x[i] - self.prev_x[i]);
            self.render[o + 1] = self.prev_y[i] + alpha * (self.pos_y[i] - self.prev_y[i]);
            self.render[o + 2] = self.vel_x[i];
            self.render[o + 3] = self.vel_y[i];
            self.render[o + 4] = self.mass[i];
        }
    }

    pub fn all_finite(&self) -> bool {
        self.pos_x.iter().chain(&self.pos_y).all(|v| v.is_finite())
            && self
                .vel_x
                .iter()
                .chain(&self.vel_y)
                .all(|v| v.is_finite())
    }
}

/// One velocity-Verlet step. Reuses the accelerations from the previous step
/// for the first half kick. Saves the pre-step positions for interpolation.
pub fn velocity_verlet_step(p: &mut Particles, config: &Config, dt: f32) {
    let n = p.len();
    p.prev_x.copy_from_slice(&p.pos_x);
    p.prev_y.copy_from_slice(&p.pos_y);
    for i in 0..n {
        p.vel_x[i] += 0.5 * dt * p.acc_x[i];
        p.vel_y[i] += 0.5 * dt * p.acc_y[i];
        p.pos_x[i] += dt * p.vel_x[i];
        p.pos_y[i] += dt * p.vel_y[i];
    }
    compute_accelerations(p, config);
    for i in 0..n {
        p.vel_x[i] += 0.5 * dt * p.acc_x[i];
        p.vel_y[i] += 0.5 * dt * p.acc_y[i];
    }
}

/// FMM gravity.
pub fn compute_accelerations(p: &mut Particles, config: &Config) {
    let eps2 = config.softening * config.softening;
    let g = config.g;

    let mut tree = crate::fmm::FmmTree::build(p, config.order, config.leaf_capacity);
    tree.evaluate(p, g, eps2);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::{Deadline, direct_acc};

    #[test]
    fn prng_is_deterministic() {
        let mut a = XorShift64Star::new(7);
        let mut b = XorShift64Star::new(7);
        for _ in 0..100 {
            assert_eq!(a.uniform(), b.uniform());
        }
    }

    #[test]
    fn plummer_positions_stay_in_reasonable_bounds() {
        let p = Particles::new(2000, 42, Distribution::Plummer);
        for i in 0..p.len() {
            assert!(p.pos_x[i].abs() < 10.0, "x out of bounds: {}", p.pos_x[i]);
        }
    }

    #[test]
    fn masses_sum_to_total_mass_regardless_of_n() {
        let small = Particles::new(50, 1, Distribution::UniformDisc);
        let large = Particles::new(500, 1, Distribution::UniformDisc);
        let s: f32 = small.mass.iter().sum();
        let l: f32 = large.mass.iter().sum();
        assert!((s - TOTAL_MASS).abs() < 0.5);
        assert!((l - TOTAL_MASS).abs() < 0.5);
    }

    #[test]
    fn finite_check_detects_nan() {
        let mut p = Particles::new(10, 3, Distribution::UniformDisc);
        assert!(p.all_finite());
        p.pos_x[5] = f32::NAN;
        assert!(!p.all_finite());
    }

    fn total_energy(p: &Particles, g: f32, eps2: f32) -> f64 {
        let mut e = 0.0_f64;
        for i in 0..p.len() {
            let v2 = (p.vel_x[i] * p.vel_x[i] + p.vel_y[i] * p.vel_y[i]) as f64;
            e += 0.5 * p.mass[i] as f64 * v2;
        }
        for i in 0..p.len() {
            for j in (i + 1)..p.len() {
                let dx = (p.pos_x[j] - p.pos_x[i]) as f64;
                let dy = (p.pos_y[j] - p.pos_y[i]) as f64;
                let r2 = dx * dx + dy * dy + eps2 as f64;
                e += 0.5 * g as f64 * p.mass[i] as f64 * p.mass[j] as f64 * r2.ln();
            }
        }
        e
    }

    /// Known failure: energy drifts over long runs. Root cause is not yet
    /// fixed; see the close-encounter substepping gap in the fixed-step loop.
    #[test]
    fn energy_drift_bounded() {
        let dl = Deadline::new("energy_drift_bounded");
        let mut p = Particles::new(200, 21, Distribution::UniformDisc);
        let cfg = Config::default();
        let eps2 = cfg.softening * cfg.softening;
        let e0 = total_energy(&p, cfg.g, eps2);
        let k0: f64 = (0..p.len())
            .map(|i| {
                0.5
                    * p.mass[i] as f64
                    * (p.vel_x[i] * p.vel_x[i] + p.vel_y[i] * p.vel_y[i]) as f64
            })
            .sum();
        for _ in 0..150 {
            velocity_verlet_step(&mut p, &cfg, 0.004);
            dl.check();
        }
        let e1 = total_energy(&p, cfg.g, eps2);
        let denom = e0.abs().max(0.25 * k0);
        assert!(
            (e1 - e0).abs() / denom < 0.05,
            "energy drift {} -> {} (denom {})",
            e0,
            e1,
            denom
        );
    }

    /// Known failure: momentum drifts over repeated steps. Root cause is not
    /// yet fixed.
    #[test]
    fn momentum_drift_bounded() {
        let dl = Deadline::new("momentum_drift_bounded");
        let mut p = Particles::new(300, 5, Distribution::UniformDisc);
        let cfg = Config::default();
        let scale: f64 = (0..p.len())
            .map(|i| {
                p.mass[i] as f64 * (p.vel_x[i].abs() + p.vel_y[i].abs()) as f64
            })
            .sum();
        let px0: f64 = (0..p.len()).map(|i| p.mass[i] as f64 * p.vel_x[i] as f64).sum();
        let py0: f64 = (0..p.len()).map(|i| p.mass[i] as f64 * p.vel_y[i] as f64).sum();
        for _ in 0..100 {
            velocity_verlet_step(&mut p, &cfg, 0.002);
            dl.check();
        }
        let px1: f64 = (0..p.len()).map(|i| p.mass[i] as f64 * p.vel_x[i] as f64).sum();
        let py1: f64 = (0..p.len()).map(|i| p.mass[i] as f64 * p.vel_y[i] as f64).sum();
        let drift = ((px1 - px0).powi(2) + (py1 - py0).powi(2)).sqrt();
        assert!(drift < 1e-3 * scale.max(1e-9), "momentum drift {}", drift);
    }

    /// Known failure: position reversal error sits just above the threshold.
    #[test]
    fn time_reversal_roundtrip() {
        let dl = Deadline::new("time_reversal_roundtrip");
        let mut p = Particles::new(200, 13, Distribution::UniformDisc);
        let cfg = Config::default();
        let pos0 = p.pos_x.clone();
        let pos0y = p.pos_y.clone();
        let vel0x = p.vel_x.clone();
        let vel0y = p.vel_y.clone();
        for _ in 0..40 {
            velocity_verlet_step(&mut p, &cfg, 0.005);
            dl.check();
        }
        for i in 0..p.len() {
            p.vel_x[i] = -p.vel_x[i];
            p.vel_y[i] = -p.vel_y[i];
        }
        for _ in 0..40 {
            velocity_verlet_step(&mut p, &cfg, 0.005);
            dl.check();
        }
        for i in 0..p.len() {
            p.vel_x[i] = -p.vel_x[i];
            p.vel_y[i] = -p.vel_y[i];
        }
        let mut max_pos_err = 0.0_f32;
        let mut max_vel_err = 0.0_f32;
        for i in 0..p.len() {
            max_pos_err = max_pos_err
                .max((p.pos_x[i] - pos0[i]).abs())
                .max((p.pos_y[i] - pos0y[i]).abs());
            max_vel_err = max_vel_err
                .max((p.vel_x[i] - vel0x[i]).abs())
                .max((p.vel_y[i] - vel0y[i]).abs());
        }
        assert!(max_pos_err < 2e-4, "pos reversal error {}", max_pos_err);
        assert!(max_vel_err < 2e-3, "vel reversal error {}", max_vel_err);
    }

    #[test]
    fn direct_reference_is_symmetric_for_two_particles() {
        let mut p = Particles::new(2, 1, Distribution::UniformDisc);
        p.pos_x = vec![-0.5, 0.5];
        p.pos_y = vec![0.0, 0.0];
        p.mass = vec![2.0, 3.0];
        let (ax, ay) = direct_acc(&p, 1.0, 0.0025);
        assert!((ax[0] - 3.0 / 1.0025).abs() < 1e-9);
        assert!(ay[0].abs() < 1e-9);
        assert!((ax[1] + 2.0 / 1.0025).abs() < 1e-9);
    }
}
