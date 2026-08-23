//! FMM correctness tests.
//!
//! Gates compare the full evaluation against a direct O(n^2) reference.
//! Structural tests prove individual passes: P2M/M2M moments, M2L isolation,
//! L2L shifting, staged-versus-production equivalence, and exact far/near
//! partitioning.

use super::{BinomTable, FmmTree, Node, NONE};
use crate::complex::Complex;
use crate::config::Distribution;
use crate::sim::Particles;
use crate::testutil::{clone_layout, clustered_particles, direct_acc, rel_l2_error, Deadline};
use std::collections::HashSet;

const ORDER: usize = 8;
const LEAF_CAPACITY: usize = 32;
const EPS2: f32 = 1e-6;

#[allow(clippy::too_many_arguments)] // test fixture: every Node field is set by hand
fn nd(
    cx: f64,
    cy: f64,
    half: f64,
    parent: u32,
    children: [u32; 4],
    first: usize,
    count: usize,
    depth: u32,
    gx: i64,
    gy: i64,
    leaf: bool,
) -> Node {
    Node {
        cx,
        cy,
        ex: cx,
        ey: cy,
        half,
        parent,
        children,
        first: first as u32,
        count: count as u32,
        depth,
        gx,
        gy,
        leaf,
    }
}

/// Differentiate a local expansion centered at the origin, evaluated at z.
fn eval_expansion(local: &[Complex], z: Complex, order: usize) -> Complex {
    let mut spow = vec![Complex::new(1.0, 0.0); order];
    for k in 1..order {
        spow[k] = spow[k - 1].mul(z);
    }
    let mut deriv = Complex::default();
    for k in 1..=order {
        deriv = deriv.add(local[k - 1].scale(k as f64).mul(spow[k - 1]));
    }
    deriv
}

#[test]
fn single_pair_matches_analytic() {
    let mut p = Particles::new(2, 1, Distribution::UniformDisc);
    p.pos_x = vec![-0.5, 0.5];
    p.pos_y = vec![0.0, 0.0];
    p.vel_x = vec![0.0; 2];
    p.vel_y = vec![0.0; 2];
    p.mass = vec![2.0, 3.0];
    p.render(1.0);
    let eps2 = 0.0025_f32;
    let mut tree = FmmTree::build(&p, ORDER, LEAF_CAPACITY);
    tree.evaluate(&mut p, 1.0, eps2);
    let expect_a1 = 3.0_f32 / (1.0 + eps2);
    let expect_a2 = -2.0_f32 / (1.0 + eps2);
    assert!((p.acc_x[0] - expect_a1).abs() < 1e-4, "a1 {} vs {}", p.acc_x[0], expect_a1);
    assert!(p.acc_y[0].abs() < 1e-5);
    assert!((p.acc_x[1] - expect_a2).abs() < 1e-4, "a2 {} vs {}", p.acc_x[1], expect_a2);
    assert!(p.acc_y[1].abs() < 1e-5);
}

