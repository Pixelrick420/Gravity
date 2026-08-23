//! Quadtree FMM: tree construction, upward pass, and shared types.
//!
//! Interaction classification lives in [`classify`]; the M2L, L2L, and leaf
//! evaluation passes live in [`passes`].

mod classify;
mod passes;
#[cfg(test)]
mod tests;

use crate::complex::Complex;
use crate::sim::Particles;

const MAX_DEPTH: u32 = 16;
const NONE: u32 = u32::MAX;

#[derive(Clone, Copy)]
struct Node {
    /// Geometric box center.
    cx: f64,
    cy: f64,
    /// Expansion origin. Leaves use the center of mass; internals the box
    /// center. Mass-centered leaves keep high-order moments small.
    ex: f64,
    ey: f64,
    half: f64,
    parent: u32,
    children: [u32; 4],
    first: u32,
    count: u32,
    depth: u32,
    gx: i64,
    gy: i64,
    leaf: bool,
}

struct BinomTable {
    data: Vec<f64>,
    width: usize,
}

impl BinomTable {
    fn new(max_n: usize) -> Self {
        let width = max_n + 1;
        let mut data = vec![0.0_f64; width * width];
        for n in 0..=max_n {
            for k in 0..=n {
                let v = if k == 0 || k == n {
                    1.0
                } else {
                    data[(n - 1) * width + k - 1] + data[(n - 1) * width + k]
                };
                data[n * width + k] = v;
            }
        }
        Self { data, width }
    }

    fn get(&self, n: usize, k: usize) -> f64 {
        self.data[n * self.width + k]
    }
}

/// Barnes-Hut style quadtree with per-node multipole and local expansions.
pub struct FmmTree {
    nodes: Vec<Node>,
    sorted_idx: Vec<u32>,
    level_ranges: Vec<(usize, usize)>,
    multipole: Vec<Complex>,
    local: Vec<Complex>,
    stride_mp: usize,
    stride_lp: usize,
}

impl FmmTree {
    /// Build the tree over `p` and run the upward (P2M + M2M) pass.
    pub fn build(p: &Particles, order: usize, leaf_capacity: usize) -> Self {
        let n = p.len();
        let stride_mp = order + 1;
        let stride_lp = order;

        if n == 0 {
            return Self {
                nodes: Vec::new(),
                sorted_idx: Vec::new(),
                level_ranges: Vec::new(),
                multipole: Vec::new(),
                local: Vec::new(),
                stride_mp,
                stride_lp,
            };
        }

        let mut min_x = f64::MAX;
        let mut max_x = f64::MIN;
        let mut min_y = f64::MAX;
        let mut max_y = f64::MIN;
        for i in 0..n {
            let x = p.pos_x[i] as f64;
            let y = p.pos_y[i] as f64;
            min_x = min_x.min(x);
            max_x = max_x.max(x);
            min_y = min_y.min(y);
            max_y = max_y.max(y);
        }
        let root_cx = (min_x + max_x) * 0.5;
        let root_cy = (min_y + max_y) * 0.5;
        let root_half = (((max_x - min_x).max(max_y - min_y)) * 0.5 * 1.000_1 + 1e-6).max(1e-6);

        let codes: Vec<u32> = (0..n)
            .map(|i| {
                let nx = ((p.pos_x[i] as f64 - (root_cx - root_half)) / (2.0 * root_half))
                    .clamp(0.0, 1.0 - 1e-9);
                let ny = ((p.pos_y[i] as f64 - (root_cy - root_half)) / (2.0 * root_half))
                    .clamp(0.0, 1.0 - 1e-9);
                let ix = (nx * (1u32 << MAX_DEPTH) as f64) as u32;
                let iy = (ny * (1u32 << MAX_DEPTH) as f64) as u32;
                morton(ix, iy)
            })
            .collect();

        let mut sorted_idx: Vec<u32> = (0..n as u32).collect();
        sorted_idx.sort_by_key(|&i| codes[i as usize]);

        let est = 2 * (n / leaf_capacity.max(1)).max(1) + 16;
        let mut tree = FmmTree {
            nodes: Vec::with_capacity(est),
            sorted_idx,
            level_ranges: Vec::new(),
            multipole: vec![Complex::default(); est * stride_mp],
            local: vec![Complex::default(); est * stride_lp],
            stride_mp,
            stride_lp,
        };

        tree.nodes.push(Node {
            cx: root_cx,
            cy: root_cy,
            ex: root_cx,
            ey: root_cy,
            half: root_half,
            parent: NONE,
            children: [NONE; 4],
            first: 0,
            count: n as u32,
            depth: 0,
            gx: 0,
            gy: 0,
            leaf: false,
        });

        // Breadth-first subdivision. Particles reorder in place under each
        // node, so every level stays a contiguous slice of sorted_idx.
        let mut scratch: Vec<u32> = vec![0; n];
        let mut level_start = 0usize;
        while level_start < tree.nodes.len() {
            let level_end = tree.nodes.len();
            for ni in level_start..level_end {
                let count = tree.nodes[ni].count as usize;
                if count == 0 || count > leaf_capacity && tree.nodes[ni].depth < MAX_DEPTH {
                    let node = tree.nodes[ni];
                    let shift = 2 * (MAX_DEPTH - 1 - node.depth);
                    let mut counts = [0usize; 4];
                    for k in 0..count {
                        let pi = tree.sorted_idx[node.first as usize + k] as usize;
                        let q = ((codes[pi] >> shift) & 3) as usize;
                        counts[q] += 1;
                    }
                    let mut offsets = [0usize; 4];
                    let mut cursor = 0usize;
                    for q in 0..4 {
                        offsets[q] = cursor;
                        cursor += counts[q];
                    }
                    let mut cursors = offsets;
                    for k in 0..count {
                        let pi = tree.sorted_idx[node.first as usize + k];
                        let q = ((codes[pi as usize] >> shift) & 3) as usize;
                        scratch[offsets[q] + {
                            let c = cursors[q] - offsets[q];
                            cursors[q] += 1;
                            c
                        }] = pi;
                    }
                    tree.sorted_idx[node.first as usize..node.first as usize + count]
                        .copy_from_slice(&scratch[..count]);

                    let child_half = node.half * 0.5;
                    for q in 0..4 {
                        if counts[q] == 0 {
                            continue;
                        }
                        let dx = if q & 1 == 1 { 1.0 } else { -1.0 };
                        let dy = if q & 2 == 2 { 1.0 } else { -1.0 };
                        let child_id = tree.nodes.len() as u32;
                        tree.nodes.push(Node {
                            cx: node.cx + dx * child_half,
                            cy: node.cy + dy * child_half,
                            ex: node.cx + dx * child_half,
                            ey: node.cy + dy * child_half,
                            half: child_half,
                            parent: ni as u32,
                            children: [NONE; 4],
                            first: node.first + offsets[q] as u32,
                            count: counts[q] as u32,
                            depth: node.depth + 1,
                            gx: node.gx * 2 + (q & 1) as i64,
                            gy: node.gy * 2 + ((q >> 1) & 1) as i64,
                            leaf: false,
                        });
                        tree.nodes[ni].children[q] = child_id;
                    }
                } else {
                    tree.nodes[ni].leaf = true;
                }
            }
            tree.level_ranges.push((level_start, level_end));
            level_start = level_end;
        }

        let node_total = tree.nodes.len();
        tree.multipole
            .resize(node_total * stride_mp, Complex::default());
        tree.local.resize(node_total * stride_lp, Complex::default());
        tree.anchor_leaf_expansions_at_mass(p);
        tree.upward_pass(p, order);
        tree
    }

