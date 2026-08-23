//! Interaction classification: split every leaf's sources into far (M2L)
//! and near (direct) sets by recursive descent through the parent
//! neighborhood.

use super::{FmmTree, NONE};
use std::collections::HashMap;

impl FmmTree {
    /// Strict well-separatedness test for two boxes at any depths.
    ///
    /// Compare the cell-index ranges at the coarser of the two depths. A gap
    /// of one coarse cell or more separates the boxes by more than sqrt(2)
    /// times the coarse half size. Expansions converge under that bound,
    /// whatever the depth difference.
    pub(super) fn well_separated(&self, t: usize, s: usize) -> bool {
        let tn = &self.nodes[t];
        let sn = &self.nodes[s];
        let (tr, sr) = if tn.depth >= sn.depth {
            let sh = tn.depth - sn.depth;
            ((tn.gx >> sh, tn.gy >> sh), (sn.gx, sn.gy))
        } else {
            let sh = sn.depth - tn.depth;
            ((tn.gx, tn.gy), (sn.gx >> sh, sn.gy >> sh))
        };
        let xg = (sr.0 - tr.0 - 1).max(tr.0 - sr.0 - 1).max(0);
        let yg = (sr.1 - tr.1 - 1).max(tr.1 - sr.1 - 1).max(0);
        xg.max(yg) >= 1
    }

    /// Classify each leaf target's interactions inside its parent
    /// neighborhood.
    ///
    /// A well-separated source box translates whole via M2L. An adjacent or
    /// overlapping internal box recurses into its children. A leaf that stays
    /// adjacent becomes a near-field source. Together with contributions
    /// inherited from ancestors, this assigns every other particle to exactly
    /// one of the two sets per leaf.
    pub(super) fn classify_interactions(
        &self,
        maps: &[HashMap<(i64, i64), u32>],
    ) -> (Vec<Vec<usize>>, Vec<Vec<u32>>) {
        let n = self.nodes.len();
        let mut m2l_lists: Vec<Vec<usize>> = vec![Vec::new(); n];
        let mut near_lists: Vec<Vec<u32>> = vec![Vec::new(); n];
        for t in 0..n {
            if self.nodes[t].leaf {
                near_lists[t].push(t as u32);
            }
            let parent = self.nodes[t].parent;
            if parent == NONE {
                continue;
            }
            let parent = parent as usize;
            let level = self.nodes[t].depth as usize;
            let (pgx, pgy) = (self.nodes[parent].gx, self.nodes[parent].gy);
            for dy in -1_i64..=1 {
                for dx in -1_i64..=1 {
                    let qgx = pgx + dx;
                    let qgy = pgy + dy;
                    if qgx < 0 || qgy < 0 {
                        continue;
                    }
                    let qshift = level as u32 - 1;
                    if qgx >= (1i64 << qshift) || qgy >= (1i64 << qshift) {
                        continue;
                    }
                    let qidx = match maps[level - 1].get(&(qgx, qgy)) {
                        Some(&qid) => qid,
                        None => {
                            // Vacant bucket: an ancestor stopped subdividing
                            // over this region. Climb to the nearest existing
                            // ancestor and traverse its subtree instead.
                            let mut alvl = level - 1;
                            let mut agx = qgx;
                            let mut agy = qgy;
                            let mut found = None;
                            while alvl > 0 {
                                alvl -= 1;
                                agx >>= 1;
                                agy >>= 1;
                                if let Some(&aid) = maps[alvl].get(&(agx, agy)) {
                                    found = Some(aid);
                                    break;
                                }
                            }
                            match found {
                                Some(aid) => aid,
                                None => continue,
                            }
                        }
                    };
                    let mut stack: Vec<usize> = vec![qidx as usize];
                    while let Some(s) = stack.pop() {
                        if s == t {
                            continue;
                        }
                        if self.well_separated(t, s) {
                            m2l_lists[t].push(s);
                            continue;
                        }
                        let sn = &self.nodes[s];
                        if sn.leaf {
                            near_lists[t].push(s as u32);
                        } else {
                            for &c in &sn.children {
                                if c != NONE {
                                    stack.push(c as usize);
                                }
                            }
                        }
                    }
                }
            }
            // Climbed subtrees can overlap earlier edges. Sort and dedup so
            // each source translates once and no pair counts twice.
            near_lists[t].sort_unstable();
            near_lists[t].dedup();
            m2l_lists[t].sort_unstable();
            m2l_lists[t].dedup();
        }
        (m2l_lists, near_lists)
    }
}