/// One source box, one target box, one particle each. The far-field
/// contribution at the target particle must match the analytic pull from the
/// source particle to 1e-4.
#[test]
fn two_box_isolation() {
    let order = 8usize;
    let stride_mp = order + 1;
    let stride_lp = order;
    let mut tree = FmmTree {
        nodes: Vec::new(),
        sorted_idx: vec![0, 1],
        level_ranges: vec![(0, 1), (1, 3)],
        multipole: vec![Complex::default(); 3 * stride_mp],
        local: vec![Complex::default(); 3 * stride_lp],
        stride_mp,
        stride_lp,
    };
    tree.nodes.push(nd(0.0, 0.0, 2.0, NONE, [1, NONE, NONE, 2], 0, 2, 0, 0, 0, false));
    tree.nodes.push(nd(-1.25, -1.25, 0.75, 0, [NONE; 4], 0, 1, 1, 0, 0, true));
    tree.nodes.push(nd(1.25, 1.25, 0.75, 0, [NONE; 4], 1, 1, 1, 1, 1, true));

    let mut p = Particles::new(2, 1, Distribution::UniformDisc);
    p.pos_x = vec![-1.6, 0.0];
    p.pos_y = vec![-1.0, 0.0];
    p.vel_x = vec![0.0; 2];
    p.vel_y = vec![0.0; 2];
    p.mass = vec![1.0, 5.0];
    p.render(1.0);

    tree.upward_pass(&p, order);
    let binom = BinomTable::new(2 * order);
    let mut wpow = vec![Complex::default(); 2 * order + 2];
    tree.m2l(2, 1, order, &binom, &mut wpow);

    // Far field at an arbitrary point inside the target box, from the box's
    // local expansion about its center.
    let zi = Complex::new(1.4, 1.1);
    let zc = Complex::new(tree.nodes[2].cx, tree.nodes[2].cy);
    let s = Complex::new(zi.re - zc.re, zi.im - zc.im);
    let tbase = 2 * stride_lp;
    let deriv = eval_expansion(&tree.local[tbase..3 * stride_lp], s, order);
    let ax_far = -deriv.re;
    let ay_far = deriv.im;

    let dx = p.pos_x[0] as f64 - zi.re;
    let dy = p.pos_y[0] as f64 - zi.im;
    let r2 = dx * dx + dy * dy;
    let exact_x = dx / r2;
    let exact_y = dy / r2;
    assert!(
        (ax_far - exact_x).abs() < 1e-4 && (ay_far - exact_y).abs() < 1e-4,
        "isolation mismatch: fmm ({ax_far:+.6},{ay_far:+.6}) exact ({exact_x:+.6},{exact_y:+.6})"
    );
}

/// Hand-built chain root -> X (internal) -> C (leaf). Fill X's local with
/// arbitrary coefficients, shift down once, then evaluate both expansions at
/// the same point inside C. Truncated-polynomial shifting is exact, so the
/// two must agree to 1e-9.
#[test]
fn l2l_exactness() {
    let order = 8usize;
    let stride_mp = order + 1;
    let stride_lp = order;
    let mut tree = FmmTree {
        nodes: Vec::new(),
        sorted_idx: Vec::new(),
        level_ranges: vec![(0, 1), (1, 2), (2, 3)],
        multipole: vec![Complex::default(); 3 * stride_mp],
        local: vec![Complex::default(); 3 * stride_lp],
        stride_mp,
        stride_lp,
    };
    tree.nodes.push(nd(0.0, 0.0, 2.0, NONE, [1, NONE, NONE, NONE], 0, 0, 0, 0, 0, false));
    // X: level 1 cell (0,0), center (-1,-1).
    tree.nodes.push(nd(-1.0, -1.0, 1.0, 0, [2, NONE, NONE, NONE], 0, 0, 1, 0, 0, false));
    // C: level 2 cell (1,0) under X, center (-0.5,-1.5).
    tree.nodes.push(nd(-0.5, -1.5, 0.5, 1, [NONE; 4], 0, 0, 2, 1, 0, true));

    let mut rng_state = 12345u64;
    let mut frand = move || {
        rng_state ^= rng_state << 13;
        rng_state ^= rng_state >> 7;
        rng_state ^= rng_state << 17;
        ((rng_state % 20000) as f64 - 10000.0) / 10000.0
    };
    for k in 0..order {
        tree.local[stride_lp + k] = Complex::new(frand(), frand());
    }

    tree.downward_pass(&BinomTable::new(2 * order));

    let z = Complex::new(-0.62, -1.31);
    let from_x = eval_expansion(
        &tree.local[stride_lp..2 * stride_lp],
        Complex::new(z.re + 1.0, z.im + 1.0),
        order,
    );
    let from_c = eval_expansion(
        &tree.local[2 * stride_lp..3 * stride_lp],
        Complex::new(z.re + 0.5, z.im + 1.5),
        order,
    );
    assert!(
        (from_x.re - from_c.re).abs() < 1e-9 && (from_x.im - from_c.im).abs() < 1e-9,
        "L2L inexact"
    );
}

