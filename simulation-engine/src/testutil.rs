//! Shared test helpers: timing guard, direct-summation reference, error
//! metrics, and reusable particle layouts.

use crate::config::Distribution;
use crate::sim::Particles;
use std::time::{Duration, Instant};

const TEST_TIME_LIMIT: Duration = Duration::from_secs(60);

pub(crate) struct Deadline {
    start: Instant,
    what: &'static str,
}

impl Deadline {
    pub(crate) fn new(what: &'static str) -> Self {
        Self {
            start: Instant::now(),
            what,
        }
    }

    pub(crate) fn check(&self) {
        let elapsed = self.start.elapsed();
        assert!(
            elapsed < TEST_TIME_LIMIT,
            "{} exceeded test time limit ({:?} >= {:?})",
            self.what,
            elapsed,
            TEST_TIME_LIMIT
        );
    }
}

/// Direct O(n^2) accelerations in f64, as the accuracy reference.
pub(crate) fn direct_acc(p: &Particles, g: f32, eps2: f32) -> (Vec<f64>, Vec<f64>) {
    let n = p.len();
    let mut ax = vec![0.0_f64; n];
    let mut ay = vec![0.0_f64; n];
    for i in 0..n {
        for j in 0..n {
            if i == j {
                continue;
            }
            let dx = (p.pos_x[j] - p.pos_x[i]) as f64;
            let dy = (p.pos_y[j] - p.pos_y[i]) as f64;
            let r2 = dx * dx + dy * dy + eps2 as f64;
            let s = g as f64 * p.mass[j] as f64 / r2;
            ax[i] += s * dx;
            ay[i] += s * dy;
        }
    }
    (ax, ay)
}

pub(crate) fn rel_l2_error(
    p: &Particles,
    ax: &[f32],
    ay: &[f32],
    rx: &[f64],
    ry: &[f64],
) -> f64 {
    let mut num = 0.0_f64;
    let mut den = 0.0_f64;
    for i in 0..p.len() {
        let ex = ax[i] as f64 - rx[i];
        let ey = ay[i] as f64 - ry[i];
        num += ex * ex + ey * ey;
        den += rx[i] * rx[i] + ry[i] * ry[i];
    }
    (num / den).sqrt()
}

const GOLDEN_ANGLE: f64 = 2.399_963;

/// Two dense spiral clusters at (-0.45,-0.35) and (+0.45,+0.35).
pub(crate) fn clustered_particles(n: usize, seed: u32) -> Particles {
    let mut p = Particles::new(n, seed, Distribution::UniformDisc);
    for k in 0..n {
        let ang = (k as f64) * GOLDEN_ANGLE;
        let rad = 0.12 * (((k % 23) as f64 + 1.0) / 24.0).sqrt();
        if k % 2 == 0 {
            p.pos_x[k] = (-0.45 + rad * ang.cos()) as f32;
            p.pos_y[k] = (-0.35 + rad * ang.sin()) as f32;
        } else {
            p.pos_x[k] = (0.45 + rad * ang.cos()) as f32;
            p.pos_y[k] = (0.35 + rad * ang.sin()) as f32;
        }
        p.mass[k] = 1.0 + (k % 9) as f32;
    }
    p.render(1.0);
    p
}

/// Copy positions and masses of `src` with zero velocities.
pub(crate) fn clone_layout(src: &Particles) -> Particles {
    let mut q = Particles::new(src.len(), 1, Distribution::UniformDisc);
    q.pos_x = src.pos_x.clone();
    q.pos_y = src.pos_y.clone();
    q.vel_x = vec![0.0; src.len()];
    q.vel_y = vec![0.0; src.len()];
    q.mass = src.mass.clone();
    q.render(1.0);
    q
}