    /// Move each leaf's expansion origin to its center of mass. This keeps
    /// high-order moments small when mass clumps in one box corner.
    fn anchor_leaf_expansions_at_mass(&mut self, p: &Particles) {
        for node in &mut self.nodes {
            if !node.leaf {
                continue;
            }
            let mut m = 0.0_f64;
            let mut mx = 0.0_f64;
            let mut my = 0.0_f64;
            for k in 0..node.count as usize {
                let pi = self.sorted_idx[node.first as usize + k] as usize;
                let mi = f64::from(p.mass[pi]);
                m += mi;
                mx += mi * f64::from(p.pos_x[pi]);
                my += mi * f64::from(p.pos_y[pi]);
            }
            if m > 0.0 {
                node.ex = mx / m;
                node.ey = my / m;
            }
        }
    }

    /// P2M on leaves, then M2M translation to parents, bottom-up.
    fn upward_pass(&mut self, p: &Particles, order: usize) {
        for ni in (0..self.nodes.len()).rev() {
            let base = ni * self.stride_mp;
            if self.nodes[ni].leaf {
                let node_first = self.nodes[ni].first as usize;
                let node_count = self.nodes[ni].count as usize;
                for k in 0..node_count {
                    let pi = self.sorted_idx[node_first + k] as usize;
                    let m = p.mass[pi] as f64;
                    let dzx = p.pos_x[pi] as f64 - self.nodes[ni].ex;
                    let dzy = p.pos_y[pi] as f64 - self.nodes[ni].ey;
                    let mut pw = Complex::new(1.0, 0.0);
                    let dz = Complex::new(dzx, dzy);
                    self.multipole[base] = self.multipole[base].add(pw.scale(m));
                    for kk in 1..=order {
                        pw = pw.mul(dz);
                        self.multipole[base + kk] = self.multipole[base + kk].add(pw.scale(m));
                    }
                }
            } else {
                for &c in &self.nodes[ni].children {
                    if c == NONE {
                        continue;
                    }
                    let cbase = c as usize * self.stride_mp;
                    let dx = self.nodes[c as usize].ex - self.nodes[ni].ex;
                    let dy = self.nodes[c as usize].ey - self.nodes[ni].ey;
                    let delta = Complex::new(dx, dy);
                    let mut pdelta = vec![Complex::new(1.0, 0.0); order + 1];
                    for kk in 1..=order {
                        pdelta[kk] = pdelta[kk - 1].mul(delta);
                    }
                    for kk in 0..=order {
                        let mut acc = Complex::default();
                        for t in 0..=kk {
                            acc = acc.add(
                                self.multipole[cbase + t]
                                    .mul(pdelta[kk - t])
                                    .scale(binom(kk, t)),
                            );
                        }
                        self.multipole[base + kk] = self.multipole[base + kk].add(acc);
                    }
                }
            }
        }
    }
}

#[inline]
fn morton(mut x: u32, mut y: u32) -> u32 {
    x &= 0xFFFF;
    y &= 0xFFFF;
    x = (x | (x << 8)) & 0x00FF_00FF;
    x = (x | (x << 4)) & 0x0F0F_0F0F;
    x = (x | (x << 2)) & 0x3333_3333;
    x = (x | (x << 1)) & 0x5555_5555;
    y = (y | (y << 8)) & 0x00FF_00FF;
    y = (y | (y << 4)) & 0x0F0F_0F0F;
    y = (y | (y << 2)) & 0x3333_3333;
    y = (y | (y << 1)) & 0x5555_5555;
    (y << 1) | x
}

#[inline]
fn binom(n: usize, k: usize) -> f64 {
    let k = k.min(n - k);
    let mut result = 1.0_f64;
    for i in 0..k {
        result = result * (n - i) as f64 / (i + 1) as f64;
    }
    result
}