/// The root multipole after P2M plus M2M must equal the exact moments of all
/// particles about the root center.
#[test]
fn root_multipole_matches_exact_moments() {
    let n = 120;
    let mut p = Particles::new(n, 7, Distribution::UniformDisc);
    for k in 0..n {
        let ang = (k as f64) * 0.7;
        p.pos_x[k] = (0.6 * ang.cos()) as f32;
        p.pos_y[k] = (0.6 * ang.sin()) as f32;
        p.mass[k] = 1.0;
    }
    p.render(1.0);

    let order = 8usize;
    let tree = FmmTree::build(&p, order, 4);
    let rcx = tree.nodes[0].cx;
    let rcy = tree.nodes[0].cy;
    for k in 0..=order {
        let mut expect = Complex::default();
        for i in 0..n {
            let dz = Complex::new(p.pos_x[i] as f64 - rcx, p.pos_y[i] as f64 - rcy);
            let mut pw = Complex::new(1.0, 0.0);
            for _ in 0..k {
                pw = pw.mul(dz);
            }
            expect = expect.add(pw.scale(p.mass[i] as f64));
        }
        let got = tree.multipole[k];
        let err = (got.re - expect.re).abs() + (got.im - expect.im).abs();
        assert!(err < 1e-9, "root multipole k={k} wrong, err {err:.2e}");
    }
}

/// Running the passes by hand must reproduce the local expansions that
/// evaluate produces, bit for bit, for both layouts.
#[test]
fn staged_passes_match_production() {
    let order = ORDER;
    let binom = BinomTable::new(2 * order);
    for (name, p) in [
        ("uniform", Particles::new(500, 11, Distribution::UniformDisc)),
        ("clustered", clustered_particles(400, 7)),
    ] {
        let mut ta = FmmTree::build(&p, order, LEAF_CAPACITY);
        let mut pa = clone_layout(&p);
        ta.evaluate(&mut pa, 1.0, EPS2);

        // build already ran the upward pass; repeat only M2L and L2L here.
        let mut tb = FmmTree::build(&p, order, LEAF_CAPACITY);
        let (m2l_lists, _near) = tb.classify_interactions();
        tb.interaction_pass(order, &binom, &m2l_lists);
        tb.downward_pass(&binom);

        assert_eq!(
            ta.local, tb.local,
            "{name}: staged passes diverge from production"
        );
    }
}

/// For every leaf, every other particle must appear exactly once across the
/// near list and the M2L translations onto the leaf's full ancestor chain.
/// Sources beyond the parent neighborhood belong to coarser ancestors, whose
/// contributions arrive through L2L inheritance.
#[test]
fn partition_covers_each_particle_once() {
    for (name, p) in [
        ("uniform", Particles::new(500, 11, Distribution::UniformDisc)),
        ("clustered", clustered_particles(400, 7)),
    ] {
        let tree = FmmTree::build(&p, ORDER, LEAF_CAPACITY);
        let (m2l_lists, near_lists) = tree.classify_interactions();

        let mut members: Vec<usize> = Vec::new();
        let mut chain: Vec<usize> = Vec::new();
        for (li, near) in near_lists.iter().enumerate() {
            if !tree.nodes[li].leaf {
                continue;
            }
            // Near set: gathered neighbor leaves plus the leaf itself.
            members.clear();
            for &nid in near {
                let node = &tree.nodes[nid as usize];
                members.extend(
                    tree.sorted_idx
                        [node.first as usize..node.first as usize + node.count as usize]
                        .iter()
                        .map(|&x| x as usize),
                );
            }
            let near_set: HashSet<usize> = members.iter().copied().collect();

            // Far set: sources translated onto any node of the leaf's chain.
            chain.clear();
            let mut cur = li;
            while cur != NONE as usize {
                chain.push(cur);
                cur = tree.nodes[cur].parent as usize;
            }
            members.clear();
            for &t in &chain {
                for &sid in &m2l_lists[t] {
                    let node = &tree.nodes[sid];
                    members.extend(
                        tree.sorted_idx[node.first as usize
                            ..node.first as usize + node.count as usize]
                            .iter()
                            .map(|&x| x as usize),
                    );
                }
            }
            let far_set: HashSet<usize> = members.drain(..).collect();

            let doubles = near_set.intersection(&far_set).count();
            let covered = near_set.len() + far_set.len() - doubles;
            assert_eq!(
                doubles, 0,
                "{name}: leaf {li} double-counts {doubles} particles"
            );
            assert_eq!(
                covered,
                p.len(),
                "{name}: leaf {li} misses {} particles",
                p.len() - covered
            );
        }
    }
}

