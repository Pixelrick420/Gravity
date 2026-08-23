//! Evaluation passes: M2L source-to-target translation, L2L downward
//! shifting, and per-particle far-field evaluation plus near-field summation.

use super::{BinomTable, FmmTree};
use crate::complex::Complex;
use crate::sim::Particles;

impl FmmTree {
    /// Run all passes and write accelerations into `p`: classify, M2L, L2L,
    /// then leaf evaluation (far field from locals, near field direct).
    pub fn evaluate(&mut self, p: &mut Particles, g: f32, eps2: f32) {
        if p.len() == 0 || self.nodes.is_empty() {
            return;
        }
        let order = self.stride_lp;
        let binom = BinomTable::new(2 * order);

        let (m2l_lists, near_lists) = self.classify_interactions();

        self.interaction_pass(order, &binom, &m2l_lists);
        self.downward_pass(&binom);

        for i in 0..p.len() {
            p.acc_x[i] = 0.0;
            p.acc_y[i] = 0.0;
        }

        let mut near_ids: Vec<u32> = Vec::new();
        let mut spow: Vec<Complex> = vec![Complex::default(); order];

        for (li, node) in self.nodes.iter().enumerate() {
            if !node.leaf {
                continue;
            }
            // Far field: differentiate this leaf's local expansion.
            let lbase = li * self.stride_lp;
            for slot in 0..node.count as usize {
                let i = self.sorted_idx[node.first as usize + slot] as usize;
                let sx = p.pos_x[i] as f64 - node.ex;
                let sy = p.pos_y[i] as f64 - node.ey;
                let s = Complex::new(sx, sy);
                spow[0] = Complex::new(1.0, 0.0);
                for k in 1..order {
                    spow[k] = spow[k - 1].mul(s);
                }
                let mut deriv = Complex::default();
                for k in 1..=order {
                    deriv =
                        deriv.add(self.local[lbase + k - 1].scale(k as f64).mul(spow[k - 1]));
                }
                p.acc_x[i] -= g * deriv.re as f32;
                p.acc_y[i] += g * deriv.im as f32;
            }

            near_ids.clear();
            for &nid in &near_lists[li] {
                let nn = &self.nodes[nid as usize];
                near_ids
                    .extend(&self.sorted_idx[nn.first as usize..nn.first as usize + nn.count as usize]);
            }

            // Each leaf owns its list, so no cross-leaf pair counts twice.
            for slot in 0..node.count as usize {
                let i = self.sorted_idx[node.first as usize + slot] as usize;
                for &j32 in &near_ids {
                    let j = j32 as usize;
                    if j == i {
                        continue;
                    }
                    let dx = p.pos_x[j] - p.pos_x[i];
                    let dy = p.pos_y[j] - p.pos_y[i];
                    let r2 = dx * dx + dy * dy + eps2;
                    let s = g * p.mass[j] / r2;
                    p.acc_x[i] += s * dx;
                    p.acc_y[i] += s * dy;
                }
            }
        }
    }

    /// Translate every classified source's multipole into the target's local
    /// expansion.
    pub(super) fn interaction_pass(
        &mut self,
        order: usize,
        binom: &BinomTable,
        m2l_lists: &[Vec<usize>],
    ) {
        let mut wpow: Vec<Complex> = vec![Complex::default(); 2 * order + 2];
        for (t, edges) in m2l_lists.iter().enumerate() {
            for &s in edges {
                self.m2l(t, s, order, binom, &mut wpow);
            }
        }
    }
    /// One M2L translation: source multipole at `source` adds to the target's
    /// local expansion about the target center.
    pub(super) fn m2l(
        &mut self,
        target: usize,
        source: usize,
        order: usize,
        binom: &BinomTable,
        wpow: &mut [Complex],
    ) {
        let wx = self.nodes[target].ex - self.nodes[source].ex;
        let wy = self.nodes[target].ey - self.nodes[source].ey;
        let w = Complex::new(wx, wy);
        let winv = w.inverse();
        wpow[0] = Complex::new(1.0, 0.0);
        for t in 1..wpow.len() {
            wpow[t] = wpow[t - 1].mul(winv);
        }
        let sbase = source * self.stride_mp;
        let tbase = target * self.stride_lp;
        let m0 = self.multipole[sbase];
        for n in 1..=order {
            let sign = if (n + 1) % 2 == 0 { 1.0 } else { -1.0 };
            let mut acc = m0.scale(sign / n as f64).mul(wpow[n]);
            for k in 1..=order {
                let mk = self.multipole[sbase + k];
                let c = binom.get(k + n - 1, n) / k as f64;
                acc = acc.add(mk.scale(sign * c).mul(wpow[n + k]));
            }
            self.local[tbase + n - 1] = self.local[tbase + n - 1].add(acc);
        }
    }

    /// Shift local expansions parent to child, top-down level by level.
    pub(super) fn downward_pass(&mut self, binom: &BinomTable) {
        for level in 1..self.level_ranges.len() {
            let (ls, le) = self.level_ranges[level];
            for ni in ls..le {
                let parent = self.nodes[ni].parent as usize;
                let dl = Complex::new(
                    self.nodes[ni].ex - self.nodes[parent].ex,
                    self.nodes[ni].ey - self.nodes[parent].ey,
                );
                let pbase = parent * self.stride_lp;
                let cbase = ni * self.stride_lp;
                let mut dpow = vec![Complex::new(1.0, 0.0); self.stride_lp];
                for k in 1..self.stride_lp {
                    dpow[k] = dpow[k - 1].mul(dl);
                }
                for n in 1..=self.stride_lp {
                    let mut acc = Complex::default();
                    for k in n..=self.stride_lp {
                        acc = acc.add(
                            self.local[pbase + k - 1]
                                .mul(dpow[k - n])
                                .scale(binom.get(k, n)),
                        );
                    }
                    self.local[cbase + n - 1] = self.local[cbase + n - 1].add(acc);
                }
            }
        }
    }
}