/// Total error must fall clearly as the expansion order rises. A flat or
/// rising sequence means a pass stopped contributing.
#[test]
fn order_convergence_improves_with_order() {
    for (name, p) in [
        ("uniform", Particles::new(500, 11, Distribution::UniformDisc)),
        ("clustered", clustered_particles(400, 7)),
    ] {
        let (rx, ry) = direct_acc(&p, 1.0, EPS2);
        let e4 = run_order(&p, &rx, &ry, 4);
        let e8 = run_order(&p, &rx, &ry, 8);
        let e16 = run_order(&p, &rx, &ry, 16);
        eprintln!("{name} order  4 | rel L2 {e4:.3e}");
        eprintln!("{name} order  8 | rel L2 {e8:.3e}");
        eprintln!("{name} order 16 | rel L2 {e16:.3e}");
        // Clear convergence in the useful range...
        assert!(e8 < e4 * 0.5, "{name}: order 8 error {e8:.3e} did not halve {e4:.3e}");
        // ...and no regression at the f32 precision floor, where higher
        // orders stop helping.
        assert!(e16 < e4, "{name}: order 16 error {e16:.3e} regressed on {e4:.3e}");
    }
}

fn run_order(p: &Particles, rx: &[f64], ry: &[f64], order: usize) -> f64 {
    let mut q = clone_layout(p);
    let mut tree = FmmTree::build(&q, order, LEAF_CAPACITY);
    tree.evaluate(&mut q, 1.0, EPS2);
    rel_l2_error(&q, &q.acc_x.clone(), &q.acc_y.clone(), rx, ry)
}

#[test]
fn fmm_matches_direct_sum_uniform() {
    let dl = Deadline::new("fmm_matches_direct_sum_uniform");
    let mut p = Particles::new(500, 11, Distribution::UniformDisc);
    let mut tree = FmmTree::build(&p, ORDER, LEAF_CAPACITY);
    dl.check();
    tree.evaluate(&mut p, 1.0, EPS2);
    let (rx, ry) = direct_acc(&p, 1.0, EPS2);
    dl.check();
    let err = rel_l2_error(&p, &p.acc_x.clone(), &p.acc_y.clone(), &rx, &ry);
    assert!(err < 1e-3, "uniform rel L2 error {err}");
}

#[test]
fn fmm_matches_direct_sum_clustered() {
    let dl = Deadline::new("fmm_matches_direct_sum_clustered");
    let mut p = clustered_particles(400, 7);
    let mut tree = FmmTree::build(&p, ORDER, LEAF_CAPACITY);
    dl.check();
    tree.evaluate(&mut p, 1.0, EPS2);
    let (rx, ry) = direct_acc(&p, 1.0, EPS2);
    dl.check();
    let err = rel_l2_error(&p, &p.acc_x.clone(), &p.acc_y.clone(), &rx, &ry);
    assert!(err < 1e-3, "clustered rel L2 error {err}");
}
